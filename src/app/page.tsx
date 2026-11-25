import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { TractionSlot } from "@/components/about/TractionSlot";
import { Landing } from "@/components/landing/Landing";
import { botUsername } from "@/components/ui/bot";
import { langOf, META, ogImage, ogLocale } from "@/components/ui/meta";

// The title, description and share card follow ?lang= (uz by default).
export async function generateMetadata({ searchParams }: PageProps<"/">): Promise<Metadata> {
  const lang = langOf((await searchParams).lang);
  const m = META[lang].landing;
  return {
    title: { absolute: m.title },
    description: m.description,
    openGraph: { title: m.ogTitle, description: m.ogDescription, images: [ogImage(lang)], locale: ogLocale(lang) },
    twitter: { card: "summary_large_image", title: m.ogTitle, description: m.ogDescription, images: [ogImage(lang)] },
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

export default function Home() {
  return (
    <>
      <Landing
        bot={botUsername()}
        // The live count beside Learn more: read on the server, streamed with the page, nothing when there is none.
        traction={
          <Suspense fallback={null}>
            <TractionSlot kinds={["people"]} dot={2.5} />
          </Suspense>
        }
      />
      <Suspense>
        <PerRequest />
      </Suspense>
    </>
  );
}
