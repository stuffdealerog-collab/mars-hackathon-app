#!/usr/bin/env node
// Runs after `next build` on Vercel. On PRODUCTION builds only, points the bot's webhook at this
// deployment's PUBLIC_URL, so swapping TELEGRAM_BOT_TOKEN in Vercel (a new bot) needs nothing
// else than a redeploy. Never fails the build and never prints the token: a problem is a warning.
// The bot's name, descriptions, commands and menu button are synced at runtime by
// src/lib/uslub/bot-profile.ts on the first update after a deploy.

const env = process.env;
if (env.VERCEL_ENV !== "production") process.exit(0);

const token = env.TELEGRAM_BOT_TOKEN?.trim();
const secret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
const base =
  env.PUBLIC_URL?.trim().replace(/\/+$/, "") ||
  (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "");

const warn = (msg) => console.warn(`[webhook] ${msg}`);
if (!token || !secret || !base.startsWith("https://")) {
  warn("skipped: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET or an https PUBLIC_URL is missing");
  process.exit(0);
}

const redact = (text) => String(text).split(token).join("<token>");

async function call(method, body = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
  if (!json.ok) throw new Error(`${method}: ${json.description ?? res.status}`);
  return json.result;
}

try {
  const me = await call("getMe");
  const configured = env.BOT_USERNAME?.trim().replace(/^@/, "");
  console.log(`[webhook] bot @${me.username}`);
  if (configured && configured.toLowerCase() !== String(me.username).toLowerCase()) {
    warn(`BOT_USERNAME is "${configured}" but the token belongs to @${me.username} — update BOT_USERNAME in Vercel`);
  }
  const url = `${base}/api/telegram`;
  const info = await call("getWebhookInfo");
  if (info.url === url) {
    console.log(`[webhook] already -> ${url}`);
  } else {
    await call("setWebhook", {
      url,
      secret_token: secret,
      allowed_updates: [
        "message",
        "edited_message",
        "callback_query",
        "my_chat_member",
        "pre_checkout_query",
        "business_connection",
        "business_message",
        "edited_business_message",
        "deleted_business_messages",
      ],
      max_connections: 40,
    });
    console.log(`[webhook] set -> ${url}${info.url ? " (was another URL)" : ""}`);
  }
} catch (err) {
  warn(`not registered: ${redact(err instanceof Error ? err.message : err)}`);
}
