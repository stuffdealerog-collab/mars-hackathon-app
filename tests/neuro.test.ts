import { describe, expect, it } from "vitest";
import { analyzeNeuro, detectNeuro, humanScore } from "../src/lib/uslub/neuro";
import { latinToCyrillic } from "../src/lib/uslub/translit";

describe("detectNeuro", () => {
  it("finds Russian clichés with inflections and exact positions", () => {
    const text = "В современном мире это уникальную возможность нельзя упускать. Откройте для себя наш кофе!";
    const hits = detectNeuro(text, "ru");
    expect(hits.map((h) => h.phrase.toLowerCase())).toEqual([
      "в современном мире",
      "уникальную возможность",
      "откройте для себя",
    ]);
    for (const h of hits) expect(text.slice(h.index, h.index + h.phrase.length)).toBe(h.phrase);
    expect(hits[0].suggestion).toBeTruthy();
  });

  it("finds 'не упустите шанс' and 'погрузитесь в атмосферу'", () => {
    const hits = detectNeuro("Погрузитесь в атмосферу уюта и не упустите шанс!", "ru");
    expect(hits).toHaveLength(2);
  });

  it("finds English clichés but not innocent words", () => {
    const hits = detectNeuro("Unlock seamless coffee. Dive into a game-changer. Elevated taste.", "en");
    expect(hits.map((h) => h.phrase.toLowerCase())).toEqual(["unlock", "seamless", "dive into", "game-changer", "elevated"]);
    expect(detectNeuro("Our blockchain lockers open at 9.", "en")).toEqual([]);
  });

  it("finds Uzbek Latin clichés with any apostrophe variant and suffixes", () => {
    const text = "Zamonaviy dunyoda bu noyob imkoniyatdir! Qo‘ldan boy bermang. To'plam 5 ta mahsulotni o`z ichiga oladi.";
    const hits = detectNeuro(text, "uz_latn");
    expect(hits.map((h) => h.phrase)).toEqual([
      "Zamonaviy dunyoda",
      "noyob imkoniyatdir",
      "Qo‘ldan boy bermang",
      "o`z ichiga oladi",
    ]);
  });

  it("finds 'nafaqat ... balki' constructions", () => {
    const hits = detectNeuro("Bu nafaqat mazali, balki foydali.", "uz_latn");
    expect(hits).toHaveLength(1);
  });

  it("works on Uzbek Cyrillic via the same list", () => {
    const cyr = latinToCyrillic("Zamonaviy dunyoda noyob imkoniyat sizni kutmoqda");
    const hits = detectNeuro(cyr, "uz_cyrl");
    expect(hits).toHaveLength(3);
    expect(hits[0].phrase).toBe("Замонавий дунёда");
  });

  it("returns nothing for plain human copy", () => {
    expect(detectNeuro("Bugun plov 35 000 so'm. Chilonzor 5-kvartal, soat 12 dan.", "uz_latn")).toEqual([]);
    expect(detectNeuro("Плов сегодня 35 000 сум. Чиланзар, с 12:00.", "ru")).toEqual([]);
  });

  it("does not double-count overlapping phrases", () => {
    const hits = detectNeuro("Bugungi zamonaviy dunyoda", "uz_latn");
    expect(hits).toHaveLength(1);
    expect(hits[0].phrase).toBe("Bugungi zamonaviy dunyoda");
  });
});

describe("humanScore", () => {
  it("is high for plain copy and drops with clichés", () => {
    const plain = "Bugun plov 35 000 so'm. Chilonzor 5-kvartal, soat 12 dan.";
    const neuro = "Zamonaviy dunyoda noyob imkoniyat! Qo'ldan boy bermang! Kashf eting!!!";
    expect(humanScore(plain, "uz_latn")).toBe(100);
    expect(humanScore(neuro, "uz_latn")).toBeLessThan(60);
  });

  it("penalizes emoji walls and exclamation spam", () => {
    expect(humanScore("Salom!!!!!!! 🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥", "uz_latn")).toBeLessThan(90);
  });

  it("is 0 for empty text and stays within 0-100", () => {
    expect(humanScore("", "en")).toBe(0);
    const awful = "Unlock elevate seamless dive into game-changer look no further tapestry unleash vibrant!!!!!!!!";
    const { humanScore: s } = analyzeNeuro(awful, "en");
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(40);
  });
});
