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
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Mercat" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(min-width: 1024px)", color: "#171513" },
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
