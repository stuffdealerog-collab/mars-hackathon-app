/**
 * Shared contract between the Studio UI (src/app/studio, src/components/**)
 * and the engine (src/lib/uslub/**, src/app/api/uslub/**).
 *
 * Product: Uslub AI (working name) — an AI marketing department for small
 * businesses in Uzbekistan. The owner delegates tasks to AI "employees";
 * the Studio shows their work as a node graph (ComfyUI-like) and nothing is
 * published without the owner's approval.
 *
 * Types only — safe to import from client and server code.
 */

/** Output scripts/languages. uz_cyrl is produced deterministically from uz_latn. */
export type Script = "uz_latn" | "uz_cyrl" | "ru" | "en";

/** AI employees of the department. */
export type AgentRole =
  | "brand" //      Brend xotirasi — knowledge base + brand DNA
  | "strategist" // Strateg — content plan / campaign from a task
  | "copywriter" // Kopirayter — posts in the brand's voice
  | "editor" //     Muharrir — anti "neuro-words" (AI cliché) filter
  | "translator" // Tarjimon — UZ Latin / UZ Cyrillic / RU / EN
  | "designer" //   Dizayner — covers and images
  | "video" //      Videograf — Reels/TikTok script + video
  | "publisher" //  SMM-menejer — Telegram now; Instagram/YouTube later
  | "radar" //      Mijoz radar — where the customers are
  | "analyst"; //   Analitik — audits real channel numbers, competitors, learns from results

export interface BrandDNA {
  name: string;
  oneLiner: string; // what the business does, in plain words
  audience: string;
  tone: string;
  address: "siz" | "sen" | "mixed" | "n/a";
  emojiDensity: "none" | "low" | "medium" | "high";
  avgPostLength: number; // characters
  ctaStyle: string;
  hashtags: string[];
  recurringFormats: string[];
  products: string[];
  doList: string[];
  dontList: string[];
  languages: Script[];
  /**
   * How the channel's own posts end, learned from those posts. New posts end the same way (owner correction 1,
   * 2026-11-25): never a rule like "contact in every post", never Mercat's link in place of the channel's contact.
   * Missing on brands analysed before 2026-11-25.
   */
  postEnding?: PostEnding;
}

/**
 * The usual ending of a channel's posts.
 * - "contact":  a contact line (phone, @manager, a bot or wa.me link): `contact` holds it exactly as the posts write it;
 * - "admin":    "write to the admin" / "в личку" without a concrete contact;
 * - "link":     a link (site, shop, form);
 * - "hashtags": hashtags only;
 * - "none":     the posts just end;
 * - "mixed":    no single habit (fewer than half the posts share one).
 */
export interface PostEnding {
  pattern: "contact" | "admin" | "link" | "hashtags" | "none" | "mixed";
  /** The contact as the channel writes it (e.g. "📞 +998 90 123 45 67", "@dilnoza_admin"); reuse it in that form. */
  contact?: string;
  /** Hashtags the channel's posts end with, as written (max 5). */
  hashtags?: string[];
  /** Up to 3 real endings copied from the channel's posts (last line or two), newest first. */
  examples: string[];
}

/**
 * What kind of channel this is (owner correction 2, 2026-11-25). Goals, findings, plan pillars, owner questions and
 * the Monday report follow it.
 * - "business":  a shop, cafe, service, clinic… selling to customers (orders are a goal);
 * - "blog":      a person's own channel;
 * - "expert":    a creator, teacher or specialist building an audience;
 * - "media":     news, a digest;
 * - "community": a group or club channel run for its members.
 * A blog/expert/media/community channel gets a growth plan and never price or "how to order" advice.
 */
export type ChannelType = "business" | "blog" | "expert" | "media" | "community";

export interface BrandProfile {
  id: string;
  channel?: string; // public Telegram @username
  knowledge: string; // business info the owner pasted (products, prices, address, story)
  samplePosts: string[];
  dna: BrandDNA;
  /**
   * "channel" = learned from a channel with history (t.me/s posts and numbers).
   * "fresh"   = the channel is empty or does not exist yet: the brand is built from the
   *             owner's description of the product/service/business (no stats, no samples).
   * Missing on brands created before 2026-11-25: treat as "channel".
   */
  mode?: BrandMode;
  /** How the brand's pictures look; missing until the style is learned. */
  visual?: VisualStyle;
  /**
   * What kind of channel this is (db: brands.channel_type), so goals, plans and reports follow it (owner correction 2).
   * Missing = not detected yet (brands made before detection shipped keep today's sales plan).
   */
  channelType?: ChannelType;
  /**
   * The main goal the owner confirmed (db: brands.goal): "sale" (more orders) or "grow" (more subscribers). The
   * confirm question is pre-filled from channelType. Missing = not asked yet.
   */
  goal?: Goal;
  createdAt: string; // ISO
}

