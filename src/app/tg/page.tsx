import type { Metadata } from "next";
import { botUsername } from "@/components/ui/bot";
import MiniApp from "./mini-app";

export const metadata: Metadata = { title: "Mini App", robots: { index: false } };

// Telegram Mini App entry point (opened from the bot's WebApp button / menu button).
export default function TelegramMiniAppPage() {
  return <MiniApp bot={botUsername()} />;
}
