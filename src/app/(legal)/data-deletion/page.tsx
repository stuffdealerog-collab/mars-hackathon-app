import type { Metadata } from "next";
import { Suspense } from "react";
import { readConnectorConfig } from "@/lib/connectors/config";
import { verifyDeletionCode } from "@/lib/connectors/signed-request";
import { LEGAL } from "../content";
import { LegalPage, legalLang } from "../LegalPage";

// Meta's "Data deletion instructions URL"; ?code= is the confirmation code our data-deletion callback returned. The
// page confirms a deletion only for a code Mercat issued (signed with the Meta app secret); any other code is "not
// found", never a made-up confirmation.
export async function generateMetadata({ searchParams }: PageProps<"/data-deletion">): Promise<Metadata> {
  const d = LEGAL.deletion[legalLang((await searchParams).lang)];
  return { title: d.title, description: d.description };
}

async function Body({ searchParams }: { searchParams: PageProps<"/data-deletion">["searchParams"] }) {
  const q = await searchParams;
  const code = typeof q.code === "string" && /^[A-Za-z0-9_.-]{6,48}$/.test(q.code) ? q.code : null;
  const request = code ? { code, known: verifyDeletionCode(code, readConnectorConfig(process.env).meta.appSecret) } : null;
  return <LegalPage kind="deletion" lang={legalLang(q.lang)} request={request} />;
}

export default function DataDeletionPage({ searchParams }: PageProps<"/data-deletion">) {
  return (
    <Suspense fallback={null}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}
