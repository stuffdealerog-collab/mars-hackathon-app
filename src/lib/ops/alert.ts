/**
 * Team alerts: one Telegram message to OPS_CHAT_ID when something breaks that only a person can fix
 * (the picture provider's balance ran out, the Anthropic account has no credit left).
 *
 * - At most one message per kind per hour, across every server instance (an `events` row of type
 *   'ops_alert' is claimed under an advisory lock), plus a per-instance memo so a burst of failures
 *   on one instance costs one check.
 * - OPS_CHAT_ID unset (or malformed): nothing is sent; one console line per kind per hour.
 * - Never throws, never blocks long (Telegram call limited to 5 s), never carries key material.
 *
 * OPS_CHAT_ID: a numeric chat id ("-100…" for a group with the bot in it, or a person's id after they
 * pressed /start in the bot) or a public channel "@name" where the bot is an admin.
 * The module has no "@/" imports at load time so llm.ts (and its tests) can import it as is.
 */

export type OpsAlertKind = "image_balance" | "anthropic_credit";
export type OpsAlertResult = "sent" | "no_chat" | "rate_limited" | "failed";

export const OPS_ALERT_WINDOW_MS = 60 * 60_000;

export interface OpsAlertDeps {
  chatId: () => string | undefined;
  send: (chatId: string, text: string) => Promise<void>;
  /**
   * Claims this kind's slot for the window, shared by all instances: true = nobody sent it since
   * `sinceIso` and this caller now holds it. Missing = per-instance limit only.
   */
  claim?: (kind: OpsAlertKind, sinceIso: string) => Promise<boolean>;
  now?: () => number;
  windowMs?: number;
}

export function createOpsAlerter(deps: OpsAlertDeps) {
  const last = new Map<OpsAlertKind, number>();
  return async function notify(kind: OpsAlertKind, text: string): Promise<OpsAlertResult> {
    try {
      const now = (deps.now ?? Date.now)();
      const windowMs = deps.windowMs ?? OPS_ALERT_WINDOW_MS;
      const prev = last.get(kind);
      if (prev !== undefined && now - prev < windowMs) return "rate_limited";
      last.set(kind, now); // before any await: parallel failures on this instance send once
      const chatId = deps.chatId();
      if (!chatId) {
        console.warn(`[ops] ${kind} (OPS_CHAT_ID is not set, nothing sent): ${text}`);
        return "no_chat";
      }
      if (deps.claim) {
        // The shared record is down: still send (this instance's memo keeps it to once an hour).
        const mine = await deps.claim(kind, new Date(now - windowMs).toISOString()).catch(() => true);
        if (!mine) return "rate_limited";
      }
      await deps.send(chatId, text);
      return "sent";
    } catch (err) {
      console.error(`[ops] ${kind} alert failed:`, err instanceof Error ? err.message : err);
      return "failed";
    }
  };
}

/* ------------------------------------------------------------------ texts */

