import { z } from "zod";
import { polishUzLatin } from "../translit";
import { toBase64, type ImageBytes } from "./images";
import type { StyleLang, StyleWords, VisualStyleWithWords } from "./words";

/**
 * Claude vision reads the channel's recent photos (and the owner's) and returns the brand's
 * picture style: which photos are representative, palette, light, composition, props, mood,
 * what to avoid, and one English paragraph an image model can follow; plus the same style in the
 * owner's words in Uzbek, Russian and English for the Studio (`ownerText`, see words.ts).
 * Prompt building and normalisation are pure (unit-tested); `analyzeStyle` makes the call.
 */

export const IMAGE_KINDS = ["product", "food", "place", "people", "process", "graphic", "text", "screenshot", "other"] as const;

const OwnerWordsSchema = z.object({
  summary: z.string().describe("One or two short sentences: how their photos look"),
  light: z.string().describe("A few words"),
  composition: z.string().describe("A few words: framing and angle"),
  mood: z.string().describe("A few words"),
  avoid: z.array(z.string()).describe("What never appears in their photos, up to 6 short items, starting with text and logos"),
});

export const StyleAnalysisSchema = z.object({
  images: z
    .array(
      z.object({
        index: z.number().int().describe("Image number as labelled, starting at 1"),
        kind: z.enum(IMAGE_KINDS),
        keep: z.boolean().describe("true = a real photo that shows how this business pictures what it sells"),
      }),
    )
    .describe("One entry per image shown, in order"),
  palette: z.array(z.string()).describe("3-6 dominant colours of the kept photos as #rrggbb"),
  light: z.string().describe("Light in a few words, e.g. 'soft window daylight from the left, warm'"),
  composition: z.string().describe("Framing and angle, e.g. 'close-up of one product on a wooden table, 45 degrees'"),
  props: z.array(z.string()).describe("Recurring surfaces, backgrounds and objects, up to 8"),
  mood: z.string(),
  avoid: z.array(z.string()).describe("Things never in their photos or that would look wrong next to them, up to 8"),
  prompt: z
    .string()
    .describe("One English paragraph (40-90 words) describing the photo style for an image model; no brand names, no text in the picture"),
  ownerText: z
    .object({
      uz: OwnerWordsSchema.describe("Uzbek, Latin script"),
      ru: OwnerWordsSchema.describe("Russian"),
      en: OwnerWordsSchema.describe("English"),
    })
    .describe("The same style explained to the business owner, written natively in each language"),
});

export type StyleAnalysis = z.infer<typeof StyleAnalysisSchema>;

export interface AnalysisImage {
  img: ImageBytes;
  source: "channel" | "owner";
  label: string; // e.g. "channel post 2026-11-20" or "owner photo"
}

export interface BrandBrief {
  name: string;
  oneLiner: string;
  products: string[];
  knowledge: string;
  mode: "channel" | "fresh";
}

/** Shared by both system prompts: the owner-facing text the Studio shows (the prompt stays for the image model). */
const OWNER_WORDS = `"ownerText" explains the same style to the business owner, who reads it in the app in Uzbek (Latin script), Russian or English. Write each language as a local photographer would say it to the owner, not as a word-for-word translation of the English fields: short plain phrases ("deraza yonidan tushgan kunduzgi yorugʻ", "мягкий дневной свет из окна"), no image-model or camera jargon (no "prompt", "render", "bokeh", lens names), no marketing words or clichés ("unique", "atmosphere of comfort", "премиальный"), no business name. "summary" is one or two short sentences on how their photos look; "light", "composition" and "mood" are a few words each; "avoid" starts with text and logos. Uzbek uses oʻ and gʻ.`;

export const ANALYSIS_SYSTEM = `You are the photo editor of a small business's Telegram channel in Uzbekistan.
You describe how the business's pictures look so an image model can make NEW photos that look like they were taken by the same person for the same channel.

For every image decide "keep": true only for a real photograph that shows how this business pictures its products, food, place, work or people.
Set keep false for maps, screenshots, price lists, menus, posters or cards that are mostly text, logos on a plain background, memes and collages.
Photos the owner added are their own choice: keep them unless they are not photos at all.

Describe only the kept photos. Use plain concrete visual words (light, surfaces, colours, angle, lens feel, how busy the frame is), never marketing words.
"prompt" describes the channel's photo STYLE, not one photo: it is combined with a different subject every time (a new dish, a different product), so never describe one specific product or scene. Say how any of their products is photographed: light, backgrounds and surfaces, styling and props, colours, camera angle and distance, photo quality. If they use two or three distinct setups, name them ("either a white table set for guests or dark satin with marble").
"prompt" must not mention the business name, logos, signs or any text. If the kept photos are amateur phone photos, say so: the new pictures must match that, not look like glossy studio or "AI art".
"avoid" always includes "text, letters or logos in the picture" and lists what is clearly absent from their photos (e.g. "neon light", "people's faces", "studio white background").

${OWNER_WORDS}`;

