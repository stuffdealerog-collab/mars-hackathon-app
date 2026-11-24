



import { describe, expect, it } from "vitest";
import { ctaAngle, stripIds } from "../../src/lib/uslub/brain/copy";

describe("customer-facing copy", () => {
  it("strips ledger ids from hooks and CTAs, keeps prices and times", () => {

    expect(stripIds("IELTS kursi narxi: 450.000 yoki 550.000 — guruhni tanlang [F3, F21]")).toBe("IELTS kursi narxi: 450.000 yoki 550.000 — guruhni tanlang");
    expect(stripIds("1 yillik kafolat bor [F8]")).toBe("1 yillik kafolat bor");
    expect(stripIds("Buket buyurtmasi uchun: @floral_aesthetic_tashkent [F6]")).toBe("Buket buyurtmasi uchun: @floral_aesthetic_tashkent");
    expect(stripIds("Qamrov 52% (S.reachRate) — 19:40 da")).toBe("Qamrov 52% — 19:40 da");
    expect(stripIds("Narx [bepul] emas")).toBe("Narx [bepul] emas");
    expect(new Set([0, 1, 2].map((i) => ctaAngle("sale", i))).size).toBe(3);
  });
});
