/**
 * Telegram deep-link start payloads reduced to something safe to store in analytics and show on /stats.
 *
 * Some payloads carry bearer ids: `publish_<postId>` (the Studio's «Kanalga joylash»), and `brand_<brandId>` /
 * `post_<id>` (startapp links into the Mini App). For a web brand nobody owns yet the brand id alone opens it
 * (uslub/http.ts), so analytics keep only the word in front of an id:
 *
 *   publish_<uuid>_ru -> "publish"     brand_<uuid> -> "brand"      ref_42 -> "ref"
 *   src_<tag>_<n> (tracked link in a plan post) -> "plan"
 *   src_booth1 or booth1 (a /qr code) -> "booth1"     landing -> "landing"     utm_tg_ads -> "utm_tg_ads"
 *   a bare id, or anything outside Telegram's payload alphabet -> "other"; empty -> null
 *
 * Idempotent, so /stats can bucket rows stored before this existed (they hold the payload minus "src_").
 * Pure: no I/O, imported by the bot, the Mini App auth route and the stats query.
 */

/** Telegram deep-link payloads allow only A-Z a-z 0-9 _ - (max 64 chars). */
const PAYLOAD_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** The bot's tracked plan link `src_<6-char tag>_<slot>` (bot.ts PLAN_LINK_RE); stored rows lost the "src_". */
const PLAN_LINK_RE = /^src_[a-z0-9]{6}_\d{1,2}$/;
const STORED_PLAN_RE = /^(?:src_)?[a-z0-9]{6}_\d{1,2}$/;

/** Prefixes whose tail is an id or a channel name: always reduced to the prefix, whatever follows. */
const ID_PREFIXES = new Set(["publish", "brand", "post", "ch"]);

const OTHER = "other";
const MAX_LENGTH = 32;

/** Looks like an id rather than a word: a number, a UUID or hex string, or a long token with digits. */
function isIdLike(part: string): boolean {
  if (/^\d+$/.test(part)) return true;
  if (/^[0-9a-f]{8,}$/.test(part) && /\d/.test(part)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/.test(part)) return true;
  return part.length > 24 || (part.length >= 12 && /\d/.test(part));
}

export function sourceCategory(payload?: string | null): string | null {
  const raw = payload?.trim();
  if (!raw) return null;
  if (!PAYLOAD_RE.test(raw)) return OTHER;

  const lower = raw.toLowerCase();
  if (STORED_PLAN_RE.test(lower)) return "plan";

  const body = lower.startsWith("src_") && lower.length > 4 ? lower.slice(4) : lower;
  const parts = body.split("_");
  if (ID_PREFIXES.has(parts[0])) return parts[0];

  const words: string[] = [];
  for (const part of parts) {
    if (!part || isIdLike(part)) break;
    words.push(part);
  }
  return words.length ? words.join("_").slice(0, MAX_LENGTH) : OTHER;
}

/**
 * The start payload as kept in event props (`start` and `miniapp_open` events): plan links stay whole, because
 * brain/memory.ts counts starts per tracked link; anything else is reduced to its category.
 */
export function eventStartPayload(payload?: string | null): string | null {
  const raw = payload?.trim();
  if (raw && PLAN_LINK_RE.test(raw)) return raw;
  return sourceCategory(raw);
}

export type SourceCount = { source: string; count: number };

/**
 * Users per source for /stats, merged by category: rows stored before sources were categorised still hold raw
 * payloads such as publish_<postId> or brand_<brandId>. No source (or an empty one) counts as "direct".
 */
export function bucketSources(rows: { source: string | null; count: number }[]): SourceCount[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const source = sourceCategory(row.source) ?? "direct";
    totals.set(source, (totals.get(source) ?? 0) + row.count);
  }
  return [...totals]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}
