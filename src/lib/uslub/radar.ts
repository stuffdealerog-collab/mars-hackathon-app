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

/** One web-search pass + structuring. Only sourced URLs and audience numbers survive. */
async function researchPass(prompt: string, maxUses: number, timeoutMs: number): Promise<RadarLead[]> {
  const research = await llmWebResearch({ system: SEARCH_SYSTEM, prompt, maxUses, timeoutMs });
  if (!research.text && !research.sources.length) return [];

  const sourceText = research.sources.map((s) => `${s.title} — ${s.url}`).join("\n");
  const { leads } = await llmJson({
    schema: LeadsSchema,
    system:
      "Convert research notes into structured leads. Keep only places that appear in the notes or search results. " +
      "url: the exact URL from the notes or sources, or empty string. audienceHint: only a number stated in the notes " +
      "(e.g. \"~45k obunachi\"), otherwise empty string. Write why/action in Uzbek (Latin), one short sentence each. Max 8 leads.",
    prompt: `RESEARCH NOTES:\n${research.text.slice(0, 12000) || "(none)"}\n\nSEARCH RESULT URLS:\n${sourceText.slice(0, 6000) || "(none)"}`,
    model: MODEL_FAST,
    effort: "low",
    maxTokens: 4000,
    timeoutMs: 20_000,
  });

  const known = new Set(research.sources.map((s) => hostOf(s.url)));
  const notes = research.text;
  return leads.slice(0, 8).map((l) => {
    const raw = l.url.trim();
    const url = raw && !/^https?:\/\//i.test(raw) ? `https://${raw.toLowerCase()}` : raw;
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

const leadKey = (l: RadarLead) => (l.url ? hostOf(l.url) + new URL(l.url).pathname.toLowerCase() : l.name.toLowerCase());

/** Merges lead lists, dropping duplicates by URL (or name when there is no URL). */
export function mergeLeads(a: RadarLead[], b: RadarLead[], max = 8): RadarLead[] {
  const seen = new Set<string>();
  const out: RadarLead[] = [];
  for (const l of [...a, ...b]) {
    let key: string;
    try {
      key = leadKey(l);
    } catch {
      key = l.name.toLowerCase();
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
    if (out.length >= max) break;
  }
  return out;
}

export const RADAR_FAILED_REASON = "Radar hozir ishlamadi (qidiruv xizmati javob bermadi). Birozdan keyin qayta urinib ko‘ring.";

export const RADAR_EMPTY_REASON =
  "Radar ochiq manbalarda mos kanal yoki guruh topa olmadi. Maqsadni aniqroq yozing (masalan: «Toshkentdagi yosh onalar») va qayta urinib ko‘ring.";

/**
 * Web-searched list of places to find customers. If the first pass finds fewer
 * than 3 places, a broader niche + city pass runs (uz/ru keywords). Never empty
 * without a reason the UI can show.
 */
export async function findLeads(brand: BrandProfile, goal?: string): Promise<{ leads: RadarLead[]; reason?: string }> {
  const { dna } = brand;
  let failures = 0;
  const first = await researchPass(
    `Business: ${dna.name}\nWhat it does: ${dna.oneLiner}\nAudience: ${dna.audience}\nProducts: ${dna.products.slice(0, 6).join(", ")}\n${
      brand.channel ? `Own Telegram channel: @${brand.channel}\n` : ""
    }Goal: ${goal?.trim() || "find new customers in Uzbekistan"}\n\nFind 6-8 places. Cite the URL for each.`,
    4,
    35_000,
  ).catch((err) => {
    failures++;
    console.warn("[uslub/radar] first pass failed:", err instanceof Error ? err.message : err);
    return [] as RadarLead[];
  });
  if (first.length >= 3) return { leads: first };

  // Broader pass: niche + city with common Uzbek/Russian discovery keywords.
  const niche = [dna.oneLiner, dna.products.slice(0, 3).join(", ")].filter(Boolean).join("; ").slice(0, 200);
  const second = await researchPass(
    `Niche: ${niche}\nCity: Toshkent (Ташкент), Uzbekistan.\n` +
      `Search broadly with queries such as: "${dna.name} toshkent telegram kanal", "toshkent telegram kanal ${dna.products[0] ?? ""}", ` +
      `"ташкент телеграм канал ${dna.products[0] ?? ""}", "toshkent instagram bloger", "ташкент блогер", "toshkent guruh", ` +
      `"ташкент чат группа", "toshkent ko‘rgazma 2026".\nList 5-8 real places (channels, groups, bloggers, events, marketplaces) with URLs.`,
    5,
    35_000,
  ).catch((err) => {
    failures++;
    console.warn("[uslub/radar] broad pass failed:", err instanceof Error ? err.message : err);
    return [] as RadarLead[];
  });
  const leads = mergeLeads(first, second);
  if (leads.length) return { leads };
  return { leads: [], reason: failures === 2 ? RADAR_FAILED_REASON : RADAR_EMPTY_REASON };
}
