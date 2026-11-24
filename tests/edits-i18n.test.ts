import { describe, expect, it } from "vitest";
import { DICTIONARIES, LOCALES, t, type MessageKey } from "../src/lib/i18n";
import { cleanEdit, mergeVariants, MAX_VARIANT } from "../src/lib/uslub/edits";
import type { Script } from "../src/lib/uslub/contract";

const current: Record<Script, string> = {
  uz_latn: "Bento-tort 150 000 so‘mdan.",
  uz_cyrl: "Бенто-торт 150 000 сўмдан.",
  ru: "Бенто-торт от 150 000 сум.",
  en: "Bento cake from 150,000 sum.",
};

describe("owner edits at approval", () => {
  it("strips control and invisible characters, keeps line breaks", () => {
    expect(cleanEdit(`  Salom\u0000\u0007 dunyo​\r\n\r\nNarx: 10  000  `)).toBe("Salom dunyo\n\nNarx: 10 000");
  });

  it("regenerates Cyrillic from an edited Latin text so the two never disagree", () => {
    const r = mergeVariants(current, { uz_latn: "Bento-tort endi 140 000 so‘mdan." });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.variants.uz_latn).toBe("Bento-tort endi 140 000 so‘mdan.");
    expect(r.variants.uz_cyrl).toContain("140 000");
    expect(r.variants.uz_cyrl).not.toContain("150 000");
    expect(r.changed).toEqual(["uz_latn", "uz_cyrl"]);
    expect(r.variants.ru).toBe(current.ru);
  });

  it("keeps an explicitly edited Cyrillic text and ignores unchanged ones", () => {
    const r = mergeVariants(current, { uz_latn: current.uz_latn, uz_cyrl: "Бенто-торт — 145 000 сўм." });
    expect(r.ok && r.changed).toEqual(["uz_cyrl"]);
    expect(r.ok && r.variants.uz_cyrl).toBe("Бенто-торт — 145 000 сўм.");
  });

  it("refuses empty or over-long texts, naming the field", () => {
    expect(mergeVariants(current, { ru: " \u0000 " })).toEqual({ ok: false, field: "ru" });
    expect(mergeVariants(current, { en: "x".repeat(MAX_VARIANT + 1) })).toEqual({ ok: false, field: "en" });
  });

  it("re-scores the edited text for machine-sounding phrases", () => {
    const r = mergeVariants(current, { ru: "Не упустите шанс! Уникальная возможность попробовать бенто-торт." });
    expect(r.ok && r.neuroHits.ru?.length).toBeGreaterThan(0);
  });
});

describe("bot texts in uz, ru and en", () => {
  it("every locale has exactly the same keys", () => {
    const en = Object.keys(DICTIONARIES.en).sort();
    for (const l of LOCALES) expect(Object.keys(DICTIONARIES[l]).sort()).toEqual(en);
  });

  it("bot texts are really translated and fully filled", () => {
    const sample: MessageKey[] = ["bot.onboard_prompt", "pub.button", "pub.user_not_admin", "bot.results_summary", "bot.link_ask", "bot.done"];
    for (const key of sample) {
      const [uz, ru, en] = LOCALES.map((l) => t(l, key, { channel: "kanal", n: 3, week: "2026-11-23", found: 2, measured: 1, i: 1, score: 90 }));
      expect(ru).not.toBe(uz);
      expect(en).not.toBe(uz);
      expect(ru).toMatch(/[а-яё]/i);
      expect(en).not.toMatch(/[а-яё]/i);
      for (const text of [uz, ru, en]) expect(text).not.toMatch(/\{\w+\}/);
    }
  });
});
