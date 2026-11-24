import { z } from "zod";
import { getEnv } from "@/lib/env";
import { currentContext } from "@/lib/uslub/context";
import { codeForStatus, type ErrorCode, errorText } from "@/lib/uslub/errors";
import { handle, json, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { publishPost } from "@/lib/uslub/publish";

export const maxDuration = 30;

const Body = z.object({
  postId: z.string().trim().min(1),
  script: z.enum(["uz_latn", "uz_cyrl", "ru", "en"]),
  chat: z.string().trim().min(2).max(200),
  initData: z.string().max(8192).optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
});

const codeFor = (status: number): ErrorCode => (status === 401 ? "auth_required" : status === 404 ? "post_not_found" : status === 502 ? "telegram_unavailable" : codeForStatus(status));

/**
 * POST { postId, script, chat, initData? } -> { ok, url?, error?, code?, addAdminUrl? }
 * Requires Telegram auth (Mini App initData in `Authorization: tma <initData>` or the body).
 * Anonymous web callers get 401 "publish from Telegram" — the Studio sends them to the bot deep link
 * t.me/<bot>?start=publish_<postId> instead.
 */
export const POST = handle(async (req) => {
  rateLimit(req, "publish", 10);
  const body = await readJson(req, Body);
  const lang = currentContext()?.lang ?? "uz";
  if (!getEnv().TELEGRAM_BOT_TOKEN) return json({ ok: false, error: errorText("bot_not_configured", lang), code: "bot_not_configured" }, 503);
  const userId = telegramUserId(req, body.initData);
  const { status, ...result } = await publishPost({ postId: body.postId, script: body.script, chat: body.chat, userId });
  // publishPost's messages are already owner-facing (uz/ru); the code lets the Studio pick its own words.
  return json(result.ok ? result : { ...result, code: codeFor(status) }, status);
});
