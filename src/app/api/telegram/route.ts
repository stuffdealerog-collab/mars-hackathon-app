import { timingSafeEqual } from "node:crypto";
import { webhookCallback } from "grammy";
import { getBot } from "@/lib/bot";
import { getEnv } from "@/lib/env";

// Telegram webhook endpoint. Register it with `pnpm set-webhook`.
export const maxDuration = 120;

type Handler = (req: Request) => Promise<Response>;
let handler: Handler | null = null;

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(req: Request): Promise<Response> {
  const env = getEnv();
  const expected = env.TELEGRAM_WEBHOOK_SECRET;
  const received = req.headers.get("x-telegram-bot-api-secret-token") ?? "";

  // Fail closed: without a configured secret, nobody can call the webhook.
  if (!expected || !safeEqual(received, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!env.TELEGRAM_BOT_TOKEN) {
    return new Response("Bot is not configured", { status: 503 });
  }

  handler ??= webhookCallback(getBot(), "std/http", {
    secretToken: expected,
    onTimeout: "return",
    timeoutMilliseconds: 50_000,
  });

  try {
    return await handler(req);
  } catch (err) {
    // Answer 200 anyway so Telegram does not retry the same failing update forever.
    console.error("[telegram] update failed:", err instanceof Error ? err.message : err);
    return new Response("ok", { status: 200 });
  }
}