export type BrandMode = "channel" | "fresh";

/**
 * The brand's visual style, learned from reference images (the channel's past post photos
 * and/or photos the owner attached). Used to make new post images in the same style.
 */
export interface VisualStyle {
  /** Reference images actually used (https URLs we can hand to an image model), newest first. */
  refs: { url: string; source: "channel" | "owner" }[];
  palette: string[]; // dominant colours, e.g. ["#f4efe6", "#3b2a20"]
  light: string; // e.g. "soft window daylight, warm"
  composition: string; // e.g. "close-up product on a wooden table, top-down"
  props: string[]; // recurring objects/backgrounds
  mood: string;
  avoid: string[]; // what is never in their pictures (e.g. "people's faces", "neon")
  /** One paragraph ready to append to an image prompt. */
  prompt: string;
  learnedAt: string; // ISO
  /** The same style in the owner's languages, for display (the English `prompt` stays for the image model). */
  ownerText?: Partial<Record<"uz" | "ru" | "en", { summary: string; light: string; composition: string; mood: string; avoid: string[] }>>;
}

/** The plan item a post was written from (so plan and posts stay connected). */
export interface PlanSlot {
  day: string; // ISO date
  time: string; // "19:00"
  goal: Goal;
  hook: string;
  cta: string;
  /** The plan item's format (PlanItem.format: "photo", "video", "text", "poll", …); missing on older posts. */
  format?: string;
}

/** A picture for a post, made in the brand's visual style. */
export interface PostImage {
  status: "queued" | "running" | "ready" | "failed";
  /**
   * https: the newest FINISHED picture. It stays while a new variant renders or after that
   * attempt fails (status describes the latest attempt). This is exactly what the Studio shows,
   * what the bot previews and what publishing sends.
   */
  url?: string;
  jobId?: string; // media job id while queued/running
  prompt?: string;
  refsUsed: number; // how many reference images the model saw
  error?: string; // owner-safe message when failed
}

/** A phrase that sounds machine-written ("neuro-word"). */
export interface NeuroHit {
  phrase: string;
  index: number;
  suggestion?: string;
}

export interface PostDraft {
  id: string;
  brandId: string;
  brief: string;
  variants: Record<Script, string>;
  neuroHits: Partial<Record<Script, NeuroHit[]>>; // clichés still present after editing
  humanScore: number; // 0-100, higher = sounds more human
  status: "draft" | "approved" | "published";
  publishedUrl?: string;
  /** The plan item this post was written from, when it came from the weekly plan. */
  slot?: PlanSlot;
  /** The post's picture in the brand's style; missing = no picture requested yet. */
  image?: PostImage;
  approvedAt?: string; // ISO, set when the owner approves (persisted, survives reload)
  /**
   * Set when the text still has a blank the writer could not fill (e.g. an unknown price or code).
   * Approve/publish refuse such a post with code "placeholder_left" until the owner fills it.
   */
  needsApproval?: boolean;
  placeholders?: { script: Script; tokens: string[] }[];
  note?: string; // owner-readable, in the request's language: which fact to add
  /** Set once the approved post is queued to go out on its own at its slot (autopilot); missing = not queued. */
  schedule?: PostSchedule;
  /**
   * A video post (db: posts.video): the Videographer's script and, once the owner sent it to the bot, their video.
   * Present on a plan slot with format "video" after its script was written, or on a video idea (no slot). A post
   * with a video goes out as that video with the text as its caption; a video post without one never goes out.
   */
  video?: PostVideo;
  createdAt: string;
}

/**
 * The owner's video for a post and the script it was shot from. Mercat keeps no copy of the file: Telegram's file_id
 * (from the owner's message to the bot) is sent to the channel as is.
 */
export interface PostVideo {
  /** The Videographer's script (written once on request, then reused: never paid twice). */
  plan?: VideoPlan;
  /** When the script was written (ISO). */
  plannedAt?: string;
  /** Telegram file_id of the owner's video; missing = no video yet. */
  fileId?: string;
  fileUniqueId?: string;
  /** "video": a video message (sendVideo); "document": a video sent as a file (sendDocument, the same file_id). */
  as?: "video" | "document";
  duration?: number; // seconds
  width?: number;
  height?: number;
  size?: number; // bytes
  mime?: string;
  /** Telegram file_id of the video's thumbnail (GET /api/uslub/video/thumb serves it to the owner). */
  thumbFileId?: string;
  receivedAt?: string; // ISO
}

