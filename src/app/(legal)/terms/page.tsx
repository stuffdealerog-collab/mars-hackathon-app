import type { Metadata } from "next";
import { Suspense } from "react";
import { LEGAL } from "../content";
import { LegalPage, legalLang } from "../LegalPage";

export async function generateMetadata({ searchParams }: PageProps<"/terms">): Promise<Metadata> {
  const d = LEGAL.terms[legalLang((await searchParams).lang)];
  return { title: d.title, description: d.description };
}

async function Body({ searchParams }: { searchParams: PageProps<"/terms">["searchParams"] }) {
  return <LegalPage kind="terms" lang={legalLang((await searchParams).lang)} />;
}

export default function TermsPage({ searchParams }: PageProps<"/terms">) {
  return (
    <Suspense fallback={null}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}
