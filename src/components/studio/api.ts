/**
 * Studio data access: a thin typed client over /api/uslub/* (src/lib/uslub/contract.ts).
 *
 * No silent fallback: a failed call returns `{ ok: false, error, code }` and the Studio shows
 * an owner-safe message with "Qayta urinish". Sample data exists only behind `?mock=1`
 * (see sample.ts) and is always labelled on screen.
 */
import type {
  BrandMode,
  BrandProfile,
  ChannelAudit,
  ContentPlan,
  PlanItem,
  PlanSlot,
  PostDraft,
  PostImage,
  Script,
  Strategy,
  VisualStyle,
} from "@/lib/uslub/contract";
import { useLang, type Lang } from "../ui/lang";

/** A blank still in a post's text, per script (approve and publish refuse with placeholder_left). */
export type Missing = { script: Script; tokens: string[] };
export type Fail = { ok: false; error?: string; code: string; status: number; reason?: string; addAdminUrl?: string; missing?: Missing[] };
export type Ok<T> = { ok: true; data: T };
export type Res<T> = Ok<T> | Fail;

const BASE = "/api/uslub";

/** Sample mode (recordings, the landing's example): `?mock=1`. */
export function sampleMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("mock") === "1";
}

type TgWindow = Window & { Telegram?: { WebApp?: { initData?: string } } };
/** Telegram Mini App initData, when the Studio runs inside Telegram. */
export function tgInitData(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const d = (window as TgWindow).Telegram?.WebApp?.initData;
  return d ? d : undefined;
}

/** Bot deep link; the suffix tells the bot which text to publish (uz Latin is the default). */
export const botPublishUrl = (bot: string, postId: string, script: Script = "uz_latn") => {
  const suffix = script === "uz_latn" ? "" : `_${script}`;
  return `https://t.me/${bot}?start=${encodeURIComponent(`publish_${postId}${suffix}`.slice(0, 64))}`;
};

const HANDOFF = "mercat.k";

function storedHandoff(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return localStorage.getItem(HANDOFF) ?? undefined;
  } catch {
    return undefined;
  }
}

/** "<userId>.<exp>.<sig>", exp in unix seconds: readable without the secret, so expiry is known here. */
const expiresAt = (k: string) => Number(k.split(".")[1]) * 1000;

/**
 * The bot's signed link key (`#k=` in the Studio link): lets a desktop browser act for the owner's
 * Telegram account. Only a key that has not expired; a bearer secret, so never logged or shown.
 */
export function handoffKey(): string | undefined {
  const k = storedHandoff();
  return k && expiresAt(k) > Date.now() ? k : undefined;
}

/** The Telegram user id a key on this device was signed for (readable, not secret), or null. */
export function handoffUser(): string | null {
  const id = storedHandoff()?.split(".")[0];
  return id && /^\d+$/.test(id) ? id : null;
}

/** none: no key on this device; valid; expired: the owner should open the Studio from the bot again. */
export function handoffState(): "none" | "valid" | "expired" {
  const k = storedHandoff();
  return !k ? "none" : expiresAt(k) > Date.now() ? "valid" : "expired";
}

export function saveHandoff(k: string | null) {
  try {
    if (k) localStorage.setItem(HANDOFF, k);
    else localStorage.removeItem(HANDOFF);
  } catch {
    /* private mode: this page only */
  }
}

/**
 * The Authorization header for /api/uslub and the media components: the Mini App's initData
 * first, then the bot's handoff key; none for a channel pasted in a plain browser.
 */
export function authHeader(): string | undefined {
  const init = tgInitData();
  if (init) return `tma ${init}`;
  const k = handoffKey();
  return k ? `handoff ${k}` : undefined;
}

// x-lang: refusals the server writes itself (a 429, a validation message) come back in the
// language the owner reads the page in.
function headers(): Record<string, string> {
  const auth = authHeader();
  return { "content-type": "application/json", "x-lang": useLang.getState().lang, ...(auth ? { authorization: auth } : {}) };
}

