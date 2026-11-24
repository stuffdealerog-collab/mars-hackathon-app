import "server-only";
import { z } from "zod";
import type { ContentPlan, PlanItem, Strategy } from "@/lib/uslub/contract";
import { getEnv } from "@/lib/env";
import { analyzeDeterministic, type Analysis, type OnStage } from "./audit";
import { upcomingEvents } from "./calendar";
import { extractIds, groundedCheck, jaccard, lintItem, trigrams, type CheckFail, type LintItem } from "./lint";
import { brainJson, GROUNDING, HAIKU, SONNET } from "./llm";
import { cycleOf, pillarShares, ruleLedger, runRules, type KbSignals } from "./rules";
import { buildKpis, buildSkeleton, type Slot } from "./skeleton";
import { features, LEXICON, median, normApos } from "./stats";
import type { ChannelStats, Goal, Lang, LedgerEntry, RuleResult } from "./types";

/* ------------------------------------------------------------------ D0 facts */

const FACT_TYPES = ["product", "price", "address", "district", "landmark", "hours", "contact", "delivery", "payment", "year", "number", "person", "review", "certificate", "guarantee", "offer", "deadline", "story"] as const;
const FactsSchema = z.object({ facts: z.array(z.object({ type: z.enum(FACT_TYPES), text: z.string(), quote: z.string() })) });
type Fact = { id: string; type: (typeof FACT_TYPES)[number]; text: string; quote: string };

const D0 = `Extract atomic facts from the owner's knowledge base. One fact = one checkable statement: one product, one price (with its product), one address, one hours line, one number, one review, one guarantee, one offer term, one deadline.
For each: type (product|price|address|district|landmark|hours|contact|delivery|payment|year|number|person|review|certificate|guarantee|offer|deadline|story), text (short, KB language), quote (the exact span copied character-for-character from the KB).
Do not infer, merge, translate, generalise or complete anything. A price with no product: skip it. Return JSON {facts:[...]}.`;

const ws = (s: string) => normApos(s).replace(/\s+/g, " ").trim().toLowerCase();

export async function extractFacts(kb: string): Promise<Fact[]> {
  if (!kb.trim()) return [];
  const res = await brainJson({ schema: FactsSchema, model: HAIKU, effort: "low", maxTokens: 6000, system: D0, prompt: `KNOWLEDGE BASE:\n${kb.slice(0, 12000)}` });
  const norm = ws(kb);
  return res.facts
    .filter((f) => f.quote.trim() && norm.includes(ws(f.quote)))
    .slice(0, 40)
    .map((f, i) => ({ id: `F${i + 1}`, ...f }));
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
});

const PlanSchema = z.object({
  items: z.array(z.object({ slot: z.number(), hookType: z.string(), hook: z.string(), cta: z.string(), brief: z.string(), factIds: z.array(z.string()) })),
  rationale: z.array(z.string()),
});

const CriticSchema = z.object({
  items: z.array(z.object({ slot: z.number(), fails: z.array(z.object({ check: z.string(), quote: z.string(), reason: z.string() })) })),
});

