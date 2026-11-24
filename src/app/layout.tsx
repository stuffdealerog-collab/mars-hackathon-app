import type { Metadata, Viewport } from "next";
import { onest } from "@/components/lamp/font";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_URL ?? "https://mercat-ai.vercel.app"),
  title: { default: "Mercat — marketing bo‘limi bir havoladan", template: "%s · Mercat" },
  description:
    "Telegram kanalingiz havolasini bering: 10 ta AI xodim kanalni o‘qiydi va bir daqiqada brend ovozi, bir haftalik postlar, Reels ssenariysi va mijozlaringiz turgan joylarni tayyorlaydi. Siz faqat tasdiqlaysiz.",
  openGraph: {
    title: "Mercat — bir havola, butun marketing bo‘limi",
    description: "Kanal havolasini bering: bir daqiqada brend ovozi, haftalik postlar va mijozlaringiz qayerdaligi.",
    images: ["/generated/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="uz" className={`h-full antialiased ${onest.variable}`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
