import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { IntroPreview } from "@/components/onboarding/Preview";

export const metadata: Metadata = { title: "Intro preview", robots: { index: false } };

type Q = Record<string, string | string[] | undefined>;

/** Development only: the shared first-run intro on its own, either variant, either theme. */
export default function IntroPreviewPage({ searchParams }: { searchParams: Promise<Q> }) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={null}>
      <Stage searchParams={searchParams} />
    </Suspense>
  );
}

async function Stage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const variant = q.variant === "phone" ? "phone" : "desktop";
  const theme = q.theme === "light" ? "light" : "dark";
  const lang = q.lang === "ru" || q.lang === "en" ? q.lang : "uz";
  return <IntroPreview variant={variant} theme={theme} lang={lang} />;
}