async function failFrom(res: Response): Promise<Fail> {
  const j = (await res.json().catch(() => null)) as { error?: string; code?: string; reason?: string; addAdminUrl?: string; missing?: unknown } | null;
  return {
    ok: false,
    status: res.status,
    error: typeof j?.error === "string" ? j.error : undefined,
    code: j?.code ?? (res.status === 429 ? "rate_limited" : res.status === 404 ? "not_found" : "http"),
    reason: j?.reason,
    addAdminUrl: j?.addAdminUrl,
    missing: Array.isArray(j?.missing) ? (j.missing as Missing[]).filter((m) => typeof m?.script === "string" && Array.isArray(m.tokens)) : undefined,
  };
}

function caught(err: unknown, timedOut: boolean): Fail {
  if (timedOut) return { ok: false, code: "timeout", status: 0 };
  return { ok: false, code: "network", status: 0, error: undefined, reason: err instanceof Error ? err.message : undefined };
}

/**
 * One JSON request. `timeoutMs` sits a little above the route's maxDuration so the server's own
 * limit decides and its `{ error, code }` reaches the owner.
 */
async function call<T>(path: string, init: { method: "GET" | "POST"; body?: unknown; keepalive?: boolean }, timeoutMs: number): Promise<Res<T>> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: init.method,
      headers: headers(),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ctrl.signal,
      keepalive: init.keepalive,
    });
    if (!res.ok) return await failFrom(res);
    const json = (await res.json().catch(() => null)) as T | null;
    if (!json) return { ok: false, code: "bad_json", status: res.status };
    return { ok: true, data: json };
  } catch (err) {
    return caught(err, timedOut);
  } finally {
    clearTimeout(timer);
  }
}

const q = (lang: Lang) => `lang=${lang}`;

/* ------------------------------------------------------------------ brand */

export type ChannelInfo = { title?: string; subscribers?: number; postsRead?: number };

export function createBrand(input: { channel?: string; knowledge?: string; mode?: BrandMode; lang: Lang }) {
  return call<{ brand: BrandProfile; channelInfo?: ChannelInfo }>(
    "/brand",
    { method: "POST", body: { ...input, initData: tgInitData() } },
    95_000,
  );
}

export function getBrand(id: string, lang: Lang) {
  return call<{ brand: BrandProfile }>(`/brand?id=${encodeURIComponent(id)}&${q(lang)}`, { method: "GET" }, 20_000);
}

/* --------------------------------------------------------------- analysis */

export function analyzeChannel(channel: string, lang: Lang) {
  return call<{ audit: ChannelAudit }>("/analyze", { method: "POST", body: { channel, lang } }, 95_000);
}

/* --------------------------------------------------------------- strategy */

/** Empty-channel brands also get launch tactics (how to get the first subscribers). */
export type Launch = { weeks?: number; tactics: { title: string; how: string; why?: string }[] };
/** Brain v2 "sufficiency": for each part of the plan, whether it rests on the channel's data, a benchmark or a prior. */
export type Sufficiency = { key: string; status: "data" | "benchmark" | "prior" | "insufficient"; n: number; need: number; text: string };
export type StrategyResult = { strategy: Strategy; plan: ContentPlan; launch?: Launch; sufficiency?: Sufficiency[] };

/** Extra fields the strategist puts on plan items beyond the contract (shown in Pro rejim). */
/**
 * Brain v2's forecast for a slot (lib/uslub/brain/forecast.ts): a views range when the data
 * allows one, and an owner-readable `display` either way. Older plans sent the range flat.
 */
export type SlotForecast = {
  status?: "ok" | "insufficient";
  views?: { low: number; mid: number; high: number };
  display?: string;
  low?: number;
  high?: number;
};
export type PlanItemExtra = { forecast?: SlotForecast; briefMeta?: string; approvalReasons?: string[] };

/** The views range of a forecast, whichever shape it came in; null when there is none. */
export function forecastRange(f?: SlotForecast): { low: number; high: number } | null {
  const r = f?.views ?? f;
  return r && Number.isFinite(r.low) && Number.isFinite(r.high) ? { low: r.low as number, high: r.high as number } : null;
}

export type StrategyEvent =
  | { stage: "skeleton"; slots: unknown[] }
  | { stage: "item"; item: PlanItem }
  | { stage: string; [k: string]: unknown };

/**
 * The weekly plan, streamed (NDJSON): progress arrives as `skeleton` (how many slots) and `item`
 * (one per finished slot), then `result`. Strategy takes ~45 s; the route's maxDuration is 90 s and the client waits 95 s.
 */
