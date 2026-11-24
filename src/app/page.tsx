import Link from "next/link";
import { getEnv } from "@/lib/env";

export default function Home() {
  const bot = getEnv().BOT_USERNAME;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-8 px-4 py-16 sm:px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">
          MARS AI Hackathon · Tashkent
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Something new is landing.</h1>
        <p className="mt-4 text-lg text-muted">
          A Telegram-first product, built this weekend. Open the bot to try it; the numbers are live.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        {bot ? (
          <a
            href={`https://t.me/${bot}`}
            className="rounded-xl bg-foreground px-5 py-3 text-center font-semibold text-background"
          >
            Open @{bot} in Telegram
          </a>
        ) : (
          <span className="rounded-xl border border-line px-5 py-3 text-center text-muted">
            Bot link coming soon
          </span>
        )}
        <Link href="/stats" className="rounded-xl border border-line px-5 py-3 text-center font-semibold">
          Live stats
        </Link>
      </div>
    </main>
  );
}
