#!/usr/bin/env node
// Registers the Telegram webhook, the Mini App menu button and /start descriptions.
// Usage: pnpm set-webhook   (reads TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, PUBLIC_URL from .env.local)
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const publicUrl = process.env.PUBLIC_URL?.trim().replace(/\/+$/, "");
const menuText = process.env.MENU_BUTTON_TEXT?.trim() || "Open";

const missing = [
  !token && "TELEGRAM_BOT_TOKEN",
  !secret && "TELEGRAM_WEBHOOK_SECRET",
  !publicUrl && "PUBLIC_URL",
].filter(Boolean);
if (missing.length) {
  console.error(`Missing in .env.local: ${missing.join(", ")}`);
  process.exit(1);
}
if (!publicUrl.startsWith("https://")) {
  console.error("PUBLIC_URL must be an https:// URL (Telegram requires HTTPS).");
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{16,256}$/.test(secret)) {
  console.error("TELEGRAM_WEBHOOK_SECRET must be 16-256 chars of A-Z a-z 0-9 _ -");
  process.exit(1);
}

const redact = (text) => String(text).split(token).join("<token>");

async function call(method, body = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
  if (!json.ok) throw new Error(`${method} failed: ${json.description ?? res.status}`);
  return json.result;
}

try {
  const me = await call("getMe");
  console.log(`Bot: @${me.username}`);
  const configured = process.env.BOT_USERNAME?.trim().replace(/^@/, "");
  if (configured && configured.toLowerCase() !== String(me.username).toLowerCase()) {
    console.warn(`Warning: BOT_USERNAME (${configured}) does not match the token's bot (@${me.username}).`);
  }

  await call("setWebhook", {
    url: `${publicUrl}/api/telegram`,
    secret_token: secret,
    allowed_updates: [
      "message",
      "edited_message",
      "callback_query",
      // Channel signals for the autopilot (subscriber joins/leaves, reactions, posts the owner sends by hand,
      // the bot becoming an admin). chat_member and message_reaction_count arrive only when named here and
      // only from chats where the bot is an admin.
      "my_chat_member",
      "chat_member",
      "message_reaction_count",
      "channel_post",
      "pre_checkout_query",
      "business_connection",
      "business_message",
      "edited_business_message",
      "deleted_business_messages",
    ],
    max_connections: 40,
  });
  console.log(`Webhook     -> ${publicUrl}/api/telegram`);

  await call("setChatMenuButton", {
    menu_button: { type: "web_app", text: menuText, web_app: { url: `${publicUrl}/tg` } },
  });
  console.log(`Menu button -> ${publicUrl}/tg ("${menuText}")`);

  await call("setMyCommands", { commands: [{ command: "start", description: "Start" }] });
  await call("setMyCommands", { commands: [{ command: "start", description: "Boshlash" }], language_code: "uz" });
  await call("setMyCommands", { commands: [{ command: "start", description: "Начать" }], language_code: "ru" });
  console.log("Commands    -> /start (en, uz, ru)");

  const info = await call("getWebhookInfo");
  console.log("Webhook info:", {
    url: info.url,
    pending_update_count: info.pending_update_count,
    last_error_message: info.last_error_message ?? null,
    allowed_updates: info.allowed_updates,
  });
} catch (err) {
  console.error(redact(err instanceof Error ? err.message : err));
  process.exit(1);
}
