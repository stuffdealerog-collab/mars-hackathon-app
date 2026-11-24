import { existsSync, readdirSync, readFileSync } from "node:fs";
import type { Niche } from "../../../src/lib/uslub/brain/bench";
import type { ChannelData } from "../../../src/lib/uslub/brain/types";

/** A golden channel frozen at capture time: trimmed t.me/s data (post text ≤ 500 chars). */
export interface Fixture {
  handle: string;
  niche: Niche;
  capturedAt: string;
  data: ChannelData;
}

export const FIXTURE_DIR = new URL("./fixtures/", import.meta.url);

export function loadFixtures(): Fixture[] {
  if (!existsSync(FIXTURE_DIR)) return [];
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(new URL(f, FIXTURE_DIR), "utf8")) as Fixture);
}

/** The channel's own public posts as the knowledge base (what a "paste a link" user gives us). */
export function kbFromPosts(data: ChannelData, max = 12): string {
  return data.posts
    .filter((p) => !p.isForward && p.text.trim().length > 40)
    .slice(0, max)
    .map((p) => p.text.trim())
    .join("\n\n---\n\n");
}
