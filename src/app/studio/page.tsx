import type { Metadata } from "next";
import { Studio } from "@/components/studio/Studio";
import { botUsername } from "@/components/ui/bot";

export const metadata: Metadata = { title: "Studiya" };

// ?brand=<id>, ?channel=<t.me link>, ?mode=fresh, ?mock=1 and ?lang= are read on the client, so the shell stays static.
export default function StudioPage() {
  return <Studio bot={botUsername()} />;
}
