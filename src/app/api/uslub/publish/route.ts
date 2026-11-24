import { z } from "zod";
import { getEnv } from "@/lib/env";
import { currentContext } from "@/lib/uslub/context";
import { errorText } from "@/lib/uslub/errors";
import { handle, json, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { publishPost } from "@/lib/uslub/publish";
import { publishErrorText } from "@/lib/uslub/publish-errors";
import { findPlaceholders } from "@/lib/uslub/placeholders";
import { getBrand, getPost } from "@/lib/uslub/store";

export const maxDuration = 30;

const Body = z.object({
  postId: z.string().trim().min(1),
  script: z.enum(["uz_latn", "uz_cyrl", "ru", "en"]),
  chat: z.string().trim().min(2).max(200),
  initData: z.string().max(8192).optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
});

/**
 * POST { postId, script, chat, initData?, lang? } -> { ok, url? } | { ok: false, error, code, addAdminUrl? }
 * Requires Telegram auth (Mini App initData in `Authorization: tma <initData>` or the body).
 * Anonymous web callers get 401 "publish from Telegram" — the Studio sends them to the bot deep link
 * t.me/<bot>?start=publish_<postId> instead. `error` is in the request's language; `addAdminUrl` comes with
 * code "bot_not_admin" (the "add the bot to the channel" link).
 */
export const POST = handle(async (req) => {
  rateLimit(req, "publish", 10);
  const body = await readJson(req, Body);
  const lang = currentContext()?.lang ?? "uz";
  if (!getEnv().TELEGRAM_BOT_TOKEN) return json({ ok: false, error: errorText("bot_not_configured", lang), code: "bot_not_configured" }, 503);
  const userId = telegramUserId(req, body.initData);
  // A text with an unfilled slot ("Kod: [kod]") never goes out. Checked only for the brand's owner, the one
  // person publishPost would let through (nobody else learns anything about the post).
  const post = userId != null ? await getPost(body.postId) : null;
  const brand = post ? await getBrand(post.brandId) : null;
  if (post && brand?.ownerTelegramId === userId) {
    const tokens = findPlaceholders(post.variants[body.script] ?? "");
    if (tokens.length) {
      const facts = tokens.map((t) => `«${t}»`).join(", ");
      return json({ ok: false, error: errorText("placeholder_left", lang, { facts }), code: "placeholder_left", missing: [{ script: body.script, tokens }] }, 422);
    }
  }
  const { status, ...result } = await publishPost({ postId: body.postId, script: body.script, chat: body.chat, userId });
  if (result.ok) return json(result, status);
  const { code, text } = publishErrorText(lang, status, result.error, result.addAdminUrl);
  return json({ ok: false, error: text, code, ...(result.addAdminUrl ? { addAdminUrl: result.addAdminUrl } : {}) }, status);
});
