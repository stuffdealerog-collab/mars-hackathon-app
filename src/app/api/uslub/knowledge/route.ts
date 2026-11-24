import { z } from "zod";
import { loadKnowledge, saveKnowledge } from "@/lib/uslub/brain/kbstore";
import { ingestSources } from "@/lib/uslub/brain/knowledge";
import { spendClaude } from "@/lib/uslub/budget";
import { handle, HttpError, json, loadBrandFor, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import type { StoredBrand } from "@/lib/uslub/store";

// Node.js runtime is the default (an explicit `runtime` export is rejected with cacheComponents).
export const maxDuration = 60;

const Product = z.object({
  name: z.string().trim().min(1).max(120),
  price: z.union([z.string().trim().max(40), z.number().nonnegative().max(1e12)]).optional(),
});

const Body = z.object({
  brandId: z.string().trim().min(1).max(100),
  urls: z.array(z.string().trim().min(4).max(500)).max(5).optional(),
  products: z.array(Product).max(50).optional(),
  address: z.string().trim().max(300).optional(),
  landmark: z.string().trim().max(200).optional(),
  hours: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(60).optional(),
  delivery: z.string().trim().max(300).optional(),
  text: z.string().max(8000).optional(),
  initData: z.string().max(8192).optional(),
});

/**
 * Owner knowledge may only be added to the owner's own brand. A channel_only brand
 * is a shared cache of public posts that anyone with its id can read, so private
 * prices or addresses must never be attached to it.
 */
function assertWritable(brand: StoredBrand) {
  if (brand.source === "channel_only") {
    throw new HttpError(409, "Bu brend faqat ochiq kanal postlaridan tuzilgan. Avval bilimlaringiz bilan o‘z brendingizni yarating (POST /api/uslub/brand).", "own_brand_needed");
  }
}

/**
 * POST { brandId, urls?, products?, address?, landmark?, hours?, phone?, delivery?, text? }
 *   -> { sources: [{url?, kind, ok, chars, title?, error?, structured?, transcribed?}], saved, knowledgeChars, kbPreview }
 * Reads Google Docs/Sheets (shared by link), websites (incl. schema.org prices) and PDFs into brand memory.
 */
export const POST = handle(async (req) => {
  rateLimit(req, "brain-knowledge", 6);
  const body = await readJson(req, Body);
  const userId = telegramUserId(req, body.initData);
  const brand = await loadBrandFor(body.brandId, userId);
  assertWritable(brand);
  const hasInput =
    Boolean(body.urls?.length || body.products?.length || body.text?.trim()) ||
    [body.address, body.landmark, body.hours, body.phone, body.delivery].some((v) => v?.trim());
  if (!hasInput) throw new HttpError(400, "Havola, mahsulot/narx yoki manzil yuboring", "knowledge_needed");
  await spendClaude(req, userId, "knowledge");
  const sources = await ingestSources(body);
  const saved = await saveKnowledge(brand.id, sources);
  const kb = await loadKnowledge(brand.id);
  return json({
    sources: sources.map((s) => ({ ...s, text: undefined })),
    saved,
    knowledgeChars: kb.text.length,
    kbPreview: kb.text.slice(0, 600),
  });
});

/** GET ?brandId= -> { sources: [{id, kind, url?, title?, chars, createdAt}], knowledgeChars } */
export const GET = handle(async (req) => {
  rateLimit(req, "brain-knowledge-get", 60);
  const brandId = new URL(req.url).searchParams.get("brandId") ?? "";
  const brand = await loadBrandFor(brandId, telegramUserId(req));
  const kb = await loadKnowledge(brand.id);
  return json({ sources: kb.sources, knowledgeChars: kb.text.length });
});
