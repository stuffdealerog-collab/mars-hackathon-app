/**
 * The public traction counter's shape and rules (pure: shared by the server reader, the route and the tests). Two
 * numbers and nothing else; whatever else a row carries is dropped here.
 */
export type Traction = {
  /**
   * People who have tried Mercat, as a floor: Telegram users (bot or Mini App) without the team and without the owners'
   * customers. Anonymous web visitors are left out (their key changes every day, so it cannot be counted as people).
   * null when the team cannot be left out (see peopleCountable): the page then shows channels only.
   */
  people: number | null;
  /** Distinct channels Mercat has analysed, whoever ran them. */
  channels: number;
};

const count = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
};

/**
 * May the people count go public? Only when the team can be taken out of it: STATS_TEAM_TG_IDS is set, or this is not
 * a production build (`next dev`, tests), where the number is never public.
 */
export function peopleCountable(teamIds: readonly number[], nodeEnv: string | undefined): boolean {
  return teamIds.length > 0 || nodeEnv !== "production";
}

/** The query's one row as two counts, or null when it is missing or malformed. `people: false` drops the people count. */
export function readTractionRow(row: unknown, { people = true }: { people?: boolean } = {}): Traction | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const telegram = count(r.telegram_people);
  const channels = count(r.channels);
  if (telegram === null || channels === null) return null;
  return { people: people ? telegram : null, channels };
}

/** The route's body: `{ ok: true, people, channels }` (people may be null), or `{ ok: false }` when there is nothing honest to show. */
export type TractionBody = ({ ok: true } & Traction) | { ok: false };

export const tractionBody = (t: Traction | null): TractionBody => (t ? { ok: true, people: t.people, channels: t.channels } : { ok: false });
