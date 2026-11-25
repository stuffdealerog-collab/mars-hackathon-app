import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { connectCopy, fill, type Lang } from "@/components/connections/copy";
import { Mark } from "@/components/lamp/Mark";
import { botUsername } from "@/components/ui/bot";
import { isConnectError, isConnectorId } from "@/lib/connectors/types";

/**
 * Where the owner's browser lands after connecting a platform from the Mini App (the sign-in ran in the external
 * browser, outside Telegram): one line that it worked, or why not, and the way back to Telegram. It never receives
 * a token or the provider's code: the callback strips them (src/app/api/connect/callback).
 */
export const metadata: Metadata = { title: { absolute: "Mercat" }, robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function langFrom(q: string | string[] | undefined, acceptLanguage: string | null): Lang {
  if (q === "ru" || q === "en" || q === "uz") return q;
  const first = (acceptLanguage ?? "").toLowerCase().match(/^\s*([a-z]{2})/)?.[1];
  return first === "ru" || first === "en" ? first : "uz";
}

async function Body({ searchParams }: { searchParams: PageProps<"/connect/done">["searchParams"] }) {
  const q = await searchParams;
  const lang = langFrom(q.lang, (await headers()).get("accept-language"));
  const t = connectCopy(lang);
  const provider = typeof q.p === "string" && isConnectorId(q.p) ? q.p : null;
  const error = typeof q.error === "string" && isConnectError(q.error) ? q.error : null;
  const brand = typeof q.brand === "string" && UUID.test(q.brand) ? q.brand : null;
  const platform = provider ? t.names[provider] : "Mercat";
  const bot = botUsername();
  const telegram = brand ? `https://t.me/${bot}?startapp=${encodeURIComponent(`brand_${brand}`)}` : `https://t.me/${bot}`;
  const failed = !provider || !!error;

  return (
    <main lang={lang} className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-center px-4 pb-24 sm:px-8">
      <span aria-hidden className="mb-8 block h-[3px] w-[26px] rounded-full bg-[var(--hair-2)]" />
      <h1 className="text-balance text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[40px]">
        {fill(failed ? t.done.failTitle : t.done.title, { platform })}
      </h1>
      <p className="mt-4 max-w-[46ch] text-[16px] leading-relaxed text-ink-2 sm:text-[17px]">
        {failed ? `${error ? `${t.errors[error]} ` : ""}${t.done.retry}` : t.done.text}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <a href={telegram} className="btn">
          {t.done.openTelegram}
        </a>
        <a href={brand ? `/studio?brand=${brand}` : "/studio"} className="btn-2">
          {t.done.openStudio}
        </a>
      </div>
    </main>
  );
}

export default function ConnectDonePage({ searchParams }: PageProps<"/connect/done">) {
  return (
    <div className="flex min-h-dvh flex-col bg-stage text-ink">
      <header className="mx-auto flex w-full max-w-[1180px] items-center px-4 pt-3 sm:px-8 sm:pt-5">
        <Mark />
      </header>
      <Suspense fallback={null}>
        <Body searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
