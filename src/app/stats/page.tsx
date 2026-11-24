import type { Metadata } from "next";
import { Suspense } from "react";
import { getStats, STATS_TIMEZONE, type Stats } from "@/lib/stats";
import AutoRefresh from "./auto-refresh";

export const metadata: Metadata = {
  title: "Live stats",
  description: "How many people use Mercat, live. No names are shown.",
  robots: { index: false },
};

export default function StatsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Mercat users, live</h1>
        <p className="text-sm text-muted">Updates every 15 seconds</p>
      </header>
      <Suspense fallback={<p className="text-muted">Loading stats…</p>}>
        <StatsContent />
      </Suspense>
      <AutoRefresh seconds={15} />
    </main>
  );
}

const numberFormat = new Intl.NumberFormat("en-US");
const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: STATS_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  day: "numeric",
  month: "short",
});

async function StatsContent() {
  const result = await getStats();

  if (!result.ok) {
    return (
      <div className="rounded-2xl border border-line bg-card p-8">
        <p className="text-lg font-semibold">Stats are not available yet</p>
        <p className="mt-2 text-muted">
          {result.error === "not_configured"
            ? "The database is not connected yet."
            : "The database did not respond. Retrying automatically."}
        </p>
      </div>
    );
  }

  const { stats } = result;
  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Total users" value={stats.total_users} highlight />
        <StatTile label="New today" value={stats.users_today} />
        <StatTile label="Active today" value={stats.active_today} />
        <StatTile label="Events today" value={stats.events_today} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarList
          title="Users by source"
          caption="Where users came from (QR code / deep link)"
          rows={stats.by_source.map((r) => ({ label: r.source, value: r.count }))}
          empty="No users yet"
        />
        <BarList
          title="Events by type"
          caption={`${numberFormat.format(stats.total_events)} events in total`}
          rows={stats.by_type.map((r) => ({ label: r.type, value: r.count }))}
          empty="No events yet"
        />
      </div>

      <RecentSignups rows={stats.recent_signups} />

      <p className="text-xs text-muted">
        Updated {timeFormat.format(new Date(result.generatedAt))} (Tashkent time). No names are shown.
      </p>
    </div>
  );
}

function StatTile({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5 sm:p-6">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p
        className={`mt-2 font-semibold tabular-nums tracking-tight ${
          highlight ? "text-5xl sm:text-6xl" : "text-4xl sm:text-5xl"
        }`}
      >
        {numberFormat.format(value)}
      </p>
    </div>
  );
}

function BarList({
  title,
  caption,
  rows,
  empty,
}: {
  title: string;
  caption: string;
  rows: { label: string; value: number }[];
  empty: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  return (
    <section className="rounded-2xl border border-line bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted">{caption}</p>
      {rows.length === 0 ? (
        <p className="mt-6 text-muted">{empty}</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {rows.slice(0, 12).map((row) => {
            const share = total ? Math.round((row.value / total) * 100) : 0;
            return (
              <li
                key={row.label}
                className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3"
                title={`${row.label}: ${numberFormat.format(row.value)} (${share}%)`}
              >
                <span className="truncate text-sm font-medium">{row.label}</span>
                <span className="h-2.5 rounded-full bg-tint" aria-hidden>
                  <span
                    className="block h-2.5 rounded-full bg-ink-2"
                    style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
                  />
                </span>
                <span className="text-sm tabular-nums">
                  {numberFormat.format(row.value)} <span className="text-muted">· {share}%</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RecentSignups({ rows }: { rows: Stats["recent_signups"] }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Latest signups</h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-muted">Waiting for the first user…</p>
      ) : (
        <ol className="mt-4 divide-y divide-line">
          {rows.map((row, i) => (
            <li key={`${row.created_at}-${i}`} className="flex items-center justify-between gap-4 py-2.5">
              <span className="truncate font-medium">New user</span>
              <time dateTime={row.created_at} className="shrink-0 text-sm tabular-nums text-muted">
                {timeFormat.format(new Date(row.created_at))}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