const D2 = (brand: string, category: string, cycle: string, goal: string) => `You are the Strateg of Uslub AI for ${brand} (${category}, buying cycle: ${cycle}), Tashkent. Owner's goal: "${goal}".
INPUT: facts F#, selected stats S.*, firedRules, competitorClaims [{phrase, ids}], web W#, pillarGoals [{goal, share}] (FIXED, do not change), voice summary, ownerQuestions.

Produce a Strategy (no KPIs; code adds them):
1 positioning — exactly: "For <audience in a situation>, <brand> is the <category> that <ONE differentiator>, unlike <alternative seen in competitorClaims or W>. [ids]"
  The differentiator MUST (a) cite an F id, (b) not appear in competitorClaims, (c) matter to one audience's job. Unbacked adjectives are banned (sifatli, professional, ishonchli, eng yaxshi, качественный, лучший, best, quality).
  If no fact qualifies, use a verifiable practical axis (location/landmark, published price list, hours, delivery terms per F) and add the risk "Weak differentiation — ask the owner what they do that competitors don't [R...]".
2 audiences (max 3) — define them by product × situation, not demographics. Each needs: name; job (situation + the progress the customer wants); pains (only from F, competitor post themes [P], or W); triggers (only from the calendar entries provided, or F; payday only if an F fact states it); whereTheyAre (only: this channel [S.subscribers], competitor channels [P], W URLs, places the owner named [F]). If nothing is known, write exactly "UNKNOWN — Mijoz radar search needed".
3 offer — one entry offer built from F: "<product> — <price> — <condition> — how to claim: bot link [F..]". A risk reducer (trial, tasting, free consultation, exchange) or a deadline only if F states it. If there is no price fact: "BLOCKED — price needed [R...]".
4 proofPoints — only F or W, ranked: countable numbers > named reviews > certificates/years > process facts. S stats are internal diagnostics and are never proof.
5 pillars — one per pillarGoals entry, same goal and share. Give each a concrete topic name (not "Trust"), and 2–3 examples, each citing F ids. Where a top post [P] or competitor-gap rule exists, at least one example adapts its FORMAT, never its text.
6 risks (3–6) — only from fired rules, stats, or missing facts, each with ids.

Return JSON matching the schema.`;

const D3 = `You are the content planner of Uslub AI. Code already fixed each slot's day, time, goal, format, link and approval. You write the hook, the CTA and the brief for each slot.
INPUT: slots [{slot, day, time, goal, format, lang, exp?, calendarEvent?}], facts F#, voice {fingerprint, anchors[3]}, recentHooks (own, last 30), competitorHooks, hookTypes, lexicon, firedRules.

FOR EACH SLOT:
- hookType: one of number | price | question | local | before_after | behind_scenes | myth_fact | product_spotlight. Max 2 per type per week. If exp="hookType", use a type not in recentHooks.
- hook = the first line, ≤90 chars (aim for ≤70), in slot.lang. It must contain at least one specific: a number or price from F, a product name from F, a district or landmark from F, or a real customer question from F. No greetings ("Assalomu alaykum", "Hurmatli mijozlar", "Здравствуйте", "Dear"). No hype. A question hook must name the customer's actual pain.
  Shapes (fill ONLY from F): "{product} — {price} so'm. Nega aynan shu narx?" | "{district}da {product}: {number} {unit}" | "«{real FAQ question}» — eng ko'p so'raladigan savol"
  Bad: "Sizni ajoyib takliflarimiz kutmoqda!" (no specific, cliché, would fit anyone).
- cta: one action. sale/trust: verb + concrete benefit + the token {{LINK}} exactly once ("Botga yozing — menyu va bugungi narxlar: {{LINK}}"). reach: one forward or save line, no link.
- brief (for Kopirayter and Dizayner): 1 sentence of angle and which audience pain; the facts to use [F..]; what to photograph or film AT THE BUSINESS (real, never stock; for video, a ≤60-second phone shot list in 3 steps).
- sale slot: include the product's F price in the hook or brief. Urgency only with an F deadline or capacity fact.
- before_after or any customer content: say "needs customer consent" in the brief.
- factIds: every F id you used.
VOICE: match the fingerprint — address form, words per sentence, emoji ≤ min(3, fingerprint emojiPer100 +50%), exclamations only if the owner uses them. Copy the anchors' manner, never their sentences. Never reuse competitor wording.
RATIONALE: 3–5 lines, each "R.X: <ledger number> → <decision this week> [ids]".
Return JSON {items:[{slot, hookType, hook, cta, brief, factIds}], rationale:[...]}.`;

const REPAIR = `FIX ONLY these slots. For each, the failed checks and quoted reasons are given. Change only what the reasons require; keep everything else. If a needed fact does not exist, remove the claim instead of inventing it.`;

