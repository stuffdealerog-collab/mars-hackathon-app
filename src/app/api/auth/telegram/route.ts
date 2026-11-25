import { z } from "zod";
import { getEnv } from "@/lib/env";
import { pickLocale } from "@/lib/i18n";
import { validateInitData } from "@/lib/telegram-auth";
import { eventStartPayload } from "@/lib/source-category";
import { parseSource, track } from "@/lib/track";

const BodySchema = z.object({ initData: z.string().min(1).max(8192) });

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

// Called by the Mini App (/tg) with Telegram.WebApp.initData.
export async function POST(req: Request): Promise<Response> {
  const botToken = getEnv().TELEGRAM_BOT_TOKEN;
  if (!botToken) return json({ ok: false, error: "bot_not_configured" }, 503);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return json({ ok: false, error: "bad_request" }, 400);

  const result = validateInitData(parsed.data.initData, botToken);
  if (!result.ok) return json({ ok: false, error: result.reason }, 401);

  const { user, startParam } = result;
  await track(
    user,
    "miniapp_open",
    { start_param: eventStartPayload(startParam), chat_type: result.chatType },
    { source: parseSource(startParam) },
  );

  return json({
    ok: true,
    user: { first_name: user.first_name },
    locale: pickLocale(user.language_code),
  });
}
