import "server-only";
import { getAnthropic } from "@/lib/uslub/llm";
import { SONNET, wellFormed } from "./llm";
import type { LedgerEntry } from "./types";

/**
 * Web context (spec A2.3): one Sonnet call with server-side web search, plain text
 * (citations do not mix with structured outputs). Only cited sentences survive,
 * each as a W# ledger entry with its URL and the exact cited text. Never blocks the
 * plan: only the strategist waits for it (15 s budget), and any failure returns [].
 */
const SYSTEM = `You research the local market for a small business in Tashkent, Uzbekistan, for its weekly Telegram plan.
Use web search (at most 2 searches). Search for the business by name with "Tashkent", and for "<category> Tashkent" prices or offers (Uzbek or Russian queries work best, e.g. "tort narxi Toshkent", "торт цена Ташкент"). Report only facts that appear in search results; every sentence must rest on a cited source.
Look for: (1) prices and current offers of competitors in this category in Tashkent, (2) dated events in Tashkent in the next 14 days that matter to this category, (3) public facts about this business (address, ratings, reviews) if any.
Short factual sentences. No advice, no opinions. If nothing relevant is found, say so in one sentence. Write in English.`;

export async function webContext(
  q: { brandName: string; category: string; channel?: string; competitors?: string[]; now: number },
  timeoutMs = 15_000,
): Promise<LedgerEntry[]> {
  const today = new Date(q.now + 5 * 3_600_000).toISOString().slice(0, 10);
  const prompt = wellFormed(
    `Business: ${q.brandName} (${q.category || "small business"}), Tashkent.${q.channel ? ` Telegram: @${q.channel.replace(/^@/, "")}.` : ""}${
      q.competitors?.length ? ` Competitors: ${q.competitors.map((c) => `@${c.replace(/^@/, "")}`).join(", ")}.` : ""
    } Today: ${today}.`,
  );
  try {
    const res = await getAnthropic().beta.messages.create(
      {
        model: SONNET,
        max_tokens: 3000,
        output_config: { effort: "low" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM,
        tools: [
          {
            // The basic variant: the dynamic-filtering one (_20260209) spent its uses in code execution and returned no citations.
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 2,
            user_location: { type: "approximate", city: "Tashkent", timezone: "Asia/Tashkent" },
          },
        ],
        messages: [{ role: "user", content: prompt }],
      },
      { timeout: timeoutMs, maxRetries: 0 },
    );
    if (res.stop_reason === "refusal") return [];
    const seen = new Set<string>();
    const out: LedgerEntry[] = [];
    for (const block of res.content) {
      if (block.type !== "text" || !block.citations) continue;
      for (const c of block.citations) {
        if (c.type !== "web_search_result_location" || !c.url || !c.cited_text) continue;
        const quote = c.cited_text.replace(/\s+/g, " ").trim();
        const key = `${c.url}|${quote.slice(0, 80)}`;
        if (seen.has(key) || quote.length < 12) continue;
        seen.add(key);
        out.push({
          id: `W${out.length + 1}`,
          label: `${c.title ?? new URL(c.url).hostname}: ${block.text.trim().slice(0, 160)}`,
          value: quote,
          display: Array.from(quote).slice(0, 220).join(""),
          url: c.url,
          quote,
          source: "web",
        });
        if (out.length >= 8) return out;
      }
    }
    return out;
  } catch (err) {
    console.warn("[brain/web] web context skipped", err instanceof Error ? err.message : err);
    return [];
  }
}
