import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Analytics } from "@/components/analytics/Analytics";
import { onest } from "@/components/ui/font";
import { META, ogImage } from "@/components/ui/meta";
import "./globals.css";

// Defaults for every page (Uzbek); / and /studio give their own per ?lang= (generateMetadata).
// The share card is the brand kit's public/brand/og-<lang>.png, set here and per page, not as a
// file-based opengraph-image, which would override the per-language ones.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_URL ?? "https://mercat-ai.vercel.app"),
  title: { default: META.uz.landing.title, template: "%s · Mercat" },
  description: META.uz.landing.description,
  openGraph: { title: META.uz.landing.ogTitle, description: META.uz.landing.ogDescription, images: [ogImage("uz")], siteName: "Mercat" },
  twitter: { card: "summary_large_image", title: META.uz.landing.ogTitle, description: META.uz.landing.ogDescription, images: [ogImage("uz")] },
};

// The browser's own chrome matches what the page shows: the warm graphite room on a computer
// (.desk, from 64rem: the same unit as Tailwind's lg), the black stage on phones and in Telegram.
export const viewport: Viewport = {
  themeColor: [
    { media: "(min-width: 64rem)", color: "#171513" },
    { color: "#000000" },
  ],
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="uz" className={`h-full antialiased ${onest.variable}`}>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        {/* Visit counters (GA4, Metrica): production, landing page only, never see ?query or #fragment.
            Suspense: usePathname may suspend under cacheComponents once a route has dynamic params. */}
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
      </body>
    </html>
  );
}
