/** Tashkent is UTC+5 all year (no daylight saving since 1992). */
export const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** A moment on the Tashkent wall clock. `weekday` 0 = Monday … 6 = Sunday, as in ChannelAudit.bestWeekdays. */
export interface TashkentClock {
  date: string; // YYYY-MM-DD
  weekday: number;
  hour: number;
  minute: number;
}

export function tashkentClock(at: Date): TashkentClock {
  const local = new Date(at.getTime() + TASHKENT_OFFSET_MS);
  return {
    date: local.toISOString().slice(0, 10),
    weekday: (local.getUTCDay() + 6) % 7,
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
  };
}
