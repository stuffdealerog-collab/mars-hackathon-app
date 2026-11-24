import "server-only";
import { z } from "zod";
import type { BrandProfile, RadarLead } from "./contract";
import { llmJson, llmWebResearch, MODEL_FAST } from "./llm";

const SEARCH_SYSTEM = `You are "Mijoz radar", the customer-finding employee of an AI marketing department in Uzbekistan.
Use web search to find REAL places where this business's customers already are: Telegram channels and groups,
Instagram bloggers, YouTube channels, events and fairs, marketplaces (Uzum Market, Wildberries UZ, OLX.uz…), websites.
Focus on Uzbekistan (Tashkent first). For each place give: name, URL, why the customers are there, a concrete action
(buy an ad post, partner, DM the admin, list products…), and an audience number ONLY if a search result states it.
Never invent channels, URLs or subscriber counts. Write the notes in Uzbek (Latin).`;

const LeadsSchema = z.object({
  leads: z.array(
    z.object({
      kind: z.enum(["telegram_channel", "telegram_group", "instagram", "youtube", "event", "marketplace", "website", "other"]),
      name: z.string(),
      url: z.string(),
      why: z.string(),
      audienceHint: z.string(),
      action: z.string(),
    }),
  ),
});

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** Web-searched list of places to find customers. Only sourced audience numbers survive. */
export async function findLeads(brand: BrandProfile, goal?: string): Promise<RadarLead[]> {
  const { dna } = brand;
  const research = await llmWebResearch({
    system: SEARCH_SYSTEM,
    prompt: `Business: ${dna.name}\nWhat it does: ${dna.oneLiner}\nAudience: ${dna.audience}\nProducts: ${dna.products.slice(0, 6).join(", ")}\n${
      brand.channel ? `Own Telegram channel: @${brand.channel}\n` : ""
    }Goal: ${goal?.trim() || "find new customers in Uzbekistan"}\n\nFind 6-8 places. Cite the URL for each.`,
    maxUses: 4,
    timeoutMs: 50_000,
  });

  const sourceText = research.sources.map((s) => `${s.title} — ${s.url}`).join("\n");
  const { leads } = await llmJson({
    schema: LeadsSchema,
    system:
      "Convert research notes into structured leads. Keep only places that appear in the notes. " +
      "url: the exact URL from the notes or sources, or empty string. audienceHint: only a number stated in the notes " +
      "(e.g. \"~45k obunachi\"), otherwise empty string. Write why/action in Uzbek (Latin), one short sentence each. Max 8 leads.",
    prompt: `RESEARCH NOTES:\n${research.text.slice(0, 12000)}\n\nSEARCH RESULT URLS:\n${sourceText.slice(0, 6000)}`,
    model: MODEL_FAST,
    effort: "low",
    maxTokens: 4000,
    timeoutMs: 25_000,
  });

  const known = new Set(research.sources.map((s) => hostOf(s.url)));
  const notes = research.text;
  return leads.slice(0, 8).map((l) => {
    const url = l.url.trim();
    const sourced = url && (known.has(hostOf(url)) || notes.includes(url) || /t\.me\//.test(url));
    const hint = l.audienceHint.trim();
    // Keep an audience number only if the same digits appear in the research notes.
    const digits = hint.match(/\d[\d.,]*/)?.[0];
    const hintSourced = hint && digits && notes.includes(digits);
    return {
      kind: l.kind,
      name: l.name,
      ...(sourced ? { url } : {}),
      why: l.why,
      ...(hintSourced ? { audienceHint: hint } : {}),
      action: l.action,
    };
  });
}
