import { normalizeUzLatin } from "../translit";
import type { Aspect, CaptionCue } from "./types";

/**
 * Captions are OUR overlay, never pixels from the video model: models garble
 * letters, and Uzbek o‘/g‘ worst of all. The same cues drive
 * - the in-app preview (CSS overlay over <video>, or a WebVTT <track>),
 * - SRT for CapCut / Premiere / Resolve,
 * - an ASS file for burning in with ffmpeg + libass (brand style).
 * Pure module.
 */

export const CAPTION_LIMITS = {
  maxCues: 12,
  maxCharsPerLine: 32, // 9:16 phone screen at a readable size
  maxLines: 2,
  minCueSeconds: 1.2, // shorter than this cannot be read
  maxTextLength: 120,
} as const;

export type CaptionLang = "uz" | "ru" | "en";

/** Uzbek Latin apostrophes -> official ʻ / ʼ; whitespace collapsed; control chars removed. */
export function cleanCaption(text: string, lang: CaptionLang = "uz"): string {
  const t = text
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CAPTION_LIMITS.maxTextLength);
  return lang === "uz" ? normalizeUzLatin(t) : t;
}

/** Greedy word wrap into at most `maxLines` lines; the last line gets an ellipsis if text is cut. */
export function wrapCaption(text: string, maxChars: number = CAPTION_LIMITS.maxCharsPerLine, maxLines: number = CAPTION_LIMITS.maxLines): string[] {
  const words = text.split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars || !cur) {
      cur = next;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1];
  kept[maxLines - 1] = `${last.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
  return kept;
}

/**
 * Spreads caption lines over a clip: time proportional to text length (reading
 * speed), every cue at least `minCueSeconds`, a 0.15 s gap between cues.
 */
export function autoCues(lines: string[], totalSeconds: number, lang: CaptionLang = "uz"): CaptionCue[] {
  const texts = lines.map((l) => cleanCaption(l, lang)).filter(Boolean).slice(0, CAPTION_LIMITS.maxCues);
  if (!texts.length || !(totalSeconds > 0)) return [];
  const gap = 0.15;
  const usable = Math.max(0, totalSeconds - gap * (texts.length - 1));
  const weights = texts.map((t) => Math.max(8, t.length));
  const sum = weights.reduce((a, b) => a + b, 0);
  let durations = weights.map((w) => Math.max(CAPTION_LIMITS.minCueSeconds, (usable * w) / sum));
  const total = durations.reduce((a, b) => a + b, 0);
  if (total > usable) durations = durations.map((d) => (d * usable) / total); // too many lines: compress evenly
  const cues: CaptionCue[] = [];
  let t = 0;
  texts.forEach((text, i) => {
    const start = round2(t);
    const end = round2(Math.min(totalSeconds, t + durations[i]));
    cues.push({ start, end, text });
    t = end + gap;
  });
  return cues;
}

/** Validates and cleans cues (sorted, inside the clip, non-overlapping, non-empty). */
export function normalizeCues(cues: CaptionCue[], totalSeconds: number, lang: CaptionLang = "uz"): CaptionCue[] {
  const out: CaptionCue[] = [];
  const sorted = [...cues].sort((a, b) => a.start - b.start).slice(0, CAPTION_LIMITS.maxCues);
  for (const c of sorted) {
    const text = cleanCaption(c.text, lang);
    if (!text) continue;
    const prevEnd = out.at(-1)?.end ?? 0;
    const start = round2(Math.max(0, c.start, prevEnd));
    const end = round2(Math.min(totalSeconds, c.end));
    if (!(end > start)) continue;
    out.push({ start, end, text });
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function clock(seconds: number, sep: "." | ","): string {
  const ms = Math.round(Math.max(0, seconds) * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(rest, 3)}`;
}

/** WebVTT for a <track kind="captions"> element. "-->" inside text is neutralised. */
export function toWebVtt(cues: CaptionCue[]): string {
  const body = cues
    .map((c, i) => `${i + 1}\n${clock(c.start, ".")} --> ${clock(c.end, ".")}\n${wrapCaption(escapeVtt(c.text)).join("\n")}`)
    .join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}

const escapeVtt = (t: string) => t.replace(/-->/g, "→").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** SubRip for CapCut / Premiere / DaVinci Resolve. */
export function toSrt(cues: CaptionCue[]): string {
  return (
    cues
      .map((c, i) => `${i + 1}\n${clock(c.start, ",")} --> ${clock(c.end, ",")}\n${wrapCaption(c.text.replace(/-->/g, "→")).join("\n")}`)
      .join("\n\n") + "\n"
  );
}

const ASS_SIZE: Record<Aspect, [number, number]> = {
  "9:16": [1080, 1920],
  "16:9": [1920, 1080],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
};

function assClock(seconds: number): string {
  const cs = Math.round(Math.max(0, seconds) * 100);
  const h = Math.floor(cs / 360_000);
  const m = Math.floor((cs % 360_000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const rest = cs % 100;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${h}:${p(m)}:${p(s)}.${p(rest)}`;
}

/** ASS override tags start with "{" and "\N" is a line break: strip both from user text. */
const escapeAss = (t: string) => t.replace(/[{}\\]/g, "");

/**
 * Advanced SubStation Alpha file in the Mercat style: white bold sans on a
 * translucent ink box, lower third, 10% safe margins. Burn in with
 *   ffmpeg -i clip.mp4 -vf "subtitles=captions.ass" -c:a copy out.mp4
 * (needs an ffmpeg built with libass; Inter or Manrope installed, else Arial).
 */
export function toAss(cues: CaptionCue[], aspect: Aspect = "9:16", font = "Inter"): string {
  const [w, h] = ASS_SIZE[aspect];
  const size = Math.round(w * (aspect === "16:9" ? 0.034 : 0.056));
  const marginV = Math.round(h * (aspect === "16:9" ? 0.08 : 0.14));
  const marginH = Math.round(w * 0.1);
  // ASS colours are &HAABBGGRR (alpha 00 = opaque). Box: ink #13151C at ~40% transparency.
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Mercat,${font},${size},&H00FFFFFF,&H00FFFFFF,&H661C1513,&H661C1513,-1,0,0,0,100,100,0,0,3,${Math.round(size * 0.35)},0,2,${marginH},${marginH},${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events = cues.map(
    (c) => `Dialogue: 0,${assClock(c.start)},${assClock(c.end)},Mercat,,0,0,0,,${wrapCaption(escapeAss(c.text)).join("\\N")}`,
  );
  return [...header, ...events, ""].join("\n");
}
