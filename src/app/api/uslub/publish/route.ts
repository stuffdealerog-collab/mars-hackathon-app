import { z } from "zod";
import { getEnv } from "@/lib/env";
import { handle, json, rateLimit, readJson } from "@/lib/uslub/http";
import { publishPost } from "@/lib/uslub/publish";

export const maxDuration = 30;

const Body = z.object({
  postId: z.string().trim().min(1),
  script: z.enum(["uz_latn", "uz_cyrl", "ru", "en"]),
  chat: z.string().trim().min(2).max(200),
});

/** POST { postId, script, chat } -> { ok, url?, error?, addAdminUrl? } (the owner already approved in the UI). */
export const POST = handle(async (req) => {
  rateLimit(req, "publish", 10);
  const body = await readJson(req, Body);
  if (!getEnv().TELEGRAM_BOT_TOKEN) return json({ ok: false, error: "Bot is not configured" }, 503);
  const result = await publishPost(body.postId, body.script, body.chat);
  return json(result, result.ok ? 200 : 400);
});
