import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { getStats } from "@/lib/stats";
import { statsGate } from "@/lib/stats-access";
import { eventEnv } from "@/lib/stats-meta";
import { parseStatsQuery, type StatsQuery, type StatsRange, statsHref, STATS_TIMEZONE } from "@/lib/stats-model";
import RefreshButton from "./refresh-button";
import { ActivityFeed, Funnel, NorthStarCard, Overview, QualityCard, SourceList, UsersList } from "./sections";

export const metadata: Metadata = {
  title: "Live stats",
  description: "Who visits Mercat and who uses it, on the web, in the Mini App and in the bot. Operator view.",
  robots: { index: false },
};

export default function StatsPage({ searchParams }: PageProps<"/stats">) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-4xl">Who visits, who uses</h1>
          <p className="mt-1 text-sm text-muted">Landing, web Studio, Mini App and bot. Tashkent days.</p>
        </div>
        <RefreshButton />
      </header>
      <Suspense fallback={<p className="text-muted">Loading stats…</p>}>
        <StatsContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: STATS_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  day: "numeric",
  month: "short",
});

async function StatsContent({ searchParams }: { searchParams: PageProps<"/stats">["searchParams"] }) {
  // src/proxy.ts asks for the password; checking again here keeps the data out of any response the proxy did not
  // gate, and reading the request headers keeps this part out of the build-time prerender.
  if (statsGate((await headers()).get("authorization")) !== "allow") {
    return <p className="text-muted">Stats are private.</p>;
  }
  const params = await searchParams;
  const query = parseStatsQuery(params);
  const result = params.mock === "1" && process.env.NODE_ENV !== "production" ? await mockStats(query) : await getStats(query);

  if (!result.ok) {
    return (
      <div className="rounded-2xl border border-line bg-card p-6 sm:p-8">
        <p className="text-lg font-semibold">Stats are not available yet</p>
        <p className="mt-2 text-muted">
          {result.error === "not_configured"
            ? "The database is not connected yet."
            : "The database did not respond. Press Refresh to try again."}
        </p>
      </div>
    );
  }

  const { stats } = result;
  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <Controls query={query} teamConfigured={stats.teamConfigured} />
      <NorthStarCard northStar={stats.northStar} teamConfigured={stats.teamConfigured} />
      <Overview rows={stats.overview} />
      <Funnel rows={stats.funnel} range={query.range} />
      <div className="grid gap-5 sm:gap-6 lg:grid-cols-2">
        <SourceList
          title="Landing visitors by source"
          caption="From ?src=, ?utm_source= or the referring site's category. Counted without cookies."
          rows={stats.landingSources}
          empty="No landing visits counted in this range yet."
        />
        <SourceList
          title="New Telegram users by link"
          caption="First link they came through (QR label, landing, studio…). No link reads as direct."
          rows={stats.telegramSources}
          empty="No new Telegram users in this range."
        />
      </div>
      <QualityCard quality={stats.quality} errors={stats.errors} />
      <UsersList rows={stats.users} timeFormat={timeFormat} teamHidden={stats.teamConfigured && !query.includeTeam} />
      <ActivityFeed rows={stats.feed} timeFormat={timeFormat} />
      <p className="text-xs leading-relaxed text-muted">
        Updated {timeFormat.format(new Date(result.generatedAt))} (Tashkent time). Operator view: Telegram first names and
        @usernames only. No Telegram ids, brand ids, IPs or visitor keys are shown. Dev traffic is{" "}
        {query.includeDev ? "included" : "left out"}; the team is {query.includeTeam || !stats.teamConfigured ? "included" : "left out"}.
        New events from this deployment are tagged “{eventEnv()}”.
      </p>
    </div>
  );
}

/** `?mock=1` outside production: made-up numbers for UI checks without a database. */
async function mockStats(query: StatsQuery) {
  await connection();
  const { fixtureStats } = await import("@/lib/stats-fixture");
  return { ok: true as const, stats: fixtureStats(query), generatedAt: new Date().toISOString() };
}

const RANGE_LABELS: Record<StatsRange, string> = { today: "Today", "7d": "7 days", "30d": "30 days", all: "All time" };

function Controls({ query, teamConfigured }: { query: StatsQuery; teamConfigured: boolean }) {
  return (
    <nav aria-label="Stats options" className="flex flex-wrap items-center gap-2 text-sm">
      <div className="flex flex-wrap gap-1 rounded-full border border-line bg-card p-1" role="group" aria-label="Range">
        {(Object.keys(RANGE_LABELS) as StatsRange[]).map((range) => (
          <Link
            key={range}
            href={statsHref(query, { range })}
            aria-current={query.range === range ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 ${query.range === range ? "bg-ink font-semibold text-paper" : "text-muted hover:text-ink"}`}
          >
            {RANGE_LABELS[range]}
          </Link>
        ))}
      </div>
      <Toggle href={statsHref(query, { includeDev: !query.includeDev })} on={query.includeDev} label="Dev traffic" />
      {teamConfigured ? (
        <Toggle href={statsHref(query, { includeTeam: !query.includeTeam })} on={query.includeTeam} label="Team" />
      ) : (
        <span className="rounded-full border border-dashed border-line px-3 py-1.5 text-muted" title="Set STATS_TEAM_TG_IDS to hide the team">
          Team filter not set
        </span>
      )}
    </nav>
  );
}

function Toggle({ href, on, label }: { href: string; on: boolean; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 hover:border-line-2"
    >
      <span aria-hidden className={`size-2 rounded-full ${on ? "bg-led" : "bg-glass-3"}`} />
      {label}: <span className={on ? "font-semibold" : "text-muted"}>{on ? "shown" : "hidden"}</span>
    </Link>
  );
}
