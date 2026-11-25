import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Studio } from "@/components/studio/Studio";
import { botUsername } from "@/components/ui/bot";
import { langOf, META, ogImage, ogLocale } from "@/components/ui/meta";

// The Studio's own title, description and share card, in the language of ?lang= (uz by default).
export async function generateMetadata({ searchParams }: PageProps<"/studio">): Promise<Metadata> {
  const lang = langOf((await searchParams).lang);
  const m = META[lang].studio;
  const og = `${m.title} · Mercat`;
  return {
    title: m.title,
    description: m.description,
    openGraph: { title: og, description: m.description, images: [ogImage(lang)], locale: ogLocale(lang) },
    twitter: { card: "summary_large_image", title: og, description: m.description, images: [ogImage(lang)] },
  };
}

// ?brand=<id>, ?channel=<t.me link>, ?mode=fresh and ?mock=1 are read on the client.
/**
 * The metadata above reads ?lang=, which is request-time data: this marker tells Next the page
 * renders per request, so the title and share card stream in its language instead of blocking.
 */
async function PerRequest() {
  await connection();
  return null;
}

export default function StudioPage() {
  return (
    <>
      <Studio bot={botUsername()} />
      <Suspense>
        <PerRequest />
      </Suspense>
    </>
  );
}
