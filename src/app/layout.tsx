import type { Metadata, Viewport } from "next";
import { Manrope, Unbounded } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});

const unbounded = Unbounded({
  subsets: ["latin", "cyrillic"],
  variable: "--font-unbounded",
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
  themeColor: "#faf7f2",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="uz" className={`h-full antialiased ${manrope.variable} ${unbounded.variable}`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
