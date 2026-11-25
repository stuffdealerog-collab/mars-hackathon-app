/**
 * The analysis and the plan as bot messages (pure): the same analysis and plan the Studio shows, in a few lines the
 * owner reads in a chat. Owner text only: internal ids ("[S.reachRate]", "F3") never reach the message.
 */
import type { ChannelAudit, ContentPlan } from "../contract";
import { formatDay, type Locale, t } from "../../i18n";
import { ownerText, stripIdsAll } from "../brain/copy";
import { clip } from "../text";

const KIND_ORDER: Record<ChannelAudit["findings"][number]["kind"], number> = { problem: 0, opportunity: 1, strength: 2 };

/** "12 300" (uz, ru) / "12,300" (en); one decimal kept for fractions ("4,5" / "4.5"). */
export function formatNumber(n: number, locale: Locale): string {
  const rounded = Math.round(n * 10) / 10;
  const [int, frac] = Math.abs(rounded).toFixed(Number.isInteger(rounded) ? 0 : 1).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, locale === "en" ? "," : " ");
  return `${rounded < 0 ? "-" : ""}${grouped}${frac ? (locale === "en" ? "." : ",") + frac : ""}`;
}

function clean(s: string, locale: Locale, max: number): string {
  const full = stripIdsAll(ownerText(s, locale)).replace(/\s*\n+\s*/g, " ");
  const cut = clip(full, max);
  return cut.length < full.length ? `${cut.trimEnd()}…` : cut;
}

/** The channel analysis: the numbers in one line, then the three findings the Studio shows (problems first). */
export function analysisMessage(audit: ChannelAudit, locale: Locale): string {
  const channel = audit.channel.replace(/^@/, "");
  const numbers = [
    audit.subscribers != null ? t(locale, "bot.an_subs", { n: formatNumber(audit.subscribers, locale) }) : "",
    audit.avgViews != null ? t(locale, "bot.an_views", { n: formatNumber(audit.avgViews, locale) }) : "",
    audit.reachRate != null ? t(locale, "bot.an_reach", { n: Math.round(Math.min(1, audit.reachRate) * 100) }) : "",
    t(locale, "bot.an_per_week", { n: formatNumber(audit.postsPerWeek, locale) }),
  ].filter(Boolean);
  const top = [...audit.findings].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]).slice(0, 3);
  const findings = top.map((f) => `• ${clean(f.text, locale, 400)}`).filter((l) => l.length > 2);
  return [t(locale, "bot.analysis_title", { channel }), numbers.join(" · "), "", ...(findings.length ? findings : [t(locale, "bot.an_none")])].join("\n").slice(0, 3800);
}

/** Lines shown in the chat; the rest is in the app. */
const PLAN_LINES = 7;

/**
 * The week plan: one line per post ("• pay 19:00 — Opening line"). The time comes from the plan's timeLabel
 * ("Kanalingiz bo‘yicha eng yaxshi vaqt: pay 19:00"); when every post shares the label's first part it is said once.
 */
export function planMessage(plan: ContentPlan, locale: Locale, opts: { launch?: boolean } = {}): string {
  const items = plan.items;
  const split = items.map((it) => {
    const label = it.timeLabel?.trim() ?? "";
    const at = label.lastIndexOf(": ");
    return at > 0 ? { kind: label.slice(0, at), when: label.slice(at + 2) } : { kind: "", when: `${formatDay(it.day, locale)}, ${it.time}` };
  });
  const kinds = new Set(split.map((s) => s.kind));
  const shared = kinds.size === 1 ? [...kinds][0] : "";
  const lines = items.slice(0, PLAN_LINES).map((it, i) => {
    const s = split[i];
    const when = shared || !s.kind ? s.when : `${s.when} (${s.kind.toLowerCase()})`;
    const hook = clean(it.hook || it.brief, locale, 90);
    return `• ${when}${hook ? ` — ${hook}` : ""}`;
  });
  const title = t(locale, opts.launch ? "bot.plan_title_launch" : "bot.plan_title", { n: items.length });
  const more = items.length > PLAN_LINES ? [t(locale, "bot.plan_more", { n: items.length - PLAN_LINES })] : [];
  return [title, ...(shared ? [`⏰ ${shared}`] : []), "", ...lines, ...more].join("\n").slice(0, 3800);
}
