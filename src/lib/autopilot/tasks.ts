import "server-only";
import { GrammyError, InlineKeyboard } from "grammy";
import { getBot } from "../bot";
import { defineCronTask } from "../cron/registry";
import { getPublicUrl } from "../env";
import { pickLocale } from "../i18n";
import { notifyOps } from "../ops/alert";
import { safeLogEvent } from "../track";
import { loadKnowledge } from "../uslub/brain/kbstore";
import { ORDER_BUCKETS, savePlanView } from "../uslub/brain/memory";
import { scrapeChannelData } from "../uslub/brain/scrape";
import { buildStrategy } from "../uslub/brain/strategy";
import { brandMonthlyCapUsd, spenderKey, takeUnits } from "../uslub/budget-core";
import { currentContext, flushUsage, runWithContext } from "../uslub/context";
import type { ChannelType, Goal, PostDraft } from "../uslub/contract";
import { generatePosts } from "../uslub/copywriter";
import { addBotAsAdminLink } from "../uslub/publish";
import { publishOnce } from "../uslub/publish-once";
import { slotBrief, slotSummary, toPlanSlot } from "../uslub/slots";
import { getBrand, getPost, listPosts, savePosts } from "../uslub/store";
import { summarizeUsage } from "../uslub/usage-cost";
import { AUTOPILOT_BUDGETS } from "./budgets";
import { say } from "./copy";
import { notifyQueueEvent, sendToOwner } from "./notify";
import { runPublishDue, type PublishDueDeps } from "./publish-due";
import {
  autopilotBrands,
  brandSpend30d,
  channelsForSnapshot,
  claimDue,
  claimRun,
  expireOverdue,
  finishQueue,
  finishRun,
  markStaleSending,
  metricsDue,
  pauseAutopilot,
  saveSnapshot,
  saveViews,
  setPostSchedule,
  tagPosts,
  weekNumbers,
  weekPlan,
} from "./repo";
import { reportInputFrom, reportKind } from "./report";
import { runMetrics, runSnapshots, typicalViews } from "./signals";
import { readAutopilot } from "./state";
import { isoWeek, tashkentDate } from "./time";
import { selectWeekBatch } from "./week";
import { weekMessage } from "./week-message";
import { pickWeekSlots, runWeekly, type WeeklyBrand, type WeeklyDeps } from "./weekly";

/**
 * The autopilot's tick tasks (registered in src/lib/cron/tasks.ts, publish-due first). Budgets add up to 210 s, so
 * with the heartbeat and the media sweep every task fits in the tick's 250 s.
 */

const DAY = 86_400_000;

