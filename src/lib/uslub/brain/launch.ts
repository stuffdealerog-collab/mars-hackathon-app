import "server-only";
import { z } from "zod";
import type { ContentPlan, Goal, PlanItem, Strategy } from "@/lib/uslub/contract";
import { inventedFacts } from "@/lib/uslub/neuro";
import type { OnStage } from "./audit";
import { stripIds, stripIdsAll } from "./copy";
import { bestTimeLabel } from "./forecast";
import { GROWTH_IDEAS, KIND_BRIEF, descriptionSignals, launchKpis, launchQuestions, launchSkeleton, launchSufficiency, type LaunchSlot } from "./launch-plan";
import { brainJson, SONNET } from "./llm";
import { mondayOf } from "./skeleton";
import { LEXICON } from "./stats";
import type { Lang } from "./types";
import { clip } from "../text";

/**
 * Fresh mode: a 2-week LAUNCH plan for a Telegram channel with no posts and 0–few subscribers, built only
 * from the owner's description of the business. Code fixes the skeleton (days, times, goals, the pinned
 * intro first, one offer); Claude writes the words in two parallel calls (strategy + growth tactics, and
 * the 9 post briefs). Any number, date or promo word that is not in the description sends the item to
 * the owner for approval instead of being published as fact.
 */

const LANG_RULE: Record<Lang, string> = {
  uz: "Write every field in natural Uzbek, Latin script, as people in Tashkent write: o‘ and g‘ with the ‘ sign, the tutuq belgisi as ’. Plain shop-owner words, no marketing jargon.",
  ru: "Write every field in natural Russian, plain shop-owner words, no marketing jargon.",
  en: "Write every field in plain English, shop-owner words, no marketing jargon.",
};

const COMMON = (lang: Lang) => `You are the Strategist of Mercat, an AI marketing department for small businesses in Uzbekistan.
The business is launching its Telegram channel from zero: no posts yet, 0–few subscribers. Nothing is known about it except the OWNER'S DESCRIPTION.
FACT RULES (hard):
- The owner's description is the ONLY source of facts. Never invent prices, addresses, districts, phone numbers, delivery terms or areas, opening hours, years in business, customer counts, reviews, awards, discounts, gifts or deadlines.
- If something needs such a fact and the description does not give it, leave it out or send the reader to the admin ("narxini adminga yozing"). Never write a blank or placeholder ([narx], [telefon], {…}, XXX): every hook, CTA and brief must read as finished text.
- Ideas and recommendations are fine (what to post, how to grow); claims about the business are only what the description says.
${LANG_RULE[lang]}
Never use these machine-sounding phrases or their paraphrases: ${LEXICON.join("; ")}.`;

const StrategySchema = z.object({
  positioning: z.string(),
  audiences: z.array(z.object({ name: z.string(), job: z.string(), pains: z.array(z.string()), triggers: z.array(z.string()), whereTheyAre: z.array(z.string()) })),
  offer: z.string(),
  proofPoints: z.array(z.string()),
  pillars: z.array(z.object({ goal: z.enum(["reach", "trust", "sale"]), name: z.string(), examples: z.array(z.string()) })),
  risks: z.array(z.string()),
  tactics: z.array(z.object({ title: z.string(), how: z.string(), why: z.string() })),
});

const ItemsSchema = z.object({ items: z.array(z.object({ slot: z.number(), hook: z.string(), cta: z.string(), brief: z.string() })) });

