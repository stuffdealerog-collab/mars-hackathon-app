import { normalizeCues } from "./captions";
import { buildPrompt, NEGATIVE_PROMPT } from "./presets";
import { inputImages, ProviderError, redactSecrets, type MediaProvider, type ProviderRef } from "./provider";
import type { MediaJobRepo } from "./repo";
import { isTerminal, type MediaJob, type MediaJobInput, type MediaKind, type MediaResult } from "./types";

/**
 * Job lifecycle: create (validate -> pick provider -> build prompt -> persist ->
 * submit) -> refresh (throttled poll -> map status -> store result) -> cancel.
 *
 * The browser polls GET /api/uslub/media/jobs?id=… every few seconds; we only
 * call the provider when the last poll is older than `pollIntervalMs`, so a
 * crowd of open tabs cannot hammer (or bill) the provider.
 * Pure module: every dependency is injected; see media.test.ts.
 */

export class MediaError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: "not_configured" | "bad_input" | "limit" | "not_found" | "login_required",
  ) {
    super(message);
    this.name = "MediaError";
  }
}

export interface MediaJobsDeps {
  repo: MediaJobRepo;
  providers: MediaProvider[]; // in preference order
  now?: () => number;
  newId?: () => string;
  dailyLimit?: number; // jobs per rolling 24 h, whole app (protects the API balance)
  userDailyLimit?: number; // per verified Telegram user
  anonDailyLimit?: number; // shared by ALL anonymous web callers; 0 = Telegram login required
  /** Pictures have their own pools (see config.ts); the fields above are for videos. */
  image?: { dailyLimit?: number; anonDailyLimit?: number; userDailyLimit?: number; brandDailyLimit?: number };
  pollIntervalMs?: number;
  timeoutMs?: number; // a job still not done after this is failed
  /** Copies a finished result to our own storage; return the new result, or undefined to keep the provider URL. */
  archive?: (job: MediaJob) => Promise<MediaResult | undefined>;
  /** Strings to scrub from provider errors (API keys). */
  secrets?: () => (string | undefined)[];
}

export const MEDIA_DEFAULTS = {
  dailyLimit: 30,
  userDailyLimit: 5,
  anonDailyLimit: 5,
  image: { dailyLimit: 150, anonDailyLimit: 100, userDailyLimit: 60, brandDailyLimit: 24 },
  pollIntervalMs: 4_000,
  timeoutMs: 20 * 60_000,
  minSeconds: 3,
  maxSeconds: 12,
} as const;

const NOT_CONFIGURED =
  "Videograf hali ulanmagan: video API kaliti qo‘shilmagan. / Видео-API не подключён: нет ключа провайдера.";

