import { describe, expect, it } from "vitest";
import { analyzeNeuro, deletionEdit, detectNeuro, inventedFacts } from "../src/lib/uslub/neuro";
import { latinToCyrillic } from "../src/lib/uslub/translit";

const PROD_INPUT =
  "Zamonaviy dunyoda noyob imkoniyatni qo‘ldan boy bermang! Bizning mahsulotimiz sizga yangi ufqlarni ochib beradi.";

describe("new cliché phrases", () => {
  it("catches the production example, including 'yangi ufqlarni ochib beradi'", () => {
    const { hits, humanScore } = analyzeNeuro(PROD_INPUT, "uz_latn");
    expect(hits.map((h) => h.phrase)).toEqual([
      "Zamonaviy dunyoda",
      "noyob imkoniyatni",
      "qo‘ldan boy bermang",
      "yangi ufqlarni ochib beradi",
    ]);
    expect(humanScore).toBeLessThan(60);
  });

  it.each([
    ["Sifat va ishonch kafolati — biz bilan!", "uz_latn"],
    ["Bu eng yaxshi tanlovingiz", "uz_latn"],
    ["Siz uchun maxsus taklif", "uz_latn"],
    ["Beqiyos tajribaga ega bo'ling", "uz_latn"],
    ["Наш продукт открывает новые горизонты", "ru"],
    ["Гарантия качества и лучший выбор", "ru"],
    ["Незабываемые впечатления ждут", "ru"],
    ["Unlock new horizons with us", "en"],
    ["The best choice, made especially for you", "en"],
  ] as const)("detects clichés in %s", (text, script) => {
    expect(detectNeuro(text, script).length).toBeGreaterThan(0);
  });

  it("matches Uzbek Cyrillic and uppercase variants", () => {
    expect(detectNeuro(latinToCyrillic("Yangi ufqlarni ochib beradi"), "uz_cyrl")).toHaveLength(1);
    expect(detectNeuro("YANGI UFQLARNI OCHIB BERADI", "uz_latn")).toHaveLength(1);
  });

  it("matches «Лучший выбор» but not plain words", () => {
    expect(detectNeuro("Выбор за вами: плов 35 000 сум", "ru")).toEqual([]);
  });
});

describe("inventedFacts guard", () => {
  it("flags the production bug: a promo deadline that was never in the input", () => {
    const bad = "Aksiya juma kunigacha davom etadi, shoshiling! Bizning mahsulotimiz sizga yangi ufqlarni ochib beradi.";
    const invented = inventedFacts(PROD_INPUT, bad);
    expect(invented).toEqual(expect.arrayContaining(["aksiya", "juma", "shoshiling"]));
  });

  it("flags new numbers, percentages, weekdays and promo words in ru/en", () => {
    expect(inventedFacts("Свежий хлеб каждый день.", "Скидка 20% до пятницы!").length).toBeGreaterThan(0);
    expect(inventedFacts("Fresh bread every day.", "Fresh bread every day. Free delivery today!")).toEqual(
      expect.arrayContaining(["free", "today"]),
    );
  });

  it("allows edits that only remove or reuse existing facts", () => {
    const original = "Zamonaviy dunyoda plov 35 000 so'm, juma kuni aksiya!";
    expect(inventedFacts(original, "Plov 35 000 so'm, juma kuni aksiya!")).toEqual([]);
    expect(inventedFacts(PROD_INPUT, "Mahsulotimizni sinab ko'ring.")).toEqual([]);
  });
});

describe("deletionEdit", () => {
  it("never adds words: drops cliché sentences, cuts leading clichés", () => {
    const text = "Zamonaviy dunyoda, plov 35 000 so'm. Bu noyob imkoniyat! Manzil: Chilonzor 5.";
    const out = deletionEdit(text, detectNeuro(text, "uz_latn"));
    expect(out).toBe("Plov 35 000 so'm. Manzil: Chilonzor 5.");
    expect(inventedFacts(text, out)).toEqual([]);
    expect(detectNeuro(out, "uz_latn")).toEqual([]);
  });

  it("returns the original when every sentence is a cliché (nothing honest to keep)", () => {
    expect(deletionEdit(PROD_INPUT, detectNeuro(PROD_INPUT, "uz_latn"))).toBe(PROD_INPUT);
  });

  it("is a no-op without hits", () => {
    expect(deletionEdit("Salom!", [])).toBe("Salom!");
  });
});