const envNum = (name: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const raw = process.env[name];
  const n = Number(raw);
  return raw != null && raw.trim() !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/* ------------------------------------------------------------ publish-due */

function publishDueDeps(): PublishDueDeps {
  const api = getBot().api;
  return {
    now: Date.now,
    markStaleSending,
    expireOverdue: (before) => expireOverdue(before),
    claimDue,
    async finish(row, status, error) {
      await finishQueue(row.postId, status, error ?? null);
      await setPostSchedule(row.postId, { dueAt: new Date(row.dueAt).toISOString(), status }).catch(() => undefined);
    },
    loadPost: getPost,
    loadBrand: getBrand,
    publish: (a) => publishOnce(a),
    async notifyOwner(row, event) {
      await notifyQueueEvent(api, row, event, addBotAsAdminLink());
    },
    async alertTeam(row, reason) {
      await notifyOps(
        "publish_failed",
        [
          `Mercat: автопубликация поста не прошла (@${row.chat}).`,
          `Причина: ${reason.slice(0, 200)}`,
          "Владелец получил сообщение. Следующее такое сообщение — не раньше чем через час.",
        ].join("\n"),
      );
    },
  };
}

export const publishDue = defineCronTask({
  name: "publish-due",
  budgetMs: AUTOPILOT_BUDGETS["publish-due"],
  run: (ctx) => runPublishDue(publishDueDeps(), ctx),
});

/* ------------------------------------------------------ channel snapshots */

export const channelSnapshots = defineCronTask({
  name: "channel-snapshots",
  budgetMs: AUTOPILOT_BUDGETS["channel-snapshots"],
  async run(ctx) {
    const api = getBot().api;
    const activeDays = envNum("AUTOPILOT_ACTIVE_DAYS", 14, 1, 365);
    return runSnapshots(
      {
        today: ctx.tashkent.date,
        channels: () => channelsForSnapshot(ctx.tashkent.date, Date.now() - activeDays * DAY, 40),
        async memberCount(channel) {
          try {
            return await api.getChatMemberCount(`@${channel}`);
          } catch (err) {
            if (err instanceof GrammyError) return null;
            throw err;
          }
        },
        async scrapeCount(channel) {
          const data = await scrapeChannelData(channel, { maxPosts: 1, maxPages: 1, timeoutMs: 5_000 });
          return data.subscribers ?? null;
        },
        save: saveSnapshot,
      },
      ctx,
    );
  },
});

/* ----------------------------------------------------------- post metrics */

export const postMetrics = defineCronTask({
  name: "post-metrics",
  budgetMs: AUTOPILOT_BUDGETS["post-metrics"],
  run: (ctx) =>
    runMetrics(
      {
        now: Date.now,
        due: () => metricsDue(60),
        async channelPosts(channel) {
          const data = await scrapeChannelData(channel, { maxPosts: 60, maxPages: 3, timeoutMs: 6_000 });
          return data.posts.map((p) => ({ id: p.id, views: p.views }));
        },
        save: saveViews,
      },
      ctx,
    ),
});

/* ----------------------------------------------------------------- weekly */

const CHANNEL_TYPES = new Set<ChannelType>(["business", "blog", "expert", "media", "community"]);
const GOALS = new Set<Goal>(["reach", "trust", "sale", "engage", "grow"]);

/** Writes next week's plan and posts for one brand, then sends the owner the week to approve. */
async function generateWeek(b: WeeklyBrand, deadline: number): Promise<number> {
  const brand = await getBrand(b.id);
  if (!brand?.channel || brand.ownerTelegramId !== b.ownerTelegramId) return 0;
  const owner = b.ownerTelegramId;
  const lang = b.locale;
  return runWithContext({ route: "cron/weekly", lang, telegramId: owner }, async () => {
    const ctx = currentContext();
    try {
      // The app-wide daily Claude ceiling still holds: a plan and its posts are 2 units, as a bot onboarding.
      const budget = await takeUnits({ actor: spenderKey(owner, ""), anonymous: false, weight: 2, route: "cron/weekly" }).catch(() => "ok" as const);
      if (budget !== "ok") throw new Error(`claude budget: ${budget}`);
      const known = await loadKnowledge(brand.id).catch(() => ({ text: "" }));
      const knowledge = [known.text, brand.knowledge].filter(Boolean).join("\n\n");
      const result = await buildStrategy({
        knowledge,
        channel: brand.channel,
        lang,
        category: brand.dna?.oneLiner?.slice(0, 80),
        brandName: brand.dna?.name,
        brandId: brand.id,
        ownerTelegramId: owner,
        ownerVerified: brand.source === "custom",
      });
      await savePlanView(brand.id, {
        mode: "channel",
        plan: result.plan,
        strategy: result.strategy,
        ownerQuestions: result.ownerQuestions,
        planTag: result.planTag,
        lang,
        createdAt: new Date().toISOString(),
      }).catch(() => undefined);

      const items = result.plan.items.map((it, i) => ({ ...it, n: Number((it as { slot?: unknown }).slot) || i + 1 }));
      const picked = pickWeekSlots(items, Math.round(envNum("AUTOPILOT_POSTS_PER_WEEK", 3, 1, 5)));
      const batchAt = new Date().toISOString();
      const postsDeadline = Math.min(deadline, Date.now() + 60_000);
      const written = await Promise.allSettled(
        picked.map(async (it) => {
          const s = { day: it.day, time: it.time, goal: it.goal, hook: it.hook, cta: it.cta, brief: it.brief, format: it.format };
          const [post] = await generatePosts(brand, slotBrief(s), 1, {
            slot: { ...toPlanSlot(s), ...(it.format ? { format: it.format } : {}) },
            storedBrief: slotSummary(s),
            deadline: postsDeadline,
            format: it.format,
          });
          if (!post) return null;
          post.createdAt = batchAt;
          await savePosts([post], owner);
          return { post, n: it.n };
        }),
      );
      const done = written.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
      if (result.planTag) await tagPosts(done.map((d) => ({ postId: d.post.id, tag: result.planTag as string, slot: d.n }))).catch(() => undefined);
      if (done.length) await sendWeek(b, "ready");
      return done.length;
    } finally {
      if (ctx?.usage.length) {
        const usd = summarizeUsage("cron/weekly", ctx.usage).usd;
        await safeLogEvent(owner, "autopilot_spend", { brand_id: b.id, usd, week: isoWeek(Date.now()) });
      }
      await flushUsage(ctx);
    }
  });
}

/** The week view (week-message.ts) sent to the owner. */
async function sendWeek(b: WeeklyBrand, kind: "ready" | "week"): Promise<void> {
  const brand = await getBrand(b.id);
  if (!brand) return;
  const posts: PostDraft[] = await listPosts(brand.id, 50);
  const batch = selectWeekBatch({ posts, channel: brand.channel, languages: brand.dna?.languages, now: Date.now() });
  const msg = weekMessage(b.locale, { kind, brandId: brand.id, posts, batch, appUrl: getPublicUrl(), autopilotOn: true });
  const r = await sendToOwner(getBot().api, b.ownerTelegramId, msg.text, msg.keyboard);
  if (r === "blocked") await pauseAutopilot(b.id).catch(() => undefined);
}

function weeklyDeps(): WeeklyDeps {
  const api = getBot().api;
  const imageUsd = envNum("AUTOPILOT_IMAGE_USD", 0.08, 0, 10);
  return {
    now: Date.now,
    limits: {
      capUsd: brandMonthlyCapUsd(),
      weekUsd: envNum("AUTOPILOT_WEEK_USD", 0.4, 0, 100),
      activeDays: envNum("AUTOPILOT_ACTIVE_DAYS", 14, 1, 365),
    },
    async brands() {
      return (await autopilotBrands()).map((r) => ({
        id: r.id,
        ownerTelegramId: r.ownerTelegramId,
        channel: r.channel,
        autopilot: readAutopilot(r.autopilot),
        ...(r.channelType && CHANNEL_TYPES.has(r.channelType as ChannelType) ? { channelType: r.channelType as ChannelType } : {}),
        ...(r.goal && GOALS.has(r.goal as Goal) ? { goal: r.goal as Goal } : {}),
        lastSeenAt: r.lastSeenAt,
        locale: pickLocale(r.languageCode),
      }));
    },
    claim: (key, brandId, kind) => claimRun(key, brandId, kind),
    finish: (key, status, detail) => finishRun(key, status, detail),
    async reportInput(b, bounds) {
      const nums = await weekNumbers(b.id, b.channel, bounds);
      let medianViews: number | undefined;
      if (b.channel) {
        try {
          const data = await scrapeChannelData(b.channel, { maxPosts: 40, maxPages: 2, timeoutMs: 6_000 });
          medianViews = typicalViews(data.posts, Date.now());
        } catch {
          medianViews = undefined; // the line then shows views without the comparison
        }
      }
      return reportInputFrom(nums, { locale: b.locale, kind: reportKind(b.channelType, b.goal), weekOf: bounds.weekOf, thisWeekOf: bounds.thisWeekOf, medianViews });
    },
    async sendReport(b, report, bounds) {
      let keyboard: InlineKeyboard | undefined;
      if (report.askOrders) {
        // With last week's plan the answer goes to brain_outcomes through the bot's own ord: buttons; else apo:.
        const plan = await weekPlan(b.id, bounds.weekOf).catch(() => null);
        keyboard = new InlineKeyboard();
        for (const key of ["0", "1", "4", "10"]) keyboard.text(ORDER_BUCKETS[key].label, plan ? `ord:${plan.tag}:${key}` : `apo:${b.id}:${key}`);
      }
      const r = await sendToOwner(api, b.ownerTelegramId, report.text, keyboard);
      await safeLogEvent(b.ownerTelegramId, "weekly_report", { brand_id: b.id, kind: report.askOrders ? "sales" : "growth", delivered: r });
      return r;
    },
    async spentUsd(brandId) {
      const s = await brandSpend30d(brandId);
      return s.llmUsd + s.images * imageUsd;
    },
    generate: generateWeek,
    async tell(b, what) {
      const r = await sendToOwner(api, b.ownerTelegramId, say(b.locale, what));
      await safeLogEvent(b.ownerTelegramId, "autopilot_notice", { brand_id: b.id, what, day: tashkentDate(Date.now()), delivered: r });
      return r;
    },
    pause: (brandId) => pauseAutopilot(brandId),
  };
}

export const weekly = defineCronTask({
  name: "weekly",
  budgetMs: AUTOPILOT_BUDGETS.weekly,
  run: (ctx) => runWeekly(weeklyDeps(), ctx, ctx.tashkent),
});
