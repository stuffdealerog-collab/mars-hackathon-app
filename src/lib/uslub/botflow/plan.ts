import "server-only";
import { getEnv } from "@/lib/env";
import { mayTrackLinks } from "../brain/answers";
import { loadAnswers } from "../brain/answers-store";
import { runAudit } from "../brain/audit";
import { questionsForBrand } from "../brain/brand-questions";
import { defaultGoalFor, planTypeFor } from "../brain/channel-type";
import { loadKnowledge } from "../brain/kbstore";
import { buildLaunchStrategy } from "../brain/launch";
import { savePlanView } from "../brain/memory";
import type { OwnerQuestion } from "../brain/questions";
import { buildStrategy } from "../brain/strategy";
import type { Lang } from "../brain/types";
import type { ChannelAudit, ChannelType, ContentPlan, PlanItem, PostDraft } from "../contract";
import { generatePosts } from "../copywriter";
import { brandPostEnding, planTrackedLink, withoutTrackedLinks } from "../ending";
import { slotBrief, type SlotInput, slotSummary, toPlanSlot } from "../slots";
import { savePosts, setBrandTypeGoal, type StoredBrand } from "../store";

/**
 * The Studio's analysis, plan and posts for the bot (owner corrections 1-2 included), with the same inputs the API
 * routes use, so a brand onboarded in the bot gets the same week as one onboarded in the Studio:
 *   analyzeForBot  = POST /api/uslub/analyze { channel, brandId }
 *   planForBrand   = POST /api/uslub/strategy { brandId }  (week plan, or the 2-week launch plan for a fresh brand)
 *   writePlanPosts = POST /api/uslub/posts { brandId, slots }
 * The bot takes its Claude budget before the run (bot.ts), so none of these take units.
 */

const botName = () => getEnv().BOT_USERNAME?.replace(/^@/, "");

/** The channel analysis the Studio's Kanal tab shows; null when there is none (an empty channel, a failed read). */
export async function analyzeForBot(brand: StoredBrand, lang: Lang): Promise<ChannelAudit | null> {
  if (!brand.channel || brand.mode === "fresh") return null;
  try {
    // The brand's stored type as the owner's confirmed goal plans it (the analyze route's brandChannelType).
    const channelType = brand.channelType ? planTypeFor(brand.channelType, brand.goal) : undefined;
    const r = await runAudit({ channel: brand.channel, lang, ...(channelType ? { channelType } : {}) });
    return r.audit;
  } catch (err) {
    console.warn("[botflow/plan] analysis failed", err instanceof Error ? err.message : err);
    return null;
  }
}

export interface BotPlan {
  mode: "channel" | "fresh";
  plan: ContentPlan;
  /** The owner's open questions (goal first), from the plan run or, for a launch plan, from the brand. */
  questions: OwnerQuestion[];
  /** The goal this plan was made for. */
  goal: "sale" | "grow";
  channelType?: ChannelType;
}

const asMainGoal = (g: string | undefined | null): "sale" | "grow" | undefined => (g === "sale" || g === "grow" ? g : undefined);

/**
 * The brand's week plan, saved as the plan view the Studio and the Mini App reopen. null when there is nothing to plan
 * from (a fresh brand without a description).
 */