export async function buildStrategy(
  brandId: string,
  lang: Lang,
  onEvent: (e: StrategyEvent) => void,
  timeoutMs = 95_000,
): Promise<Res<StrategyResult>> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  try {
    const res = await fetch(`${BASE}/strategy`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ brandId, lang, stream: true }),
      signal: ctrl.signal,
    });
    if (!res.ok) return await failFrom(res);
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("ndjson") || !res.body) {
      const j = (await res.json().catch(() => null)) as StrategyResult | null;
      return j?.plan ? { ok: true, data: j } : { ok: false, code: "bad_json", status: res.status };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let result: StrategyResult | null = null;
    let failure: Fail | null = null;
    const line = (raw: string) => {
      const s = raw.trim();
      if (!s) return;
      let e: StrategyEvent & { error?: string; code?: string; status?: number };
      try {
        e = JSON.parse(s);
      } catch {
        return;
      }
      if (e.stage === "result") result = e as unknown as StrategyResult;
      else if (e.stage === "error") failure = { ok: false, code: e.code ?? "http", status: e.status ?? 500, error: e.error };
      else onEvent(e);
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      lines.forEach(line);
    }
    line(buf);
    if (failure) return failure;
    if (result) return { ok: true, data: result };
    return { ok: false, code: "incomplete", status: res.status };
  } catch (err) {
    return caught(err, timedOut);
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ posts */

export type SlotBrief = PlanSlot & { brief: string };

export function slotOf(item: PlanItem): SlotBrief {
  return { day: item.day, time: item.time, goal: item.goal, hook: item.hook, cta: item.cta, brief: item.brief };
}

/** A slot the writer could not fill; `index` points into the slots that were sent. */
export type MissedSlot = { index: number; day: string; time: string; error: string; code: string };

/**
 * One post per slot. Partial success is normal: `failed` lists the slots that came out empty.
 * The route works to a ~60 s budget with maxDuration 120; the client waits 125 s so the server is
 * done before we give up, and the store then lists what landed instead of writing it again.
 */
export function writePosts(brandId: string, slots: SlotBrief[], lang: Lang) {
  return call<{ posts: PostDraft[]; failed?: MissedSlot[] }>("/posts", { method: "POST", body: { brandId, slots: slots.slice(0, 7), lang } }, 125_000);
}

export function listPosts(brandId: string, lang: Lang) {
  return call<{ posts: PostDraft[] }>(`/posts?brandId=${encodeURIComponent(brandId)}&${q(lang)}`, { method: "GET" }, 20_000);
}

/** Persists the approval. Edited texts ride along so the bot publishes what the owner saw. */
export function approvePost(postId: string, lang: Lang, variants?: Partial<Record<Script, string>>, keepalive = false) {
  return call<{ post: PostDraft }>("/posts/approve", { method: "POST", body: { postId, lang, ...(variants ? { variants } : {}) }, keepalive }, 20_000);
}

/* --------------------------------------------------------------- pictures */

/** Learns the brand's picture style from channel photos and/or the owner's photos (data: URLs). */
export function learnVisual(brandId: string, ownerImages: string[] | undefined, lang: Lang) {
  return call<{ visual: VisualStyle }>("/visual", { method: "POST", body: { brandId, ownerImages, lang } }, 125_000);
}

export function startPostImage(postId: string, lang: Lang) {
  return call<{ image: PostImage }>("/media/post-image", { method: "POST", body: { postId, lang } }, 155_000);
}

export function getPostImage(postId: string, lang: Lang) {
  return call<{ image: PostImage }>(`/media/post-image?postId=${encodeURIComponent(postId)}&${q(lang)}`, { method: "GET" }, 15_000);
}

/* ---------------------------------------------------------------- publish */

/** Inside the Mini App only: the server checks initData, ownership and the bot's admin rights. */
export function publishPost(postId: string, script: Script, chat: string, lang: Lang) {
  return call<{ ok: boolean; url?: string; error?: string; code?: string; addAdminUrl?: string; missing?: Missing[] }>(
    "/publish",
    { method: "POST", body: { postId, script, chat, lang, initData: tgInitData() } },
    35_000,
  );
}
