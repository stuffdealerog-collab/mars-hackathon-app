import Link from "next/link";
import type { ReactNode } from "react";
import { Mark } from "@/components/lamp/Mark";
import { botUsername } from "@/components/ui/bot";
import { DELETION_STATUS, DELETION_UNKNOWN, LEGAL, type LegalKind, type LegalLang, LINKS, NAV } from "./content";
import { LEGAL_UPDATED, OPERATOR } from "./operator";

/**
 * One legal page (privacy, terms, data deletion) in the page's language (?lang=, Uzbek by default). Server
 * component, plain text on the dark stage: these pages are read by owners and by Meta's and Google's reviewers.
 */

const PATH: Record<LegalKind, string> = { privacy: "/privacy", terms: "/terms", deletion: "/data-deletion" };
const LANGS: LegalLang[] = ["uz", "ru", "en"];
const TEAM: Record<LegalLang, string> = { uz: "Mercat jamoasi", ru: "команда Mercat", en: "the Mercat team" };

const withLang = (path: string, lang: LegalLang) => (lang === "uz" ? path : `${path}?lang=${lang}`);

/** Fills {operator}, {city}, {contact}, {bot} and the link names, then turns [text](url) into links. */
function rich(text: string, lang: LegalLang, bot: string): ReactNode[] {
  const contact = `[Telegram @${bot}](https://t.me/${bot})${OPERATOR.email ? ` · [${OPERATOR.email}](mailto:${OPERATOR.email})` : ""}`;
  const filled = text
    .replace(/\{operator\}/g, OPERATOR.entity ?? TEAM[lang])
    .replace(/\{city\}/g, OPERATOR.city[lang])
    .replace(/\{contact\}/g, contact)
    .replace(/\{bot\}/g, `@${bot}`)
    .replace(/\{(\w+)\}/g, (m, k: string) => LINKS[k] ?? m);
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const m of filled.matchAll(re)) {
    if (m.index > last) out.push(filled.slice(last, m.index));
    const [, label, href] = m;
    const external = /^(https?:|mailto:)/.test(href);
    out.push(
      <a key={m.index} href={href} className="link" {...(external && !href.startsWith("mailto:") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {label}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < filled.length) out.push(filled.slice(last));
  return out;
}

/** `request`: a data-deletion confirmation code from the URL, and whether Mercat issued it. */
export function LegalPage({ kind, lang, request }: { kind: LegalKind; lang: LegalLang; request?: { code: string; known: boolean } | null }) {
  const doc = LEGAL[kind][lang];
  const nav = NAV[lang];
  const bot = botUsername();
  return (
    <div lang={lang} className="flex min-h-dvh flex-col bg-stage text-ink">
      <header className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-3 px-4 pt-3 sm:px-8 sm:pt-5">
        <Mark />
        <nav className="seg" aria-label="Til · Язык · Language">
          {LANGS.map((l) => (
            <a key={l} href={withLang(PATH[kind], l)} lang={l} aria-current={l === lang ? "true" : undefined} className="inline-flex items-center justify-center">
              {l}
            </a>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[720px] flex-1 px-4 pb-16 pt-10 sm:px-8 sm:pt-14">
        <h1 className="text-balance text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[44px]">{doc.title}</h1>
        <p className="mt-3 text-[13px] text-ink-3">
          {nav.updated}: {LEGAL_UPDATED}
        </p>
        {request && (
          <p role="status" className="mt-6 rounded-[20px] bg-glass px-4 py-3.5 text-[15px] leading-snug shadow-[inset_0_0_0_1px_var(--hair)]">
            {(request.known ? DELETION_STATUS : DELETION_UNKNOWN)[lang].replace("{code}", request.code)}
          </p>
        )}
        <p className="mt-6 max-w-[62ch] text-[17px] leading-relaxed text-ink-2">{rich(doc.intro, lang, bot)}</p>
        {doc.sections.map((s) => (
          <section key={s.h} className="mt-10">
            <h2 className="text-[21px] font-[620] leading-tight tracking-[-0.02em]">{s.h}</h2>
            {s.p.map((p, i) => (
              <p key={i} className="mt-3 max-w-[62ch] text-[16px] leading-relaxed text-ink-2">
                {rich(p, lang, bot)}
              </p>
            ))}
          </section>
        ))}
      </main>

      <footer className="mx-auto flex w-full max-w-[720px] flex-wrap gap-x-5 gap-y-2 px-4 pb-10 text-[14px] sm:px-8">
        {(["privacy", "terms", "deletion"] as const).map((k) => (
          <a key={k} href={withLang(PATH[k], lang)} className="link" aria-current={k === kind ? "page" : undefined}>
            {nav[k]}
          </a>
        ))}
        <Link href={lang === "uz" ? "/" : `/?lang=${lang}`} prefetch={false} className="link">
          {nav.home}
        </Link>
      </footer>
    </div>
  );
}

export const legalLang = (v: string | string[] | undefined): LegalLang => (v === "ru" || v === "en" ? v : "uz");
