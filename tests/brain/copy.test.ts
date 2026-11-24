



import { describe, expect, it } from "vitest";
import { stripIds } from "../../src/lib/uslub/brain/copy";
import { factNumbers, groundedCheck } from "../../src/lib/uslub/brain/lint";

describe("customer-facing copy", () => {
  it("strips ledger ids from hooks and CTAs, keeps prices and times", () => {
    expect(stripIds("IELTS kursi narxi: 450.000 yoki 550.000 — guruhni tanlang [F3, F21]")).toBe("IELTS kursi narxi: 450.000 yoki 550.000 — guruhni tanlang");
    expect(stripIds("1 yillik kafolat bor [F8]")).toBe("1 yillik kafolat bor");
    expect(stripIds("Buket buyurtmasi uchun: @floral_aesthetic_tashkent [F6]")).toBe("Buket buyurtmasi uchun: @floral_aesthetic_tashkent");
    expect(stripIds("Qamrov 52% (S.reachRate) — 19:40 da")).toBe("Qamrov 52% — 19:40 da");
    expect(stripIds("Narx [bepul] emas")).toBe("Narx [bepul] emas");
    expect(stripIds("Narx [F1,F2] va [S.hourLift.19-22]")).toBe("Narx va");
    const evil = `[${"S.a.".repeat(2000)}`;
    const t0 = Date.now();
    stripIds(evil);
    expect(Date.now() - t0).toBeLessThan(200);
  });
});

describe("GROUNDED number parsing", () => {
  it("never glues a list of prices into one number (v1 and v2.2 false positive)", () => {
    expect(factNumbers("narx 450.000 , 600.000 yoki 550.000 so'm").map((n) => n.value)).toEqual([450000, 600000, 550000]);
    expect(factNumbers("3 600 000 so'm, 5 600 000 so'm").map((n) => n.value)).toEqual([3600000, 5600000]);
    expect(factNumbers("79ming, 84ming").map((n) => n.value)).toEqual([79000, 84000]);
    expect(factNumbers("2,60 × 1,60 m").map((n) => n.value)).toEqual([]);
    const ledger = new Map([
      ["F3", { id: "F3", label: "price", value: "450.000", display: "IELTS kursi 450.000", source: "kb" as const }],
      ["F21", { id: "F21", label: "price", value: "600.000", display: "Intensiv 600.000", source: "kb" as const }],
    ]);
    expect(groundedCheck("Narx 450.000 yoki 600.000 [F3, F21]", ledger)).toEqual([]);
    expect(groundedCheck("Narx 450.000 yoki 700.000 [F3, F21]", ledger)[0]?.quote).toBe("700.000");
  });
});
