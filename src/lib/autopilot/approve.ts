import "server-only";
import { GrammyError, type Api } from "grammy";
import { getEnv } from "../env";
import { safeLogEvent } from "../track";
import { pickScript, shownHash } from "../uslub/botpublish-core";
import type { PostDraft } from "../uslub/contract";
import type { BotAdminStatus } from "./types";
import { addBotAsAdminLink } from "../uslub/publish";
import { approvePost, getPost, listPosts, type StoredBrand } from "../uslub/store";
import { enqueuePost, saveBotAdmin, setPostSchedule, touchUser } from "./repo";
import { botAdminFrom } from "./state";
import { selectWeekBatch, type WeekBatch, type WeekSkip } from "./week";
import { weekHash } from "./week-message";

/**
 * «Approve the week» on the server (POST /api/uslub/posts/approve-week and the bot's [Approve all]). The caller has
 * already checked that `ownerTelegramId` is the verified owner of `brand`.
 *
 * The posts selectWeekBatch lets through are approved and queued for their slot with the hash of the text and
 * picture approved (publish-due sends exactly that, or nothing). The bot's rights in the channel are checked once,
 * here, so the owner hears about a missing admin right now and not at the slot.
 */

/** The Telegram continuation of «approve the week»: the bot checks the channel rights, then shows the week. */
export function weekContinueUrl(brandId: string): string {
  const bot = (getEnv().BOT_USERNAME ?? "mercatai").replace(/^@/, "");
  return `https://t.me/${bot}?start=week_${brandId.toLowerCase()}`;
}

export interface ApproveWeekResult {
  queued: { postId: string; dueAt: string }[];
  skipped: WeekSkip[];
  admin: BotAdminStatus;
  addAdminUrl?: string;
}

/** The bot's rights in the channel, asked from Telegram (stored on the brands of that channel). */
export async function checkBotAdmin(api: Pick<Api, "getMe" | "getChatMember">, channel: string, now = Date.now()): Promise<BotAdminStatus> {
  try {
    const me = await api.getMe();
    const m = await api.getChatMember(`@${channel.replace(/^@/, "")}`, me.id);
    const status = botAdminFrom(m as { status: string; can_post_messages?: boolean; can_invite_users?: boolean }, now);
    await saveBotAdmin(channel, status).catch(() => 0);
    return status;
  } catch (err) {
    if (err instanceof GrammyError) {
      // Not in the channel, or the channel is gone: Telegram answers 400/403.
      const status = botAdminFrom(null, now);
      await saveBotAdmin(channel, status).catch(() => 0);
      return status;
    }
    return { status: "unknown", canPost: false, canInvite: false };
  }
}

/** `changed`: the batch is not the one the owner was shown (`hash`), and nothing was approved. */
export type ApproveWeekOutcome = (ApproveWeekResult & { changed?: false; batch: WeekBatch }) | { changed: true; batch: WeekBatch };

export async function approveWeek(args: {
  brand: StoredBrand;
  ownerTelegramId: number;
  postIds?: string[];
  api: Pick<Api, "getMe" | "getChatMember">;
  now?: number;
  /** Already-loaded posts (the bot's view); read from the store otherwise. */
  posts?: PostDraft[];
  /**
   * The weekHash of the batch the owner was shown (the bot's [Approve all], the Studio, the Mini App: week-hash.ts).
   * When the batch is another one now (a new batch, a finished picture, an edit, a passed slot), nothing is approved.
   */
  hash?: string;
}): Promise<ApproveWeekOutcome> {
  const now = args.now ?? Date.now();
  const { brand } = args;
  // Approving the week (web Studio, Mini App or the bot) counts as the owner being active (the 14-day gate).
  await touchUser(args.ownerTelegramId);
  const posts = args.posts ?? (await listPosts(brand.id, 50));
  const batch = selectWeekBatch({ posts, channel: brand.channel, languages: brand.dna?.languages, postIds: args.postIds, now });
  // A button is shown only for a week with posts, so a hash with nothing to approve now is a changed week too.
  if (args.hash !== undefined && (!batch.ready.length || weekHash(batch, posts) !== args.hash)) return { changed: true, batch };
  const byId = new Map(posts.map((p) => [p.id, p]));
  const queued: ApproveWeekResult["queued"] = [];
  for (const r of batch.ready) {
    const approved = await approvePost(r.postId, args.ownerTelegramId);
    const post = approved ?? (await getPost(r.postId));
    if (!post || post.status === "published") continue;
    // Queued with the hash of the version checked above (and shown), not a re-read: an edit that lands during the
    // approval stops the send at the slot instead of going out unseen.
    const seen = byId.get(r.postId) ?? post;
    const script = pickScript(seen.variants, r.script, brand.dna?.languages);
    const q = await enqueuePost({
      postId: post.id,
      brandId: brand.id,
      ownerTelegramId: args.ownerTelegramId,
      chat: brand.channel as string,
      script,
      dueAt: Date.parse(r.dueAt),
      textHash: shownHash(seen, script),
    });
    const dueAt = new Date(q.dueAt).toISOString();
    await setPostSchedule(post.id, { dueAt, status: q.status }).catch(() => undefined);
    queued.push({ postId: post.id, dueAt });
  }
  const admin = brand.channel ? await checkBotAdmin(args.api, brand.channel, now) : { status: "unknown" as const, canPost: false, canInvite: false };
  await safeLogEvent(args.ownerTelegramId, "week_approved", { brand_id: brand.id, queued: queued.length, skipped: batch.skipped.length, bot_admin: admin.status });
  return {
    queued,
    skipped: batch.skipped,
    admin,
    ...(brand.channel && !admin.canPost ? { addAdminUrl: addBotAsAdminLink() } : {}),
    batch,
  };
}
