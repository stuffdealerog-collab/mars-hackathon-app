import type { Metadata } from "next";
import { botUsername } from "@/components/ui/bot";
import MiniApp from "./mini-app";

export const metadata: Metadata = {
  title: { absolute: "Mercat" },
  description: "Mercat — Telegram ichidagi marketing bo‘limingiz: kanalni o‘qiydi, postlarni rasmlari bilan yozadi, siz tasdiqlaysiz.",
  robots: { index: false },
};

// Telegram Mini App entry point (opened from the bot's WebApp button / menu button).
export default function TelegramMiniAppPage() {
  return <MiniApp bot={botUsername()} />;
}
