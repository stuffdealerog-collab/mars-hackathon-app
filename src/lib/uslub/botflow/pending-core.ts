/**
 * What the bot is waiting for from one Telegram user (pure). The bot asks something — the goal, a fact (how customers
 * order, prices, what the channel is about, the contact), up to 3 photos, a video for a post — and the answer comes
 * as that user's next update, on any server instance. One state per user, the newest wins; each kind expires on its
 * own clock, after which the user's next message is read as usual (a channel link, a business description).
 * Storage: pending.ts. Dispatch: flows.ts (read before classifyOnboardText in bot.ts).
 */
import type { OwnerQuestion, QuestionKey } from "../brain/questions";

export const PENDING_KINDS = ["fact", "photos", "video", "goal"] as const;
export type PendingKind = (typeof PENDING_KINDS)[number];

/** The engine's question keys plus the bot's own follow-up: the contact behind "phone" or "@manager". */
export type AskedKey = QuestionKey | "contact";

/** An engine question (runQuestions) or the bot's contact follow-up. */
export type FlowQuestion = Omit<OwnerQuestion, "key"> & { key: AskedKey };

/** The questions still to ask after a run, in order, and what the run already knows. */
export interface QuestionFlow {
  queue: FlowQuestion[];
  /** Keys the owner skipped in this flow (asked again only on a later run). */
  skipped: AskedKey[];
  /** The goal this run's plan was made for: a different answer offers to rebuild the week. */
  planGoal?: "sale" | "grow";
  /** The week can be rebuilt from the channel (a channel run, not a description). */
  rebuildable?: boolean;
  /** The brand was read from its channel's posts: the goal question may say what the posts suggest. */
  fromChannel?: boolean;
  /** Ask for up to 3 photos once the questions are done (the brand's first run). */
  askPhotos?: boolean;
  /** Questions answered in this flow (a thank-you only when there was something to thank for). */
  answered?: number;
}

interface Base {
  brandId: string;
  /** When the bot asked (ms epoch). */
  at: number;
}

export type Pending =
  | (Base & { kind: "goal"; flow: QuestionFlow })
  | (Base & { kind: "fact"; key: Exclude<AskedKey, "goal">; flow: QuestionFlow })
  | (Base & { kind: "photos"; fileIds: string[] })
  | (Base & { kind: "video"; postId: string });

const MIN = 60_000;
const HOUR = 60 * MIN;

/**
 * How long each kind waits for a typed answer. After two hours a message is more likely a new channel link or
 * description than the answer to a question (the goal's buttons carry the brand, so a late tap still counts). Photos
 * and a video cannot be confused with onboarding text, so they wait a day.
 */
export const PENDING_TTL_MS: Record<PendingKind, number> = {
  fact: 2 * HOUR,
  goal: 2 * HOUR,
  photos: 24 * HOUR,
  video: 24 * HOUR,
};

/** Store key: brain_facts_cache.kb_hash (prefixed like "planview:", never a sha256). */
export const pendingKey = (telegramId: number) => `botpending:${telegramId}`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FACT_KEYS = new Set(["order", "prices", "about", "contact"]);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isFlow = (v: unknown): v is QuestionFlow => isObj(v) && Array.isArray(v.queue) && Array.isArray(v.skipped);

/** The state if it is well formed and not expired at `now`, else null. */
export function livePending(raw: unknown, now = Date.now()): Pending | null {
  if (!isObj(raw)) return null;
  const { kind, brandId, at } = raw;
  if (typeof kind !== "string" || !(PENDING_KINDS as readonly string[]).includes(kind)) return null;
  if (typeof brandId !== "string" || !UUID_RE.test(brandId)) return null;
  if (typeof at !== "number" || !Number.isFinite(at) || at > now + MIN) return null;
  if (now - at > PENDING_TTL_MS[kind as PendingKind]) return null;
  switch (kind) {
    case "goal":
      return isFlow(raw.flow) ? (raw as unknown as Pending) : null;
    case "fact":
      return typeof raw.key === "string" && FACT_KEYS.has(raw.key) && isFlow(raw.flow) ? (raw as unknown as Pending) : null;
    case "photos":
      return Array.isArray(raw.fileIds) && raw.fileIds.every((f) => typeof f === "string") ? (raw as unknown as Pending) : null;
    case "video":
      return typeof raw.postId === "string" && UUID_RE.test(raw.postId) ? (raw as unknown as Pending) : null;
    default:
      return null;
  }
}
