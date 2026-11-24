import { z } from "zod";
import { cleanText } from "@/lib/uslub/editor";
import { handle, json, rateLimit, readJson } from "@/lib/uslub/http";
import { analyzeNeuro } from "@/lib/uslub/neuro";

export const maxDuration = 45;

const Body = z.object({
  text: z.string().min(1).max(6000),
  script: z.enum(["uz_latn", "uz_cyrl", "ru", "en"]),
  /** false = detect only (no AI call). Default true. */
  rewrite: z.boolean().optional(),
});

/** POST { text, script } -> { text, hits, humanScore } (text is the cleaned version). */
export const POST = handle(async (req) => {
  rateLimit(req, "neuro", 30);
  const body = await readJson(req, Body);
  if (body.rewrite === false) {
    return json({ text: body.text, ...analyzeNeuro(body.text, body.script) });
  }
  const before = analyzeNeuro(body.text, body.script);
  const result = await cleanText(body.text, body.script);
  return json({ ...result, before });
});
