/**
 * Checks on a weekly plan that need no I/O (pure, unit-tested): facts about events that are already over,
 * plan items that repeat each other, and internal markers that must never reach the owner.
 */
import type { Strategy } from "@/lib/uslub/contract";
import { ownerText, stripIdsAll } from "./copy";
import { jaccard, trigrams } from "./lint";
import { normApos } from "./stats";
import type { Lang } from "./types";
import { datesIn } from "../dates";

const ws = (s: string) => normApos(s).replace(/\s+/g, " ").trim().toLowerCase();

/** Words of a one-off event (an opening, a promotion, a contest), not a standing fact. */
const EVENT_RE = /ochil|yangi filial|tadbir|aksiya|chegirma|konkurs|sovg['ʻ‘’]a|yarmarka|открыт|открыва|откро|новый филиал|акци|скидк|конкурс|розыгрыш|мероприят|ярмарк|opening|new branch|giveaway|contest|discount|\bevent\b/i;
/** Fact types that stay true after the day they were written (a date in them is "since", not "on"). */
const STANDING = new Set(["price", "address", "district", "landmark", "hours", "contact", "delivery", "payment", "product", "certificate", "year", "person", "review"]);

/** The date of the channel post a fact was quoted from ("[YYYY-MM-DD] text" blocks of postsAsKb), if any. */
export function factPostedAt(quote: string, kb: string): string | undefined {
  const q = ws(quote);
  for (const block of kb.split(/\n(?=\[\d{4}-\d{2}-\d{2}\] )/)) {
    const m = /^\[(\d{4}-\d{2}-\d{2})\] /.exec(block.trim());
    if (m && ws(block).includes(q)) return m[1];
  }
  return undefined;
}

/**
 * Facts about something that is over by the plan's first day: an opening, a promotion or an event with a date before
 * it, or event wording in a channel post older than 14 days. They stay in the ledger (the address of a branch that
 * opened is still true) but never drive a slot, an offer or a deadline.
 */
export function pastFacts(facts: { id: string; type: string; quote: string }[], kb: string, firstDay: string): Map<string, string | undefined> {
  const out = new Map<string, string | undefined>();
  for (const f of facts) {
    const postedAt = factPostedAt(f.quote, kb);
    const dates = datesIn(f.quote, postedAt ?? firstDay);
    const allPast = dates.length > 0 && dates.every((d) => d < firstDay);
    // A promotion that still runs on the first day ("1-noyabrdan 31-dekabrgacha") is current, however old its post.
    const running = dates.some((d) => d >= firstDay);
    const old = postedAt != null && !running && Date.parse(firstDay) - Date.parse(postedAt) > 14 * 86_400_000;
    const eventish = EVENT_RE.test(normApos(f.quote)) || f.type === "offer" || f.type === "deadline";
    if ((eventish && (allPast || old)) || (!STANDING.has(f.type) && allPast)) out.set(f.id, postedAt);
  }
  return out;
}

/** Content words (≥4 letters, first 5 letters as a crude Uzbek stem) for near-duplicate hooks. */
export const words = (s: string) => new Set(normApos(s).toLowerCase().split(/[^\p{L}']+/u).filter((w) => w.length >= 4).map((w) => w.slice(0, 5)));

/** Facts about where and how to buy: every trust or sale post may repeat them, so sharing one is not a duplicate. */
const CONTACT_FACTS = new Set(["address", "district", "landmark", "hours", "contact", "delivery", "payment"]);

export type Duplicate = { of: number; hook: string; facts: string[] };

/**
 * Later plan items that repeat an earlier one: the same topic fact (a product, a tip, a number…), exactly the same
 * facts, or a near-identical hook. Keyed by the later slot.
 */
export function duplicateItems(items: { slot?: unknown; hook: string; factIds?: unknown }[], factType: Map<string, string>): Map<number, Duplicate> {
  const out = new Map<number, Duplicate>();
  const ids = (x: { factIds?: unknown }) => [...new Set((x.factIds as string[] | undefined) ?? [])];
  const topic = (x: { factIds?: unknown }) => ids(x).filter((id) => factType.has(id) && !CONTACT_FACTS.has(factType.get(id) as string));
  for (let i = 1; i < items.length; i++)
    for (let j = 0; j < i; j++) {
      const a = items[i];
      const b = items[j];
      const shared = topic(a).filter((id) => topic(b).includes(id));
      const sameFacts = ids(a).length > 0 && ids(a).length === ids(b).length && ids(a).every((id) => ids(b).includes(id));
      const sameHook = Boolean(a.hook && b.hook) && (jaccard(trigrams(a.hook), trigrams(b.hook)) >= 0.5 || jaccard(words(a.hook), words(b.hook)) >= 0.5);
      if (shared.length || sameFacts || sameHook) {
        out.set(a.slot as number, { of: b.slot as number, hook: b.hook, facts: shared.length ? shared : sameFacts ? ids(a) : [] });
        break;
      }
    }
  return out;
}

/** The strategist's "BLOCKED — price needed [R…]" marker (any field, any case, ids or not). */
export const isBlockedMarker = (t: string) => /^\W*BLOCKED\b/i.test(t.trim());

/**
 * The owner reads the strategy as is: ledger ids (kept for the grounding checks above) are removed in place, and an
 * internal marker (BLOCKED, UNKNOWN) never reaches them as text.
 */
export function ownerFacing(st: Strategy, lang: Lang, unknownWhere: string): void {
  const clean = (t: string) => (/^UNKNOWN\b/i.test(t.trim()) ? unknownWhere : ownerText(stripIdsAll(t), lang));
  const keep = (t: string) => !isBlockedMarker(t);
  st.positioning = keep(st.positioning) ? clean(st.positioning) : "";
  st.offer = keep(st.offer) ? clean(st.offer) : "";
  st.proofPoints = st.proofPoints.filter(keep).map(clean);
  st.risks = st.risks.filter(keep).map(clean);
  st.audiences = st.audiences.map((a) => ({
    ...a,
    name: clean(a.name),
    job: clean(a.job),
    pains: a.pains.filter(keep).map(clean),
    triggers: a.triggers.filter(keep).map(clean),
    whereTheyAre: a.whereTheyAre.filter(keep).map(clean),
  }));
  st.pillars = st.pillars.map((p) => ({ ...p, name: clean(p.name), examples: p.examples.filter(keep).map(clean) }));
}

const TIME_SOURCE: Record<Lang, Record<string, string>> = {
  uz: { data: "kanalingiz ma’lumotlari bo‘yicha", learned: "o‘tgan rejalar natijasi bo‘yicha", competitor: "raqobatchilar bo‘yicha", benchmark: "sohadagi kanallar bo‘yicha", prior: "taxminiy" },
  ru: { data: "по данным вашего канала", learned: "по итогам прошлых планов", competitor: "по конкурентам", benchmark: "по каналам вашей ниши", prior: "ориентировочно" },
  en: { data: "from your channel's data", learned: "from past plans' results", competitor: "from competitors", benchmark: "from channels in your niche", prior: "a rule of thumb" },
};

const REASON: Record<Lang, Record<string, string>> = {
  uz: { narx: "narx", video: "video", "birinchi postlar": "birinchi postlar", bayram: "bayram", aksiya: "aksiya", raqobatchi: "raqobatchi nomi", "da'vo": "da’vo", mijoz: "mijoz fikri", til: "kanal yozmaydigan til", critic: "tekshiruv izohi" },
  ru: { narx: "цена", video: "видео", "birinchi postlar": "первые посты", bayram: "праздник", aksiya: "акция", raqobatchi: "имя конкурента", "da'vo": "обещание", mijoz: "отзыв клиента", til: "язык, на котором канал не пишет", critic: "замечание проверки" },
  en: { narx: "price", video: "video", "birinchi postlar": "first posts", bayram: "holiday", aksiya: "promotion", raqobatchi: "competitor name", "da'vo": "claim", mijoz: "customer review", til: "a language the channel doesn't use", critic: "review note" },
};

const EXP: Record<Lang, { label: string; v: Record<string, string> }> = {
  uz: { label: "Sinov", v: { hour: "vaqt", format: "format", hookType: "boshlanish", length: "uzunlik", language: "til" } },
  ru: { label: "Тест", v: { hour: "время", format: "формат", hookType: "первая строка", length: "длина", language: "язык" } },
  en: { label: "Test", v: { hour: "time", format: "format", hookType: "opening line", length: "length", language: "language" } },
};

const META_LABEL: Record<Lang, { time: string; approve: string; none: string }> = {
  uz: { time: "Vaqt", approve: "Tasdiq", none: "shart emas" },
  ru: { time: "Время", approve: "Подтвердить", none: "не нужно" },
  en: { time: "Time", approve: "Approve", none: "not needed" },
};

/**
 * Why a slot has its time and why it waits for approval, in the owner's language and without ledger ids
 * ("Время: по данным вашего канала · Подтвердить: цена, первые посты · Тест: время").
 */
export function briefMetaText(s: { timeSource: string; reasons: string[]; exp?: string }, lang: Lang): string {
  const L = META_LABEL[lang] ?? META_LABEL.uz;
  const reasons = [...new Set(s.reasons.map((r) => (r.startsWith("critic:") ? REASON[lang].critic : (REASON[lang][r] ?? r))))];
  const parts = [`${L.time}: ${TIME_SOURCE[lang][s.timeSource] ?? TIME_SOURCE[lang].prior}`, `${L.approve}: ${reasons.join(", ") || L.none}`];
  if (s.exp) parts.push(`${EXP[lang].label}: ${EXP[lang].v[s.exp] ?? s.exp}`);
  return parts.join(" · ");
}
