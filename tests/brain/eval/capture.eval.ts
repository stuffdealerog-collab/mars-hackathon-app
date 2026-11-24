import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type ChannelSummary, type Niche, summarize } from "../../../src/lib/uslub/brain/bench";
import { scrapeChannelData } from "../../../src/lib/uslub/brain/scrape";
import { computeStats } from "../../../src/lib/uslub/brain/stats";
import { channelValidity } from "../../../src/lib/uslub/brain/validity";
import { FIXTURE_DIR, type Fixture } from "./fixtures";

/**
 * Freezes the golden channels (CAPTURE=1): one polite t.me/s scrape each (≤4 pages), trimmed
 * fixtures for the evals, and the text-free niche summaries committed as the benchmark seed.
 */
const golden = JSON.parse(readFileSync(new URL("./golden.json", import.meta.url), "utf8")) as { channels: { handle: string; niche: Niche }[] };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!process.env.CAPTURE)("capture golden channels", () => {
  it("scrapes, validates and writes fixtures + bench seed", async () => {
    mkdirSync(FIXTURE_DIR, { recursive: true });
    const now = Date.now();
    const summaries: ChannelSummary[] = [];
    const report: string[] = [];
    for (const g of golden.channels) {
      try {
        const data = await scrapeChannelData(g.handle, { maxPosts: 60, maxPages: 4, now });
        const v = channelValidity(data, now, { role: "competitor", serviceTexts: data.serviceTexts });
        if (!v.ok) {
          report.push(`skip @${g.handle}: ${v.code}`);
          continue;
        }
        const trimmed = { ...data, posts: data.posts.map((p) => ({ ...p, text: Array.from(p.text).slice(0, 500).join("") })) };
        const fx: Fixture = { handle: data.channel, niche: g.niche, capturedAt: new Date(now).toISOString(), data: trimmed };
        writeFileSync(new URL(`${data.channel.toLowerCase()}.json`, FIXTURE_DIR), JSON.stringify(fx));
        const stats = computeStats(data, now);
        summaries.push(summarize(stats, g.niche, new Date(now).toISOString()));
        report.push(`ok @${data.channel}: ${data.posts.length} posts, ${data.subscribers ?? "?"} subs, mature ${stats.maturePosts}`);
      } catch (err) {
        report.push(`fail @${g.handle}: ${err instanceof Error ? err.message : String(err)}`);
      }
      await sleep(700);
    }
    writeFileSync(new URL("../../../src/lib/uslub/brain/bench-seed.json", import.meta.url), `${JSON.stringify(summaries, null, 1)}\n`);
    console.log(report.join("\n"));
    expect(summaries.length).toBeGreaterThan(0);
  });
});
