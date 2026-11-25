import { z } from "zod";
import { ensureInviteLink, INVITE_SOURCE_RE } from "@/lib/autopilot/invites";
import { getBot } from "@/lib/bot";
import { addBotAsAdminLink } from "@/lib/uslub/publish";
import { handle, HttpError, json, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { getBrand } from "@/lib/uslub/store";

export const maxDuration = 15;

const Body = z.object({
  brandId: z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  /** Where the link goes: "qr", "instagram", "ad_kanal_x" … (lowercase, up to 24 characters). */
  source: z.string().trim().toLowerCase().regex(INVITE_SOURCE_RE),
  initData: z.string().max(8192).optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
});

/**
 * POST { brandId, source, initData?, lang? } -> { link, created }
 * The brand channel's invite link for one source (made once, then reused), so the joins through it are counted.
 * Verified Telegram owner only. 409 { code: "bot_not_admin", addAdminUrl } when the bot is not an admin of the
 * channel with «Invite users».
 */
export const POST = handle(async (req) => {
  rateLimit(req, "autopilot_invite", 20);
  const body = await readJson(req, Body);
  const userId = telegramUserId(req, body.initData);
  if (userId == null) throw new HttpError(401, "invite links need a Telegram owner", "auth_required");
  const brand = await getBrand(body.brandId.toLowerCase());
  if (!brand) throw new HttpError(404, "Brand not found", "brand_not_found");
  if (brand.ownerTelegramId !== userId) throw new HttpError(403, "brand of another owner", "brand_forbidden");
  if (!brand.channel) throw new HttpError(400, "brand has no channel", "channel_invalid");
  const r = await ensureInviteLink(getBot().api, { id: brand.id, channel: brand.channel }, body.source);
  if (r.ok) return json({ link: r.link, created: r.created });
  if (r.reason === "bot_cannot_invite") throw new HttpError(409, "bot cannot make invite links", "bot_not_admin", {}, { addAdminUrl: addBotAsAdminLink() });
  throw new HttpError(502, "telegram refused the invite link", "telegram_unavailable");
});
