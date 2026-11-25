import "server-only";
import { z } from "zod";
import type { ContentPlan, PlanItem, Strategy } from "@/lib/uslub/contract";
import { createHash } from "node:crypto";
import { getEnv } from "@/lib/env";
import { analyzeDeterministic, type Analysis, type OnStage } from "./audit";
import type { ChannelSummary } from "./bench";
import { upcomingEvents } from "./calendar";
import type { StoredPlanItem } from "./learn";
import { extractIds, groundedCheck, jaccard, lintItem, trigrams, type CheckFail, type LintItem } from "./lint";
import { bestTimeLabel } from "./forecast";
import { brainJson, GROUNDING, HAIKU, SONNET } from "./llm";
import { loadFactsCache, newPlanTag, saveFactsCache, savePlan } from "./memory";
import { scrapeChannelData } from "./scrape";
import { ownerText, stripIds, stripIdsAll } from "./copy";
import { cycleOf, pillarShares, ruleLedger, runRules, type KbSignals } from "./rules";
import { assignFocus, assignHookTypes, buildKpis, buildSkeleton, HOOK_TYPES, type Slot } from "./skeleton";
import { features, LEXICON, median, normApos } from "./stats";
import { sufficiency } from "./sufficiency";
import type { ChannelData, ChannelStats, Goal, Lang, LedgerEntry, RuleResult } from "./types";
import { webContext } from "./web";
import { clip } from "../text";
import { dotted, pastDatesIn } from "../dates";
import { briefMetaText, type Duplicate, duplicateItems, isBlockedMarker, ownerFacing, pastFacts } from "./plan-checks";
import { fixMixedScript } from "../postguard";

/* ------------------------------------------------------------------ D0 facts */

const FACT_TYPES = ["product", "price", "address", "district", "landmark", "hours", "contact", "delivery", "payment", "year", "number", "person", "review", "certificate", "guarantee", "offer", "deadline", "story"] as const;
const FactsSchema = z.object({ facts: z.array(z.object({ type: z.enum(FACT_TYPES), text: z.string(), quote: z.string() })) });
type Fact = { id: string; type: (typeof FACT_TYPES)[number]; text: string; quote: string };

const D0 = `Extract atomic facts from the owner's knowledge base. One fact = one checkable statement: one product, one price (with its product), one address, one hours line, one number, one review, one guarantee, one offer term, one deadline.
For each: type (product|price|address|district|landmark|hours|contact|delivery|payment|year|number|person|review|certificate|guarantee|offer|deadline|story), text (short, KB language), quote (the exact span copied character-for-character from the KB).
Do not infer, merge, translate, generalise or complete anything. A price with no product: skip it. At most 30 facts, most useful first: prices, products, address and hours, numbers and reviews, then the rest. Return JSON {facts:[...]}.`;

const ws = (s: string) => normApos(s).replace(/\s+/g, " ").trim().toLowerCase();

const factCache = new Map<string, { at: number; facts: Fact[] }>();

/**
 * D0 with two caches keyed by the KB hash: this instance's memory (30 min), then Postgres (7 days),
 * so the same brand re-planned on any serverless instance skips the extraction call.
 */
export async function extractFacts(kb: string): Promise<Fact[]> {
  if (!kb.trim()) return [];
  const key = createHash("sha256").update(kb).digest("hex");
  const hit = factCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.facts;
  const stored = (await loadFactsCache(key).catch(() => null)) as Fact[] | null;
  if (stored?.length) {
    factCache.set(key, { at: Date.now(), facts: stored });
    return stored;
  }
  const facts = await extractFactsUncached(kb);
  factCache.set(key, { at: Date.now(), facts });
  if (factCache.size > 100) factCache.delete(factCache.keys().next().value as string);
  void saveFactsCache(key, facts);
  return facts;
}

async function extractFactsUncached(kb: string): Promise<Fact[]> {
  const res = await brainJson({ schema: FactsSchema, model: HAIKU, effort: "low", maxTokens: 5000, timeoutMs: 14_000, purpose: "facts", system: D0, prompt: `KNOWLEDGE BASE:\n${clip(kb, 12000)}` });
  const norm = ws(kb);
  return res.facts
    .filter((f) => f.quote.trim() && norm.includes(ws(f.quote)))
    .slice(0, 40)
    .map((f, i) => ({ id: `F${i + 1}`, ...f }));
}

/** The owner's own recent posts (≤45 days, not forwards, not ads) as knowledge-base text. */
export function postsAsKb(data: ChannelData, now: number, max = 12): string {
  const recent = data.posts
    .filter((p) => !p.isForward && !features(p).isAd && p.text.trim().length > 40 && now - Date.parse(p.postedAt) <= 45 * 86_400_000)
    .slice(0, max);
  // Each post carries its date so the planner can tell a standing fact (price, address) from an old event.
  return recent.length ? `Kanal postlari (@${data.channel}):\n${recent.map((p) => `[${p.postedAt.slice(0, 10)}] ${p.text.trim()}`).join("\n\n")}` : "";
}

const factLedger = (facts: Fact[]): LedgerEntry[] =>
  facts.map((f) => ({ id: f.id, label: `${f.type}: ${f.text}`, value: f.text, display: f.quote, quote: f.quote, source: "kb" }));

/* -------------------------------------------------------------- voice + claims */

