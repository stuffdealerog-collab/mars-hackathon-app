import "server-only";
import { getEnv } from "@/lib/env";
import { spenderKey, takeUnits } from "./budget-core";
import { clientIp, HttpError } from "./http";

// The counter itself (limits, units, the events ledger) lives in budget-core.ts, shared with the bot.
export { budgetLimits, type BudgetLimits, resetBudgetMemory, spenderKey, type SpendResult, takeUnits } from "./budget-core";

/**
 * Call before an API route's first Claude call. Throws a localized 429 `budget_exhausted` (with `scope`: "app" |
 * "anonymous") when today's units are used up. `userId` = the verified Telegram user (null = anonymous web caller).
 */
export async function spendClaude(req: Request, userId: number | null, route: string, opts: { weight?: number } = {}): Promise<void> {
  const anonymous = userId == null;
  const r = await takeUnits({ actor: spenderKey(userId, clientIp(req)), anonymous, weight: opts.weight ?? 1, route });
  if (r === "ok") return;
  const bot = `@${(getEnv().BOT_USERNAME ?? "mercatai").replace(/^@/, "")}`;
  throw new HttpError(429, `claude budget: ${r}`, "budget_exhausted", { bot }, { scope: r });
}