/**
 * A post's place in the publish queue (db: publish_queue).
 * - "queued":  waits for dueAt;
 * - "sending": a tick is sending it now;
 * - "sent":    out in the channel (PostDraft.publishedUrl has the link);
 * - "blocked": the bot is not an admin with post rights in the channel; retried until dueAt + 24 h;
 * - "failed":  Telegram refused it after the retries;
 * - "expired": more than 24 h late (the ticker was down); the owner decides;
 * - "unknown": the send was cut off mid-way; never resent on its own, the owner checks the channel.
 */
export interface PostSchedule {
  dueAt: string; // ISO
  status: "queued" | "sending" | "sent" | "blocked" | "failed" | "expired" | "unknown";
  /** Owner-safe reason when blocked/failed/expired/unknown, in the request's language. */
  error?: string;
}

export interface RadarLead {
  kind:
    | "telegram_channel"
    | "telegram_group"
    | "instagram"
    | "youtube"
    | "event"
    | "marketplace"
    | "website"
    | "other";
  name: string;
  url?: string;
  why: string; // why your customers are there
  audienceHint?: string; // e.g. "~45k subscribers" — only if sourced
  action: string; // e.g. "buy an ad post", "partner", "DM the admin"
}

export interface VideoPlan {
  hook: string; // first 2 seconds
  scenes: { seconds: number; visual: string; voiceover: string; caption: string }[];
  musicMood: string;
  videoUrl?: string; // filled when a provider renders it
  /** The language the script is written in (the brand's post language); missing on plans made before 2026-11-25. */
  lang?: Script;
}

/* ------------------------------------------- marketing brain (analysis) */
/* Rule: every finding, proof point and KPI baseline must come from real data
 * (channel stats, the owner's knowledge base, cited web sources) — never invented. */

/**
 * What a plan item (and the post written from it) is for.
 * Sales channels (ChannelType "business"): "reach" new people, build "trust", make a "sale".
 * Growth channels (blog, expert, media, community; owner correction 2): "engage" the people already there (reactions,
 * replies, forwards, polls) and "grow" the channel (new subscribers: series, cross-promotion, shareable posts).
 */
export type Goal = SalesGoal | GrowthGoal;
export type SalesGoal = "reach" | "trust" | "sale";
export type GrowthGoal = "engage" | "grow";

export interface ChannelAudit {
  channel: string; // @username
  title?: string;
  subscribers?: number;
  postsAnalyzed: number;
  postsPerWeek: number;
  avgViews?: number;
  reachRate?: number; // avgViews / subscribers (0..1)
  bestHours: number[]; // local hours (UTC+5) with the highest median views
  bestWeekdays: number[]; // 0 = Monday
  formatMix: Record<string, number>; // text / photo / video / album -> share 0..1
  topPosts: { url: string; views?: number; why: string }[];
  findings: { kind: "strength" | "problem" | "opportunity"; text: string; evidence: string }[];
  benchmark?: {
    channel: string;
    subscribers?: number;
    avgViews?: number;
    reachRate?: number;
    postsPerWeek: number;
  }[];
}

export interface Strategy {
  positioning: string; // For <audience> who <need>, <brand> is <category> that <benefit>, unlike <alternative>
  audiences: { name: string; job: string; pains: string[]; triggers: string[]; whereTheyAre: string[] }[];
  offer: string;
  proofPoints: string[]; // only from the knowledge base or data
  pillars: { name: string; goal: Goal; share: number; examples: string[] }[];
  kpis: { metric: string; baseline?: number; target: number; how: string }[];
  risks: string[];
}

export interface PlanItem {
  day: string; // ISO date
  time: string; // "19:00"
  goal: Goal;
  pillar: string;
  format: string;
  hook: string;
  cta: string;
  brief: string; // ready to hand to the copywriter
  metric: string;
  needsApproval: boolean; // promos, prices, video, first posts
  /**
   * Owner-readable note on `time`, in the plan's language, as guidance and never a promise: where the time comes from
   * (e.g. "Kanalingizda eng ko‘p ko‘rilgan vaqt" / "Your channel's best hour so far"). The UI shows it as given.
   */
  timeLabel?: string;
}

export interface ContentPlan {
  weekOf: string; // ISO date of Monday
  items: PlanItem[];
  rationale: string;
}

/* ----------------------------------------------------------- node graph */

export type NodeKind = AgentRole | "input" | "approval";

export interface FlowNode {
  id: string;
  kind: NodeKind;
  label: string;
  config?: Record<string, unknown>;
}

