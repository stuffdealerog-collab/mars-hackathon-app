/**
 * "Seen" for the first-run intro: the intro is shown once. Pure: the hosts read the stored
 * values (Telegram CloudStorage in the Mini App, localStorage on the web) and pass them in.
 *
 * The stored value is the intro version that was seen. Bump INTRO_VERSION when the intro changes
 * enough to show it again; `decideIntro` says what an owner who saw an older version gets.
 */
import type { IntroOnly } from "./steps";

/** 2: the «add the bot to your channel» card joined the intro. */
export const INTRO_VERSION = 2;
/** Telegram CloudStorage key: letters, digits, `_` and `-` only. */
export const INTRO_CLOUD_KEY = "intro";
/** localStorage key on the web (and the Mini App's local fallback for old Telegram clients). */
export const INTRO_LOCAL_KEY = "mercat.intro";

/** The newest intro version any store remembers; 0 when none does. */
export function seenVersion(...values: (string | null | undefined)[]): number {
  let best = 0;
  for (const v of values) {
    if (v == null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n) && n > best) best = n;
  }
  return best;
}

/** True when any stored value says this version (or a later one) was already seen. */
export function introSeen(...values: (string | null | undefined)[]): boolean {
  return seenVersion(...values) >= INTRO_VERSION;
}

export type IntroDecision = {
  /** open the intro now */
  show: boolean;
  /** only the add-the-bot card (someone who already knows the product) */
  only?: IntroOnly;
};

/**
 * Whether to open the intro on this launch, and how much of it.
 * - `force` (?intro=1, ?intro=admin: a preview) always shows it.
 * - This version seen: never again (it stays reachable from Settings / Help).
 * - Opened with intent (a channel link from the bot, a brand link from the desktop): not now;
 *   the run or the brand comes first, and the intro waits for an ordinary open.
 * - Someone who knows the product (saw an older intro, or has saved work): only the new card,
 *   the bot-admin step, once. The tour itself they have seen or do not need.
 * - Everyone else: the whole intro.
 */
export function decideIntro(o: { seen: number; returning: boolean; withIntent: boolean; force?: "all" | IntroOnly | null }): IntroDecision {
  if (o.force) return o.force === "admin" ? { show: true, only: "admin" } : { show: true };
  if (o.seen >= INTRO_VERSION) return { show: false };
  if (o.withIntent) return { show: false };
  if (o.seen > 0 || o.returning) return { show: true, only: "admin" };
  return { show: true };
}

/** The value written when the intro is closed (finished, skipped or «later»: all count as seen). */
export const seenValue = () => String(INTRO_VERSION);

type KV = Pick<Storage, "getItem" | "setItem">;

/** localStorage access that never throws (private mode, blocked storage, server render). */
export const localIntro = {
  /** the intro version seen on this device (0: none) */
  version(storage: KV | null = safeLocal()): number {
    try {
      return seenVersion(storage?.getItem(INTRO_LOCAL_KEY));
    } catch {
      return 0;
    }
  },
  seen(storage: KV | null = safeLocal()): boolean {
    return localIntro.version(storage) >= INTRO_VERSION;
  },
  mark(storage: KV | null = safeLocal()) {
    try {
      storage?.setItem(INTRO_LOCAL_KEY, seenValue());
    } catch {
      /* private mode: the intro may show once more, never blocks */
    }
  },
};

function safeLocal(): KV | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** `?intro=1` opens the whole intro whatever was stored, `?intro=admin` the add-the-bot card. */
export function forcedIntro(search: string): "all" | IntroOnly | null {
  const v = new URLSearchParams(search).get("intro");
  if (v === "1") return "all";
  if (v === "admin") return "admin";
  return null;
}
export const forcedByUrl = (search: string) => forcedIntro(search) != null;
