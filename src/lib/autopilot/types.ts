/**
 * The autopilot's shared shapes (pure, client-safe: the Studio and the Mini App import them too). Kept here rather
 * than in src/lib/uslub/contract.ts, which only the lead edits.
 *
 * Routes (verified Telegram owner = Mini App initData or the Studio's handoff key):
 * POST /api/uslub/posts/approve-week { brandId; postIds?: string[]; initData?; lang? }
 *      -> { queued: { postId, dueAt }[]; skipped: { postId, reason: WeekSkipReason, tokens?, dates? }[];
 *           admin: BotAdminStatus; addAdminUrl?: string }
 *      approves the latest batch (or postIds) and queues each post for its slot. Verified owner only; anonymous:
 *      401 { code: "auth_required", continueUrl: "https://t.me/<bot>?start=week_<brandId>" }; an unowned brand:
 *      403 { code: "brand_unowned", continueUrl } (the bot checks channel rights, then approves).
 * GET  /api/uslub/autopilot?brandId= -> { autopilot: AutopilotState & { trialDaysLeft? }, admin: BotAdminStatus,
 *      schedule: Record<postId, PostSchedule> }   owner (or the id holder of an unowned brand)
 * POST /api/uslub/autopilot { brandId; on: boolean; initData?; lang? } -> same as GET   verified owner only
 *      (anonymous: 401 with continueUrl as above)
 */

/**
 * A brand's autopilot (db: brands.autopilot): Mercat writes next week's posts every Monday and sends the owner the
 * week's report. Approved posts go out at their slot whether it is on or off (the owner said yes to each one).
 * The 7-day trial starts the first time the owner turns it on (`since`); turning it off and on again keeps the same
 * trial dates.
 */
export interface AutopilotState {
  on: boolean;
  since?: string; // ISO, first time it was turned on
  trialEndsAt?: string; // ISO, since + 7 days
  /** "blocked": the owner blocked the bot, so nothing is prepared until they turn it on again. */
  paused?: "blocked";
}

/**
 * Is the bot an admin of the brand's channel with the rights it needs (from Telegram's my_chat_member updates and
 * the checks the autopilot makes)? "unknown" until Telegram has told us.
 */
export interface BotAdminStatus {
  status: "admin" | "no_post_right" | "not_admin" | "unknown";
  canPost: boolean;
  canInvite: boolean;
  checkedAt?: string; // ISO
}

/** Why "approve the week" left a post out (selectWeekBatch in src/lib/autopilot/week.ts). */
export type WeekSkipReason =
  | "published" //         already in the channel
  | "no_channel" //        the brand has no channel to post to
  | "blank" //             a blank is still in the text ([narx], XXX…): `tokens` names them
  | "past_date" //         the text names a date that will have passed: `dates`
  | "no_slot" //           not from the plan, so it has no time to go out
  | "slot_passed" //       its slot is over for today
  | "picture_rendering" // its picture is still being made
  | "video_missing"; //    a video slot without the owner's video
