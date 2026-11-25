/**
 * The week in the bot: one line per post that can go out (when, opening line), the ones that cannot and why, and
 * the buttons [Approve all] (bound to exactly the posts shown) and [Review] (the Mini App's week view).
 * Used by the `week_` deep link, the weekly "posts are ready" message and a stale [Approve all] tap.
 */
import { InlineKeyboard } from "grammy";
import type { Locale } from "../i18n";
import { shownHash, textHash } from "../uslub/botpublish-core";
import type { PostDraft } from "../uslub/contract";
import { clip } from "../uslub/text";
import { say, skipReason, whenLabel } from "./copy";
import type { WeekBatch } from "./week";
import { weekHashText } from "./week-hash";
import { slotTime } from "./time";

/** "apw:<brandId>:<hash>" (≤ 64 bytes: 4 + 36 + 1 + 16 = 57). */
export const APPROVE_WEEK_RE = /^apw:([0-9a-f-]{36}):([A-Za-z0-9_-]{16})$/;
/** "apa:1:<brandId>" turns the autopilot on, "apa:0:<brandId>" off. */
export const AUTOPILOT_RE = /^apa:([01]):([0-9a-f-]{36})$/;
/** "apr:<brandId>": "check again" after the bot was made an admin (the week_ link of a brand nobody owns yet). */
export const WEEK_RETRY_RE = /^apr:([0-9a-f-]{36})$/;
/** "apg:<brandId>:sale|grow": the owner's goal from the Monday report (channel type and goal unknown). */
export const GOAL_RE = /^apg:([0-9a-f-]{36}):(sale|grow)$/;
/** "apo:<brandId>:<bucket>": the weekly orders answer of a brand without last week's plan. */
export const ORDERS_RE = /^apo:([0-9a-f-]{36}):(0|1|4|10)$/;

/**
 * Binds [Approve all] (and the web's approve-week `hash`) to the posts shown and their text and picture: any change
 * shows the list again. The same value as week-hash.ts weekHashForClient, computed with node:crypto.
 */
export function weekHash(batch: Pick<WeekBatch, "ready">, posts: readonly PostDraft[]): string {
  const byId = new Map(posts.map((p) => [p.id, p]));
  return textHash(
    weekHashText(batch, (id, script) => {
      const p = byId.get(id);
      return p ? shownHash(p, script) : "";
    }),
  );
}

const hookOf = (p: PostDraft | undefined) => {
  const line = (p?.slot?.hook?.trim() || p?.variants.uz_latn?.split("\n").find((l) => l.trim()) || "").replace(/\s+/g, " ");
  return clip(line, 60);
};

export function weekMessage(
  locale: Locale,
  o: {
    kind: "week" | "ready" | "changed";
    brandId: string;
    posts: readonly PostDraft[];
    batch: WeekBatch;
    /** https origin of the app, for the Mini App button; omitted when there is none. */
    appUrl?: string;
    autopilotOn: boolean;
    /** The brand has an owner: only then the autopilot switch is offered (only the owner can use it). */
    owned: boolean;
  },
): { text: string; keyboard?: InlineKeyboard } {
  const byId = new Map(o.posts.map((p) => [p.id, p]));
  const lines: string[] = [];
  if (o.kind === "changed") lines.push(say(locale, "week_changed"));
  const n = o.batch.ready.length;
  if (!n) lines.push(say(locale, "week_none"));
  else {
    lines.push(say(locale, o.kind === "ready" ? "week_ready_title" : "week_title", { n }));
    for (const r of o.batch.ready) lines.push(`• ${whenLabel(Date.parse(r.dueAt), locale)} — ${hookOf(byId.get(r.postId))}`);
  }
  const skipped = o.batch.skipped.filter((s) => s.reason !== "published");
  if (skipped.length) {
    lines.push("", say(locale, "week_skipped_title"));
    for (const s of skipped) {
      const p = byId.get(s.postId);
      const at = slotTime(p?.slot);
      const head = [at != null ? whenLabel(at, locale) : "", hookOf(p)].filter(Boolean).join(" — ");
      lines.push(`• ${head || "—"}: ${skipReason(locale, s.reason, s)}`);
    }
  }
  if (n) lines.push("", say(locale, "week_hint"));

  const kb = new InlineKeyboard();
  let any = false;
  if (n) {
    kb.text(say(locale, "week_approve_all"), `apw:${o.brandId}:${weekHash(o.batch, o.posts)}`).row();
    any = true;
  }
  if (o.appUrl?.startsWith("https://")) {
    kb.webApp(say(locale, "week_review"), `${o.appUrl}/tg?brand=${encodeURIComponent(o.brandId)}&view=week`).row();
    any = true;
  }
  if (!o.autopilotOn && o.owned) {
    kb.text(say(locale, "autopilot_offer"), `apa:1:${o.brandId}`);
    any = true;
  }
  return { text: clip(lines.join("\n"), 4000), ...(any ? { keyboard: kb } : {}) };
}
