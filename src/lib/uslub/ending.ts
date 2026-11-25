/**
 * How a channel's posts end (owner correction 1, 2026-11-25): learned from the channel's own posts, never a rule.
 * A channel that ends its posts with "📞 +998 90 123 45 67" gets new posts ending the same way; a channel whose posts
 * just end gets nothing added. Mercat's tracked link is opt-in and inserted by code (ensureTrackedLink), never by the
 * prompt, and never in place of the channel's own contact.
 * Pure (no I/O): every rule is unit-tested.
 */
import type { PostEnding, Script } from "./contract";

export interface EndingPost {
  text: string;
  isForward?: boolean;
}

export interface EndingOptions {
  /** The channel's own @username: a link to itself is not a contact. */
  channel?: string;
  /** Mercat's bot (BOT_USERNAME): never the channel's contact. */
  bot?: string;
}

const AD_RE = /#reklama|#реклама|(^|[^\p{L}])реклама([^\p{L}]|$)|\breklama\b|#ad\b|erid/iu;
export const PHONE_RE = /(?:\+?998[\s-]?\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2})|(?:\(\d{2}\)\s?\d{3}[\s-]?\d{2}[\s-]?\d{2})/g;
const HANDLE_RE = /(?<![\w/.])@([A-Za-z][\w]{3,31})/g;
const TME_RE = /(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(\+?[\w]+)(\/\d+)?(\?[\w=&-]*)?/gi;
const WA_RE = /(?:https?:\/\/)?wa\.me\/\d+/gi;
const URL_RE = /(?:https?:\/\/|www\.)\S+|(?<![@\w])[\w-]+\.(?:uz|com|ru|org|net|me|io|shop|store)(?:\/\S*)?/gi;
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;
const HAS_HASHTAG = /#[\p{L}\p{N}_]+/u;
const ADMIN_RE = /(?<!\p{L})(admin|administrator|админ|администратор|lichka|lichkaga|личк|в лс|direct|direkt|директ|yozing|yozib qoldiring|напишите|пишите|write to us|message us|dm us)\p{L}*/iu;

const norm = (s: string) => s.toLowerCase().replace(/^@/, "");

/** The last lines of a post that make its ending: up to 2 non-empty lines (3 when the last one is only hashtags). */
export function endingOf(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return "";
  const take = isHashtagLine(lines[lines.length - 1]) ? 3 : 2;
  return lines.slice(-take).join("\n");
}

const isHashtagLine = (line: string) => {
  const rest = line.replace(HASHTAG_RE, "").replace(/[\p{Extended_Pictographic}\s|•·,.-]/gu, "");
  return rest.length === 0 && HAS_HASHTAG.test(line);
};

/**
 * Contacts in a text, as keys (phone = its last 9 digits, @handle / t.me user / wa.me in lower case) with the text as
 * written: the channel's own handle, its post links and invite links, and Mercat's bot are not contacts.
 */
export function contactsIn(text: string, opts: EndingOptions = {}): { key: string; raw: string }[] {
  const own = opts.channel ? norm(opts.channel) : "";
  const bot = opts.bot ? norm(opts.bot) : "";
  const out: { key: string; raw: string }[] = [];
  for (const m of text.matchAll(PHONE_RE)) out.push({ key: `tel:${m[0].replace(/\D/g, "").slice(-9)}`, raw: m[0].trim() });
  for (const m of text.matchAll(HANDLE_RE)) {
    const h = m[1].toLowerCase();
    if (h === own || h === bot) continue;
    out.push({ key: `tg:${h}`, raw: m[0] });
  }
  for (const m of text.matchAll(TME_RE)) {
    const name = m[1].toLowerCase();
    // t.me/<channel>/<id> is a post, t.me/+… and joinchat are invites, t.me/s/… is the preview: none is a contact.
    if (m[2] || name.startsWith("+") || name === "joinchat" || name === "s" || name === own || name === bot) continue;
    out.push({ key: `tg:${name}`, raw: m[0] });
  }
  for (const m of text.matchAll(WA_RE)) out.push({ key: `wa:${m[0].replace(/\D/g, "")}`, raw: m[0] });
  return out;
}

type Kind = PostEnding["pattern"];

/** What one post's ending does: names a contact, sends to the admin, gives a link, only hashtags, or nothing. */
export function classifyEnding(ending: string, opts: EndingOptions = {}): Exclude<Kind, "mixed"> {
  if (!ending.trim()) return "none";
  if (contactsIn(ending, opts).length) return "contact";
  // A link, or the channel signing off with its own @name / t.me link (a signature the new posts keep).
  const own = opts.channel ? norm(opts.channel) : "";
  const signature = own && new RegExp(String.raw`(?<![\w/.])@${own}(?!\w)|t\.me\/${own}(?![\w/])`, "i").test(ending);
  if (signature || [...ending.matchAll(URL_RE)].length) return "link";
  if (ADMIN_RE.test(ending)) return "admin";
  const last = ending.split("\n").at(-1) ?? "";
  if (isHashtagLine(last)) return "hashtags";
  return "none";
}

const MAX_LINE = 140;

/**
 * The channel's usual ending, from its own posts (newest first; ads and forwards skipped). The pattern is the habit
 * at least half the posts share, else "mixed". `contact` is the channel's most frequent contact, as the line that
 * carries it is most often written ("📞 Buyurtma: +998 90 123 45 67"), and only when at least two posts use it (one
 * when the channel has fewer than three posts): a contact seen once may be a partner's.
 */
export function extractPostEnding(posts: (string | EndingPost)[], opts: EndingOptions = {}): PostEnding {
  const own = posts
    .map((p) => (typeof p === "string" ? { text: p } : p))
    .filter((p) => !p.isForward && p.text.trim().length >= 10 && !AD_RE.test(p.text));
  if (!own.length) return { pattern: "none", examples: [] };
  const endings = own.map((p) => endingOf(p.text));
  const kinds = endings.map((e) => classifyEnding(e, opts));
  const counts = new Map<Kind, number>();
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  const [topKind, topN] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const pattern: Kind = topN * 2 >= own.length ? topKind : "mixed";

  // Contact: the most frequent contact across the endings (then the whole posts), in the line that carries it.
  const tally = new Map<string, { n: number; lines: Map<string, number> }>();
  endings.forEach((e) => {
    const seen = new Set<string>();
    for (const c of contactsIn(e, opts)) {
      if (seen.has(c.key)) continue;
      seen.add(c.key);
      const t = tally.get(c.key) ?? { n: 0, lines: new Map<string, number>() };
      t.n++;
      const line = (e.split("\n").find((l) => contactsIn(l, opts).some((x) => x.key === c.key)) ?? c.raw).replace(/\s+/g, " ").trim();
      t.lines.set(line, (t.lines.get(line) ?? 0) + 1);
      tally.set(c.key, t);
    }
  });
  const minUses = own.length < 3 ? 1 : 2;
  const best = [...tally.values()].filter((t) => t.n >= minUses).sort((a, b) => b.n - a.n)[0];
  const contactLine = best ? [...best.lines.entries()].sort((a, b) => b[1] - a[1])[0][0] : undefined;

  // Hashtags the channel ends with again and again (topic tags used once are not a habit).
  const tagCount = new Map<string, { n: number; raw: string }>();
  for (const e of endings) for (const tag of new Set((e.match(HASHTAG_RE) ?? []).map((t) => t))) {
    const k = tag.toLowerCase();
    tagCount.set(k, { n: (tagCount.get(k)?.n ?? 0) + 1, raw: tagCount.get(k)?.raw ?? tag });
  }
  const minTag = Math.max(2, Math.ceil(own.length * 0.3));
  const hashtags = [...tagCount.values()].filter((t) => t.n >= minTag).sort((a, b) => b.n - a.n).slice(0, 5).map((t) => t.raw);

  const examples = endings.filter((e) => e.trim()).slice(0, 3).map((e) => (e.length > MAX_LINE * 2 ? `${e.slice(0, MAX_LINE * 2).trimEnd()}…` : e));
  return {
    pattern,
    ...(contactLine ? { contact: contactLine.length > MAX_LINE ? contactLine.slice(0, MAX_LINE).trimEnd() : contactLine } : {}),
    ...(hashtags.length ? { hashtags } : {}),
    examples,
  };
}

/* ------------------------------------------------------------------ applying the ending to a new post */

type Variant = Exclude<Script, "uz_cyrl">;

const UZ_LATIN_RE = /o['‘’ʻ`]|g['‘’ʻ`]|(?<!\p{L})(uchun|buyurtma|yozing|murojaat|manzil|bog['‘’ʻ]lan|aloqa|qo['‘’ʻ]ng['‘’ʻ]iroq|telefon|raqam)/iu;

/** The contact line in this variant: as the channel writes it when it is in the variant's language, else emoji + contact. */
export function contactLineFor(line: string, script: Variant, opts: EndingOptions = {}): string {
  const contacts = contactsIn(line, opts);
  let words = line;
  for (const c of contacts) words = words.replace(c.raw, " ");
  words = words.replace(URL_RE, " ");
  const letters = words.replace(/[^\p{L}]/gu, "");
  const cyr = /[Ѐ-ӿ]/.test(letters);
  const fits =
    !letters ||
    (script === "ru" && cyr) ||
    (script === "uz_latn" && !cyr && UZ_LATIN_RE.test(words)) ||
    (script === "en" && !cyr && !UZ_LATIN_RE.test(words));
  if (fits) return line.trim();
  const lead = (/^[\p{Extended_Pictographic}️‍\s]+/u.exec(line)?.[0] ?? "").trim();
  return [lead, contacts.map((c) => c.raw).join(" · ")].filter(Boolean).join(" ");
}

const CONTACT_BLANK_RE = /\[(kontakt|контакт|contact)\]/i;
const BLANK_SENTENCE_RE = /[^\n.!?]*\[(kontakt|контакт|contact)\][^\n.!?]*[.!?]?/gi;

/**
 * Ends a new post the way the channel's posts end:
 * - "contact": the channel's contact goes in (a [kontakt] blank is filled with it; otherwise its line is appended once);
 * - "hashtags": the channel's recurring hashtags are appended when the post has none of them;
 * - "none": nothing is added, and a [kontakt] blank the writer left is removed (the channel never names a contact);
 * - "admin" / "link" / "mixed": the writer followed the examples; nothing is forced.
 * Never adds Mercat's link. Idempotent.
 */
export function applyPostEnding(text: string, ending: PostEnding | undefined, script: Variant, opts: EndingOptions = {}): string {
  if (!ending) return text;
  let out = text;
  if (ending.contact && (ending.pattern === "contact" || CONTACT_BLANK_RE.test(out))) {
    const keys = new Set(contactsIn(ending.contact, opts).map((c) => c.key));
    const present = contactsIn(out, opts).some((c) => keys.has(c.key));
    const raw = contactsIn(ending.contact, opts)[0]?.raw;
    if (CONTACT_BLANK_RE.test(out) && raw) out = out.replace(new RegExp(CONTACT_BLANK_RE.source, "gi"), raw);
    else if (!present && ending.pattern === "contact") out = `${out.trimEnd()}\n\n${contactLineFor(ending.contact, script, opts)}`;
  } else if ((ending.pattern === "none" || ending.pattern === "hashtags") && CONTACT_BLANK_RE.test(out)) {
    out = out
      .replace(BLANK_SENTENCE_RE, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  if (ending.pattern === "hashtags" && ending.hashtags?.length) {
    const has = ending.hashtags.some((h) => out.toLowerCase().includes(h.toLowerCase()));
    if (!has) out = `${out.trimEnd()}\n\n${ending.hashtags.join(" ")}`;
  }
  return out;
}

/** Contact keys a post-pass must never delete: the channel's own contact and the owner's answered contact. */
export function ownContactKeys(ending: PostEnding | undefined, extra: (string | undefined)[] = [], opts: EndingOptions = {}): string[] {
  return [ending?.contact, ...extra].flatMap((t) => (t ? contactsIn(t, opts).map((c) => c.key) : []));
}

/* ------------------------------------------------------------------ the opt-in tracked link */

const TRACK_LABEL: Record<Variant, string> = { uz_latn: "Yozish uchun", ru: "Написать", en: "Message us" };

/** A tracked Mercat link (t.me/<bot>?start=src_<tag>_<slot>), as the planner builds it. */
export const TRACKED_LINK_RE = /^https:\/\/t\.me\/(\w{4,32})\?start=src_[a-z0-9]{6}_\d{1,2}$/;

/**
 * The opt-in tracked link, put in by code: the exact link stays when the writer copied it; a mangled copy (another
 * payload, no https, the bot without ?start) is replaced; when it is missing, one short line is appended. The
 * channel's own contact is never removed for it.
 */
export function ensureTrackedLink(text: string, link: string, script: Variant): string {
  const m = TRACKED_LINK_RE.exec(link);
  if (!m) return text;
  if (text.includes(link)) return text;
  const bot = m[1];
  // The bot's name must end there: a channel link that starts with it (t.me/mercatai_uz) is not a copy of the link.
  const mangled = new RegExp(String.raw`(?:https?:\/\/)?(?:t\.me|telegram\.me)\/${bot}(?!\w)(?:\?start=[\w-]*)?`, "i");
  if (mangled.test(text)) return text.replace(mangled, link);
  return `${text.trimEnd()}\n\n${TRACK_LABEL[script]}: ${link}`;
}

const ANY_TRACKED_RE = /\s*(?:https?:\/\/)?t\.me\/\w+\?start=src_[\w-]+/gi;

/** A CTA without Mercat tracked links (a plan made before links became opt-in, or a brand with no owner). */
export function withoutTrackedLinks(cta: string): string {
  return cta.replace(ANY_TRACKED_RE, "").replace(/[\s:–—-]+$/, "").trim();
}

/** Words of a call to action that only make sense with something to tap or write to ("Buyurtma bering", "Пишите"). */
const CTA_WORD_RE =
  /(?<!\p{L})(buyurtma|zakaz|заказ|order|yoz|qo['‘’ʻ]ng['‘’ʻ]iroq|murojaat|bog['‘’ʻ]lan|пиш|напиш|звон|позвон|обращ|свяж|write|call|message|contact|dm|batafsil|подробн|details|havola|ссылк|link|bosing|нажм|click|tap|o['‘’ʻ]ting|переход|перейд|shu yerda|bu yerda|здесь|here)\p{L}*/iu;

/**
 * A line whose link was taken out at its end: the call to action that pointed at it goes too, back to the previous
 * sentence end ("Medovik — 180 000 so'm. Buyurtma bering: <link>" -> "Medovik — 180 000 so'm."). A short tail of at most
 * six words with a CTA word and no contact of its own counts as that call to action. Null = nothing is left.
 */
function withoutDanglingCta(line: string): string | null {
  // "…+998 90 123 45 67 yoki <link>": the "or" that led to the link goes with it.
  const rest = line.replace(/[\s,]+(yoki|или|or)$/iu, "");
  const cut = Math.max(0, ...[...rest.matchAll(/[.!?…](?=\s)/g)].map((m) => (m.index ?? -1) + 1));
  const tail = rest.slice(cut).trim();
  const words = tail.match(/[\p{L}\d'‘’ʻ]+/gu) ?? [];
  const bare = Boolean(tail) && words.length <= 6 && CTA_WORD_RE.test(tail) && !contactsIn(tail).length;
  const kept = bare ? rest.slice(0, cut).trimEnd() : rest;
  return /[\p{L}\d]/u.test(kept) ? kept : null;
}

/**
 * A post with no Mercat tracked link (the owner did not opt in, or the brand has no owner): any t.me/<bot>?start=src_…
 * the writer left goes. When the link ended its line, the call to action that pointed at it goes with it (a line left
 * with only "Yozing:" or "Buyurtma bering" goes whole). Other links stay.
 */
export function dropTrackedLinks(text: string, bot: string | undefined): string {
  if (!bot) return text;
  const link = String.raw`\s*(?:https?:\/\/)?(?:t\.me|telegram\.me)\/${bot}\?start=src_[\w-]+`;
  const re = new RegExp(link, "gi");
  const atEnd = new RegExp(String.raw`${link}[\s.!?)]*$`, "i");
  if (!re.test(text)) return text;
  return text
    .split("\n")
    .map((line) => {
      if (!line.match(re)) return line;
      const rest = line.replace(re, "").replace(/[\s:–—-]+$/, "").trimEnd();
      if (atEnd.test(line)) return withoutDanglingCta(rest);
      return /[\p{L}\d]/u.test(rest) ? rest : null;
    })
    .filter((l): l is string => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A plan slot's tracked link: the plan item's `link`, else the one in its CTA; only a link to our own bot counts. */
export function planTrackedLink(s: { link?: string; cta: string }, bot: string | undefined): string | undefined {
  if (!bot) return undefined;
  const candidates = [s.link, ...(s.cta.match(/https:\/\/t\.me\/\w+\?start=src_[a-z0-9]{6}_\d{1,2}/g) ?? [])];
  return candidates.find((l): l is string => typeof l === "string" && TRACKED_LINK_RE.exec(l)?.[1]?.toLowerCase() === bot.toLowerCase());
}

/** The ending as the copywriter reads it (an empty string when nothing was learned). */
export function endingBrief(ending: PostEnding | undefined): string {
  if (!ending || !ending.examples.length) return "";
  const how: Record<Kind, string> = {
    contact: `they end with the channel's contact. Reuse it exactly as written: "${ending.contact ?? ""}"`,
    admin: "they end by sending readers to the admin, without a phone or link (copy that manner).",
    link: "they end with a link (copy the link from the examples exactly; never another link).",
    hashtags: `they end with hashtags only${ending.hashtags?.length ? `: ${ending.hashtags.join(" ")}` : ""}.`,
    none: "they just end: no contact line, no link, no hashtags, no 'write to the admin'. Add nothing at the end.",
    mixed: `no single habit; follow the examples${ending.contact ? `. When a post asks people to order or write, use the channel's contact exactly as written: "${ending.contact}"` : ""}.`,
  };
  return [`HOW THE CHANNEL'S POSTS END (learned from its own posts) — ${how[ending.pattern]}`, ...ending.examples.map((e, i) => `ending ${i + 1}: ${e.replace(/\n/g, " / ")}`)].join("\n");
}