export class MediaJobs {
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(private readonly deps: MediaJobsDeps) {
    this.now = deps.now ?? Date.now;
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  /** Configured providers that can do this kind, in preference order. */
  available(kind: MediaKind): MediaProvider[] {
    return this.deps.providers.filter((p) => p.isConfigured() && p.supports(kind));
  }

  isConfigured(kind?: MediaKind): boolean {
    return kind ? this.available(kind).length > 0 : this.deps.providers.some((p) => p.isConfigured());
  }

  private pickProvider(input: MediaJobInput): MediaProvider {
    const isData = inputImages(input).some((u) => u.startsWith("data:"));
    let candidates = this.available(input.kind);
    if (input.provider) candidates = candidates.filter((p) => p.id === input.provider);
    if (!candidates.length) throw new MediaError(503, NOT_CONFIGURED, "not_configured");
    const ok = isData ? candidates.filter((p) => p.acceptsDataUrls) : candidates;
    if (!ok.length) {
      throw new MediaError(
        400,
        "Bu provayder uchun rasmni https havola sifatida yuboring. / Для этого провайдера пришлите фото ссылкой https.",
        "bad_input",
      );
    }
    return ok[0];
  }

  /** The caps for a kind: videos use the original pools, pictures their own (plus a per-brand cap). */
  limits(kind: MediaKind): { global: number; anon: number; user: number; brand?: number } {
    if (kind === "image") {
      const d = MEDIA_DEFAULTS.image;
      const i = this.deps.image ?? {};
      return {
        global: i.dailyLimit ?? d.dailyLimit,
        anon: i.anonDailyLimit ?? d.anonDailyLimit,
        user: i.userDailyLimit ?? d.userDailyLimit,
        brand: i.brandDailyLimit ?? d.brandDailyLimit,
      };
    }
    return {
      global: this.deps.dailyLimit ?? MEDIA_DEFAULTS.dailyLimit,
      anon: this.deps.anonDailyLimit ?? MEDIA_DEFAULTS.anonDailyLimit,
      user: this.deps.userDailyLimit ?? MEDIA_DEFAULTS.userDailyLimit,
    };
  }

  /**
   * @param actor verified Telegram user id, or null for an anonymous web caller.
   * Spend is capped per user, in one shared anonymous pool, per brand (pictures) and app-wide,
   * separately for pictures and videos.
   */
  async create(input: MediaJobInput, actor: Actor = ANON): Promise<MediaJob> {
    if (input.kind === "video" && !input.imageUrl) {
      throw new MediaError(400, "Video uchun mahsulot rasmini yuboring. / Для видео нужно фото товара.", "bad_input");
    }
    if (input.kind === "video" && input.referenceUrls?.length) {
      throw new MediaError(400, "Video uchun faqat bitta rasm. / Для видео — только одно фото.", "bad_input");
    }
    if ((input.referenceUrls?.length ?? 0) > MAX_REFERENCES) {
      throw new MediaError(400, `Ko‘pi bilan ${MAX_REFERENCES} ta namuna rasm. / Не больше ${MAX_REFERENCES} фото-образцов.`, "bad_input");
    }
    const images = inputImages(input);
    for (const url of images) validateImageUrl(url);
    const provider = this.pickProvider(input);

    const caps = this.limits(input.kind);
    const ownerKey = ownerKeyOf(actor);
    if (ownerKey === "anon" && caps.anon <= 0 && provider.id !== "demo") throw loginRequired();

    const seconds = input.kind === "video" ? clamp(Math.round(input.seconds), MEDIA_DEFAULTS.minSeconds, MEDIA_DEFAULTS.maxSeconds) : 0;
    const { prompt, negativePrompt } = input.customPrompt
      ? { prompt: input.customPrompt.prompt, negativePrompt: input.customPrompt.negativePrompt ?? NEGATIVE_PROMPT }
      : buildPrompt({
          kind: input.kind,
          presetId: input.presetId,
          aspect: input.aspect,
          productName: input.productName,
          brief: input.brief,
        });
    const at = new Date(this.now()).toISOString();
    const job: MediaJob = {
      id: this.newId(),
      kind: input.kind,
      status: "queued",
      provider: provider.id,
      model: provider.model(input.kind),
      presetId: input.presetId,
      aspect: input.aspect,
      seconds,
      prompt,
      negativePrompt,
      imageRef: !images.length ? "none" : images[0].startsWith("data:") ? "inline-upload" : images[0],
      refCount: images.length,
      captions: normalizeCues(input.captions ?? [], seconds || 10),
      brandId: input.brandId,
      ownerKey,
      polls: 0,
      createdAt: at,
      updatedAt: at,
    };
    const free = provider.id === "demo"; // the demo provider costs nothing
    const quota = await this.deps.repo.insertWithinQuota(job, {
      sinceIso: new Date(this.now() - 24 * 3600_000).toISOString(),
      global: free ? Infinity : caps.global,
      owner: free ? Infinity : ownerKey === "anon" ? caps.anon : caps.user,
      brand: free || caps.brand === undefined ? undefined : caps.brand,
    });
    if (quota !== "ok") {
      throw new MediaError(
        429,
        quota === "owner" && ownerKey === "anon"
          ? "Mehmonlar uchun bugungi limit tugadi. Telegram bot orqali kiring. / Гостевой лимит на сегодня исчерпан — войдите через Telegram."
          : "Bugungi limit tugadi. Ertaga qayta urinib ko‘ring. / Дневной лимит генераций исчерпан.",
        "limit",
      );
    }

    try {
      const ref = await provider.submit({
        kind: job.kind,
        prompt,
        negativePrompt,
        imageUrl: input.imageUrl,
        referenceUrls: input.referenceUrls,
        aspect: job.aspect,
        seconds: job.seconds,
        idempotencyKey: job.id,
      });
      job.providerRequestId = ref.requestId;
      job.providerStatusUrl = ref.statusUrl;
      job.providerResultUrl = ref.resultUrl;
      job.providerCancelUrl = ref.cancelUrl;
      job.model = ref.model || job.model;
    } catch (err) {
      job.status = "failed";
      job.error = this.describe(err);
    }
    job.updatedAt = new Date(this.now()).toISOString();
    await this.deps.repo.update(job);
    return job;
  }

  /**
   * Loads a job the actor may see. A job created by a verified Telegram user is
   * visible and cancellable only by that user (404 for anyone else, so ids are
   * not confirmed). An anonymous job's random UUID is its capability: it is
   * returned only to the caller who created it.
   */
  async get(id: string, actor: Actor = ANON, opts: AccessOpts = {}): Promise<MediaJob> {
    const job = await this.deps.repo.get(id);
    if (!job || (!opts.authorized && job.ownerKey !== "anon" && job.ownerKey !== ownerKeyOf(actor))) {
      throw new MediaError(404, "Topilmadi / Не найдено", "not_found");
    }
    return job;
  }

  /**
   * Cheap pre-check of the daily caps before a caller spends money preparing a job (AI calls,
   * uploads). Not a reservation: create() still checks atomically with the insert.
   */
  async assertRoom(actor: Actor = ANON, kind: MediaKind = "image", brandId?: string): Promise<void> {
    const caps = this.limits(kind);
    const ownerKey = ownerKeyOf(actor);
    if (ownerKey === "anon" && caps.anon <= 0) throw loginRequired();
    if (!this.deps.repo.countSince) return;
    const used = await this.deps.repo.countSince(new Date(this.now() - 24 * 3600_000).toISOString(), kind, ownerKey, brandId);
    const ownerCap = ownerKey === "anon" ? caps.anon : caps.user;
    const brandFull = brandId !== undefined && caps.brand !== undefined && used.brand >= caps.brand;
    if (used.total >= caps.global || used.owner >= ownerCap || brandFull) {
      throw new MediaError(429, "Bugungi limit tugadi. / Дневной лимит исчерпан.", "limit");
    }
  }

  /**
   * Returns the job, polling the provider first when it is due. `authorized`: the caller has
   * already checked access to what the job belongs to (e.g. the post), so the owner check is skipped.
   */
  async refresh(id: string, actor: Actor = ANON, opts: AccessOpts = {}): Promise<MediaJob> {
    const job = await this.get(id, actor, opts);
    if (isTerminal(job.status) || !job.providerRequestId) return job;
    const now = this.now();
    const interval = this.deps.pollIntervalMs ?? MEDIA_DEFAULTS.pollIntervalMs;
    if (job.lastPolledAt && now - Date.parse(job.lastPolledAt) < interval) return job;

    const provider = this.deps.providers.find((p) => p.id === job.provider);
    // The timeout is judged AFTER asking the provider: a job that finished while nobody was
    // polling (the owner closed the tab) is still delivered, not failed for being late.
    const timedOut = now - Date.parse(job.createdAt) > (this.deps.timeoutMs ?? MEDIA_DEFAULTS.timeoutMs);
    const expire = async () => {
      job.status = "failed";
      job.error = "Provayder javob bermadi (vaqt tugadi). / Провайдер не ответил вовремя.";
      if (provider?.cancel) await provider.cancel(refOf(job)).catch(() => undefined);
      return this.save(job);
    };
    if (!provider) {
      job.status = "failed";
      job.error = `Provider ${job.provider} is no longer available`;
      return this.save(job);
    }

    job.polls += 1;
    job.lastPolledAt = new Date(now).toISOString();
    try {
      const r = await provider.poll(refOf(job));
      if (r.status === "succeeded") {
        if (!r.outputUrl) {
          job.status = "failed";
          job.error = "Provayder natija qaytarmadi. / Провайдер не вернул результат.";
        } else {
          job.status = "succeeded";
          job.result = {
            url: r.outputUrl,
            contentType: r.contentType,
            expiresAt: provider.retentionMs ? new Date(now + provider.retentionMs).toISOString() : undefined,
            demo: provider.id === "demo" || undefined,
          };
          if (this.deps.archive) {
            const archived = await this.deps.archive(job).catch(() => undefined);
            if (archived) job.result = archived;
          }
        }
      } else if (r.status === "failed" || r.status === "canceled") {
        job.status = r.status;
        job.error = r.error ? this.describe(new ProviderError(r.error)) : undefined;
      } else {
        job.status = r.status; // queued | running
      }
    } catch (err) {
      // Network blips and 5xx keep the job alive; a definitive 4xx (unknown request, bad auth) ends it.
      const definitive = err instanceof ProviderError && !err.retryable && (err.status ?? 0) >= 400 && (err.status ?? 0) < 500;
      if (definitive) {
        job.status = "failed";
        job.error = this.describe(err);
      }
    }
    if (timedOut && !isTerminal(job.status)) return expire();
    return this.save(job);
  }

  async cancel(id: string, actor: Actor = ANON): Promise<MediaJob> {
    const job = await this.get(id, actor);
    if (isTerminal(job.status)) return job;
    const provider = this.deps.providers.find((p) => p.id === job.provider);
    if (provider?.cancel && job.providerRequestId) await provider.cancel(refOf(job)).catch(() => undefined);
    job.status = "canceled";
    return this.save(job);
  }

  private async save(job: MediaJob): Promise<MediaJob> {
    job.updatedAt = new Date(this.now()).toISOString();
    await this.deps.repo.update(job);
    return job;
  }

  private describe(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    return redactSecrets(msg, this.deps.secrets?.() ?? []);
  }
}

/** The caller: a verified Telegram user id, or null for an anonymous web caller. */
export type Actor = { telegramId: number | null };
export type AccessOpts = { authorized?: boolean };

/** Anonymous use of this kind is switched off (its anonymous cap is 0): sign in through the bot. */
const loginRequired = () =>
  new MediaError(401, "Telegram bot orqali kiring. / Войдите через Telegram-бота.", "login_required");
const ANON: Actor = { telegramId: null };
const ownerKeyOf = (a: Actor) => (a.telegramId != null ? `tg:${a.telegramId}` : "anon");

function refOf(job: MediaJob): ProviderRef {
  return {
    requestId: job.providerRequestId ?? "",
    model: job.model,
    statusUrl: job.providerStatusUrl,
    resultUrl: job.providerResultUrl,
    cancelUrl: job.providerCancelUrl,
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

const DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
export const MAX_DATA_URL_BYTES = 3_000_000; // Vercel request bodies stop at 4.5 MB
/** Style references per image job (the product photo is extra). */
export const MAX_REFERENCES = 8;

/** https only (providers fetch it from their side), or a small base64 PNG/JPEG/WebP data URL. */
export function validateImageUrl(url: string): void {
  if (url.startsWith("data:")) {
    if (url.length > MAX_DATA_URL_BYTES || !DATA_URL_RE.test(url)) {
      throw new MediaError(400, "Rasm PNG/JPEG/WebP bo‘lsin va 2 MB dan oshmasin. / Фото: PNG/JPEG/WebP до 2 МБ.", "bad_input");
    }
    return;
  }
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new MediaError(400, "Rasm havolasi noto‘g‘ri. / Неверная ссылка на фото.", "bad_input");
  }
  const host = u.hostname.toLowerCase();
  const local = host === "localhost" || host.endsWith(".local") || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || host === "[::1]";
  if (u.protocol !== "https:" || local) {
    throw new MediaError(400, "Rasm ochiq https havolada bo‘lishi kerak. / Фото должно быть по публичной ссылке https.", "bad_input");
  }
}

