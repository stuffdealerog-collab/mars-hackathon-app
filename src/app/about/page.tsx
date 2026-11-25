import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { About } from "@/components/about/About";
import { TractionSlot } from "@/components/about/TractionSlot";
import { botUsername } from "@/components/ui/bot";
import { langOf, META, ogImage, ogLocale } from "@/components/ui/meta";

// "How Mercat works": the title, description and share card follow ?lang= (uz by default).
export async function generateMetadata({ searchParams }: PageProps<"/about">): Promise<Metadata> {
  const lang = langOf((await searchParams).lang);
  const m = META[lang].about;
  const og = `${m.title} · Mercat`;
  return {
    title: m.title,
    description: m.description,
    openGraph: { title: og, description: m.description, images: [ogImage(lang)], locale: ogLocale(lang) },
    twitter: { card: "summary_large_image", title: og, description: m.description, images: [ogImage(lang)] },
  };
}

/**
 * The metadata above reads ?lang=, which is request-time data: this marker tells Next the page
 * renders per request, so the title and share card stream in its language instead of blocking.
 */
async function PerRequest() {
  await connection();
  return null;
}

export default function AboutPage() {
  return (
    <>
      <About
        bot={botUsername()}
        // The live counts under the lead: read on the server, streamed with the page, nothing when there is none.
        traction={
          <Suspense fallback={null}>
            <TractionSlot className="mt-8" withNote />
          </Suspense>
        }
      />
      <Suspense>
        <PerRequest />
      </Suspense>
    </>
  );
}
