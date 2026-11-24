import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-jbmono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Uslub AI — AI marketing bo'limi", template: "%s · Uslub AI" },
  description:
    "Kichik biznes uchun AI marketing bo'limi: brend ovozi, 4 yozuvda postlar, Reels ssenariysi va mijozlar qayerdaligi. Siz faqat tasdiqlaysiz.",
  openGraph: {
    title: "Uslub AI — butun marketing bo'limi bir havolada",
    description: "Telegram kanalingiz havolasini bering: 60 soniyada brend DNK, haftalik postlar va mijozlar ro'yxati.",
    images: ["/generated/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#050506",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="uz" className={`h-full antialiased ${manrope.variable} ${mono.variable}`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