export function voiceFingerprint(stats: ChannelStats | undefined, kbStyle = "") {
  const posts = stats ? [...stats.lifts].sort((a, b) => b.lift - a.lift) : [];
  if (posts.length < 5) {
    return { address: "siz" as const, avgSentenceWords: 12, emojiPer100: 0.3, exclamPerSentence: 0, medianChars: 500, lineBreakDensity: 2, primaryLang: "uz-Latn", apostropheStyle: /ʻ/.test(kbStyle) ? "ʻ" : "'", anchors: [] as string[], default: true };
  }
  const half = posts.slice(0, Math.max(1, Math.ceil(posts.length / 2)));
  const q = Math.max(1, Math.ceil(posts.length / 4));
  const weighted = [...half, ...half.slice(0, q)].map((x) => x.post.text);
  const all = weighted.join("\n");
  const sentences = all.split(/[.!?]+\s/).filter((s) => s.trim());
  const siz = (all.match(/\b(siz|sizga|sizni|sizning|вы|вас|вам)\b/gi) ?? []).length;
  const sen = (all.match(/\b(sen|senga|seni|sening|ты|тебе|тебя)\b/gi) ?? []).length;
  return {
    address: (sen > siz ? "sen" : "siz") as "siz" | "sen",
    avgSentenceWords: Math.round(all.split(/\s+/).length / Math.max(1, sentences.length)),
    emojiPer100: Math.round(((all.match(/\p{Extended_Pictographic}/gu)?.length ?? 0) / Math.max(1, all.length)) * 1000) / 10,
    exclamPerSentence: Math.round(((all.match(/!/g)?.length ?? 0) / Math.max(1, sentences.length)) * 100) / 100,
    medianChars: Math.round(median(weighted.map((t) => t.length)) ?? 0),
    lineBreakDensity: Math.round(((all.match(/\n/g)?.length ?? 0) / Math.max(1, weighted.length)) * 10) / 10,
    primaryLang: stats?.majorityLang ?? "uz-Latn",
    apostropheStyle: (all.match(/ʻ/g)?.length ?? 0) > (all.match(/'/g)?.length ?? 0) ? "ʻ" : "'",
    anchors: posts.slice(0, 3).map((x) => x.post.text.slice(0, 600)),
    default: false,
  };
}

export function competitorClaims(comps: Analysis["competitors"]) {
  const counts = new Map<string, Set<string>>();
  for (const c of comps)
    for (const p of c.data.posts)
      for (const t of trigrams(p.text)) {
        if (/^\d|\d$/.test(t)) continue;
        counts.set(t, (counts.get(t) ?? new Set()).add(`P.${p.channel}/${p.id}`));
      }
  return [...counts.entries()]
    .filter(([, ids]) => ids.size >= 2)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 15)
    .map(([phrase, ids]) => ({ phrase, ids: [...ids].slice(0, 3) }));
}

/* --------------------------------------------------------------- D2 / D3 */

const StrategySchema = z.object({
  positioning: z.string(),
  audiences: z.array(z.object({ name: z.string(), job: z.string(), pains: z.array(z.string()), triggers: z.array(z.string()), whereTheyAre: z.array(z.string()) })),
  offer: z.string(),
  proofPoints: z.array(z.string()),
  pillars: z.array(z.object({ goal: z.enum(["reach", "trust", "sale"]), name: z.string(), examples: z.array(z.string()) })),
  risks: z.array(z.string()),
  rationale: z.array(z.string()),
});

const PlanSchema = z.object({
  items: z.array(z.object({ slot: z.number(), hookType: z.string(), hook: z.string(), cta: z.string(), brief: z.string(), factIds: z.array(z.string()) })),
});

const CriticSchema = z.object({
  items: z.array(z.object({ slot: z.number(), fails: z.array(z.object({ check: z.string(), quote: z.string(), reason: z.string() })) })),
});

export const D2 = (brand: string, category: string, cycle: string, goal: string) => `You are the Strateg of Mercat, an AI marketing department, for ${brand} (${category}, buying cycle: ${cycle}), Tashkent. Owner's goal: "${goal}".
INPUT: facts F#, selected stats S.* (S.bench.* = medians of other Uzbek channels in the niche, S.learn.* = results of our own past plans), firedRules, competitorClaims [{phrase, ids}], web W# (cited web sources), pillarGoals [{goal, share}] (FIXED, do not change), voice summary, ownerQuestions, learnChanges (what last weeks' results changed).

Produce a Strategy (no KPIs; code adds them):
Write every string in the output language (uz = Uzbek Latin, ru = Russian, en = English); ids stay as they are.
1 positioning — one sentence with this structure, in the output language:
  en: "For <audience in a situation>, <brand> is the <category> that <ONE differentiator>, unlike <alternative seen in competitorClaims or W>. [ids]"
  uz: "<vaziyatdagi auditoriya> uchun <brend> — <bitta farq> bilan ajralib turadigan <kategoriya>; <muqobil>dan farqli. [ids]"
  ru: "Для <аудитория в ситуации> <бренд> — это <категория>, которая <одно отличие>, в отличие от <альтернатива>. [ids]"
  The differentiator MUST (a) cite an F id, (b) not appear in competitorClaims, (c) matter to one audience's job. Unbacked adjectives are banned (sifatli, professional, ishonchli, eng yaxshi, качественный, лучший, best, quality).
  If no fact qualifies, use a verifiable practical axis (location/landmark, published price list, hours, delivery terms per F) and add the risk "Weak differentiation — ask the owner what they do that competitors don't [R...]".
2 audiences (max 3) — define them by product × situation, not demographics. Each needs: name; job (situation + the progress the customer wants); pains (only from F, competitor post themes [P], or W); triggers (only from the calendar entries provided, or F; payday only if an F fact states it); whereTheyAre (only: this channel [S.subscribers], competitor channels [P], W URLs, places the owner named [F]). If nothing is known, write exactly "UNKNOWN — Mijoz radar search needed".
3 offer — one entry offer built from F: "<product> — <price> — <condition> — how to claim: bot link [F..]". A risk reducer (trial, tasting, free consultation, exchange) or a deadline only if F states it. If there is no price fact: "BLOCKED — price needed [R...]".
4 proofPoints — only F or W, ranked: countable numbers > named reviews > certificates/years > process facts. S stats are internal diagnostics and are never proof.
5 pillars — one per pillarGoals entry, same goal and share. Give each a concrete topic name (not "Trust"), and 2–3 examples, each citing F ids. Where a top post [P] or competitor-gap rule exists, at least one example adapts its FORMAT, never its text.
6 risks (3–6) — only from fired rules, stats, or missing facts, each with ids.
7 rationale (3–5 lines) — each "<rule or result in plain words>: <ledger number> → <decision this week> [ids]". Cover the fired rules with the biggest effect on this week's plan; if learnChanges exist, the first line says what our own past results changed. Plain shop-owner words.

Keep it compact: at most 2 audiences, 2 examples per pillar, 3–4 risks, 3–4 rationale lines; every string ≤ 220 characters.
Return JSON matching the schema.`;

export const D3 = `You are the content planner of Mercat, an AI marketing department. Code already fixed each slot's day, time, goal, format, link and approval, and chose which facts each slot is about. You write the hook, the CTA and the brief for each slot.
INPUT: slots [{slot, day, time, goal, format, lang, hookOptions, focus:[F ids], exp?, calendarEvent?}], facts F#, voice {fingerprint, anchors[3]}, recentHooks (own, last 30), competitorHooks, lexicon, firedRules.

FOR EACH SLOT:
- hookType: pick the one from slot.hookOptions that sounds most natural for these facts (the first is a suggestion; for exp="hookType" stay inside the options). Build the post around the focus facts; use at least one of them unless it would sound forced, then use another F fact.
  number = a number from F up front; price = product + F price; question = the customer's real question (pain from F); local = district/landmark from F; behind_scenes = how it is made/done at the business (from F); myth_fact = a common belief vs an F fact; product_spotlight = one product from F, concrete detail; before_after = needs customer consent.
- hook = the first line, ≤90 chars (aim for ≤70), in slot.lang. It must contain at least one specific from F (number, price, product name, district/landmark, real question). No greetings ("Assalomu alaykum", "Hurmatli mijozlar", "Здравствуйте", "Dear"). No hype. Never mention the bot, the link or "write to us" in the hook: the hook is about the customer and the product. Never invent a fact that is not in F.
  Bad: "Sizni ajoyib takliflarimiz kutmoqda!" (no specific, cliché, would fit anyone).
- cta: one short action, the way the owner would say it. sale/trust: the link opens our Telegram bot, which passes the customer's message to the owner, who answers personally; so a short verb + reason tied to this post + the token {{LINK}} exactly once. Never promise that the bot itself sends menus or prices. reach: one short forward or save line, no link. Keep CTAs short (≤ 12 words before the link), vary them across slots, and never use the stock line "shu yerga yozing — o'zimiz javob beramiz".
- brief (for Kopirayter and Dizayner): 1 sentence of angle and which audience pain; the facts to use [F..]; what to photograph or film AT THE BUSINESS (real, never stock; for video, a ≤60-second phone shot list in 3 steps). The owner reads the brief: write it in slot.lang, labels included (never English labels like "Angle:", "Facts:" in a uz or ru brief, never the word "ledger").
- sale slot: include the product's F price in the hook or brief. Urgency only with an F deadline or capacity fact.
- factIds: every F id you used. hook and cta are the customer-facing post: never put ids, brackets or ledger codes in them (ids go only in factIds and the brief).
- Facts quoted from the channel's own posts carry the post date [YYYY-MM-DD]. Prices, products, addresses, hours and processes are standing facts. Dated events, promotions, deadlines and "new branch" announcements older than 14 days are history: never present them as current, and never tie a fact to a calendar event unless the fact itself names that event.
- A fact with past:true is already over on the slot's day (an opening, a promotion, an event): never announce it as coming or happening now ("ochilmoqda", "скоро", "opening soon"), never build a hook on it, never write a date before slot.day as upcoming. A standing detail inside it (the branch address, the product) may be used in the present tense.
VOICE: match the fingerprint — address form, words per sentence, emoji ≤ min(3, fingerprint emojiPer100 +50%), exclamations only if the owner uses them. Copy the anchors' manner, never their sentences. Never reuse competitor wording.
Return JSON {items:[{slot, hookType, hook, cta, brief, factIds}]}.`;

const REPAIR = `FIX ONLY these slots. For each, the failed checks and quoted reasons are given. Change only what the reasons require; keep everything else. If a needed fact does not exist, remove the claim instead of inventing it.`;

export const CRITIC = (brand: string, category: string, names: string, fp: string) =>
  `You strictly review a weekly Telegram plan for ${brand} (${category}, Tashkent); competitors: ${names}; voice: ${fp}. For each item, check ONLY: HOOK (concreteness), NEURO (paraphrased clichés/hype/calques), SWAP_TEST, VOICE (manner), GOAL_FIT, HONESTY_CATEGORY. Fail only with a concrete reason quoting the offending words. Return JSON {items:[{slot, fails:[{check, quote, reason}]}]}; empty fails = pass.`;

/** Version of every prompt the plan depends on; eval results are tied to it. */
export const PROMPT_VERSION = createHash("sha256")
  .update([D2("B", "C", "Y", "G"), D3, REPAIR, CRITIC("B", "C", "N", "F"), GROUNDING("uz", "'", LEXICON)].join("\n"))
  .digest("hex")
  .slice(0, 10);

/* ------------------------------------------------------------------- main */

export interface StrategyInput {
  knowledge: string;
  channel?: string;
  competitors?: string[];
  goal?: string;
  lang?: Lang;
  category?: string;
  brandName?: string;
  brandId?: string;
  ownerTelegramId?: number | null;
  /** The caller is the verified Telegram owner of brandId (custom brand) and `channel` is the brand's channel. */
  ownerVerified?: boolean;
  approvedPosts?: number;
  now?: number;
  onStage?: OnStage;
  /** Eval harness: frozen channels, no web, no memory writes. */
  preloaded?: { own: ChannelData; competitors?: ChannelData[]; summaries?: ChannelSummary[] };
  web?: boolean;
  save?: boolean;
}

const OQ: Record<Lang, Record<string, string>> = {
  uz: {
    price: "Asosiy mahsulot/xizmatlaringiz narxlari qancha? (sotuv postlari narxsiz chiqmaydi)",
    address: "Manzilingiz va mo'ljal qanday? Ish vaqtingiz?",
    proof: "3 ta haqiqiy mijoz fikri (ism bilan, ruxsat bilan) va raqamlar (yillar, mijozlar soni) bormi?",
    offer: "Raqobatchilar {offer} taklifini qayta-qayta ishlatmoqda. Siz ham shunday taklif bera olasizmi? Shartlari va muddati?",
    diff: "Raqobatchilardan nimangiz bilan farq qilasiz? Bitta aniq misol yozing.",
  },
  ru: {
    price: "Какие цены на основные товары/услуги? (продающие посты без цены не выходят)",
    address: "Ваш адрес, ориентир и часы работы?",
    proof: "Есть 3 настоящих отзыва (с именем и разрешением) и цифры (годы, число клиентов)?",
    offer: "Конкуренты повторяют предложение {offer}. Готовы протестировать похожее? Условия и срок?",
    diff: "Чем вы отличаетесь от конкурентов? Один конкретный пример.",
  },
  en: {
    price: "What are the prices of your main products/services? (sale posts never go out without a price)",
    address: "What is your address, landmark and opening hours?",
    proof: "Do you have 3 real customer reviews (named, with consent) and numbers (years, customer count)?",
    offer: "Competitors keep repeating a {offer} offer. Would you test a similar one? Terms and deadline?",
    diff: "What do you do that competitors don't? One concrete example.",
  },
};

const OWNER_TEXT: Record<Lang, { needInput: string; blocked: string; unknownWhere: string; weakDiff: string }> = {
  uz: {
    needInput: "Egasidan ma'lumot kerak",
    blocked: "Taklif tuzish uchun narx kerak: asosiy mahsulot yoki xizmatlaringiz narxini yuboring.",
    unknownWhere: "Hali noma'lum: mijozlar qayerda ekanini «Mijoz radar» qidiradi.",
    weakDiff: "Raqobatchilardan farqingiz aniq emas: bitta aniq misol yozing — siz nimani boshqalardan boshqacha qilasiz?",
  },
  ru: {
    needInput: "Нужно от владельца",
    blocked: "Для предложения нужна цена: пришлите цены на основные товары или услуги.",
    unknownWhere: "Пока неизвестно: где ваши клиенты, найдёт «Радар клиентов».",
    weakDiff: "Неясно, чем вы отличаетесь от конкурентов: напишите один конкретный пример.",
  },
  en: {
    needInput: "Needed from the owner",
    blocked: "We need a price to build the offer: send the prices of your main products or services.",
    unknownWhere: "Not known yet: the customer radar will look for where your customers are.",
    weakDiff: "It's not clear how you differ from competitors: write one concrete example.",
  },
};

/** Why a plan item waits for the owner, in their words (the code checks GROUNDED / PRICE / URGENCY fired). */
const HARD_REASON: Record<Lang, Record<string, string>> = {
  uz: {
    GROUNDED: "bu raqam yoki fakt sizning ma’lumotlaringizda yo‘q — to‘g‘rimi?",
    PRICE: "sotuv posti uchun narx kerak — narxini yozing",
    URGENCY: "shoshiltiruvchi gap bor, lekin muddat yoki cheklov aytilmagan — muddatini yozing",
  },
  ru: {
    GROUNDED: "этой цифры или факта нет в ваших данных — это верно?",
    PRICE: "для продающего поста нужна цена — напишите её",
    URGENCY: "есть призыв поторопиться, но не указан срок или ограничение — напишите срок",
  },
  en: {
    GROUNDED: "this number or fact is not in your details — is it right?",
    PRICE: "a sale post needs a price — please add it",
    URGENCY: "it urges people to hurry but gives no deadline or limit — add the deadline",
  },
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));
const chunk = <T,>(xs: T[], groups: number): T[][] => {
  const size = Math.max(1, Math.ceil(xs.length / groups));
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
};

