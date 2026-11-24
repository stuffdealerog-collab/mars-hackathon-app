import type { Metadata, Viewport } from "next";
import { onest } from "@/components/ui/font";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_URL ?? "https://mercat-ai.vercel.app"),
  title: { default: "Mercat — Telegram kanalingiz uchun postlar", template: "%s · Mercat" },
  description:
    "Telegram kanalingiz havolasini qo‘ying: Mercat kanalni o‘qiydi, nimani tuzatish kerakligini raqamlar bilan ko‘rsatadi va bir haftalik postlarni rasmlari bilan tayyorlaydi. Siz faqat tasdiqlaysiz.",
  openGraph: {
    title: "Mercat — kanalingizga postlarni Mercat yozadi",
    description: "Havolani qo‘ying: kanal tahlili, haftalik reja va rasmli postlar. Siz faqat tasdiqlaysiz.",
    // The image is src/app/opengraph-image.png (brand kit): Next adds it to every page.
  },
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
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
