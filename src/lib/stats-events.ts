import "server-only";
import type { Script } from "./uslub/contract";
import { findPlaceholders } from "./uslub/placeholders";
import { type EventEnv, eventEnv, STATS_EVENT } from "./stats-meta";
import { safeLogEvent } from "./track";

/**
 * Writers for the /stats events other streams log (names in stats-meta.ts STATS_EVENT). Each one keeps codes, counts
 * and flags only: no message text, no post text, no IP. Each returns the write (hand it to after() or await it) or
 * null when nothing is written. None of them throws.
 *
 * Errors are written in production only, so a dev server pointed at the shared database adds no rows; the rest follow
 * logEvent (tagged env "dev" outside production and hidden on /stats by default).
 */

// ------------------------------------------------------------------------------------------------------ errors

/**
 * Per-instance cap for error rows: at most `perKey` rows a minute for one (route, code) and `total` in all, so a
 * script hammering a broken route cannot flood the table. Memory is bounded by `total`.
 */
export class MinuteCap {
  private minute = -1;
  private total = 0;
  private readonly perKey = new Map<string, number>();

  constructor(
    private readonly maxPerKey = 20,
    private readonly maxTotal = 120,
  ) {}

  take(key: string, nowMs: number = Date.now()): boolean {
    const minute = Math.floor(nowMs / 60_000);
    if (minute !== this.minute) {
      this.minute = minute;
      this.total = 0;
      this.perKey.clear();
    }
    if (this.total >= this.maxTotal) return false;
    const used = this.perKey.get(key) ?? 0;
    if (used >= this.maxPerKey) return false;
    this.perKey.set(key, used + 1);
    this.total += 1;
    return true;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An API route as logged: "uslub/posts/approve". Id-like segments read ":id"; anything odd reads "other". */
export function errorRoute(route: string): string {
  const parts = route
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .replace(/^api\//, "")
    .split("/")
    .filter(Boolean)
    .map((part) => (UUID_RE.test(part) || /\d{4,}/.test(part) || part.length > 32 ? ":id" : part));
  const out = parts.join("/");
  return out && out.length <= 64 && /^[a-z0-9/_:.-]+$/.test(out) ? out : "other";
}

/** An error code as logged: our own codes look like "rate_limited"; anything else reads "other". */
export const errorCode = (code: unknown): string => (typeof code === "string" && /^[a-z][a-z0-9_]{0,40}$/.test(code) ? code : "other");

const errorCap = new MinuteCap();

export type ErrorLogOptions = { env?: EventEnv; now?: number; cap?: MinuteCap };

/**
 * An error answer a person got from an API route: `api_error` { route, code, status }. The surface, the visitor key
 * and the verified Telegram user come from the ambient run (call it inside the request). Production only, capped.
 */
export function logApiError(route: string, code: unknown, status: number, options: ErrorLogOptions = {}): Promise<void> | null {
  if ((options.env ?? eventEnv()) !== "prod") return null;
  const props = { route: errorRoute(route), code: errorCode(code), status: Number.isInteger(status) ? status : 0 };
  if (!(options.cap ?? errorCap).take(`${props.route}|${props.code}`, options.now)) return null;
  return safeLogEvent(null, STATS_EVENT.apiError, props);
}

// ------------------------------------------------------------------------------------------------- edit diffs

/** How much the owner changed one script of a post before approving it. Numbers and flags only, never text. */
export type EditDiff = {
  script: Script;
  chars_before: number;
  chars_after: number;
  words_added: number;
  words_removed: number;
  lines_changed: number;
  placeholders_filled: number;
  link_removed: boolean;
  phone_added: boolean;
};

const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'ʼ‘’-]*/gu) ?? [];

/** Words in `a` that `b` does not have, counted as a multiset (a moved word is not a change). */
function missing(a: string[], b: string[]): number {
  const left = new Map<string, number>();
  for (const w of b) left.set(w, (left.get(w) ?? 0) + 1);
  let count = 0;
  for (const w of a) {
    const n = left.get(w) ?? 0;
    if (n > 0) left.set(w, n - 1);
    else count += 1;
  }
  return count;
}

const BOT_LINK_RE = /t\.me\/[A-Za-z0-9_]{3,40}\?start=/i;
/** An Uzbek phone number: "+998 90 123 45 67", "(90) 123-45-67", "901234567". */
const UZ_PHONE_RE = /(?<![\d+])(?:\+?998[\s()-]*)?\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)/g;

/** One script's diff (pure). */
export function editDiff(script: Script, before: string, after: string): EditDiff {
  const lines = (t: string) => t.split("\n").map((l) => l.trim());
  const [la, lb] = [lines(before), lines(after)];
  const changedLines = Math.max(missing(la, lb), missing(lb, la));
  const [wa, wb] = [words(before), words(after)];
  const filled = findPlaceholders(before).filter((token) => !after.includes(token)).length;
  return {
    script,
    chars_before: before.length,
    chars_after: after.length,
    words_added: missing(wb, wa),
    words_removed: missing(wa, wb),
    lines_changed: changedLines,
    placeholders_filled: filled,
    link_removed: BOT_LINK_RE.test(before) && !BOT_LINK_RE.test(after),
    phone_added: (after.match(UZ_PHONE_RE)?.length ?? 0) > (before.match(UZ_PHONE_RE)?.length ?? 0),
  };
}

/** The diff of every changed script (pure). Scripts missing on either side are skipped. */
export function editDiffs(
  before: Partial<Record<Script, string>>,
  after: Partial<Record<Script, string>>,
  scripts: readonly string[],
): EditDiff[] {
  const out: EditDiff[] = [];
  for (const script of new Set(scripts)) {
    const a = before[script as Script];
    const b = after[script as Script];
    if (typeof a === "string" && typeof b === "string" && a !== b) out.push(editDiff(script as Script, a, b));
  }
  return out;
}

/**
 * The owner edited a post before approving it: `post_edited` { post_id, scripts, diff }. Call it with the text as it
 * was before the edit and as it was approved (posts/approve/route.ts does).
 */
export function logPostEdited(
  telegramId: number | null,
  postId: string,
  before: Partial<Record<Script, string>>,
  after: Partial<Record<Script, string>>,
  scripts: readonly string[],
): Promise<void> | null {
  const diff = editDiffs(before, after, scripts);
  if (!diff.length) return null;
  return safeLogEvent(telegramId, STATS_EVENT.postEdited, { post_id: postId, scripts: diff.map((d) => d.script), diff });
}

// ---------------------------------------------------------------------------------- regenerations, rejections

export const REGENERATE_WHY = ["another_version", "rewrite_phrase", "fix_blank", "other"] as const;
export type RegenerateWhy = (typeof REGENERATE_WHY)[number];

/** A post's text was written again on the owner's request: `post_regenerated` { post_id?, brand_id?, why }. */
export function logPostRegenerated(
  telegramId: number | null,
  args: { postId?: string; brandId?: string; why: RegenerateWhy },
): Promise<void> {
  const why = (REGENERATE_WHY as readonly string[]).includes(args.why) ? args.why : "other";
  return safeLogEvent(telegramId, STATS_EVENT.postRegenerated, {
    ...(args.postId ? { post_id: args.postId } : {}),
    ...(args.brandId ? { brand_id: args.brandId } : {}),
    why,
  });
}

export const REJECT_REASONS = ["price_missing", "wrong_contact", "wrong_facts", "tone", "repeat", "picture", "language", "undo", "other"] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

/** The owner turned a post down (a reject chip, or undoing an approval): `post_rejected` { post_id, reason }. */
export function logPostRejected(telegramId: number | null, args: { postId: string; reason?: RejectReason }): Promise<void> {
  const reason = args.reason && (REJECT_REASONS as readonly string[]).includes(args.reason) ? args.reason : "other";
  return safeLogEvent(telegramId, STATS_EVENT.postRejected, { post_id: args.postId, reason });
}

// ------------------------------------------------------------------------------------------------------ trial

/**
 * The autopilot was switched on for the first time, which starts the trial: `trial_started` { brand_id, trial_days }.
 * For the autopilot stream: call it once, where `brands.autopilot.since` is first set.
 */
export function logTrialStarted(
  telegramId: number | null,
  args: { brandId: string; since: Date | string; trialEndsAt: Date | string },
): Promise<void> {
  const days = Math.round((new Date(args.trialEndsAt).getTime() - new Date(args.since).getTime()) / 86_400_000);
  return safeLogEvent(telegramId, STATS_EVENT.trialStarted, {
    brand_id: args.brandId,
    trial_days: Number.isFinite(days) && days >= 0 && days <= 366 ? days : null,
  });
}
