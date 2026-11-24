import "server-only";
import { getEnv } from "@/lib/env";

/** The bot's @username for deep links (publish, open). Server-side: the env var is not public. */
export function botUsername(): string {
  try {
    return getEnv().BOT_USERNAME ?? "mercatai";
  } catch {
    return "mercatai";
  }
}
