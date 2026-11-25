/**
 * Telegram deep-link start payloads reduced to something safe to store in analytics and show on /stats.
 *
 * Some payloads carry bearer ids: `publish_<postId>` (the Studio's «Kanalga joylash»), and `brand_<brandId>` /
 * `post_<id>` (startapp links into the Mini App). For a web brand nobody owns yet the brand id alone opens it
 * (uslub/http.ts), so analytics never keep them:
 *
 *   src_<label> (a /qr code)  -> the owner's label, lowercased, ≤32 chars: src_booth_1 -> "booth_1",
 *                                src_tashkent2026 -> "tashkent2026"; a UUID or a long hex run in it -> "other"
 *   src_<tag>_<n> (tracked link in a plan post) -> "plan"
 *   publish_<uuid>_ru -> "publish"     brand_<uuid> -> "brand"     post_… -> "post"     ch_… -> "ch"
 *   any other <word>_<id> -> "<word>" (ref_42 -> "ref"); landing -> "landing"; a bare id -> "other"
 *   anything outside Telegram's payload alphabet -> "other"; empty -> null
 *
 * Pure: no I/O, imported by the bot, the Mini App auth route, the stats query and /qr.
 */

/** Telegram deep-link payloads allow only A-Z a-z 0-9 _ - (max 64 chars). */
const PAYLOAD_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** The bot's tracked plan link `src_<6-char tag>_<slot>` (bot.ts PLAN_LINK_RE). */
const PLAN_LINK_RE = /^src_[a-z0-9]{6}_\d{1,2}$/;
const PLAN_ANY_RE = /^(?:src_)?[a-z0-9]{6}_\d{1,2}$/;
/** A plan link in a row stored before categories: the old parseSource had cut the "src_". */
const OLD_PLAN_ROW_RE = /^[a-z0-9]{6}_\d{1,2}$/;

/** Prefixes whose tail is an id or a channel name: always reduced to the prefix, whatever follows. */
const ID_PREFIXES = new Set(["publish", "brand", "post", "ch"]);

/** An id hidden inside a label or a word: a UUID, or 16+ hex characters in a row. */
const UUID_IN_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const LONG_HEX_IN_RE = /[0-9a-f]{16,}/;

const OTHER = "other";
const MAX_LENGTH = 32;

const hidesId = (value: string) => UUID_IN_RE.test(value) || LONG_HEX_IN_RE.test(value);

/** Looks like an id rather than a word: a number, a UUID or hex run, or a long token with digits. */
function isIdLike(part: string): boolean {
  if (/^\d+$/.test(part) || hidesId(part)) return true;
  if (/^[0-9a-f]{8,}$/.test(part) && /\d/.test(part)) return true;
  return part.length > 24 || (part.length >= 12 && /\d/.test(part));
}

/** The tail of `src_<label>`: the owner chose it on /qr, so it is kept unless an id hides in it. */
function labelCategory(label: string): string {
  if (!label) return OTHER;
  const head = label.split("_")[0];
  if (ID_PREFIXES.has(head)) return head;
  if (hidesId(label)) return OTHER;
  return label.slice(0, MAX_LENGTH);
}

/** Any other payload: the words in front of the first id-like part. */
function wordCategory(payload: string): string {
  const parts = payload.split("_");
  if (ID_PREFIXES.has(parts[0])) return parts[0];
  const words: string[] = [];
  for (const part of parts) {
    if (!part || isIdLike(part)) break;
    words.push(part);
  }
  return words.length ? words.join("_").slice(0, MAX_LENGTH) : OTHER;
}

export function sourceCategory(payload?: string | null): string | null {
  const raw = payload?.trim();
  if (!raw) return null;
  if (!PAYLOAD_RE.test(raw)) return OTHER;
  const lower = raw.toLowerCase();
  if (PLAN_ANY_RE.test(lower)) return "plan";
  if (lower.startsWith("src_")) return labelCategory(lower.slice(4));
  return wordCategory(lower);
}

/**
 * The category of a value already stored in `app_users.source`, read as a label and never stripped of "src_" again:
 * storedSourceCategory(sourceCategory(p)) === sourceCategory(p) for every payload p.
 *
 * Rows from before categories hold the payload minus one leading "src_" (the old parseSource), so:
 *   - an old /qr label (`booth_1`, `tashkent2026`) reads as itself;
 *   - an old plan link reads `<tag>_<n>` and maps to "plan" (OLD_PLAN_ROW_RE; a new row never looks like that);
 *   - an old `publish_<id>` / `brand_<id>` / `post_<id>` / `ch_<name>` row collapses to its prefix, and a value
 *     with a UUID or a 16+ hex run in it to "other";
 *   - an old row that still starts with "src_" came from a `src_src_…` payload: its label really is `src_…`,
 *     the same as a new row of that payload, so it is kept as is.
 */
export function storedSourceCategory(value?: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (!PAYLOAD_RE.test(raw)) return OTHER;
  const lower = raw.toLowerCase();
  if (OLD_PLAN_ROW_RE.test(lower)) return "plan";
  return labelCategory(lower);
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

/** Users per stored source for /stats, merged by category. No source (or an empty one) counts as "direct". */
export function bucketSources(rows: { source: string | null; count: number }[]): SourceCount[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const source = storedSourceCategory(row.source) ?? "direct";
    totals.set(source, (totals.get(source) ?? 0) + row.count);
  }
  return [...totals]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}