export async function planForBrand(brand: StoredBrand, userId: number, lang: Lang): Promise<BotPlan | null> {
  const [answers, owner] = await Promise.all([loadAnswers(brand.id).catch(() => null), loadKnowledge(brand.id).catch(() => ({ text: "" }))]);
  const knowledge = [owner.text, brand.knowledge].filter(Boolean).join("\n\n");
  const fresh = brand.mode === "fresh" || (!brand.channel && !brand.samplePosts.length);
  const bot = botName();
  const mainGoal = answers?.goal ?? asMainGoal(brand.goal);
  if (fresh) {
    if (knowledge.trim().length < 30) return null;
    const r = await buildLaunchStrategy({ knowledge, brandName: brand.dna?.name, channel: brand.channel?.replace(/^@/, ""), lang });
    const questions = questionsForBrand(brand, answers, lang, { bot });
    await savePlanView(brand.id, {
      mode: "fresh",
      plan: r.plan,
      strategy: r.strategy,
      ownerQuestions: r.ownerQuestions,
      questions,
      planTag: r.planTag,
      launch: r.launch,
      lang,
      createdAt: new Date().toISOString(),
    }).catch(() => {});
    return { mode: "fresh", plan: r.plan, questions, goal: mainGoal ?? asMainGoal(defaultGoalFor(brand.channelType)) ?? "sale", channelType: brand.channelType };
  }
  const r = await buildStrategy({
    knowledge,
    channel: brand.channel?.replace(/^@/, ""),
    lang,
    // The Studio sends no category: the brand's one-liner drives the buying cycle and niche (strategy route).
    category: brand.dna?.oneLiner?.slice(0, 80),
    brandName: brand.dna?.name,
    brandId: brand.id,
    ownerTelegramId: userId,
    ownerVerified: brand.source === "custom" && brand.ownerTelegramId != null && brand.ownerTelegramId === userId,
    channelType: brand.channelType,
    mainGoal,
    answers,
    brandOwnerTelegramId: brand.ownerTelegramId,
    postEnding: brandPostEnding(brand, bot),
    products: brand.dna?.products,
  });
  await savePlanView(brand.id, {
    mode: "channel",
    plan: r.plan,
    strategy: r.strategy,
    ownerQuestions: r.ownerQuestions,
    questions: r.questions,
    channelType: r.channelType,
    goal: r.goal,
    planTag: r.planTag,
    lang,
    createdAt: new Date().toISOString(),
  }).catch(() => {});
  // A brand made before type detection learns its type now (brands.goal is only ever the owner's answer).
  if (r.channelType && !brand.channelType) await setBrandTypeGoal(brand.id, { channelType: r.channelType }).catch(() => {});
  return { mode: "channel", plan: r.plan, questions: r.questions, goal: r.goal, channelType: r.channelType };
}

/**
 * One post per plan item, written in parallel and saved as soon as each is done (a slow one never loses the others),
 * as one batch (one createdAt) so the Studio lists them in plan order. Mercat's tracked link only when the owner
 * opted in and the brand has an owner. Posts that could not be written are left out.
 */
export async function writePlanPosts(brand: StoredBrand, items: PlanItem[], userId: number, deadline?: number): Promise<PostDraft[]> {
  const [answers, kb] = await Promise.all([loadAnswers(brand.id).catch(() => null), loadKnowledge(brand.id).catch(() => ({ text: "" }))]);
  const knowledge = [kb.text, brand.knowledge].filter((t) => t.trim()).join("\n\n");
  const tracking = mayTrackLinks(answers, brand.ownerTelegramId);
  const bot = botName();
  const batchAt = new Date().toISOString();
  const settled = await Promise.allSettled(
    items.map(async (item) => {
      const s: SlotInput & { link?: string } = {
        day: item.day,
        time: item.time,
        goal: item.goal,
        hook: item.hook,
        cta: item.cta,
        brief: item.brief,
        ...(item.format ? { format: item.format } : {}),
        ...((item as { link?: string }).link ? { link: (item as { link?: string }).link } : {}),
      };
      const trackedLink = tracking ? planTrackedLink(s, bot) : undefined;
      const forWriter = trackedLink ? s : { ...s, cta: withoutTrackedLinks(s.cta) };
      const [post] = await generatePosts(brand, slotBrief(forWriter), 1, {
        slot: toPlanSlot(s),
        storedBrief: slotSummary(s),
        deadline,
        format: s.format,
        knowledge,
        answers,
        trackedLink,
      });
      if (!post) return null;
      post.createdAt = batchAt;
      await savePosts([post], userId);
      return post;
    }),
  );
  return settled.flatMap((r) => {
    if (r.status === "fulfilled") return r.value ? [r.value] : [];
    console.warn("[botflow/plan] post not written", r.reason instanceof Error ? r.reason.message : r.reason);
    return [];
  });
}