const CRITIC = (brand: string, category: string, names: string, fp: string) =>
  `You strictly review a weekly Telegram plan for ${brand} (${category}, Tashkent); competitors: ${names}; voice: ${fp}. For each item, check ONLY: HOOK (concreteness), NEURO (paraphrased clichés/hype/calques), SWAP_TEST, VOICE (manner), GOAL_FIT, HONESTY_CATEGORY. Fail only with a concrete reason quoting the offending words. Return JSON {items:[{slot, fails:[{check, quote, reason}]}]}; empty fails = pass.`;

/* ------------------------------------------------------------------- main */

export interface StrategyInput {
  knowledge: string;
  channel?: string;
  competitors?: string[];
  goal?: string;
  lang?: Lang;
  category?: string;
  brandName?: string;
  approvedPosts?: number;
  now?: number;
  onStage?: OnStage;
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

const HOOK_TYPES = ["number", "price", "question", "local", "before_after", "behind_scenes", "myth_fact", "product_spotlight"];

export async function buildStrategy(inp: StrategyInput) {
  const t0 = Date.now();
  const now = inp.now ?? Date.now();
  const lang = inp.lang ?? "uz";
  const category = inp.category ?? "";
  const emit = inp.onStage ?? (() => {});
  const brandName = inp.brandName ?? (inp.channel ? `@${inp.channel.replace(/^@/, "")}` : "Brend");

  // 1. facts ∥ channel analysis
  emit({ stage: "facts", status: "start" });
  const [facts, analysis] = await Promise.all([
    extractFacts(inp.knowledge).catch((err) => {
      console.warn("[brain/strategy] fact extraction failed", err instanceof Error ? err.message : err);
      return [] as Fact[];
    }),
    inp.channel ? analyzeDeterministic({ channel: inp.channel, competitors: inp.competitors, category, now }) : Promise.resolve(null),
  ]);
  emit({ stage: "facts", facts: facts.map((f) => ({ id: f.id, type: f.type, quote: f.quote })) });

  const has = (...types: Fact["type"][]) => facts.filter((f) => types.includes(f.type));
  const priceFacts = has("price");
  const offerFacts = has("offer");
  const proof = has("year", "number", "review", "certificate");
  const kb: KbSignals = { hasPrices: priceFacts.length > 0, hasProducts: has("product").length > 0 || priceFacts.length > 0, hasOffer: offerFacts.length > 0, proofFacts: proof.length };

  // 2. rules with KB signals
  const stats = analysis?.stats;
  const compStats = analysis?.competitors.map((c) => c.stats) ?? [];
  const cal = upcomingEvents(category, now).map((e) => ({ id: e.id, name: e.name[lang], daysAway: e.daysAway }));
  const rules: RuleResult[] = stats
    ? runRules(stats, { category, competitors: compStats, kb, calendar: cal })
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

  // 4. code computes shares, skeleton, KPIs, claims, voice
  const cycle = cycleOf(category, inp.knowledge);
  const pillar = pillarShares(cycle, rules);
  const bot = getEnv().BOT_USERNAME?.replace(/^@/, "");
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
  });
  const kpis = buildKpis(stats, rules, sk.slots.length, sk.slots, lang);
  const claims = competitorClaims(analysis?.competitors ?? []);
  const voice = voiceFingerprint(stats, inp.knowledge);
  const usedLangs = new Set(Object.keys(stats?.langShares ?? {}));
  const slotLang = lang === "uz" ? "uz-Latn" : lang;
  emit({ stage: "skeleton", slots: sk.slots, pillar, kpis });

  const common = GROUNDING(lang, voice.apostropheStyle, LEXICON);
  const recentHooks = (analysis?.data.posts ?? []).slice(0, 30).map((p) => features(p).firstLine);
  const competitorTexts = (analysis?.competitors ?? []).flatMap((c) => c.data.posts.map((p) => p.text));
  const statsForLlm = ledger.filter((e) => e.source !== "post" || e.id.startsWith(`P.${analysis?.data.channel}`)).map(({ id, label, display, n, prior }) => ({ id, label, display, n, prior }));

  // 5 + 6. strategist ∥ planner
  emit({ stage: "llm", status: "strategist+planner" });
  const slotsForLlm = sk.slots.map((s) => ({ slot: s.slot, day: s.day, time: s.time, goal: s.goal, format: s.format, lang: slotLang, exp: s.exp, calendarEvent: s.calendarEvent }));
  const [d2, d3] = await Promise.all([
    brainJson({
      schema: StrategySchema,
      model: SONNET,
      effort: "medium",
      maxTokens: 10000,
      system: `${common}\n\n${D2(brandName, category || "biznes", cycle, inp.goal ?? "ko'proq buyurtma")}`,
      prompt: JSON.stringify({
        facts: facts.map(({ id, type, quote }) => ({ id, type, quote })),
        stats: statsForLlm,
        firedRules: firedRules.map(({ id, name, trigger, effects }) => ({ id, name, trigger, effects })),
        competitorClaims: claims,
        web: [],
        pillarGoals: (["reach", "trust", "sale"] as Goal[]).map((g) => ({ goal: g, share: pillar.final[g] })),
        voice: { address: voice.address, primaryLang: voice.primaryLang },
        calendar: cal,
        ownerQuestions,
      }),
    }),
    brainJson({
      schema: PlanSchema,
      model: SONNET,
      effort: "medium",
      maxTokens: 12000,
      system: `${common}\n\n${D3}`,
      prompt: JSON.stringify({
        slots: slotsForLlm,
        facts: facts.map(({ id, type, quote }) => ({ id, type, quote })),
        voice: { ...voice, anchors: voice.anchors },
        recentHooks,
        competitorHooks: (analysis?.competitors ?? []).flatMap((c) => c.data.posts.slice(0, 10).map((p) => features(p).firstLine)),
        hookTypes: HOOK_TYPES,
        lexicon: LEXICON,
        firedRules: firedRules.map(({ id, trigger, effects }) => ({ id, trigger, effects })),
        stats: statsForLlm.filter((e) => e.id.startsWith("S.") || e.id.startsWith("R.")),
      }),
    }),
  ]);
  emit({ stage: "llm", status: "drafted", elapsedMs: Date.now() - t0 });

  // strategy post-processing (code overwrites shares, injects KPIs)
  const nameByGoal = new Map(d2.pillars.map((p) => [p.goal, p.name]));
  const risks = [...d2.risks];
  const posIds = extractIds(d2.positioning);
  if (!posIds.some((i) => /^F\d+$/.test(i)) || claims.some((c) => ws(d2.positioning).includes(c.phrase))) {
    risks.unshift(`Weak differentiation — ask the owner what they do that competitors don't [${firedRules[0]?.id ?? "R.TRUST_GAP"}]`);
    ownerQuestions.push(q.diff);
  }
  const strategy: Strategy = {
    positioning: d2.positioning,
    audiences: d2.audiences.slice(0, 3).map((a) => ({
      ...a,
      pains: a.pains.filter((p) => extractIds(p).length > 0),
      whereTheyAre: a.whereTheyAre.filter((w) => extractIds(w).length > 0 || w.startsWith("UNKNOWN")).length
        ? a.whereTheyAre.filter((w) => extractIds(w).length > 0 || w.startsWith("UNKNOWN"))
        : ["UNKNOWN — Mijoz radar search needed"],
    })),
    offer: priceFacts.length ? d2.offer : `BLOCKED — price needed [${firedRules.find((r) => r.id === "R.HIDDEN_PRICE")?.id ?? "R.TRUST_GAP"}]`,
    proofPoints: d2.proofPoints.filter((p) => extractIds(p).some((i) => /^[FW]\d+$/.test(i))),
    pillars: (["reach", "trust", "sale"] as Goal[])
      .filter((g) => pillar.final[g] > 0)
      .map((g) => ({ name: nameByGoal.get(g) ?? g, goal: g, share: pillar.final[g] / 100, examples: d2.pillars.find((p) => p.goal === g)?.examples ?? [] })),
    kpis,
    risks: risks.slice(0, 6),
  };

  // 7. lint + critic + one repair
  const emojiCap = Math.min(3, Math.max(1, Math.round(voice.emojiPer100 * 1.5 + 1)));
  const lintCtx = {
    ledger: ledgerMap,
    priceFacts: factLedger(priceFacts),
    deadlineFacts: has("deadline").length + has("offer").filter((f) => /\d/.test(f.quote)).length,
    recentHooks,
    competitorTexts,
    emojiCap,
    address: voice.address,
  };
  const bySlot = new Map(d3.items.map((i) => [i.slot, i]));
  const asLint = (s: Slot): LintItem => {
    const it = bySlot.get(s.slot);
    return { slot: s.slot, goal: s.goal, hook: it?.hook ?? "", cta: it?.cta ?? "", brief: it?.brief ?? "", factIds: it?.factIds ?? [] };
  };
  const codeFails = new Map<number, CheckFail[]>();
  for (const s of sk.slots) {
    const it = bySlot.get(s.slot);
    codeFails.set(s.slot, it ? lintItem(asLint(s), lintCtx) : [{ check: "PLAN_SHAPE", quote: "", reason: "missing item" }]);
  }
  let criticFails = new Map<number, CheckFail[]>();
  try {
    const cr = await brainJson({
      schema: CriticSchema,
      model: HAIKU,
      effort: "low",
      maxTokens: 4000,
      timeoutMs: 15_000,
      system: CRITIC(brandName, category, compStats.map((c) => `@${c.channel}`).join(", ") || "-", JSON.stringify({ address: voice.address, emojiPer100: voice.emojiPer100 })),
      prompt: JSON.stringify({ items: sk.slots.map((s) => ({ ...asLint(s), goal: s.goal, format: s.format })) }),
    });
    criticFails = new Map(cr.items.map((i) => [i.slot, i.fails.filter((f) => f.quote.trim())]));
  } catch {
    emit({ stage: "critic", status: "skipped" });
  }
  const failsOf = (slot: number) => [...(codeFails.get(slot) ?? []), ...(criticFails.get(slot) ?? [])];
  const failing = sk.slots.filter((s) => failsOf(s.slot).length > 0);
  emit({ stage: "critic", failing: failing.map((s) => ({ slot: s.slot, fails: failsOf(s.slot) })) });

  const repaired = new Set<number>();
  if (failing.length && Date.now() - t0 < 38_000) {
    try {
      const fix = await brainJson({
        schema: PlanSchema,
        model: SONNET,
        effort: "medium",
        maxTokens: 8000,
        timeoutMs: Math.max(8_000, 55_000 - (Date.now() - t0)),
        system: `${common}\n\n${D3}\n\n${REPAIR}`,
        prompt: JSON.stringify({
          slots: failing.map((s) => ({ ...slotsForLlm[s.slot - 1], current: bySlot.get(s.slot), fails: failsOf(s.slot) })),
          facts: facts.map(({ id, type, quote }) => ({ id, type, quote })),
          voice: { address: voice.address, emojiPer100: voice.emojiPer100 },
          lexicon: LEXICON,
        }),
      });
      for (const it of fix.items) {
        if (!bySlot.has(it.slot)) continue;
        bySlot.set(it.slot, it);
        repaired.add(it.slot);
        const s = sk.slots[it.slot - 1];
        codeFails.set(it.slot, lintItem(asLint(s), lintCtx));
        criticFails.delete(it.slot); // critic is not re-run (time budget); code checks are
      }
    } catch {
      emit({ stage: "repair", status: "failed" });
    }
  }

  // 8. assemble plan
  const criticReport: { slot: number; status: "passed" | "fixed" | "owner_input"; fails: CheckFail[] }[] = [];
  const items: (PlanItem & Record<string, unknown>)[] = sk.slots.map((s) => {
    const it = bySlot.get(s.slot);
    const fails = failsOf(s.slot);
    const reasons = [...s.approvalReasons];
    let hook = it?.hook ?? "";
    let brief = it?.brief ?? "";
    let cta = it?.cta ?? "";
    const hard = fails.filter((f) => ["GROUNDED", "PRICE", "URGENCY"].includes(f.check));
    if (hard.length) {
      if (groundedCheck(hook, ledgerMap, it?.factIds ?? []).length) hook = "";
      brief = `Egasidan ma'lumot kerak: ${hard.map((f) => `${f.quote} — ${f.reason}`).join("; ")}`;
      ownerQuestions.push(`${s.day} ${s.time}: ${hard[0].reason} («${hard[0].quote}»)`);
      reasons.push(`critic:${hard[0].check}`);
    } else if (fails.length) reasons.push(`critic:${fails[0].check}`);
    const text = `${hook} ${cta} ${brief}`;
    if (/chegirma|aksiya|скидк|акци|\d+\s?%|sovg'a|подар|muddat|срок/i.test(normApos(text)) && !reasons.includes("narx")) reasons.push("aksiya");
    if (compStats.some((c) => text.toLowerCase().includes(c.channel.toLowerCase()))) reasons.push("raqobatchi");
    if (/bolalar|дети|kafolat|100%|natija|гарант/i.test(text)) reasons.push("da'vo");
    if (/mijoz(imiz)? fikri|otziv|отзыв|before_after/i.test(`${text} ${it?.hookType ?? ""}`)) reasons.push("mijoz");
    if (usedLangs.size && !usedLangs.has(slotLang)) reasons.push("til");
    criticReport.push({ slot: s.slot, status: fails.length ? "owner_input" : repaired.has(s.slot) ? "fixed" : "passed", fails });
    const link = s.link ?? "";
    cta = s.goal === "reach" ? cta.replace(/\{\{LINK\}\}/g, "").trim() : link ? cta.replace("{{LINK}}", link) : cta;
    const evIds = [...new Set([...s.evidence, ...(it?.factIds ?? [])])];
    const meta = `— Dalil: ${evIds.join(" · ") || "-"} | Vaqt: ${s.timeSource === "prior" ? "taxminiy" : s.timeSource} | Tasdiq: ${[...new Set(reasons)].join(", ") || "autopilot"}${s.exp ? ` | exp:${s.exp}` : ""}`;
    return {
      day: s.day,
      time: s.time,
      goal: s.goal,
      pillar: nameByGoal.get(s.goal) ?? s.goal,
      format: s.format,
      hook,
      cta,
      brief: `${brief}\n${meta}`,
      metric: s.metric,
      needsApproval: reasons.length > 0,
      // extras for the UI
      slot: s.slot,
      timeSource: s.timeSource,
      exp: s.exp,
      hookType: it?.hookType,
      factIds: it?.factIds ?? [],
      approvalReasons: [...new Set(reasons)],
      link: s.link,
      calendarEvent: s.calendarEvent,
      critic: criticReport[criticReport.length - 1].status,
    };
  });

  const plan: ContentPlan = { weekOf: sk.weekOf, items, rationale: d3.rationale.filter((l) => extractIds(l).length > 0).join("\n") };
  emit({ stage: "done", elapsedMs: Date.now() - t0 });
  return {
    strategy,
    plan,
    ledger,
    firedRules,
    rules,
    ownerQuestions: [...new Set(ownerQuestions)].slice(0, 8),
    criticReport,
    pillar,
    facts,
    voice: { ...voice, anchors: undefined },
    competitorClaims: claims,
    elapsedMs: Date.now() - t0,
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

export { jaccard };