const STRATEGY_TASK = `TASK: the launch strategy.
- positioning: one sentence — for whom, what, why them (only from the description).
- audiences: 1–2, by situation (who buys, when, why). whereTheyAre: concrete places in Uzbekistan where these people already are (the district's Telegram groups, the school/mahalla chats, Instagram, the counter) — no invented channel names.
- offer: one simple launch offer for the first customers, built only from the description; if its terms are unknown, say in words that the owner sets the terms and the deadline.
- proofPoints: only facts the description states (can be empty).
- pillars: exactly three, one per goal (reach, trust, sale): a short name and 2 example post ideas each.
- tactics: 3–5 concrete ways to get the FIRST subscribers for a brand-new channel, adapted to THIS business, realistic for Uzbekistan. Choose from these and make them specific (who, where, what exactly to say or print): ${GROWTH_IDEAS.join(" | ")}. Each: title (short), how (2–3 concrete steps), why (one sentence). No buying subscribers, no giveaways that require subscriptions to other channels.
- risks: 2–3 honest risks for the first two weeks (e.g. posting stops after a week, no real photos).
Return JSON.`;

const ITEMS_TASK = `TASK: write the 9 launch posts' plan items (one per slot). For each slot:
- hook: the post's first line, ≤ 90 characters, specific to this business (a product, a place, a question). No greetings, no hype.
- cta: one clear next step. For sale and intro slots: exactly how to order, using the contact from the description or [telefon]. For reach slots: invite a reply or a forward.
- brief: 2–4 sentences for the copywriter: what the post says, which facts from the description to use, which real photo to attach.
Follow each slot's "purpose". Slot 1 is the intro post the owner will pin; the post never says it is pinned. Every hook must be different. Return JSON { items: [{ slot, hook, cta, brief }] } for all 9 slots.`;

const METRIC: Record<Lang, Record<Goal, string>> = {
  uz: { reach: "javoblar va ulashishlar", trust: "ko‘rishlar", sale: "buyurtmalar", engage: "reaksiyalar va javoblar", grow: "yangi obunachilar" },
  ru: { reach: "ответы и пересылки", trust: "просмотры", sale: "заказы", engage: "реакции и ответы", grow: "новые подписчики" },
  en: { reach: "replies and forwards", trust: "views", sale: "orders", engage: "reactions and replies", grow: "new subscribers" },
};

const PILLAR_NAME: Record<Lang, Record<Goal, string>> = {
  uz: { reach: "Foydali va qiziq", trust: "Ishonch", sale: "Sotuv", engage: "Muloqot", grow: "O‘sish" },
  ru: { reach: "Польза и вовлечение", trust: "Доверие", sale: "Продажи", engage: "Общение", grow: "Рост" },
  en: { reach: "Useful and engaging", trust: "Trust", sale: "Sales", engage: "Conversation", grow: "Growth" },
};

/** When the model's offer used terms the owner never gave: the offer's shape; the terms are the owner's call. */
const OFFER_FALLBACK: Record<Lang, string> = {
  uz: "Kanalning birinchi mijozlari uchun bitta oddiy taklif. Nima va qachongacha ekanini o‘zingiz belgilaysiz — yozsangiz, postga qo‘shamiz.",
  ru: "Одно простое предложение для первых клиентов канала. Что именно и до какого числа — решаете вы; напишите, и мы добавим это в пост.",
  en: "One simple offer for the channel's first customers. You decide what it is and until when — tell us and we add it to the post.",
};

const REVIEW: Record<Lang, (day: string, token: string) => string> = {
  uz: (d, t) => `${d}: «${t}» tavsifingizda yo‘q — post chiqishidan oldin tekshiring.`,
  ru: (d, t) => `${d}: «${t}» нет в вашем описании — проверьте перед публикацией.`,
  en: (d, t) => `${d}: "${t}" is not in your description — check it before posting.`,
};

/** Fact-like tokens (numbers, dates, %, promo words) in `text` that the description never mentions. */
function unsupported(description: string, text: string): string[] {
  const clean = text.replace(/\[[^\]]{1,30}\]/g, " "); // placeholders are fine
  // inventedFacts counts occurrences; repeating the source makes it a membership check.
  return inventedFacts(description.repeat(8), clean);
}

export interface LaunchInput {
  knowledge: string;
  brandName?: string;
  channel?: string;
  goal?: string;
  lang?: Lang;
  now?: number;
  onStage?: OnStage;
}

