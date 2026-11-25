import type { ReactNode } from "react";
import type { SourceCount } from "@/lib/source-category";
import {
  type ErrorRow,
  type FeedRow,
  type FunnelRow,
  type NorthStar,
  type OverviewRow,
  type Quality,
  type StatsRange,
  type StatsSurface,
  sumFunnel,
  type UserRow,
} from "@/lib/stats-model";

/** Presentational parts of /stats. Everything here gets already-shaped data with no ids in it (stats-model.ts). */

const numberFormat = new Intl.NumberFormat("en-US");
const n = (value: number) => numberFormat.format(value);
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`;

const SURFACE_LABELS: Record<StatsSurface, string> = { web: "Web", miniapp: "Mini App", bot: "Bot", unknown: "Untagged" };
const SURFACE_HINT = "Untagged: made before surfaces were recorded (Mini App or a web Studio opened from the bot).";

function Card({ title, caption, children }: { title: string; caption?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border border-line bg-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {caption ? <p className="mt-0.5 text-sm text-muted">{caption}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ north star

export function NorthStarCard({ northStar, teamConfigured }: { northStar: NorthStar; teamConfigured: boolean }) {
  return (
    <section aria-label="North star" className="rounded-2xl border border-line-2 bg-card p-5 sm:p-7">
      <p className="text-sm font-medium text-muted">North star</p>
      <div className="mt-2 flex flex-wrap items-end gap-x-5 gap-y-2">
        {northStar.status === "live" ? (
          <>
            <p className="text-6xl font-semibold tabular-nums tracking-tight sm:text-7xl">{n(northStar.brands)}</p>
            <p className="pb-2 text-sm text-muted">
              {n(northStar.publishing)} external {northStar.publishing === 1 ? "brand" : "brands"} published at least one post in the last 7 days
            </p>
          </>
        ) : northStar.status === "unavailable" ? (
          <p className="text-2xl font-semibold sm:text-3xl">Not counted this time</p>
        ) : (
          <p className="flex items-center gap-2 text-2xl font-semibold sm:text-3xl">
            <span aria-hidden className="size-2.5 rounded-full bg-led" />
            Waits for autopilot
          </p>
        )}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        External brands (owner outside the team) with 3 or more Mercat posts published in their own channel in the last 7
        days.
        {northStar.status === "waiting" ? " It starts counting once the database records when posts go out (the autopilot update)." : null}
        {northStar.status === "unavailable" ? " The count did not finish. Press Refresh to try again." : null}
        {teamConfigured ? null : " Team filter not set (STATS_TEAM_TG_IDS): the team's own brands count too."}
      </p>
    </section>
  );
}

// -------------------------------------------------------------------------------------------------- overview

type OverviewMetric = { key: keyof Omit<OverviewRow, "span">; label: string; hint?: string; indent?: boolean };

const OVERVIEW_METRICS: OverviewMetric[] = [
  { key: "landing_visitors", label: "Landing visitors" },
  { key: "studio_visitors", label: "Studio opens", hint: "Visitors who opened /studio: a page load or a jump from the landing's links" },
  { key: "studio_users", label: "Studio users", hint: "Did something in the web Studio (anonymous or linked from the bot)" },
  { key: "miniapp_users", label: "Mini App users" },
  { key: "bot_users", label: "Bot users", hint: "Owners talking to the bot; customers from post links are counted below" },
  { key: "tg_active", label: "Telegram users active" },
  { key: "tg_new", label: "new", indent: true },
  { key: "tg_returning", label: "returning", indent: true },
  { key: "customers", label: "Customers from post links", hint: "Tapped a tracked link in a published post" },
];

const SPAN_LABELS: Record<OverviewRow["span"], string> = { today: "Today", "7d": "7 days", "30d": "30 days" };

export function Overview({ rows }: { rows: OverviewRow[] }) {
  return (
    <Card
      title="Overview"
      caption="Web visitors are counted with a key that changes every day, so 7 and 30 days add up daily visitors."
    >
      <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(3.25rem,auto))] text-sm">
        <span />
        {rows.map((row) => (
          <span key={row.span} className="pb-2 pl-3 text-right text-xs font-medium text-muted sm:pl-6">
            {SPAN_LABELS[row.span]}
          </span>
        ))}
        {OVERVIEW_METRICS.map((metric) => (
          <OverviewLine key={metric.key} metric={metric} rows={rows} />
        ))}
      </div>
    </Card>
  );
}

function OverviewLine({ metric, rows }: { metric: OverviewMetric; rows: OverviewRow[] }) {
  const line = metric.indent ? "py-1 text-muted" : "border-t border-line py-2";
  return (
    <>
      <span className={`${line} min-w-0 ${metric.indent ? "pl-4" : "font-medium"}`} title={metric.hint}>
        {metric.label}
        {metric.hint ? <span className="block text-xs font-normal text-muted">{metric.hint}</span> : null}
      </span>
      {rows.map((row) => (
        <span key={row.span} className={`${line} pl-3 text-right tabular-nums sm:pl-6 ${metric.indent ? "" : "text-base font-semibold"}`}>
          {n(row[metric.key])}
        </span>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------- funnel

const RANGE_TEXT: Record<StatsRange, string> = { today: "today", "7d": "in the last 7 days", "30d": "in the last 30 days", all: "so far" };

const STAGES: { key: keyof Omit<FunnelRow, "surface">; label: string }[] = [
  { key: "brands", label: "Brands created" },
  { key: "with_posts", label: "Got posts" },
  { key: "with_approved", label: "Approved a post" },
  { key: "with_published", label: "Published a post" },
  { key: "with_taps", label: "Got link taps" },
];

export function Funnel({ rows, range }: { rows: FunnelRow[]; range: StatsRange }) {
  const total = sumFunnel(rows);
  const top = Math.max(1, total.brands);
  return (
    <Card title="Funnel" caption={`Brands created ${RANGE_TEXT[range]} and how far each got, by where it was made.`}>
      {total.brands === 0 ? (
        <p className="text-muted">No brands in this range.</p>
      ) : (
        <>
          <ol className="flex flex-col gap-4">
            {STAGES.map((stage) => {
              const value = total[stage.key];
              const share = Math.round((value / top) * 100);
              return (
                <li key={stage.key}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{stage.label}</span>
                    <span className="tabular-nums">
                      <span className="text-base font-semibold">{n(value)}</span>
                      {stage.key !== "brands" ? <span className="text-muted"> · {share}%</span> : null}
                    </span>
                  </div>
                  <span className="mt-1.5 block h-2 rounded-full bg-tint" aria-hidden>
                    <span className="block h-2 rounded-full bg-ink-2" style={{ width: `${value ? Math.max(2, share) : 0}%` }} />
                  </span>
                  <p className="mt-1 text-xs text-muted">
                    {rows
                      .filter((row) => row.brands > 0)
                      .map((row) => `${SURFACE_LABELS[row.surface]} ${n(row[stage.key])}`)
                      .join(" · ")}
                  </p>
                </li>
              );
            })}
          </ol>
          <p className="mt-5 border-t border-line pt-3 text-xs leading-relaxed text-muted">
            Their posts: {n(total.posts)} written, {n(total.approved)} approved, {n(total.published)} published,{" "}
            {n(total.unapproved)} left as drafts for 48 hours or more without approval.{" "}
            {n(total.taps)} {total.taps === 1 ? "person" : "people"} tapped a tracked link in a post.
            {rows.some((row) => row.surface === "unknown") ? ` ${SURFACE_HINT}` : null}
          </p>
        </>
      )}
    </Card>
  );
}

// --------------------------------------------------------------------------------------------------- sources

export function SourceList({ title, caption, rows, empty }: { title: string; caption: string; rows: SourceCount[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return (
    <Card title={title} caption={caption}>
      {rows.length === 0 ? (
        <p className="text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.slice(0, 12).map((row) => {
            const share = total ? Math.round((row.count / total) * 100) : 0;
            return (
              <li
                key={row.source}
                className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3"
                title={`${row.source}: ${n(row.count)} (${share}%)`}
              >
                <span className="truncate text-sm font-medium">{row.source}</span>
                <span className="h-2.5 rounded-full bg-tint" aria-hidden>
                  <span className="block h-2.5 rounded-full bg-ink-2" style={{ width: `${Math.max(2, (row.count / max) * 100)}%` }} />
                </span>
                <span className="text-sm tabular-nums">
                  {n(row.count)} <span className="text-muted">· {share}%</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// --------------------------------------------------------------------------------------------------- quality

export function QualityCard({ quality, errors }: { quality: Quality; errors: ErrorRow[] }) {
  const lines: { label: string; value: string; hint: string }[] = [
    { label: "Approvals with the owner's edits", value: `${n(quality.edited)} of ${n(quality.approvals)}`, hint: "The owner changed the text before approving it" },
    { label: "Texts written again", value: n(quality.rewritten), hint: "Another version, or a rewrite from one phrase" },
    { label: "Pictures redone", value: n(quality.pictures_redone), hint: "A post's picture started more than once" },
    { label: "Posts rejected", value: n(quality.rejected), hint: "Turned down with a button; drafts nobody approved are in the funnel" },
    { label: "Error answers", value: `${n(quality.errors)} · ${plural(quality.error_people, "person", "people")}`, hint: "Errors the Studio or the Mini App showed" },
    { label: "Autopilot trials started", value: n(quality.trials), hint: "Counted when an owner first switches the autopilot on" },
  ];
  return (
    <Card title="Quality" caption="What owners changed, redid or turned down, and the errors people saw, in this range.">
      <dl className="grid gap-x-6 text-sm sm:grid-cols-2">
        {lines.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-3 border-t border-line py-2">
            <dt className="min-w-0">
              <span className="font-medium">{line.label}</span>
              <span className="block text-xs text-muted">{line.hint}</span>
            </dt>
            <dd className="shrink-0 text-base font-semibold tabular-nums">{line.value}</dd>
          </div>
        ))}
      </dl>
      {errors.length ? (
        <div className="mt-4">
          <p className="text-xs font-medium text-muted">Most frequent errors</p>
          <ol className="mt-1 divide-y divide-line">
            {errors.map((row) => (
              <li key={`${row.route} ${row.code}`} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                <span className="min-w-0 break-words">
                  <span className="font-medium">{row.code}</span> <span className="text-muted">· {row.route}</span>
                </span>
                <span className="shrink-0 tabular-nums">{n(row.count)}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </Card>
  );
}

// ----------------------------------------------------------------------------------------------------- users

export function UsersList({ rows, timeFormat, teamHidden }: { rows: UserRow[]; timeFormat: Intl.DateTimeFormat; teamHidden: boolean }) {
  return (
    <Card
      title="Telegram users"
      caption={`People who used the bot or the Mini App in this range, latest first (up to 100). ${teamHidden ? "Team members are left out, and so are customers" : "Customers"} who only tapped a post link${teamHidden ? "." : " are left out."}`}
    >
      {rows.length === 0 ? (
        <p className="text-muted">Nobody in this range.</p>
      ) : (
        <ol className="divide-y divide-line">
          {rows.map((user, i) => (
            <li key={`${user.username ?? user.name}-${user.firstSeen}-${i}`} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {user.name || "No name"}
                  {user.username ? <span className="font-normal text-muted"> @{user.username}</span> : null}
                </p>
                <p className="text-xs text-muted">
                  First seen {timeFormat.format(new Date(user.firstSeen))}
                  {user.lastSeen ? ` · last ${timeFormat.format(new Date(user.lastSeen))}` : null}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:justify-end sm:text-right">
                <span className="flex gap-1">
                  {user.surfaces.map((surface) => (
                    <span key={surface} className="rounded-full border border-line px-2 py-0.5">
                      {SURFACE_LABELS[surface]}
                    </span>
                  ))}
                </span>
                <span className="tabular-nums text-muted">
                  {plural(user.brands, "brand", "brands")} · {plural(user.posts, "post", "posts")} · {n(user.approved)} approved ·{" "}
                  <span className={user.published ? "font-semibold text-ink" : undefined}>{n(user.published)} published</span>
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// -------------------------------------------------------------------------------------------------- activity

const EVENT_LABELS: Record<string, string> = {
  page_view: "Page visit",
  start: "Opened the bot",
  message: "Wrote to the bot",
  miniapp_open: "Opened the Mini App",
  brand_created: "Brand created",
  brand_reused: "Brand reopened",
  brand_claimed: "Web brand claimed in the bot",
  brand_channel_linked: "Channel linked",
  bot_onboarded: "Bot made a brand",
  bot_onboard_timeout: "Bot brand timed out",
  posts_generated: "Posts written",
  post_approved: "Post approved",
  post_published: "Post published",
  post_image_started: "Picture started",
  post_edited: "Post edited before approval",
  post_regenerated: "Post written again",
  post_rejected: "Post rejected",
  api_error: "Error shown to a user",
  trial_started: "Autopilot trial started",
  publish_link_opened: "Opened a publish link",
  lead: "Customer shared a contact",
  business_connection: "Business account connected",
  business_message: "Business message",
  radar_run: "Radar run",
  video_planned: "Video planned",
  flow_planned: "Flow planned",
  media_job_created: "Media job",
};

export function ActivityFeed({ rows, timeFormat }: { rows: FeedRow[]; timeFormat: Intl.DateTimeFormat }) {
  return (
    <Card title="Recent activity" caption="What people did last: the action, where, and when. No names or ids.">
      {rows.length === 0 ? (
        <p className="text-muted">Nothing yet.</p>
      ) : (
        <ol className="divide-y divide-line">
          {rows.map((row, i) => (
            <li key={`${row.at}-${i}`} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate">{EVENT_LABELS[row.type] ?? row.type}</span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted" title={row.surface === "unknown" ? SURFACE_HINT : undefined}>
                  {SURFACE_LABELS[row.surface]}
                </span>
                <time dateTime={row.at} className="w-24 text-right text-xs tabular-nums text-muted">
                  {timeFormat.format(new Date(row.at))}
                </time>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
