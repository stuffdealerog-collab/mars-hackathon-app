import type { Metadata } from "next";
import { Suspense } from "react";
import { LEGAL } from "../content";
import { LegalPage, legalLang } from "../LegalPage";

// Meta's "Data deletion instructions URL"; ?code= is the confirmation code our data-deletion callback returned.
export async function generateMetadata({ searchParams }: PageProps<"/data-deletion">): Promise<Metadata> {
  const d = LEGAL.deletion[legalLang((await searchParams).lang)];
  return { title: d.title, description: d.description };
}

async function Body({ searchParams }: { searchParams: PageProps<"/data-deletion">["searchParams"] }) {
  const q = await searchParams;
  const code = typeof q.code === "string" && /^[A-Za-z0-9_-]{6,32}$/.test(q.code) ? q.code : null;
  return <LegalPage kind="deletion" lang={legalLang(q.lang)} code={code} />;
}

export default function DataDeletionPage({ searchParams }: PageProps<"/data-deletion">) {
  return (
    <Suspense fallback={null}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}
