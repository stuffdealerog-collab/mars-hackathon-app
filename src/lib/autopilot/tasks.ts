import "server-only";
import { GrammyError, InlineKeyboard } from "grammy";
import { getBot } from "../bot";
import { defineCronTask } from "../cron/registry";
import { getPublicUrl } from "../env";
import { type Locale, pickLocale } from "../i18n";
import { notifyOps } from "../ops/alert";
import { safeLogEvent } from "../track";
import { loadKnowledge } from "../uslub/brain/kbstore";
import { ORDER_BUCKETS, savePlanView } from "../uslub/brain/memory";
import { scrapeChannelData } from "../uslub/brain/scrape";
import { buildStrategy } from "../uslub/brain/strategy";
import { spenderKey, takeUnits } from "../uslub/budget-core";
import { currentContext, flushUsage, runWithContext } from "../uslub/context";
import type { ChannelType, Goal, PostDraft } from "../uslub/contract";
import { generatePosts } from "../uslub/copywriter";
import { isPendingImage, startPostImage } from "../uslub/media/post-image";
import { ensureVisual, postImageDeps, refreshPostImage } from "../uslub/media/post-image-service";
import { getPostForImage } from "../uslub/media/post-repo";
import { getBrandVisualInfo } from "../uslub/visual/repo";
import { addBotAsAdminLink } from "../uslub/publish";
import { publishOnce } from "../uslub/publish-once";
import { slotBrief, slotSummary, toPlanSlot } from "../uslub/slots";
import { getBrand, getPost, listPosts, savePosts, type StoredBrand } from "../uslub/store";
import { summarizeUsage } from "../uslub/usage-cost";
import { AUTOPILOT_BUDGETS, brandMonthlyCapUsd } from "./budgets";
import { say } from "./copy";
import { notifyQueueEvent, ownerLocale, type SendResult, sendToOwner } from "./notify";
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
  loadAutopilotRow,
  markMetricsTried,
  markSnapshotTried,
  markStaleSending,
  metricsDue,
  pauseAutopilot,
  queueWeekMessage,
  saveSnapshot,
  saveViews,
  setPostSchedule,
  settleWeekMessage,
  tagPosts,
  takeWeekMessage,
  waitingWeekMessages,
  weekNumbers,
  weekPlan,
} from "./repo";
import { reportInputFrom, reportKind } from "./report";
import { runMetrics, runSnapshots, typicalViews } from "./signals";
import { readAutopilot } from "./state";
import { isoWeek, tashkentDate } from "./time";
import { latestWeekBatch, selectWeekBatch } from "./week";
import { weekMessage } from "./week-message";
import { runWeekMessages } from "./week-ready";
import { pickWeekSlots, runWeekly, type WeeklyBrand, type WeeklyDeps, withSpend } from "./weekly";

/**
 * The autopilot's tick tasks (registered in src/lib/cron/tasks.ts, publish-due first). Budgets add up to 220 s, so
 * with the heartbeat and the media sweep every task fits in the tick's 250 s.
 */

const DAY = 86_400_000;

