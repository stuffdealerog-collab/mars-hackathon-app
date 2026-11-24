import type { Aspect, MediaKind, StylePresetId } from "./types";

/**
 * Brand-consistent style presets for product ads.
 *
 * Built on the rules in docs/creative/playbook.md:
 * - one shot = one subject + one action + ONE motivated camera move;
 * - the same lighting/lens/grade block is repeated word for word (a "look bible");
 * - the model never renders text, logos or UI: captions are our overlay;
 * - the product is locked ("shape, label, colours unchanged") because product
 *   fidelity is what an owner checks first.
 * Prompts are English on purpose: video/image models follow English camera
 * language best, whatever the brand's language is.
 */

export interface StylePreset {
  id: StylePresetId;
  name: { uz: string; ru: string; en: string };
  bestFor: { uz: string; ru: string; en: string };
  swatch: [string, string]; // two hex colours for the UI chip
  /** Environment + light + lens + grade: the look bible, repeated verbatim in every prompt. */
  look: string;
  /** The single camera move for video. */
  move: string;
  /** What happens in the shot (natural, physically simple motion only). */
  action: string;
  /** Composition for stills. */
  still: string;
  defaultSeconds: number;
}

export const PRESETS: Record<StylePresetId, StylePreset> = {
  "ai-os-dark": {
    id: "ai-os-dark",
    name: { uz: "Tungi studiya", ru: "Ночная студия", en: "AI OS dark" },
    bestFor: { uz: "Gadjet, kosmetika, parfyum", ru: "Гаджеты, косметика, парфюм", en: "Gadgets, cosmetics, perfume" },
    swatch: ["#D7FF3A", "#0B0B0E"],
    look:
      "near-black seamless void, a soft luminous mesh-gradient glow far behind the product, thin neon-lime (#D7FF3A) rim light from behind, single soft key light from top left, glossy specular highlights, gentle light falloff into pure black, 85mm lens, shallow depth of field, subtle 35mm film grain, filmic contrast",
    move: "very slow orbit to the right, about 20 degrees, perfectly smooth",
    action: "the product rests still while a thin line of light slowly travels across its edge",
    still: "product centred on the lower third, generous negative space above for a headline",
    defaultSeconds: 6,
  },
  "warm-bazaar": {
    id: "warm-bazaar",
    name: { uz: "Iliq bozor", ru: "Тёплый базар", en: "Warm bazaar" },
    bestFor: { uz: "Non, shirinlik, ovqat, hunarmandchilik", ru: "Хлеб, сладости, еда, ремесло", en: "Bread, sweets, food, crafts" },
    swatch: ["#F2A93B", "#7A3B1E"],
    look:
      "warm morning sunlight through a window, a wooden counter, blurred Tashkent bakery or bazaar background with terracotta and blue ceramic tones, a few dust particles in the light beam, 50mm lens at f/2, natural textures, warm tungsten practicals, subtle 35mm film grain, honest documentary feel",
    move: "slow push-in towards the product",
    action: "thin steam or a soft light beam drifts naturally around the product",
    still: "product on the counter at the left third, natural props out of focus",
    defaultSeconds: 6,
  },
  "paper-studio": {
    id: "paper-studio",
    name: { uz: "Oq studiya", ru: "Светлая студия", en: "Paper studio" },
    bestFor: { uz: "Kiyim, kosmetika, qadoqlangan mahsulot", ru: "Одежда, косметика, упаковка", en: "Clothing, cosmetics, packaged goods" },
    swatch: ["#FAF7F2", "#C8553D"],
    look:
      "clean warm paper-white seamless backdrop, soft diffused window light from the left, a soft contact shadow, 70mm lens, crisp focus on the product, calm minimal premium catalogue look, true-to-life colours",
    move: "slow lateral slide from left to right with gentle parallax",
    action: "a soft shadow of a window frame slowly glides across the backdrop",
    still: "product centred, straight-on, generous empty paper around it",
    defaultSeconds: 5,
  },
  "evening-street": {
    id: "evening-street",
    name: { uz: "Kechki shahar", ru: "Вечерний город", en: "Evening city" },
    bestFor: { uz: "Kafe, kiyim, aksessuar", ru: "Кафе, одежда, аксессуары", en: "Cafés, fashion, accessories" },
    swatch: ["#5B7CFF", "#FF9F1C"],
    look:
      "blue hour on a Tashkent street, warm shop-window light on the product, out-of-focus city lights as round bokeh, slight haze, 50mm lens at f/1.8, cinematic teal and amber grade, subtle film grain",
    move: "slow crane up revealing the product",
    action: "city lights shimmer softly in the background",
    still: "product in the foreground on the right third, bokeh city behind",
    defaultSeconds: 6,
  },
  "macro-detail": {
    id: "macro-detail",
    name: { uz: "Makro detal", ru: "Макро-деталь", en: "Macro detail" },
    bestFor: { uz: "Mato, zargarlik, tekstura", ru: "Ткань, украшения, фактура", en: "Fabric, jewellery, texture" },
    swatch: ["#FBE3C2", "#13151C"],
    look:
      "extreme close-up macro, 100mm macro lens, razor-thin depth of field, raking side light that reveals the material texture, dark neutral background, rich true-to-life colour, subtle film grain",
    move: "slow rack focus from the front edge to the centre of the product",
    action: "the light slowly rakes across the surface, revealing texture",
    still: "tight macro crop on the most beautiful detail of the product",
    defaultSeconds: 5,
  },
};

