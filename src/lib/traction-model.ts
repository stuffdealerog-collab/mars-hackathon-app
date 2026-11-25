/**
 * The public traction counter's shape (pure: shared by the server reader, the route and the tests). Two numbers and
 * nothing else; whatever else a row carries is dropped here.
 */
export type Traction = {
  /** People who have tried Mercat: Telegram users plus anonymous web visitors who used the Studio (see traction.ts). */
  people: number;
  /** Distinct channels Mercat has analysed. */
  channels: number;
};

const count = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
};

/** The query's one row as two counts, or null when it is missing or malformed. */
export function readTractionRow(row: unknown): Traction | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const telegram = count(r.telegram_people);
  const web = count(r.web_people);
  const channels = count(r.channels);
  if (telegram === null || web === null || channels === null) return null;
  return { people: telegram + web, channels };
}

/** The route's body: `{ ok: true, people, channels }`, or `{ ok: false }` when there is nothing honest to show. */
export type TractionBody = ({ ok: true } & Traction) | { ok: false };

export const tractionBody = (t: Traction | null): TractionBody => (t ? { ok: true, people: t.people, channels: t.channels } : { ok: false });

/** Reads the route's body on the page (anything unexpected hides the counter). */
export function parseTractionBody(body: unknown): Traction | null {
  if (!body || typeof body !== "object" || (body as { ok?: unknown }).ok !== true) return null;
  const b = body as Record<string, unknown>;
  const people = count(b.people);
  const channels = count(b.channels);
  return people === null || channels === null ? null : { people, channels };
}
