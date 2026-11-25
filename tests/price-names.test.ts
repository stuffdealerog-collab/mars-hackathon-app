import { describe, expect, it } from "vitest";
import { alignProductNames } from "../src/lib/uslub/postguard";
import { formatSum, normalizePrices } from "../src/lib/uslub/price";
import { latinToCyrillic, polishUzLatin } from "../src/lib/uslub/translit";

// QA 2026-11-25: generated English posts said "12,000 sum" while the Studio says "UZS"; one post wrote "patir" and
// "patyr". One way per script: 12 000 soʻm · 12 000 сўм · 12 000 сум · 12,000 UZS.
describe("one price format per script", () => {
  it("formats an amount", () => {
    expect(formatSum(12000, "uz_latn")).toBe("12 000 soʻm");
    expect(formatSum(12000, "uz_cyrl")).toBe("12 000 сўм");
    expect(formatSum(12000, "ru")).toBe("12 000 сум");
    expect(formatSum(12000, "en")).toBe("12,000 UZS");
    expect(formatSum(1250000, "en")).toBe("1,250,000 UZS");
    expect(formatSum(900, "ru")).toBe("900 сум");
  });

  it.each([
    ["en", "Napoleon cake 12 000 so'm, medovik 12000 sum, a box of 6 is 54.000 soums.", "Napoleon cake 12,000 UZS, medovik 12,000 UZS, a box of 6 is 54,000 UZS."],
    ["en", "Prices from 10 000–15 000 sum", "Prices from 10,000–15,000 UZS"],
    ["ru", "Торт 120.000 сумов, от 12000 сум, доставка 15 000 UZS", "Торт 120 000 сум, от 12 000 сум, доставка 15 000 сум"],
    ["uz_latn", "Narxi 12000 so'm, 3 tasi 30.000 so‘mdan, yetkazish 15 000 sum", "Narxi 12 000 soʻm, 3 tasi 30 000 soʻmdan, yetkazish 15 000 soʻm"],
    ["uz_cyrl", "Нархи 12000 сум, 30.000 сўмдан", "Нархи 12 000 сўм, 30 000 сўмдан"],
  ] as const)("%s: %s", (script, text, want) => {
    expect(normalizePrices(text, script)).toBe(want);
  });

  it("keeps a price in words and only fixes its currency word", () => {
    expect(normalizePrices("Hammasi 150 ming so'm", "uz_latn")).toBe("Hammasi 150 ming soʻm");
    expect(normalizePrices("Всего 150 тыс. сумов", "ru")).toBe("Всего 150 тыс. сум");
    expect(normalizePrices("Only 150k sum", "en")).toBe("Only 150k UZS");
  });

  it("leaves what is not a soʻm price alone", () => {
    for (const [text, script] of [
      ["A sum of small things matters.", "en"],
      ["2 somsa va 1 choy", "uz_latn"],
      ["Новые сумки по 2 сумки в руки", "ru"],
      ["1.5 kg tort, 12.5 ming so'm", "uz_latn"],
      ["Price: $25", "en"],
    ] as const)
      expect(normalizePrices(text, script)).toBe(text);
  });

  it("the Uzbek Latin form survives the post pipeline (polish, then Cyrillic)", () => {
    const uz = polishUzLatin(normalizePrices("Narxi 12000 so'm", "uz_latn"));
    expect(uz).toBe("Narxi 12 000 soʻm");
    expect(latinToCyrillic(uz)).toBe("Нархи 12 000 сўм");
  });
});

describe("product names as the brand DNA writes them", () => {
  const products = ["Patir", "Lag'mon", "Napoleon torti"];

  it("one spelling per name, suffixes and case kept", () => {
    expect(alignProductNames("Issiq patyr tayyor! Patyrlar 8:00 dan.", products)).toBe("Issiq patir tayyor! Patirlar 8:00 dan.");
    expect(alignProductNames("Fresh patyr every morning.", products)).toBe("Fresh patir every morning.");
    expect(alignProductNames("Bugun lagmon bor", products)).toBe("Bugun lag'mon bor");
  });

  it("never touches another script, links, handles or different words", () => {
    expect(alignProductNames("Горячий патыр", products)).toBe("Горячий патыр");
    expect(alignProductNames("Sayt: patyr.uz, bot: @patyr_bot, #patyr", products)).toBe("Sayt: patyr.uz, bot: @patyr_bot, #patyr");
    expect(alignProductNames("Patisseriya va napaleon", products)).toBe("Patisseriya va napaleon");
    expect(alignProductNames("Bugun patir bor", [])).toBe("Bugun patir bor");
  });
});
