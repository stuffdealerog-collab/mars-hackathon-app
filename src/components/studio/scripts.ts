import type { Script } from "@/lib/uslub/contract";

/** The post scripts in the order the switches show them. */
export const SCRIPT_ORDER: readonly Script[] = ["uz_latn", "uz_cyrl", "ru", "en"];

/**
 * Which post languages stand in the switch and which wait under «Yana» / «Ещё» / «More».
 * Uzbek (both scripts) and Russian are the owner's everyday languages; English is generated for
 * every post but is a side option, unless the channel itself writes in English. Pure.
 */
export function splitScripts(available: readonly Script[], channelLangs: readonly Script[] = []): { main: Script[]; more: Script[] } {
  const has = new Set(available);
  const ordered = SCRIPT_ORDER.filter((s) => has.has(s));
  const englishIsMain = channelLangs.includes("en");
  const main = ordered.filter((s) => s !== "en" || englishIsMain);
  const more = ordered.filter((s) => !main.includes(s));
  return { main, more };
}

/** The scripts a switch draws right now: the main ones, plus the side ones once revealed (or picked). */
export function shownScripts(split: { main: Script[]; more: Script[] }, revealed: boolean, picked?: Script | null): Script[] {
  if (revealed || (picked && split.more.includes(picked))) return [...split.main, ...split.more];
  return split.main;
}