/** Team-facing (the team reads Russian); `detail` is an already redacted provider message. */
export function imageBalanceText(provider: string, detail: string): string {
  const name = provider === "fal" ? "fal.ai" : provider === "higgsfield" ? "Higgsfield" : provider;
  const where = provider === "fal" ? "https://fal.ai/dashboard/billing" : provider === "higgsfield" ? "https://cloud.higgsfield.ai" : "";
  return [
    `Mercat: картинки к постам не создаются — у ${name} закончился баланс.`,
    `Ответ провайдера: ${detail.slice(0, 200)}`,
    where ? `Пополнить: ${where}` : "",
    "Владельцы видят «картинка не получилась». Следующее такое сообщение — не раньше чем через час.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function anthropicCreditText(status: number, kind: string): string {
  return [
    `Mercat: Anthropic API отказывает по оплате (${status}${kind ? `, ${kind}` : ""}).`,
    "Разбор каналов, планы и посты сейчас не создаются.",
    "Проверить баланс и лимит расходов: https://console.anthropic.com/settings/billing",
    "Следующее такое сообщение — не раньше чем через час.",
  ].join("\n");
}

/* --------------------------------------------------------- Anthropic watch */

/**
 * The Anthropic answer means the account cannot spend: 402 billing_error, a 429 for the monthly
 * spend cap, or the older 400 "Your credit balance is too low". Returns a short label, or null.
 */
export function anthropicBillingProblem(status: number, body: string): string | null {
  if (status === 402) return "billing_error";
  if (status !== 400 && status !== 403 && status !== 429) return null;
  let type: unknown;
  let message: unknown;
  let code: unknown;
  try {
    const j = JSON.parse(body) as { error?: { type?: unknown; message?: unknown; details?: { error_code?: unknown } } };
    type = j?.error?.type;
    message = j?.error?.message;
    code = j?.error?.details?.error_code;
  } catch {
    message = body;
  }
  if (type === "billing_error") return "billing_error";
  if (status === 429) return code === "enforced_spend_limit_reached" ? "spend_limit" : null;
  if (typeof message === "string" && /credit balance|purchase credits|plans\s*&\s*billing|billing/i.test(message)) return "credit_balance";
  return null;
}

/**
 * Wraps the fetch the Anthropic client uses: every answer passes through unchanged; a billing refusal
 * also alerts the team (read from a clone, so the SDK still reads the original body).
 */
export function watchAnthropicBilling(base: typeof fetch, alert: (status: number, label: string) => Promise<unknown> = alertAnthropicCredit): typeof fetch {
  const watched = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const res = await base(input, init);
    if (res.status === 402 || res.status === 400 || res.status === 403 || res.status === 429) {
      try {
        const label = anthropicBillingProblem(res.status, await res.clone().text());
        if (label) await alert(res.status, label);
      } catch {
        // watching must never break the call
      }
    }
    return res;
  };
  return watched as typeof fetch;
}

/* ------------------------------------------------------------ server side */

const CHAT_RE = /^(-?\d{4,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/;
const TOKEN_RE = /^\d+:[A-Za-z0-9_-]{30,}$/;

/** OPS_CHAT_ID, when it looks like a chat; a malformed value counts as unset (its value is never logged). */
export function opsChatId(env: Record<string, string | undefined> = process.env): string | undefined {
  const raw = env.OPS_CHAT_ID?.trim();
  if (!raw) return undefined;
  if (CHAT_RE.test(raw)) return raw;
  console.warn("[ops] OPS_CHAT_ID is malformed and was ignored");
  return undefined;
}

async function telegramSend(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token || !TOKEN_RE.test(token)) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  let res: Response;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
  } catch {
    throw new Error("Telegram is unreachable"); // never the URL: it holds the token
  }
  if (!res.ok) throw new Error(`Telegram sendMessage ${res.status}`);
}

/** Arbitrary constant key for pg_advisory_xact_lock: serialises ops alert claims. */
const OPS_LOCK = 7_310_524_002;

async function claimInDb(kind: OpsAlertKind, sinceIso: string): Promise<boolean> {
  const { getSql, isDbConfigured } = await import("../db");
  if (!isDbConfigured()) return true;
  const sql = getSql();
  const props = JSON.stringify({ kind });
  const results = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(${OPS_LOCK})`,
    sql`INSERT INTO events (telegram_id, type, props)
        SELECT NULL, 'ops_alert', ${props}::jsonb
        WHERE NOT EXISTS (
          SELECT 1 FROM events WHERE type = 'ops_alert' AND props->>'kind' = ${kind} AND created_at >= ${sinceIso}
        )
        RETURNING 1 AS ok`,
  ]);
  return (results[1] as unknown[]).length > 0;
}

let shared: ReturnType<typeof createOpsAlerter> | null = null;

/** Sends a team alert (see the module comment). Never throws. */
export function notifyOps(kind: OpsAlertKind, text: string): Promise<OpsAlertResult> {
  shared ??= createOpsAlerter({ chatId: () => opsChatId(), send: telegramSend, claim: claimInDb });
  return shared(kind, text);
}

function alertAnthropicCredit(status: number, label: string): Promise<OpsAlertResult> {
  return notifyOps("anthropic_credit", anthropicCreditText(status, label));
}
