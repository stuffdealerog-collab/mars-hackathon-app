/**
 * "Seen" for the first-run intro: the intro is shown once, and never to someone who already
 * worked in Mercat. Pure: the hosts read the stored values (Telegram CloudStorage in the Mini
 * App, localStorage on the web) and pass them in.
 *
 * Bump INTRO_VERSION when the intro changes enough to show it again to everyone.
 */
export const INTRO_VERSION = 1;
/** Telegram CloudStorage key: letters, digits, `_` and `-` only. */
export const INTRO_CLOUD_KEY = "intro";
/** localStorage key on the web (and the Mini App's local fallback for old Telegram clients). */
export const INTRO_LOCAL_KEY = "mercat.intro";

/** True when any stored value says this version (or a later one) was already seen. */
export function introSeen(...values: (string | null | undefined)[]): boolean {
  return values.some((v) => {
    const n = Number(v);
    return v != null && v !== "" && Number.isFinite(n) && n >= INTRO_VERSION;
  });
}

export type IntroDecision = {
  /** open the intro now */
  show: boolean;
  /** write "seen" now without showing it (someone who already knows the product) */
  mark: boolean;
};

/**
 * Whether to open the intro on this launch.
 * - `force` (?intro=1, a preview) always shows it.
 * - Seen before: never again (it stays reachable from Settings / Help).
 * - A returning owner (a saved brand, earlier work): never shown, and remembered as seen.
 * - Opened with intent (a channel link from the bot, a brand link from the desktop): not now;
 *   the run or the brand comes first, and the intro waits for an ordinary first open.
 */
export function decideIntro(o: { seen: boolean; returning: boolean; withIntent: boolean; force?: boolean }): IntroDecision {
  if (o.force) return { show: true, mark: false };
  if (o.seen) return { show: false, mark: false };
  if (o.returning) return { show: false, mark: true };
  if (o.withIntent) return { show: false, mark: false };
  return { show: true, mark: false };
}

/** The value written when the intro is closed (finished or skipped: both count as seen). */
export const seenValue = () => String(INTRO_VERSION);

type KV = Pick<Storage, "getItem" | "setItem">;

/** localStorage access that never throws (private mode, blocked storage, server render). */
export const localIntro = {
  seen(storage: KV | null = safeLocal()): boolean {
    try {
      return introSeen(storage?.getItem(INTRO_LOCAL_KEY));
    } catch {
      return false;
    }
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

/** `?intro=1` opens the intro whatever was stored (previews, the owner checking it). */
export const forcedByUrl = (search: string) => new URLSearchParams(search).get("intro") === "1";
