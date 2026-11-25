/**
 * Who runs Mercat, as the legal pages print it. Fill `entity` (the registered YaTT / MChJ name) and `email` before
 * submitting Meta App Review or Google verification: both reviews read these pages, and Meta's Business
 * Verification checks that the legal name matches. Until then the pages name the Mercat team and the bot.
 */
export const OPERATOR: { entity: string | null; email: string | null; city: Record<"uz" | "ru" | "en", string> } = {
  entity: null,
  email: null,
  city: { uz: "Toshkent, O‘zbekiston", ru: "Ташкент, Узбекистан", en: "Tashkent, Uzbekistan" },
};

/** The date the texts last changed (shown on every page). */
export const LEGAL_UPDATED = "2026-11-25";
