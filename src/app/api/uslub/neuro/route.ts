import { z } from "zod";
import { cleanText } from "@/lib/uslub/editor";
import { spendClaude } from "@/lib/uslub/budget";
import { handle, json, rateLimit, readJson, telegramUserId } from "@/lib/uslub/http";
import { analyzeNeuro } from "@/lib/uslub/neuro";
import { labsGate } from "@/lib/ops/labs";

export const maxDuration = 60;

const Body = z.object({
  text: z.string().min(1).max(6000),
  script: z.enum(["uz_latn", "uz_cyrl", "ru", "en"]),
  /** false = detect only (no AI call). Default true. */
  rewrite: z.boolean().optional(),
});

/**
 * POST { text, script, rewrite? } ->
 *   { text (cleaned), hits (found in the ORIGINAL), removed, remaining (still in the cleaned text),
 *     humanScoreBefore, humanScore (after), mode: "unchanged" | "rewrite" | "deletion" }
 * The editor never adds facts: a rewrite that invents numbers/dates/promos is replaced by a deletion-only edit.
 */
export const POST = handle(async (req) => {
  const closed = labsGate("neuro"); // no screen calls this route: 404 unless LABS_ROUTES names it
  if (closed) return closed;
  rateLimit(req, "neuro", 30);
  const body = await readJson(req, Body);
  if (body.rewrite === false) {
    const a = analyzeNeuro(body.text, body.script);
    return json({
      text: body.text,
      hits: a.hits,
      removed: [],
      remaining: a.hits,
      humanScoreBefore: a.humanScore,
      humanScore: a.humanScore,
      mode: "unchanged",
    });
  }
  await spendClaude(req, telegramUserId(req), "neuro");
  return json(await cleanText(body.text, body.script));
});
