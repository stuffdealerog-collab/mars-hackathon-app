/**
 * The Monday report (pure): last week in a few plain lines, shaped by what the channel is for (owner correction 2).
 *
 * - Sales (a business channel, or the owner's goal is orders): posts published out of planned, views at 72 h against
 *   the channel's typical post, people who came to the bot through the posts' links, then "how many orders last
 *   week?" with buttons (the answer is stored as an outcome).
 * - Growth (blog, expert, media, community, or the goal is subscribers/engagement): posts published, the subscriber
 *   change, views and reactions against the typical post, the best post of the week. Never an orders question.
 * - Unknown (no channel type and no goal that says orders or subscribers yet, e.g. a brand from before the type was
 *   detected): the growth lines, no orders question, and the one-time goal question instead ("More orders / More
 *   subscribers"); the answer is stored as the brand's goal (brands.goal), so from the next week the report follows it.
 *
 * A line without data is left out, never shown as 0. Forwards are not in the report: neither the Bot API nor the
 * public channel page gives them.
 */
import { formatDay, type Locale } from "../i18n";
import type { ChannelType, Goal } from "../uslub/contract";
import { fmtDelta, fmtNum } from "./copy";

export type ReportKind = "sales" | "growth" | "unknown";

/**
 * The owner's goal decides when it says orders or subscribers; otherwise the channel type. With neither, "unknown":
 * a blog must never be asked about orders, so the report asks for the goal instead.
 */
export function reportKind(channelType: ChannelType | null | undefined, goal: Goal | null | undefined): ReportKind {
  if (goal === "grow" || goal === "engage") return "growth";
  if (goal === "sale") return "sales";
  if (channelType) return channelType === "business" ? "sales" : "growth";
  return "unknown";
}

export interface WeeklyReportInput {
  locale: Locale;
  kind: ReportKind;
  /** Monday and Sunday of the week (YYYY-MM-DD). */
  from: string;
  to: string;
  /** Plan slots written for the week, and Mercat posts that went out in it. */
  planned: number;
  published: number;
  /** Views 72 h after publishing, averaged over the posts that have reached 72 h. */
  views72?: { avg: number; n: number };
  /** The channel's typical post (median views of posts older than 72 h). */
  medianViews?: number;
  /** People who opened the bot through the week's tracked links; undefined = the posts had no tracked link. */
  starts?: number;
  subscribers?: { now: number; delta: number };
  reactions?: number;
  best?: { hook: string; views: number; url?: string };
}

const L = {
  title: { uz: "📊 O‘tgan hafta ({from} – {to})", ru: "📊 Прошлая неделя ({from} – {to})", en: "📊 Last week ({from} – {to})" },
  planned: { uz: "Rejadagi {y} ta postdan {x} tasi chiqdi.", ru: "Вышло {x} из {y} постов по плану.", en: "{x} of {y} planned posts went out." },
  published: { uz: "Chiqqan postlar: {x}.", ru: "Вышло постов: {x}.", en: "Posts out: {x}." },
  nothing: {
    uz: "O‘tgan hafta kanalda Mercat postlari chiqmadi.",
    ru: "На прошлой неделе посты Mercat в канале не выходили.",
    en: "No Mercat posts went out in your channel last week.",
  },
  views_vs: {
    uz: "Har bir post 72 soatda o‘rtacha {views} marta ko‘rildi; kanalingizdagi odatiy post — {median} ({delta}).",
    ru: "За 72 часа каждый пост в среднем посмотрели {views} раз; обычный пост в канале — {median} ({delta}).",
    en: "Each post got {views} views on average in 72 hours; a typical post in your channel gets {median} ({delta}).",
  },
  views: {
    uz: "Har bir post 72 soatda o‘rtacha {views} marta ko‘rildi.",
    ru: "За 72 часа каждый пост в среднем посмотрели {views} раз.",
    en: "Each post got {views} views on average in 72 hours.",
  },
  starts: {
    uz: "Post havolalari orqali botga o‘tganlar: {n}.",
    ru: "Перешли в бота по ссылкам из постов: {n}.",
    en: "People who came to the bot through the post links: {n}.",
  },
  subscribers: { uz: "Obunachilar: {d} (hozir {now}).", ru: "Подписчики: {d} (сейчас {now}).", en: "Subscribers: {d} (now {now})." },
  reactions: { uz: "Reaksiyalar: {n}.", ru: "Реакции: {n}.", en: "Reactions: {n}." },
  best: {
    uz: "Eng ko‘p ko‘rilgani: «{hook}» — {views} marta.",
    ru: "Больше всего просмотров: «{hook}» — {views}.",
    en: "Most viewed: «{hook}» — {views} views.",
  },
  orders: {
    uz: "O‘tgan hafta nechta buyurtma bo‘ldi?",
    ru: "Сколько заказов было за прошлую неделю?",
    en: "How many orders did you get last week?",
  },
  goal: {
    uz: "Kanal sizga asosan nima uchun kerak? Javobingizga qarab keyingi hisobotlarni tuzaman.",
    ru: "Для чего вам в первую очередь канал? По ответу я буду строить следующие отчёты.",
    en: "What is the channel mainly for? I'll shape the next reports around your answer.",
  },
} satisfies Record<string, Record<Locale, string>>;

