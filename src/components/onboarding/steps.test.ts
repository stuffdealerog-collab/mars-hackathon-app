import { describe, expect, it } from "vitest";
import type { Script } from "@/lib/uslub/contract";
import { detectNeuro } from "../../lib/uslub/neuro";
import { INTRO_COPY } from "./copy";
import { ADMIN_STEP, INTRO_STEPS, introSteps, STEP_KINDS } from "./steps";

const LANGS = ["uz", "ru", "en"] as const;
const SCRIPT: Record<(typeof LANGS)[number], Script> = { uz: "uz_latn", ru: "ru", en: "en" };

describe("the intro's cards", () => {
  it("ends on the add-the-bot card, after the approve card", () => {
    expect(STEP_KINDS).toEqual(["lamps", "link", "result", "approve", "admin"]);
    expect(INTRO_STEPS).toBe(5);
    expect(ADMIN_STEP).toBe(INTRO_STEPS - 1);
  });
  it("shows the whole intro, or the add-the-bot card alone", () => {
    expect(introSteps()).toEqual([...STEP_KINDS]);
    expect(introSteps(null)).toEqual([...STEP_KINDS]);
    expect(introSteps("admin")).toEqual(["admin"]);
  });
  it("a new list each time (callers may not change the order for everyone)", () => {
    expect(introSteps()).not.toBe(introSteps());
  });
});

describe("the intro's words", () => {
  it.each(LANGS)("%s: a title, a line and an alt text for every card", (lang) => {
    const t = INTRO_COPY[lang];
    expect(t.steps).toHaveLength(INTRO_STEPS);
    expect(t.alt).toHaveLength(INTRO_STEPS);
    for (const s of t.steps) {
      expect(s.title.trim()).not.toBe("");
      expect(s.line.trim()).not.toBe("");
    }
  });
  it.each(LANGS)("%s: the add-the-bot card has three steps and names the bot", (lang) => {
    const a = INTRO_COPY[lang].admin;
    expect(a.how).toHaveLength(3);
    expect(a.how.some((h) => h.includes("{bot}"))).toBe(true);
    for (const k of ["add", "later", "reopen", "done"] as const) expect(a[k].trim()).not.toBe("");
  });
  it("quotes only Telegram labels that every Telegram app shows the same", () => {
    expect(INTRO_COPY.uz.admin.how.join(" ")).toContain("«Adminlar»");
    expect(INTRO_COPY.uz.admin.how.join(" ")).toContain("«Admin qo‘shish»");
    expect(INTRO_COPY.ru.admin.how.join(" ")).toContain("«Администраторы»");
    expect(INTRO_COPY.en.admin.how.join(" ")).toContain("“Post messages”");
  });
  it("never hard-codes the bot's username", () => {
    for (const lang of LANGS) expect(JSON.stringify(INTRO_COPY[lang])).not.toMatch(/mercatai/i);
  });
  it.each(LANGS)("%s: the new card passes the anti-cliché filter", (lang) => {
    const t = INTRO_COPY[lang];
    const words = [t.steps[ADMIN_STEP].title, t.steps[ADMIN_STEP].line, ...t.admin.how, t.admin.add, t.admin.later, t.admin.reopen, t.admin.done, t.alt[ADMIN_STEP]];
    for (const w of words) expect(detectNeuro(w, SCRIPT[lang])).toEqual([]);
  });
});
