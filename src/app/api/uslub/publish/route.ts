import { z } from "zod";
import { getEnv } from "@/lib/env";
import { handle, json, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { publishPost } from "@/lib/uslub/publish";

export const maxDuration = 30;

const Body = z.object({
  postId: z.string().trim().min(1),
  script: z.enum(["uz_latn", "uz_cyrl", "ru", "en"]),
  chat: z.string().trim().min(2).max(200),
  initData: z.string().max(8192).optional(),
});

/**
 * POST { postId, script, chat, initData? } -> { ok, url?, error?, addAdminUrl? }
 * Requires Telegram auth (Mini App initData in `Authorization: tma <initData>` or the body).
 * Anonymous web callers get 401 "publish from Telegram".
 */
export const POST = handle(async (req) => {
  rateLimit(req, "publish", 10);
  const body = await readJson(req, Body);
  if (!getEnv().TELEGRAM_BOT_TOKEN) return json({ ok: false, error: "Bot is not configured" }, 503);
  const userId = telegramUserId(req, body.initData);
  const { status, ...result } = await publishPost({ postId: body.postId, script: body.script, chat: body.chat, userId });
  return json(result, status);
});