export async function buildLaunchStrategy(inp: LaunchInput) {
  const t0 = Date.now();
  const lang = inp.lang ?? "uz";
  const now = inp.now ?? Date.now();
  const emit = inp.onStage ?? (() => {});
  const description = clip(inp.knowledge.trim(), 6000);
  const sig = descriptionSignals(description);
  const slots = launchSkeleton(now);
  emit({ stage: "skeleton", slots, mode: "fresh", elapsedMs: Date.now() - t0 });

  const context = [
    inp.brandName ? `BRAND NAME: ${inp.brandName}` : "",
    inp.channel ? `TELEGRAM CHANNEL: @${inp.channel.replace(/^@/, "")} (new, empty)` : "TELEGRAM CHANNEL: not created yet or empty",
    inp.goal ? `OWNER'S GOAL: ${clip(inp.goal, 400)}` : "",
    `OWNER'S DESCRIPTION:\n${description}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const slotsForLlm = slots.map((s) => ({ slot: s.slot, day: s.day, time: s.time, goal: s.goal, purpose: KIND_BRIEF[s.kind], pinned: s.pinned }));

  const [stratR, itemsR] = await Promise.allSettled([
    brainJson({ schema: StrategySchema, model: SONNET, effort: "low", maxTokens: 6000, timeoutMs: 50_000, maxRetries: 0, purpose: "launch_strategy", system: COMMON(lang), prompt: `${context}\n\n${STRATEGY_TASK}` }),
    brainJson({
      schema: ItemsSchema,
      model: SONNET,
      effort: "low",
      maxTokens: 6000,
      timeoutMs: 50_000,
      maxRetries: 0,
      purpose: "launch_items",
      system: COMMON(lang),
      prompt: `${context}\n\nSLOTS:\n${JSON.stringify(slotsForLlm)}\n\n${ITEMS_TASK}`,
    }),
  ]);
  // Without the post briefs there is no plan to show: surface the error (owner-safe at the route).
  if (itemsR.status === "rejected") throw itemsR.reason;
  const d = stratR.status === "fulfilled" ? stratR.value : null;
  if (!d) console.warn("[brain/launch] strategy call failed", stratR.status === "rejected" && stratR.reason instanceof Error ? stratR.reason.message : "");

  const ownerQuestions = launchQuestions(sig, lang);
  const bySlot = new Map(itemsR.value.items.map((i) => [i.slot, i]));
  const items: (PlanItem & Record<string, unknown>)[] = slots.map((s: LaunchSlot) => {
    const it = bySlot.get(s.slot);
    const hook = clip(stripIds(it?.hook ?? ""), 160);
    const cta = stripIds(it?.cta ?? "");
    const brief = stripIdsAll(it?.brief ?? "");
    const reasons: string[] = [];
    if (s.needsApproval) reasons.push(s.slot <= 3 ? "birinchi postlar" : "taklif");
    // Hook and CTA go into the post as written: any new number, date or promo word needs the owner. The brief only
    // guides the copywriter (who has the same fact rules), so there only new numbers count.
    const invented = [...unsupported(description, `${hook}\n${cta}`), ...unsupported(description, brief).filter((x) => /\d/.test(x))];
    if (invented.length) {
      reasons.push("fakt");
      ownerQuestions.push(REVIEW[lang](`${s.day} ${s.time}`, invented[0]));
    }
    if (!it) reasons.push("critic:timeout");
    const item: PlanItem & Record<string, unknown> = {
      day: s.day,
      time: s.time,
      goal: s.goal,
      pillar: PILLAR_NAME[lang][s.goal],
      format: s.format,
      hook,
      cta,
      brief,
      metric: METRIC[lang][s.goal],
      needsApproval: reasons.length > 0,
      slot: s.slot,
      // A new channel has no numbers yet: the time is a suggestion, and the label says so.
      timeLabel: bestTimeLabel({ weekday: (new Date(`${s.day}T00:00:00Z`).getUTCDay() + 6) % 7, time: s.time, timeSource: "prior" }, lang),
      kind: s.kind,
      pinned: s.pinned,
      approvalReasons: reasons,
    };
    emit({ stage: "item", item, elapsedMs: Date.now() - t0 });
    return item;
  });

  const shares: Record<Goal, number> = { reach: 0, trust: 0, sale: 0, engage: 0, grow: 0 };
  for (const s of slots) shares[s.goal]++;
  const clean = (x: string) => stripIdsAll(x);
  const offerOk = d && d.offer.trim() && !unsupported(description, d.offer).length;
  const safeOffer = offerOk ? clean(d.offer) : OFFER_FALLBACK[lang];
  const strategy: Strategy = {
    positioning: clean(d?.positioning ?? ""),
    audiences: (d?.audiences ?? []).slice(0, 2).map((a) => ({
      name: clean(a.name),
      job: clean(a.job),
      pains: a.pains.map(clean).slice(0, 4),
      triggers: a.triggers.map(clean).slice(0, 4),
      whereTheyAre: a.whereTheyAre.map(clean).slice(0, 5),
    })),
    offer: safeOffer,
    // Proof only from the description: anything with a number or date it never mentions is dropped.
    proofPoints: (d?.proofPoints ?? []).filter((p) => !unsupported(description, p).length).map(clean),
    pillars: (["trust", "sale", "reach"] as Goal[]).map((g) => ({
      name: clean(d?.pillars.find((p) => p.goal === g)?.name ?? PILLAR_NAME[lang][g]),
      goal: g,
      share: Math.round((shares[g] / slots.length) * 100) / 100,
      examples: (d?.pillars.find((p) => p.goal === g)?.examples ?? []).map(clean).slice(0, 3),
    })),
    kpis: launchKpis(slots.length, lang),
    risks: (d?.risks ?? []).map(clean).slice(0, 4),
  };
  const tactics = (d?.tactics ?? []).slice(0, 5).map((x) => ({ title: clean(x.title), how: clean(x.how), why: clean(x.why) }));
  emit({ stage: "strategy", strategy, ok: Boolean(d), elapsedMs: Date.now() - t0 });

  const plan: ContentPlan = {
    weekOf: mondayOf(slots[0].day),
    items,
    rationale: {
      uz: "Kanal yangi: birinchi post — kimligingiz, nima sotishingiz va qanday buyurtma berish (uni kanalda o‘zingiz pin qiling). Keyin mahsulot, ishonch va bitta taklif; ikki post o‘quvchilarni javob yozishga chaqiradi. 2 haftada 9 ta post — boshlash uchun yetarli va ushlab turish oson.",
      ru: "Канал новый: первый пост — кто вы, что продаёте и как заказать (закрепите его сами: нажмите на пост → «Закрепить»). Дальше товар, доверие и одно предложение; два поста зовут читателей ответить. 9 постов за 2 недели — достаточно для старта и реально выдержать.",
      en: "The channel is new: the first post says who you are, what you sell and how to order (pin it yourself: tap the post → “Pin”). Then products, trust and one offer; two posts invite replies. 9 posts in 2 weeks is enough to start and easy to keep up.",
    }[lang],
  };
  emit({ stage: "done", elapsedMs: Date.now() - t0 });
  return {
    mode: "fresh" as const,
    strategy,
    plan,
    launch: { weeks: 2, pinnedSlot: 1, tactics },
    planId: null,
    planTag: null,
    ownerQuestions: [...new Set(ownerQuestions)].slice(0, 8),
    sufficiency: launchSufficiency(sig, lang),
    facts: [],
    ledger: [],
    firedRules: [],
    criticReport: [],
    elapsedMs: Date.now() - t0,
  };
}