/** Last week's raw numbers (repo.ts weekNumbers) as the report's input. */
export function reportInputFrom(
  nums: {
    planned: number;
    published: { hook: string; url: string | null; views72: number | null; views: number | null; reactions: number | null }[];
    starts: number;
    hasLinks: boolean;
    snapshots: { day: string; subscribers: number }[];
  },
  o: { locale: Locale; kind: ReportKind; weekOf: string; thisWeekOf: string; medianViews?: number },
): WeeklyReportInput {
  const to = new Date(Date.parse(`${o.thisWeekOf}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const v72 = nums.published.map((p) => p.views72).filter((v): v is number => typeof v === "number");
  const reacted = nums.published.map((p) => p.reactions).filter((v): v is number => typeof v === "number");
  const first = nums.snapshots[0];
  const last = nums.snapshots.at(-1);
  const best = [...nums.published]
    .map((p) => ({ ...p, seen: p.views72 ?? p.views ?? 0 }))
    .sort((a, b) => b.seen - a.seen)[0];
  return {
    locale: o.locale,
    kind: o.kind,
    from: o.weekOf,
    to,
    planned: nums.planned,
    published: nums.published.length,
    ...(v72.length ? { views72: { avg: Math.round(v72.reduce((a, b) => a + b, 0) / v72.length), n: v72.length } } : {}),
    ...(o.medianViews ? { medianViews: o.medianViews } : {}),
    ...(nums.hasLinks || nums.starts > 0 ? { starts: nums.starts } : {}),
    ...(first && last && first.day !== last.day ? { subscribers: { now: last.subscribers, delta: last.subscribers - first.subscribers } } : {}),
    ...(reacted.length ? { reactions: reacted.reduce((a, b) => a + b, 0) } : {}),
    ...(best && best.seen > 0 ? { best: { hook: best.hook, views: best.seen, ...(best.url ? { url: best.url } : {}) } } : {}),
  };
}

const fill = (template: string, vars: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

const clipHook = (s: string) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > 70 ? `${one.slice(0, 69).trimEnd()}…` : one;
};

export function buildWeeklyReport(r: WeeklyReportInput): { text: string; askOrders: boolean; askGoal: boolean } {
  const loc = r.locale;
  const line = (key: keyof typeof L, vars: Record<string, string | number> = {}) => fill(L[key][loc], vars);
  const n = (x: number) => fmtNum(x, loc);
  const out: string[] = [line("title", { from: formatDay(r.from, loc), to: formatDay(r.to, loc) })];

  if (r.planned > 0) out.push(line("planned", { x: n(r.published), y: n(r.planned) }));
  else if (r.published > 0) out.push(line("published", { x: n(r.published) }));
  else out.push(line("nothing"));

  const growth = r.kind !== "sales"; // "unknown" gets the growth lines: never orders for a channel that may be a blog
  if (growth && r.subscribers) {
    const d = r.subscribers.delta;
    out.push(line("subscribers", { d: d > 0 ? `+${n(d)}` : n(d), now: n(r.subscribers.now) }));
  }
  if (r.views72 && r.views72.n > 0) {
    const views = n(r.views72.avg);
    out.push(
      r.medianViews && r.medianViews > 0
        ? line("views_vs", { views, median: n(r.medianViews), delta: fmtDelta(r.views72.avg, r.medianViews) })
        : line("views", { views }),
    );
  }
  if (r.kind === "sales" && r.starts !== undefined) out.push(line("starts", { n: n(r.starts) }));
  if (growth) {
    if (r.reactions !== undefined && r.reactions > 0) out.push(line("reactions", { n: n(r.reactions) }));
    if (r.best && r.best.views > 0 && r.best.hook.trim()) {
      out.push([line("best", { hook: clipHook(r.best.hook), views: n(r.best.views) }), r.best.url ?? ""].filter(Boolean).join(" "));
    }
  }
  const askOrders = r.kind === "sales";
  const askGoal = r.kind === "unknown";
  if (askOrders) out.push("", line("orders"));
  if (askGoal) out.push("", line("goal"));
  return { text: out.join("\n"), askOrders, askGoal };
}
