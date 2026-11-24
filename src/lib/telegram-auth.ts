import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getEnv } from "./env";

/**
 * Validation of Telegram Mini App `initData`, exactly as described in
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 *   data_check_string = all received fields except `hash`, sorted by key,
 *                       formatted as `key=value`, joined with "\n"
 *   secret_key        = HMAC_SHA256(key = "WebAppData", msg = bot_token)
 *   hash              = hex(HMAC_SHA256(key = secret_key, msg = data_check_string))
 */

const TelegramUserSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string().default(""),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
  is_premium: z.boolean().optional(),
});

export type TelegramUser = z.infer<typeof TelegramUserSchema>;

export type InitDataResult =
  | {
      ok: true;
      user: TelegramUser;
      authDate: Date;
      startParam: string | null;
      chatType: string | null;
    }
  | { ok: false; reason: "invalid" | "bad_hash" | "expired" | "no_user" };

export const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

export function validateInitData(
  initData: string,
  botToken: string,
  options: { maxAgeSeconds?: number; nowSeconds?: number } = {},
): InitDataResult {
  const maxAge = options.maxAgeSeconds ?? INIT_DATA_MAX_AGE_SECONDS;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);

  if (!initData || initData.length > 8192) return { ok: false, reason: "invalid" };

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return { ok: false, reason: "invalid" };
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheckString).digest();
  const received = Buffer.from(hash, "hex");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return { ok: false, reason: "bad_hash" };
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isInteger(authDate) || authDate <= 0) return { ok: false, reason: "invalid" };
  if (now - authDate > maxAge) return { ok: false, reason: "expired" };
  if (authDate - now > 300) return { ok: false, reason: "invalid" }; // issued in the future

  const rawUser = params.get("user");
  if (!rawUser) return { ok: false, reason: "no_user" };
  let userJson: unknown;
  try {
    userJson = JSON.parse(rawUser);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  const user = TelegramUserSchema.safeParse(userJson);
  if (!user.success) return { ok: false, reason: "invalid" };

  return {
    ok: true,
    user: user.data,
    authDate: new Date(authDate * 1000),
    startParam: params.get("start_param"),
    chatType: params.get("chat_type"),
  };
}

/**
 * For your own API routes: the Mini App sends `Authorization: tma <initData>`.
 * Returns the verified Telegram user, or null if missing/invalid.
 *
 *   const user = authenticateRequest(req);
 *   if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
 */
export function authenticateRequest(req: Request): TelegramUser | null {
  const token = getEnv().TELEGRAM_BOT_TOKEN;
  const header = req.headers.get("authorization");
  if (!token || !header?.startsWith("tma ")) return null;
  const result = validateInitData(header.slice(4), token);
  return result.ok ? result.user : null;
}