const envNum = (name: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const raw = process.env[name];
  const n = Number(raw);
  return raw != null && raw.trim() !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const activeDays = () => envNum("AUTOPILOT_ACTIVE_DAYS", 14, 1, 365);
const postsPerWeek = () => Math.round(envNum("AUTOPILOT_POSTS_PER_WEEK", 3, 1, 5));
const imageUsd = () => envNum("AUTOPILOT_IMAGE_USD", 0.08, 0, 10);
/** What one try of a brand's week (plan + posts) is expected to cost in Claude, USD. */
const weekClaudeUsd = () => envNum("AUTOPILOT_WEEK_USD", 0.4, 0, 100);

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
      const unknown = reason.startsWith("unknown");
      await notifyOps(
        "publish_failed",
        [
          unknown
            ? `Mercat: автопубликация поста прервалась на отправке (@${row.chat}); вышел ли пост, неизвестно. Повторно не отправляем.`
            : `Mercat: автопубликация поста не прошла (@${row.chat}).`,
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

/* ---------------------------------------------------------- week messages */

/** The week view (week-message.ts) sent to the owner. */
async function sendWeek(b: Pick<WeeklyBrand, "id" | "ownerTelegramId" | "locale">, kind: "ready" | "week"): Promise<SendResult> {
  const brand = await getBrand(b.id);
  if (!brand) return "failed";
  const posts: PostDraft[] = await listPosts(brand.id, 50);
  const batch = selectWeekBatch({ posts, channel: brand.channel, languages: brand.dna?.languages, now: Date.now() });
  const msg = weekMessage(b.locale, { kind, brandId: brand.id, posts, batch, appUrl: getPublicUrl(), autopilotOn: true, owned: true });
  const r = await sendToOwner(getBot().api, b.ownerTelegramId, msg.text, msg.keyboard);
  if (r === "blocked") await pauseAutopilot(b.id).catch(() => undefined);
  return r;
}

export const weekMessages = defineCronTask({
  name: "week-messages",
  budgetMs: AUTOPILOT_BUDGETS["week-messages"],
  run: (ctx) =>
    runWeekMessages(
      {
        now: Date.now,
        waiting: () => waitingWeekMessages(10),
        async pendingPictures(brandId, deadline) {
          let pending = 0;
          for (const p of latestWeekBatch(await listPosts(brandId, 50))) {
            if (!isPendingImage(p.image ?? undefined)) continue;
            // Brings the picture up to date (nobody may be polling it); never throws.
            const image = Date.now() < deadline ? await refreshPostImage(p.id) : p.image;
            if (image && isPendingImage(image)) pending++;
          }
          return pending;
        },
        take: takeWeekMessage,
        settle: settleWeekMessage,
        async send(brandId) {
          const brand = await getBrand(brandId);
          if (!brand?.ownerTelegramId || !brand.channel) return "gone";
          if (readAutopilot((await loadAutopilotRow(brandId))?.autopilot).paused) return "gone";
          const r = await sendWeek({ id: brandId, ownerTelegramId: brand.ownerTelegramId, locale: await ownerLocale(brand.ownerTelegramId) }, "ready");
          return r === "blocked" ? "gone" : r;
        },
      },
      ctx,
    ),
});

/* ------------------------------------------------------ channel snapshots */

export const channelSnapshots = defineCronTask({
  name: "channel-snapshots",
  budgetMs: AUTOPILOT_BUDGETS["channel-snapshots"],
  async run(ctx) {
    const api = getBot().api;
    const day = ctx.tashkent.date;
    return runSnapshots(
      {
        today: day,
        channels: () => channelsForSnapshot(day, Date.now() - activeDays() * DAY, 40),
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
        tried: (channel) => markSnapshotTried(channel, day),
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
        tried: markMetricsTried,
      },
      ctx,
    ),
});

/* ----------------------------------------------------------------- weekly */

const CHANNEL_TYPES = new Set<ChannelType>(["business", "blog", "expert", "media", "community"]);
const GOALS = new Set<Goal>(["reach", "trust", "sale", "engage", "grow"]);

/** Time the pictures' start needs (the subject line ≤20 s, then the job's submit), else the week goes without them. */
const PICTURES_MIN_MS = 25_000;
/** …and a style analysis (a brand's first picture) on top of that. */
const STYLE_LEARN_MIN_MS = 85_000;

/**
 * Starts the week's pictures on the server, in the brand's style and within the daily picture caps, so the owner
 * approves each post with its picture. Returns how many are being drawn; 0 = none (no picture provider, a cap, no
 * time): the week then goes out as text, and any picture drawn later is not sent (publish-due.ts textOnly).
 */
async function startWeekPictures(brand: StoredBrand, posts: PostDraft[], owner: number, deadline: number): Promise<number> {
  if (!posts.length || deadline - Date.now() < PICTURES_MIN_MS) return 0;
  try {
    const deps = postImageDeps(); // throws without a picture provider
    const actor = { telegramId: owner };
    await deps.jobs.assertRoom(actor, "image", brand.id); // daily picture caps of the owner and the brand
    // Learning the brand's style can take a minute (first picture only): then only with time to spare, else the
    // style already saved (or none) so the run stays inside the tick.
    const visual =
      deadline - Date.now() > STYLE_LEARN_MIN_MS
        ? await ensureVisual(brand, `tg:${owner}`).catch(() => undefined)
        : (await getBrandVisualInfo(brand.id).catch(() => null))?.visual;
    const info = { id: brand.id, name: brand.dna.name, oneLiner: brand.dna.oneLiner, products: brand.dna.products ?? [], visual };
    const started = await Promise.allSettled(
      posts.map(async (p) => {
        if (Date.now() > deadline) return false;
        const post = await getPostForImage(p.id);
        if (!post) return false;
        const image = await startPostImage({ post, brand: info, actor }, deps);
        return isPendingImage(image);
      }),
    );
    return started.filter((r) => r.status === "fulfilled" && r.value).length;
  } catch (err) {
    console.warn("[autopilot] week pictures not started:", err instanceof Error ? err.message : err);
    return 0;
  }
}

/** Writes next week's plan and posts for one brand and starts their pictures; the week message follows (week-ready.ts). */
async function generateWeek(b: WeeklyBrand, deadline: number): Promise<number> {
  const brand = await getBrand(b.id);
  if (!brand?.channel || brand.ownerTelegramId !== b.ownerTelegramId) return 0;
  const owner = b.ownerTelegramId;
  const channel = brand.channel;
  return runWithContext({ route: "cron/weekly", lang: b.locale, telegramId: owner }, async () => {
    const ctx = currentContext();
    try {
      // The app-wide daily Claude ceiling still holds: a plan and its posts are 2 units, as a bot onboarding.
      const budget = await takeUnits({ actor: spenderKey(owner, ""), anonymous: false, weight: 2, route: "cron/weekly" }).catch(() => "ok" as const);
      if (budget !== "ok") throw new Error(`claude budget: ${budget}`);
      const week = isoWeek(Date.now());
      // The try counts toward the brand's cap before its first Claude call (a run cut off with the tick still counts).
      return await withSpend({
        expectedUsd: weekClaudeUsd(),
        actualUsd: () => (ctx?.usage.length ? summarizeUsage("cron/weekly", ctx.usage).usd : 0),
        log: (usd, part) => safeLogEvent(owner, "autopilot_spend", { brand_id: b.id, usd, week, part }),
        run: () => writeWeek(b, { ...brand, channel }, deadline),
      });
    } finally {
      await flushUsage(ctx);
    }
  });
}

/** The plan, the posts and their pictures of one brand's week (generateWeek: within its budget and spend log). */
async function writeWeek(b: WeeklyBrand, brand: StoredBrand & { channel: string }, deadline: number): Promise<number> {
  const owner = b.ownerTelegramId;
  const lang = b.locale;
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
  const picked = pickWeekSlots(items, postsPerWeek());
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
  if (!done.length) return 0;
  // The owner approves the week with its pictures: the message waits for them (week-ready.ts, the next ticks).
  const drawing = await startWeekPictures(brand, done.map((d) => d.post), owner, deadline);
  if (drawing > 0) await queueWeekMessage(`week_msg:${b.id}:${isoWeek(Date.now())}`, b.id);
  else await sendWeek(b, "ready");
  return done.length;
}

/** The Monday report's buttons: the orders answer (sales), or the one-time goal question (type and goal unknown). */
async function reportKeyboard(b: WeeklyBrand, report: { askOrders: boolean; askGoal?: boolean }, weekOf: string, locale: Locale) {
  if (report.askOrders) {
    // With last week's plan the answer goes to brain_outcomes through the bot's own ord: buttons; else apo:.
    const plan = await weekPlan(b.id, weekOf).catch(() => null);
    const kb = new InlineKeyboard();
    for (const key of ["0", "1", "4", "10"]) kb.text(ORDER_BUCKETS[key].label, plan ? `ord:${plan.tag}:${key}` : `apo:${b.id}:${key}`);
    return kb;
  }
  if (report.askGoal) {
    return new InlineKeyboard().text(say(locale, "goal_sale"), `apg:${b.id}:sale`).text(say(locale, "goal_grow"), `apg:${b.id}:grow`);
  }
  return undefined;
}

function weeklyDeps(): WeeklyDeps {
  const api = getBot().api;
  const days = activeDays();
  return {
    now: Date.now,
    limits: {
      capUsd: brandMonthlyCapUsd(),
      // Plan and posts, plus the posts' pictures (started on the server with the week).
      weekUsd: weekClaudeUsd() + postsPerWeek() * imageUsd(),
      activeDays: days,
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
      const keyboard = await reportKeyboard(b, report, bounds.weekOf, b.locale);
      const r = await sendToOwner(api, b.ownerTelegramId, report.text, keyboard);
      const kind = report.askOrders ? "sales" : report.askGoal ? "unknown" : "growth";
      await safeLogEvent(b.ownerTelegramId, "weekly_report", { brand_id: b.id, kind, delivered: r });
      return r;
    },
    async spentUsd(brandId) {
      const s = await brandSpend30d(brandId);
      return s.llmUsd + s.images * imageUsd();
    },
    generate: generateWeek,
    async tell(b, what) {
      const r = await sendToOwner(api, b.ownerTelegramId, say(b.locale, what, { days }));
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