const FRESH_SYSTEM = `You are the photo editor for a new small business in Uzbekistan that has no channel photos yet.
From the business description choose ONE photo style for its Telegram posts: real, believable photographs a good local photographer would take with natural light, fitting this kind of business and its customers.
Never glossy 3D renders, illustrations, neon or "AI art". Use plain concrete visual words.
"prompt" is one English paragraph (40-90 words) for an image model, without the business name, logos or any text in the picture.
"avoid" always includes "text, letters or logos in the picture". "images" is an empty list.

${OWNER_WORDS}`;

/** The user turn: labelled images, then the brand description. */
export function buildAnalysisContent(images: AnalysisImage[], brand: BrandBrief) {
  const blocks: (
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: ImageBytes["type"]; data: string } }
  )[] = [];
  images.forEach((im, i) => {
    blocks.push({ type: "text", text: `Image ${i + 1} (${im.label}):` });
    blocks.push({ type: "image", source: { type: "base64", media_type: im.img.type, data: toBase64(im.img) } });
  });
  const about = [
    `Business: ${brand.name}`,
    brand.oneLiner && `What it does: ${brand.oneLiner}`,
    brand.products.length ? `Products: ${brand.products.slice(0, 12).join(", ")}` : "",
    brand.knowledge && `Owner's description: ${brand.knowledge.slice(0, 1500)}`,
  ]
    .filter(Boolean)
    .join("\n");
  blocks.push({
    type: "text",
    text: images.length
      ? `${about}\n\nThere are ${images.length} images above. Judge each one, then describe the style of the kept photos.`
      : `${about}\n\nThere are no photos. Choose the style from the description.`,
  });
  return blocks;
}

const HEX_RE = /^#[0-9a-f]{6}$/i;
const clip = (s: string, n: number) =>
  s
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'{[\s]+|["'}\]\s]+$/g, "") // models sometimes leave a stray quote or brace at the ends
    .slice(0, n);
const ALWAYS_AVOID = "text, letters or logos in the picture";

/** The owner-facing "no text" rule in each language, added when the model left it out. */
const NO_TEXT: Record<StyleLang, { re: RegExp; text: string }> = {
  uz: { re: /yozuv|harf|logo/i, text: "Rasm ichida yozuv va logotip" },
  ru: { re: /надпис|текст|букв|логот/i, text: "Надписи и логотипы на картинке" },
  en: { re: /text|letter|logo/i, text: "Text, letters or logos in the picture" },
};

/** Short, clean owner text; Uzbek gets the official oʻ/gʻ (before clipping, so "yorug'" keeps its sign). */
function ownerWords(w: StyleWords, lang: StyleLang): StyleWords {
  const c = (s: string, n: number) => clip(lang === "uz" ? polishUzLatin(s) : s, n);
  const avoid = w.avoid.map((s) => c(s, 80)).filter(Boolean).slice(0, 6);
  if (!avoid.some((s) => NO_TEXT[lang].re.test(s))) avoid.unshift(NO_TEXT[lang].text);
  return { summary: c(w.summary, 280), light: c(w.light, 120), composition: c(w.composition, 160), mood: c(w.mood, 100), avoid };
}

/** Cleans the model's answer: valid hex colours, short fields, and the "no text" rule always present. */
export function normalizeAnalysis(a: StyleAnalysis, imageCount: number) {
  const keep = new Set<number>();
  for (const im of a.images) if (im.keep && im.index >= 1 && im.index <= imageCount) keep.add(im.index - 1);
  const avoid = a.avoid.map((s) => clip(s, 80)).filter(Boolean).slice(0, 8);
  if (!avoid.some((s) => /text|letter|logo/i.test(s))) avoid.unshift(ALWAYS_AVOID);
  return {
    keep,
    style: {
      palette: a.palette.map((c) => c.trim().toLowerCase()).filter((c) => HEX_RE.test(c)).slice(0, 6),
      light: clip(a.light, 160),
      composition: clip(a.composition, 200),
      props: a.props.map((s) => clip(s, 60)).filter(Boolean).slice(0, 8),
      mood: clip(a.mood, 120),
      avoid,
      prompt: clip(a.prompt, 900),
      ownerText: { uz: ownerWords(a.ownerText.uz, "uz"), ru: ownerWords(a.ownerText.ru, "ru"), en: ownerWords(a.ownerText.en, "en") },
    } satisfies Omit<VisualStyleWithWords, "refs" | "learnedAt">,
  };
}

export type AnalyzeFn = (images: AnalysisImage[], brand: BrandBrief) => Promise<StyleAnalysis>;

/** Server: one structured Claude call (Sonnet 5.5, low effort). */
export const analyzeStyle: AnalyzeFn = async (images, brand) => {
  const { claudeVisionJson } = await import("./claude");
  return claudeVisionJson({
    schema: StyleAnalysisSchema,
    system: images.length ? ANALYSIS_SYSTEM : FRESH_SYSTEM,
    content: buildAnalysisContent(images, brand),
  });
};