type Drafted = z.infer<typeof PlanSchema>["items"][number];
export type CriticStatus = "passed" | "fixed" | "owner_input" | "timeout";

export async function buildStrategy(inp: StrategyInput) {
  const t0 = Date.now();
  const elapsed = () => Date.now() - t0;
  // Route maxDuration is 60 s; cold start, DB and serialisation need a margin. Everything returns by ~45 s.
  const DEADLINE = 45_000;
  const WEB_UNTIL = 12_000; // the strategist waits for web sources at most until t0 + 12 s
  const REPAIR_UNTIL = 26_000; // no repair call starts after this

  const now = inp.now ?? Date.now();
  const lang = inp.lang ?? "uz";
  const category = inp.category ?? "";
  const emit = inp.onStage ?? (() => {});
  const channel = inp.preloaded?.own.channel ?? inp.channel;
  const brandName = inp.brandName ?? (channel ? `@${channel.replace(/^@/, "")}` : "Brend");
  const live = !inp.preloaded;

  // 1. facts ∥ channel analysis (scrape, validity, bench, learn) ∥ web context (only the strategist waits for it)
  emit({ stage: "facts", status: "start" });
  const webP = live && inp.web !== false ? webContext({ brandName, category, channel, competitors: inp.competitors, now, lang }) : Promise.resolve([] as LedgerEntry[]);
  // Scrape once; the analysis then hits the scrape cache, and a thin KB's fact extraction starts right after it.
  const ownP: Promise<ChannelData | null> = inp.preloaded
    ? Promise.resolve(inp.preloaded.own)
    : channel
      ? scrapeChannelData(channel).catch(() => null)
      : Promise.resolve(null);
  const analysisP =
    channel || inp.preloaded
      ? ownP.then(() =>
          analyzeDeterministic({ channel: channel as string, competitors: inp.competitors, category, now, lang, brandId: inp.brandId, ownerVerified: inp.ownerVerified, preloaded: inp.preloaded, onStage: emit }),
        )
      : Promise.resolve(null);
  // A thin knowledge base ("just a channel link") is topped up with the owner's own recent posts:
  // facts are still quote-checked against that text, so nothing outside the owner's words gets in.
  const thinKb = inp.knowledge.trim().length < 300 && Boolean(channel || inp.preloaded);
  let knowledge = inp.knowledge;
  const factsP = thinKb
    ? ownP.then((own) => {
        knowledge = [inp.knowledge.trim(), own ? postsAsKb(own, now) : ""].filter(Boolean).join("\n\n");
        return extractFacts(knowledge);
      })
    : extractFacts(inp.knowledge);
  const [facts, analysis] = await Promise.all([
    factsP.catch((err) => {
      console.warn("[brain/strategy] fact extraction failed", err instanceof Error ? err.message : err);
      return [] as Fact[];
    }),
    analysisP,
  ]);
  if (thinKb && facts.length) emit({ stage: "facts", source: "channel_posts" });
  emit({ stage: "facts", facts: facts.map((f) => ({ id: f.id, type: f.type, quote: f.quote })), elapsedMs: elapsed() });

  // Facts about an event that is over by the plan's first day (the plan starts tomorrow, Tashkent time).
  const firstDay = new Date(now + 5 * 3600_000 + 86_400_000).toISOString().slice(0, 10);
  const past = pastFacts(facts, knowledge, firstDay);
  if (past.size) emit({ stage: "facts", past: [...past.keys()] });
  const has = (...types: Fact["type"][]) => facts.filter((f) => types.includes(f.type));
  const current = (xs: Fact[]) => xs.filter((f) => !past.has(f.id));
  const priceFacts = has("price");
  const offerFacts = current(has("offer"));
  const proof = has("year", "number", "review", "certificate");
  const kb: KbSignals = { hasPrices: priceFacts.length > 0, hasProducts: has("product").length > 0 || priceFacts.length > 0, hasOffer: offerFacts.length > 0, proofFacts: proof.length };

  // 2. rules with KB signals, niche benchmark and funnel data
  const stats = analysis?.stats;
  const compStats = analysis?.competitors.map((c) => c.stats) ?? [];
  const cal = upcomingEvents(category, now).map((e) => ({ id: e.id, name: e.name[lang], daysAway: e.daysAway }));
  const rules: RuleResult[] = stats
    ? runRules(stats, { category, competitors: compStats, kb, calendar: cal, bench: analysis?.bench, funnel: analysis?.learn?.funnel })
    : coldRules(kb, cal);
  const firedRules = rules.filter((r) => r.status === "fired");
  const ledger: LedgerEntry[] = [
    ...(analysis?.ledger.filter((e) => e.source !== "rule" || e.id.startsWith("S.")) ?? []),
    ...ruleLedger(rules),
    ...factLedger(facts),
    ...(analysis ? [] : cal.map((e): LedgerEntry => ({ id: `S.calendar.${e.id}`, label: e.name, value: e.daysAway, display: e.name, source: "rule" }))),
  ];
  const ledgerMap = new Map(ledger.map((e) => [e.id, e]));

  // 3. owner questions (code gate)
  const q = OQ[lang];
  const ownerQuestions: string[] = [];
  if (!priceFacts.length) ownerQuestions.push(q.price);
  if (!has("address", "district", "landmark").length || !has("hours").length) ownerQuestions.push(q.address);
  if (proof.length < 2) ownerQuestions.push(q.proof);
  const vo = rules.find((r) => r.id === "R.VALIDATED_OFFER" && r.status === "fired");
  const voOffers = (vo?.data?.offers as { offer: string }[] | undefined) ?? [];
  if (voOffers.length) ownerQuestions.push(q.offer.replace("{offer}", voOffers[0].offer));

  // 4. code computes shares, skeleton (time, goal, format, link, forecast, hook type, fact focus), KPIs, claims, voice
  const cycle = cycleOf(category, knowledge);
  const pillar = pillarShares(cycle, rules);
  const bot = getEnv().BOT_USERNAME?.replace(/^@/, "");
  const planTag = newPlanTag();
  const learned = analysis?.learn?.hints;
  const sk = buildSkeleton({
    now,
    stats,
    competitors: compStats,
    rules,
    shares: pillar.final,
    category,
    hasPriceFact: priceFacts.length > 0,
    hasOfferFact: offerFacts.length > 0,
    approvedPosts: inp.approvedPosts ?? 12,
    bot,
    lang,
    calendar: cal,
    planTag,
    bench: analysis?.bench,
    learned,
  });
  const recentHooks = (analysis?.data.posts ?? []).slice(0, 30).map((p) => features(p).firstLine);
  assignHookTypes(sk.slots, {
    factTypes: new Set(facts.map((f) => f.type)),
    recentFirstLines: recentHooks,
    supported: learned?.supported.filter((x) => x.tag === "hookType").map((x) => x.value),
    dropped: learned?.dropped.filter((x) => x.tag === "hookType").map((x) => x.value),
  });
  assignFocus(sk.slots, current(facts), rules);
  const kpis = buildKpis(stats, rules, sk.slots.length, sk.slots, lang);
  const claims = competitorClaims(analysis?.competitors ?? []);
  const voice = voiceFingerprint(stats, knowledge);
  const usedLangs = new Set(Object.keys(stats?.langShares ?? {}));
  const slotLang = lang === "uz" ? "uz-Latn" : lang;
  emit({ stage: "skeleton", planTag, slots: sk.slots, pillar, kpis, elapsedMs: elapsed() });

  const common = GROUNDING(lang, voice.apostropheStyle, LEXICON);
  const competitorTexts = (analysis?.competitors ?? []).flatMap((c) => c.data.posts.map((p) => p.text));
  const statsForLlm = ledger.filter((e) => e.source !== "post" || e.id.startsWith(`P.${analysis?.data.channel}`)).map(({ id, label, display, n, prior }) => ({ id, label, display, n, prior }));
  const factsForLlm = facts.map(({ id, type, quote }) => ({ id, type, quote, ...(past.has(id) ? { past: true, ...(past.get(id) ? { postedAt: past.get(id) } : {}) } : {}) }));
  const slotsForLlm = new Map(
    sk.slots.map((s) => [
      s.slot,
      { slot: s.slot, day: s.day, time: s.time, goal: s.goal, format: s.format, lang: slotLang, hookOptions: s.hookOptions, focus: s.focus, exp: s.exp, calendarEvent: s.calendarEvent },
    ]),
  );

  // 5. strategist: waits for the web context (≤12 s), runs in parallel with the slot writers
  const strategistP = Promise.race([webP, sleep(Math.max(0, WEB_UNTIL - elapsed())).then(() => [] as LedgerEntry[])]).then(async (web) => {
    for (const w of web) ledgerMap.set(w.id, w);
    ledger.push(...web);
    if (web.length) emit({ stage: "web", sources: web.map(({ id, url, display }) => ({ id, url, display })) });
    const d2 = await brainJson({
      schema: StrategySchema,
      purpose: "strategist",
      model: SONNET,
      effort: "low",
      maxTokens: 6000,
      timeoutMs: Math.max(8_000, DEADLINE - 1_000 - elapsed()),
      system: `${common}\n\n${D2(brandName, category || "biznes", cycle, inp.goal ?? "ko'proq buyurtma")}`,
      prompt: JSON.stringify({
        facts: factsForLlm,
        stats: statsForLlm,
        firedRules: firedRules.map(({ id, name, trigger, effects }) => ({ id, name, trigger, effects })),
        competitorClaims: claims,
        web: web.map(({ id, label, display, url }) => ({ id, label, display, url })),
        pillarGoals: (["reach", "trust", "sale"] as Goal[]).map((g) => ({ goal: g, share: pillar.final[g] })),
        voice: { address: voice.address, primaryLang: voice.primaryLang },
        calendar: cal,
        ownerQuestions,
        learnChanges: analysis?.learn?.changes ?? [],
      }),
    });
    return { d2, web };
  });

  // 6. slot writers: ≤4 parallel groups; each drafts → lints → Haiku critic → repairs once → re-lints → re-runs the critic
  const emojiCap = Math.min(3, Math.max(1, Math.round(voice.emojiPer100 * 1.5 + 1)));
  const lintCtx = {
    ledger: ledgerMap,
    priceFacts: factLedger(priceFacts),
    deadlineFacts: current(has("deadline")).length + offerFacts.filter((f) => /\d/.test(f.quote)).length,
    recentHooks,
    competitorTexts,
    emojiCap,
    address: voice.address,
  };
  const drafts = new Map<number, Drafted>();
  const codeFails = new Map<number, CheckFail[]>();
  const criticFails = new Map<number, CheckFail[]>();
  const status = new Map<number, CriticStatus>();
  const asLint = (s: Slot): LintItem => {
    const it = drafts.get(s.slot);
    return { slot: s.slot, goal: s.goal, hook: it?.hook ?? "", cta: it?.cta ?? "", brief: it?.brief ?? "", factIds: it?.factIds ?? [] };
  };
  const failsOf = (slot: number) => [...(codeFails.get(slot) ?? []), ...(criticFails.get(slot) ?? [])];
  // Code checks per item: the shared lint, plus a date that is already history on the slot's day.
  const lintSlot = (s: Slot): CheckFail[] => {
    const it = asLint(s);
    const pastDates = pastDatesIn(`${it.hook}\n${it.cta}\n${it.brief}`, s.day);
    return [
      ...lintItem(it, lintCtx),
      ...pastDates.map((d) => ({ check: "PAST", quote: dotted(d), reason: `${dotted(d)} is before this post's day (${dotted(s.day)}): that event is over — do not announce it; use another fact` })),
    ];
  };
  const criticSystem = CRITIC(brandName, category, compStats.map((c) => `@${c.channel}`).join(", ") || "-", JSON.stringify({ address: voice.address, emojiPer100: voice.emojiPer100 }));
  const runCritic = async (slots: Slot[]) => {
    if (elapsed() > DEADLINE - 6_000) return false;
    try {
      const cr = await brainJson({
        schema: CriticSchema,
        purpose: "critic",
        model: HAIKU,
        effort: "low",
        maxTokens: 3000,
        timeoutMs: Math.min(12_000, DEADLINE - 2_000 - elapsed()),
        system: criticSystem,
        prompt: JSON.stringify({ items: slots.map((s) => ({ ...asLint(s), format: s.format, hookType: drafts.get(s.slot)?.hookType })) }),
      });
      const bySlot = new Map(cr.items.map((i) => [i.slot, i.fails.filter((f) => f.quote.trim())]));
      for (const s of slots) criticFails.set(s.slot, bySlot.get(s.slot) ?? []);
      return true;
    } catch {
      return false;
    }
  };
  const draftCall = (slots: Slot[], repair: boolean) =>
    brainJson({
      schema: PlanSchema,
      purpose: repair ? "slot_repair" : "slot_writer",
      model: SONNET,
      effort: "medium",
      maxTokens: repair ? 6000 : 8000,
      timeoutMs: Math.max(8_000, DEADLINE - 2_000 - elapsed()),
      system: `${common}\n\n${D3}${repair ? `\n\n${REPAIR}` : ""}`,
      prompt: JSON.stringify(
        repair
          ? { slots: slots.map((s) => ({ ...slotsForLlm.get(s.slot), current: drafts.get(s.slot), fails: failsOf(s.slot) })), facts: factsForLlm, voice: { address: voice.address, emojiPer100: voice.emojiPer100 }, lexicon: LEXICON }
          : {
              slots: slots.map((s) => slotsForLlm.get(s.slot)),
              facts: factsForLlm,
              voice: { ...voice, anchors: voice.anchors },
              recentHooks,
              competitorHooks: (analysis?.competitors ?? []).flatMap((c) => c.data.posts.slice(0, 10).map((p) => features(p).firstLine)),
              lexicon: LEXICON,
              firedRules: firedRules.map(({ id, trigger, effects }) => ({ id, trigger, effects })),
            },
      ),
    });

  const finished: (PlanItem & Record<string, unknown>)[] = [];
  const runGroup = async (group: Slot[]) => {
    try {
      const d = await draftCall(group, false);
      for (const it of d.items) if (group.some((s) => s.slot === it.slot)) drafts.set(it.slot, it);
    } catch (err) {
      console.warn("[brain/strategy] slot draft failed", err instanceof Error ? err.message : err);
    }
    for (const s of group) codeFails.set(s.slot, drafts.has(s.slot) ? lintSlot(s) : [{ check: "PLAN_SHAPE", quote: "", reason: "missing item" }]);
    const drafted = group.filter((s) => drafts.has(s.slot));
    const criticRan = drafted.length ? await runCritic(drafted) : false;
    if (!criticRan) emit({ stage: "critic", slots: drafted.map((s) => s.slot), status: "skipped" });
    let failing = group.filter((s) => failsOf(s.slot).length > 0);
    if (failing.length) emit({ stage: "critic", failing: failing.map((s) => ({ slot: s.slot, fails: failsOf(s.slot) })) });
    if (failing.length && elapsed() < REPAIR_UNTIL) {
      try {
        const fix = await draftCall(failing, true);
        const fixed: Slot[] = [];
        for (const it of fix.items) {
          const s = failing.find((x) => x.slot === it.slot);
          if (!s) continue;
          drafts.set(it.slot, it);
          codeFails.set(it.slot, lintSlot(s));
          criticFails.delete(it.slot);
          fixed.push(s);
        }
        // Re-run the critic on the repaired items (v1 skipped this).
        if (fixed.length) await runCritic(fixed);
        for (const s of fixed) status.set(s.slot, failsOf(s.slot).length ? "owner_input" : "fixed");
      } catch {
        emit({ stage: "repair", status: "failed", slots: failing.map((s) => s.slot) });
      }
      failing = group.filter((s) => failsOf(s.slot).length > 0);
    }
    for (const s of group) {
      if (!status.has(s.slot)) status.set(s.slot, !drafts.has(s.slot) ? "timeout" : failsOf(s.slot).length ? "owner_input" : "passed");
      const item = finalize(s);
      finished.push(item);
      emit({ stage: "item", item, elapsedMs: elapsed() });
    }
  };

  // 7. assemble one item (code decides approval; the LLM can never unset it)
  const finalize = (s: Slot): PlanItem & Record<string, unknown> => {
    const it = drafts.get(s.slot);
    const fails = failsOf(s.slot);
    const reasons = [...s.approvalReasons];
    let hook = it?.hook ?? "";
    let brief = it?.brief ?? "";
    let cta = it?.cta ?? "";
    const hard = fails.filter((f) => ["GROUNDED", "PRICE", "URGENCY"].includes(f.check));
    if (hard.length) {
      if (groundedCheck(hook, ledgerMap, it?.factIds ?? []).length) hook = "";
      brief = `${OWNER_TEXT[lang].needInput}: ${hard.map((f) => `«${stripIds(f.quote)}» — ${HARD_REASON[lang][f.check] ?? HARD_REASON[lang].GROUNDED}`).join("; ")}`;
      ownerQuestions.push(`${s.day} ${s.time}: ${HARD_REASON[lang][hard[0].check] ?? HARD_REASON[lang].GROUNDED} («${stripIds(hard[0].quote)}»)`);
      reasons.push(`critic:${hard[0].check}`);
    } else if (fails.length) reasons.push(`critic:${fails[0].check}`);
    if (!it) reasons.push("critic:timeout");
    const text = `${hook} ${cta} ${brief}`;
    if (/chegirma|aksiya|скидк|акци|\d+\s?%|sovg'a|подар|muddat|срок/i.test(normApos(text)) && !reasons.includes("narx")) reasons.push("aksiya");
    if (compStats.some((c) => text.toLowerCase().includes(c.channel.toLowerCase()))) reasons.push("raqobatchi");
    if (/bolalar|дети|kafolat|100%|natija|гарант/i.test(text)) reasons.push("da'vo");
    if (/mijoz(imiz)? fikri|otziv|отзыв|before_after/i.test(`${text} ${s.hookType ?? ""}`)) reasons.push("mijoz");
    // A language the channel never uses needs approval; a "mixed" channel already uses Uzbek and Russian.
    if (usedLangs.size && !usedLangs.has(slotLang) && !(usedLangs.has("mixed") && /^(uz-Latn|uz-Cyrl|ru)$/.test(slotLang))) reasons.push("til");
    // Ids are for the checks and the brief; the customer never sees "[F3]".
    hook = stripIds(hook);
    cta = stripIds(cta);
    if (lang === "uz") {
      hook = fixMixedScript(hook);
      cta = fixMixedScript(cta);
      brief = fixMixedScript(brief);
    }
    const link = s.link ?? "";
    // No tracked link (reach slot, or no BOT_USERNAME): the placeholder never reaches the owner.
    cta = s.goal !== "reach" && link ? cta.replaceAll("{{LINK}}", link) : cta.replace(/\s*\{\{LINK\}\}/g, "").replace(/[\s:–—-]+$/, "").trim();
    const evIds = [...new Set([...s.evidence, ...(it?.factIds ?? [])])];
    const meta = briefMetaText({ timeSource: s.timeSource, reasons: [...new Set(reasons)], exp: s.exp }, lang);
    return {
      day: s.day,
      time: s.time,
      goal: s.goal,
      pillar: s.goal,
      format: s.format,
      hook,
      cta,
      brief: ownerText(stripIdsAll(brief), lang),
      metric: s.metric,
      // extras: where the slot's time/goal came from (ids for the UI's evidence chips)
      briefMeta: meta,
      // ledger ids behind the slot's time, goal and facts (for evidence chips; never shown as text)
      evidence: evIds,
      needsApproval: reasons.length > 0,
      // extras for the UI
      slot: s.slot,
      timeSource: s.timeSource,
      // "Best time" only when the channel's own numbers back it; otherwise a suggestion (the UI shows this label).
      timeLabel: bestTimeLabel(s, lang),
      exp: s.exp,
      hookType: it?.hookType && (s.hookOptions ?? []).includes(it.hookType) ? it.hookType : s.hookType,
      focus: s.focus,
      factIds: it?.factIds ?? [],
      approvalReasons: [...new Set(reasons)],
      link: s.link,
      src: s.src,
      calendarEvent: s.calendarEvent,
      forecast: s.forecast,
      critic: status.get(s.slot) ?? "owner_input",
      fails,
    };
  };

  const groups = chunk(sk.slots, 4);
  const allGroups = Promise.all(groups.map(runGroup));
  await Promise.race([allGroups, sleep(DEADLINE - elapsed())]);
  for (const s of sk.slots) {
    if (finished.some((f) => f.slot === s.slot)) continue;
    status.set(s.slot, "timeout");
    const item = finalize(s);
    finished.push(item);
    emit({ stage: "item", item, elapsedMs: elapsed() });
  }

  // Cross-item checks the per-group writers could not see. Two slots on one topic (the same fact, or a near-identical
  // hook) are one post twice: the later one is rewritten once about another fact; if that fails, it waits for the owner.
  let items = [...finished].sort((a, b) => (a.slot as number) - (b.slot as number));
  const factType = new Map(facts.map((f) => [f.id, f.type]));
  const dups = duplicateItems(items, factType);
  if (dups.size && elapsed() < DEADLINE - 15_000) {
    const redo = sk.slots.filter((s) => dups.has(s.slot) && drafts.has(s.slot));
    for (const s of redo) {
      const d = dups.get(s.slot) as Duplicate;
      codeFails.set(s.slot, [
        ...(codeFails.get(s.slot) ?? []),
        { check: "DUPLICATE", quote: drafts.get(s.slot)?.hook ?? "", reason: `same topic as slot ${d.of} («${d.hook}»): write about a different fact${d.facts.length ? `, without ${d.facts.join(", ")}` : ""}` },
      ]);
    }
    try {
      const fix = redo.length ? await draftCall(redo, true) : { items: [] };
      const fixed = new Set<number>();
      for (const it of fix.items) {
        const s = redo.find((x) => x.slot === it.slot);
        if (!s) continue;
        drafts.set(it.slot, it);
        codeFails.set(it.slot, lintSlot(s));
        criticFails.delete(it.slot);
        status.set(it.slot, failsOf(it.slot).length ? "owner_input" : "fixed");
        fixed.add(it.slot);
      }
      items = items.map((it) => (fixed.has(it.slot as number) ? finalize(sk.slots.find((s) => s.slot === it.slot) as Slot) : it));
      if (fixed.size) emit({ stage: "dedupe", slots: [...fixed] });
    } catch {
      emit({ stage: "dedupe", status: "failed", slots: redo.map((s) => s.slot) });
    }
  }
  for (const [slot] of duplicateItems(items, factType)) {
    const it = items.find((x) => x.slot === slot);
    if (!it) continue;
    (it.approvalReasons as string[]).push("critic:HOOK");
    it.needsApproval = true;
  }
  const ctaHead = (c: string) => normApos(c).toLowerCase().split(/\s+/).slice(0, 3).join(" ");
  for (let i = 1; i < items.length; i++)
    if (items[i].cta && items.slice(0, i).some((x) => x.cta && ctaHead(x.cta) === ctaHead(items[i].cta))) {
      (items[i].approvalReasons as string[]).push("critic:CTA");
      items[i].needsApproval = true;
    }

  // 8. strategy (await with whatever time is left)
  let strategyOut: { d2: z.infer<typeof StrategySchema>; web: LedgerEntry[] } | null = null;
  try {
    strategyOut = (await Promise.race([strategistP, sleep(Math.max(500, DEADLINE - elapsed())).then(() => null)])) ?? null;
  } catch (err) {
    console.warn("[brain/strategy] strategist failed", err instanceof Error ? err.message : err);
  }
  const d2 = strategyOut?.d2;
  const nameByGoal = new Map<string, string>(d2?.pillars.map((p) => [p.goal, p.name]) ?? []);
  for (const it of items) it.pillar = nameByGoal.get(it.goal) ?? it.goal;
  const risks = [...(d2?.risks ?? [])];
  if (d2) {
    const posIds = extractIds(d2.positioning);
    if (!posIds.some((i) => /^F\d+$/.test(i)) || claims.some((c) => ws(d2.positioning).includes(c.phrase))) {
      risks.unshift(OWNER_TEXT[lang].weakDiff);
      ownerQuestions.push(q.diff);
    }
  }
  // "BLOCKED — price needed" is the strategist's internal marker, never an offer the owner reads: the offer stays
  // empty and the owner is asked for the price in their language.
  const offerBlocked = isBlockedMarker(d2?.offer ?? "");
  if (offerBlocked) ownerQuestions.push(q.price);
  const strategy: Strategy = {
    positioning: d2?.positioning ?? "",
    audiences: (d2?.audiences ?? []).slice(0, 3).map((a) => ({
      ...a,
      pains: a.pains.filter((p) => extractIds(p).length > 0),
      whereTheyAre: a.whereTheyAre.filter((w) => extractIds(w).length > 0 || w.startsWith("UNKNOWN")).length
        ? a.whereTheyAre.filter((w) => extractIds(w).length > 0 || w.startsWith("UNKNOWN"))
        : [OWNER_TEXT[lang].unknownWhere],
    })),
    offer: !priceFacts.length ? OWNER_TEXT[lang].blocked : offerBlocked ? "" : (d2?.offer ?? ""),
    proofPoints: (d2?.proofPoints ?? []).filter((p) => extractIds(p).some((i) => /^[FW]\d+$/.test(i))),
    pillars: (["reach", "trust", "sale"] as Goal[])
      .filter((g) => pillar.final[g] > 0)
      .map((g) => ({ name: nameByGoal.get(g) ?? g, goal: g, share: pillar.final[g] / 100, examples: d2?.pillars.find((p) => p.goal === g)?.examples ?? [] })),
    kpis,
    risks: risks.slice(0, 6),
  };
  ownerFacing(strategy, lang, OWNER_TEXT[lang].unknownWhere);
  emit({ stage: "strategy", strategy, ok: Boolean(d2), elapsedMs: elapsed() });
  const rationale = [...(analysis?.learn?.changes ?? []), ...(d2?.rationale ?? []).filter((l) => extractIds(l).length > 0 && !groundedCheck(l, ledgerMap).length)].map(stripIdsAll);
  const plan: ContentPlan = { weekOf: sk.weekOf, items, rationale: rationale.join("\n") };
  const criticReport = items.map((i) => ({ slot: i.slot as number, status: i.critic as CriticStatus, fails: i.fails as CheckFail[] }));

  // 9. remember the plan: its tracked links join next week's results back to each slot
  let planId: string | null = null;
  if (live && inp.save !== false && (channel || inp.brandId)) {
    const stored: StoredPlanItem[] = sk.slots.map((s) => ({
      slot: s.slot,
      day: s.day,
      time: s.time,
      weekday: s.weekday,
      goal: s.goal,
      format: s.format,
      hookType: (items.find((i) => i.slot === s.slot)?.hookType as string | undefined) ?? s.hookType,
      exp: s.exp,
      src: s.src,
      hook: items.find((i) => i.slot === s.slot)?.hook,
      forecast: s.forecast,
    }));
    planId = await savePlan({
      tag: planTag,
      brandId: inp.brandId,
      // Leads from this plan's links go to this Telegram user; the bot never claims the channel's identity to customers.
      ownerTelegramId: inp.ownerTelegramId,
      channel,
      weekOf: sk.weekOf,
      items: stored,
      baseline: { medianViews: stats?.medianViews, reachRate: stats?.reachRate, subscribers: stats?.subscribers },
    }).catch(() => null);
  }
  emit({ stage: "done", elapsedMs: elapsed() });
  return {
    strategy,
    plan,
    planId,
    planTag,
    ledger,
    firedRules,
    rules,
    ownerQuestions: [...new Set(ownerQuestions)].slice(0, 8),
    criticReport,
    pillar,
    facts,
    voice: { ...voice, anchors: undefined },
    competitorClaims: claims,
    competitorIssues: analysis?.competitorIssues ?? [],
    niche: analysis?.niche,
    bench: analysis?.bench ? { ...analysis.bench, channels: undefined, channelCount: analysis.bench.channels.length } : null,
    learn: analysis?.learn ? { plans: analysis.learn.plans, scores: analysis.learn.scores, experiments: analysis.learn.experiments, calibration: analysis.learn.calibration, changes: analysis.learn.changes } : null,
    web: strategyOut?.web ?? [],
    sufficiency: sufficiency({ stats, bench: analysis?.bench, competitors: compStats.length, learn: analysis?.learn, facts: { prices: priceFacts.length, proof: proof.length } }, lang),
    promptVersion: PROMPT_VERSION,
    elapsedMs: elapsed(),
  };
}

/** Rules for a brand with no channel history. */
function coldRules(kb: KbSignals, cal: { id: string; name: string; daysAway: number }[]): RuleResult[] {
  const out: RuleResult[] = [
    { id: "R.COLD_START", name: "Ma'lumot kam", status: "fired", kind: "problem", severity: 1, trigger: "no channel history", ids: [], effects: "Priors for hour/format/language; trust +10, sale −10; first posts need approval." },
  ];
  if (kb.proofFacts < 2)
    out.push({ id: "R.TRUST_GAP", name: "Ishonch belgilari kam", status: "fired", kind: "problem", severity: 2, trigger: `proof facts ${kb.proofFacts} < 2`, ids: [], effects: "trust +10, reach −10; ≥2 trust items; max 2 sale posts." });
  if (cal.length)
    out.push({ id: "R.CALENDAR", name: "Taqvim", status: "fired", kind: "opportunity", severity: 1, trigger: cal.map((e) => `${e.name} in ${e.daysAway}d`).join(" · "), ids: cal.map((e) => `S.calendar.${e.id}`), effects: "Calendar post, needs approval." });
  return out;
}

export { HOOK_TYPES, jaccard };
