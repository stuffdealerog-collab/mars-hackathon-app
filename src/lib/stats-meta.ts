import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Ambient analytics fields of an event (read by track.ts logEvent, shown on /stats). Kept apart from track.ts so the
 * request context, the bot and the stats queries can use them without the database module.
 *
 * Where an event happened: the web (landing and desktop Studio, handoff-linked included), the Telegram Mini App, or
 * the bot. Stored in events.props.surface together with:
 *   - env: "prod" only for Vercel production (VERCEL_ENV=production), else "dev" (next dev, previews, scripts and
 *     agents pointed at the production database), so /stats can leave test traffic out;
 *   - visitor: the cookie-less daily key of an anonymous web caller (anon-key.ts dailyVisitorKey), only on rows with no
 *     Telegram id (a verified Telegram user is identified by telegram_id instead).
 */
export type Surface = "web" | "miniapp" | "bot";
export type EventEnv = "prod" | "dev";

/** Ambient event fields for the work done on behalf of one request or one bot update. */
export type EventMeta = { surface?: Surface; visitor?: string | null; telegramId?: number | null };

const metaStore = new AsyncLocalStorage<EventMeta>();

/** Runs `fn` with ambient event fields: every event logged inside gets them unless it sets its own. */
export function runWithEventMeta<T>(meta: EventMeta, fn: () => T): T {
  return metaStore.run({ ...meta }, fn);
}

/** Updates the ambient event fields of the current run (no-op outside one). */
export function setEventMeta(patch: EventMeta): void {
  const meta = metaStore.getStore();
  if (meta) Object.assign(meta, patch);
}

export const currentEventMeta = (): EventMeta | undefined => metaStore.getStore();

/** grammY middleware: every event logged while the bot handles an update is tagged surface "bot". */
export const botEventMeta = (_ctx: unknown, next: () => Promise<void>): Promise<void> =>
  runWithEventMeta({ surface: "bot" }, next);

export function eventEnv(env: Record<string, string | undefined> = process.env): EventEnv {
  return env.VERCEL_ENV === "production" ? "prod" : "dev";
}

/**
 * Event types only one surface writes: they are tagged even when logged outside an ambient run, and /stats infers
 * the surface of rows written before surfaces existed from the same list (stats-queries.ts).
 */
export const EVENT_TYPE_SURFACE: Readonly<Record<string, Surface>> = {
  start: "bot",
  message: "bot",
  lead: "bot",
  business_connection: "bot",
  business_message: "bot",
  bot_onboarded: "bot",
  bot_onboard_timeout: "bot",
  publish_link_opened: "bot",
  brand_channel_linked: "bot",
  publish_pending: "bot",
  publish_pending_done: "bot",
  miniapp_open: "miniapp",
};

const SURFACES = new Set<string>(["web", "miniapp", "bot"]);

/**
 * The row an event becomes (pure): the Telegram id falls back to the verified user of the ambient run, and the props
 * get surface, visitor and env. Fields the caller set explicitly always win.
 */
export function withEventMeta(
  type: string,
  props: Record<string, unknown>,
  telegramId: number | null,
  meta: EventMeta | undefined,
  env: EventEnv = eventEnv(),
): { telegramId: number | null; props: Record<string, unknown> } {
  const tg = telegramId ?? meta?.telegramId ?? null;
  const out: Record<string, unknown> = { ...props };
  if (!SURFACES.has(String(out.surface))) {
    delete out.surface;
    const surface = meta?.surface ?? EVENT_TYPE_SURFACE[type];
    if (surface) out.surface = surface;
  }
  if (out.visitor === undefined && tg == null && meta?.visitor) out.visitor = meta.visitor;
  if (out.env !== "prod" && out.env !== "dev") out.env = env;
  return { telegramId: tg, props: out };
}