export interface FlowEdge {
  from: string;
  to: string;
}

export interface Flow {
  id: string;
  title: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export type NodeStatus = "idle" | "running" | "done" | "error" | "needs_approval";

/* ------------------------------------------------------------------ API
 * All routes: POST JSON, respond JSON, never expose secrets.
 * Errors: { error: string } with a 4xx/5xx status.
 *
 * POST /api/uslub/brand    { channel?: string; knowledge?: string; samplePosts?: string[];
 *                            mode?: BrandMode }
 *                          -> { brand: BrandProfile }
 *                          mode "fresh": knowledge (the owner's description of the business,
 *                          at least a few sentences) is required, channel is optional (the empty
 *                          channel to publish to later); DNA is built from the description only.
 * GET  /api/uslub/brand?id= -> { brand: BrandProfile }
 * POST /api/uslub/posts    { brandId: string; brief: string; count?: number }   (count <= 5)
 *                          -> { posts: PostDraft[] }
 * POST /api/uslub/posts    { brandId: string; slots: (PlanSlot & { brief: string })[] }  (<= 7)
 *                          -> { posts: PostDraft[] }   one post per plan slot, slot kept on the post
 * GET  /api/uslub/posts?brandId= -> { posts: PostDraft[] }   newest first (drafts + approved)
 * POST /api/uslub/posts/approve { postId: string } -> { post: PostDraft }   persists approval
 * POST /api/uslub/visual   { brandId: string; ownerImages?: string[] }  (https or data: URLs)
 *                          -> { visual: VisualStyle }   learns the style from channel photos
 *                          (scraped) plus owner images; stored on the brand
 * POST /api/uslub/media/post-image { postId: string } -> { image: PostImage }
 *                          starts (or returns) the picture for a post in the brand's style
 * GET  /api/uslub/media/post-image?postId= -> { image: PostImage }   poll every ~4 s
 * POST /api/uslub/neuro    { text: string; script: Script }
 *                          -> { text: string; hits: NeuroHit[]; humanScore: number }
 * POST /api/uslub/radar    { brandId: string; goal?: string } -> { leads: RadarLead[] }
 * POST /api/uslub/video    { brandId: string; postId?: string; brief?: string; lang? }
 *                          -> { plan: VideoPlan; post: PostDraft; reused?: boolean }
 *                          postId: the script for that video post (a plan slot with format "video"), stored on
 *                          post.video.plan with a short caption as the post's text; a post that has a script gets it
 *                          back (reused: true), never written twice. No postId: a new video idea (optional brief),
 *                          saved as a draft post without a slot. Owner or the id holder of an unowned brand.
 * GET  /api/uslub/video/thumb?postId= -> image/jpeg   the thumbnail of the owner's video (same access as drafts)
 * Bot deep link t.me/<bot>?start=video_<postId>: the post's owner sends the video to the bot; it is stored on
 *                          post.video (Telegram file_id, no copy) and published with sendVideo, text as the caption.
 * POST /api/uslub/publish  { postId: string; script: Script; chat: string }  (chat = @channel)
 *                          -> { ok: boolean; url?: string; error?: string; already?: boolean }
 *                          idempotent: an already published post returns its link with already:true and is
 *                          never sent again; a concurrent second call waits briefly, then 409 publish_in_progress
 *                          sends the post's image too when image.status === "ready"
 *                          (sendPhoto; text over the 1024-char caption limit follows as a message)
 * Bot deep link t.me/<bot>?start=publish_<postId>: the bot shows the post (with its image) and a
 *                          "Kanalga joylash" button; an unowned web brand is claimed by the first
 *                          Telegram user who is an admin of that channel with post rights.
 * POST /api/uslub/plan     { brandId: string; task: string } -> { flow: Flow }
 *                          ("delegate a task": the strategist assembles a node graph)
 * POST /api/uslub/analyze  { channel: string; competitors?: string[] } -> { audit: ChannelAudit }
 * POST /api/uslub/strategy { brandId: string; audit?: ChannelAudit; goal?: string }
 *                          -> { strategy: Strategy; plan: ContentPlan }   (stored per brand for 30 days)
 * GET  /api/uslub/strategy?brandId= -> { plan, strategy, mode, ownerQuestions, planTag, launch?, lang, createdAt }
 *                          or { plan: null } — the brand's latest plan, so a reopen shows it without a new run
 * Errors may be 429 { code: "budget_exhausted", scope: "app" | "anonymous" } (daily Claude cap) and, on media
 * routes, 429 { code: "guest_limit" } (per-guest picture cap).
 */

export type ApiError = { error: string };
