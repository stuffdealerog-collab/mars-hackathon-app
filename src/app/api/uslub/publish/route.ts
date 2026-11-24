import { z } from "zod";
import { getEnv } from "@/lib/env";
import { currentContext } from "@/lib/uslub/context";
import { errorText } from "@/lib/uslub/errors";
import { handle, json, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { addBotAsAdminLink } from "@/lib/uslub/publish";
import { publishErrorText } from "@/lib/uslub/publish-errors";
import { publishOnce } from "@/lib/uslub/publish-once";
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
 * POST { postId, script, chat, initData?, lang? } -> { ok, url?, already? } | { ok: false, error, code, addAdminUrl? }
 * Requires Telegram auth (Mini App initData in `Authorization: tma <initData>` or the body).
 * Anonymous web callers get 401 "publish from Telegram" — the Studio sends them to the bot deep link
 * t.me/<bot>?start=publish_<postId> instead. `error` is in the request's language; `addAdminUrl` comes with
 * code "bot_not_admin" (the "add the bot to the channel" link).
 * Idempotent (publish-once.ts): a post already in the channel answers { ok: true, url, already: true } and is not
 * sent again; a repeat tap while the first send is still running waits for it, and after ~12 s answers 409
 * "publish_in_progress".
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
    // Already in the channel: the same answer whichever script was asked for (publishOnce checks it atomically too).
    if (post.status === "published") return json({ ok: true, ...(post.publishedUrl ? { url: post.publishedUrl } : {}), already: true });
    const tokens = findPlaceholders(post.variants[body.script] ?? "");
    if (tokens.length) {
      const facts = tokens.map((t) => `«${t}»`).join(", ");
      return json({ ok: false, error: errorText("placeholder_left", lang, { facts }), code: "placeholder_left", missing: [{ script: body.script, tokens }] }, 422);
    }
  }
  // A repeat tap waits for the send already running (maxDuration 30 s leaves room for its own send after that).
  const { status, inProgress, ...result } = await publishOnce({ postId: body.postId, script: body.script, chat: body.chat, userId }, { waitMs: 12_000 });
  if (result.ok) return json(result, status);
  if (inProgress) return json({ ok: false, error: errorText("publish_in_progress", lang), code: "publish_in_progress" }, 409);
  const { code, text } = publishErrorText(lang, status, result.error, result.addAdminUrl);
  // The add-bot link comes with every bot_not_admin (also when the bot is in the channel but cannot post).
  const addAdminUrl = result.addAdminUrl ?? (code === "bot_not_admin" ? addBotAsAdminLink() : undefined);
  return json({ ok: false, error: text, code, ...(addAdminUrl ? { addAdminUrl } : {}) }, status);
});
