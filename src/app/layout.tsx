import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MARS Hackathon App", template: "%s · MARS Hackathon App" },
  description: "Telegram-first product built at the MARS AI Hackathon in Tashkent.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