export const PRESET_IDS = Object.keys(PRESETS) as StylePresetId[];

/** Everything that gives AI away, in one line (from the playbook's anti-slop list). */
export const NEGATIVE_PROMPT =
  "text, letters, words, captions, subtitles, logo, watermark, UI, distorted or changed label, warped product, melting, morphing, extra objects, extra hands, extra fingers, plastic skin, oversaturated, cartoon, CGI look, flicker, jitter, camera shake";

const PRODUCT_LOCK =
  "Keep the product exactly as in the reference image: same shape, proportions, colours, materials and label; do not redraw or add text.";

const ASPECT_WORDS: Record<Aspect, string> = {
  "9:16": "vertical 9:16 frame",
  "16:9": "horizontal 16:9 frame",
  "1:1": "square 1:1 frame",
  "4:5": "portrait 4:5 frame",
};

/** Removes newlines/quotes/control chars and caps length: owner text goes into a model prompt. */
export function cleanPromptText(s: string | undefined, max = 240): string {
  if (!s) return "";
  return s
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/["`<>{}\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

export interface BuiltPrompt {
  prompt: string;
  negativePrompt: string;
}

/**
 * Prompt = [shot + subject] [single action], [single camera move], [look bible], [lock], [no text].
 * One subject, one action, one move: stacked moves are the #1 source of "floaty" AI footage.
 */
export function buildPrompt(args: {
  kind: MediaKind;
  presetId: StylePresetId;
  aspect: Aspect;
  productName?: string;
  brief?: string;
}): BuiltPrompt {
  const p = PRESETS[args.presetId];
  if (!p) throw new Error(`Unknown preset: ${args.presetId}`);
  const subject = cleanPromptText(args.productName, 80) || "the product from the reference image";
  const brief = cleanPromptText(args.brief);
  const parts =
    args.kind === "video"
      ? [
          `Premium commercial product shot, ${ASPECT_WORDS[args.aspect]}, of ${subject}.`,
          `${capitalize(p.action)}.`,
          `Camera: ${p.move}; one continuous move, no cuts.`,
          `Look: ${p.look}.`,
          brief ? `Direction from the owner: ${brief}.` : "",
          PRODUCT_LOCK,
          "No text, no logos, no people unless the reference shows them.",
        ]
      : [
          `Premium commercial product photograph, ${ASPECT_WORDS[args.aspect]}, of ${subject}.`,
          `Composition: ${p.still}.`,
          `Look: ${p.look}.`,
          brief ? `Direction from the owner: ${brief}.` : "",
          PRODUCT_LOCK,
          "No text, no logos: leave clean space for a headline that will be added later.",
        ];
  return { prompt: parts.filter(Boolean).join(" "), negativePrompt: NEGATIVE_PROMPT };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Public, UI-safe list (names, swatches, defaults). */
export const publicPresets = () =>
  PRESET_IDS.map((id) => {
    const p = PRESETS[id];
    return { id, name: p.name, bestFor: p.bestFor, swatch: p.swatch, defaultSeconds: p.defaultSeconds };
  });
