import type { Metadata } from "next";
import { Suspense } from "react";
import { LEGAL } from "../content";
import { LegalPage, legalLang } from "../LegalPage";

// Required by Meta App Review and Google OAuth verification (the consent screen and the app settings link here).
export async function generateMetadata({ searchParams }: PageProps<"/privacy">): Promise<Metadata> {
  const d = LEGAL.privacy[legalLang((await searchParams).lang)];
  return { title: d.title, description: d.description };
}

async function Body({ searchParams }: { searchParams: PageProps<"/privacy">["searchParams"] }) {
  return <LegalPage kind="privacy" lang={legalLang((await searchParams).lang)} />;
}

export default function PrivacyPage({ searchParams }: PageProps<"/privacy">) {
  return (
    <Suspense fallback={null}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}
