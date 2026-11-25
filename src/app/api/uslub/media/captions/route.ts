import { z } from "zod";
import { handle, json, rateLimit, readJson } from "@/lib/uslub/http";
import { autoCues, normalizeCues, toAss, toSrt, toWebVtt } from "@/lib/uslub/media/captions";
import { labsGate } from "@/lib/ops/labs";

const Cue = z.object({ start: z.number().min(0).max(600), end: z.number().min(0).max(600), text: z.string().max(200) });

const Body = z
  .object({
    lines: z.array(z.string().max(200)).max(12).optional(), // auto-timed over `seconds`
    cues: z.array(Cue).max(12).optional(), // or exact timings
    seconds: z.number().min(1).max(600),
    lang: z.enum(["uz", "ru", "en"]).default("uz"),
    aspect: z.enum(["9:16", "16:9", "1:1", "4:5"]).default("9:16"),
    format: z.enum(["json", "vtt", "srt", "ass"]).default("json"),
  })
  .refine((b) => Boolean(b.lines?.length || b.cues?.length), { message: "send lines or cues" });

const TYPES = { vtt: "text/vtt; charset=utf-8", srt: "application/x-subrip; charset=utf-8", ass: "text/x-ssa; charset=utf-8" } as const;

/**
 * POST { lines | cues, seconds, lang?, aspect?, format? }
 *   format=json -> { cues }  (for the CSS overlay over <video>)
 *   format=vtt|srt|ass -> caption file (WebVTT track, editor import, ffmpeg burn-in)
 * Captions are always our overlay: video models garble Uzbek letters.
 */
export const POST = handle(async (req) => {
  const closed = labsGate("media/captions"); // no screen calls this route: 404 unless LABS_ROUTES names it
  if (closed) return closed;
  rateLimit(req, "media_captions", 30);
  const b = await readJson(req, Body);
  const cues = b.cues?.length ? normalizeCues(b.cues, b.seconds, b.lang) : autoCues(b.lines ?? [], b.seconds, b.lang);
  if (b.format === "json") return json({ cues });
  const text = b.format === "vtt" ? toWebVtt(cues) : b.format === "srt" ? toSrt(cues) : toAss(cues, b.aspect);
  return new Response(text, { headers: { "Content-Type": TYPES[b.format], "Cache-Control": "no-store" } });
});
