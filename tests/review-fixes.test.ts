import { describe, expect, it } from "vitest";
import { ownerText, stripIdsAll } from "../src/lib/uslub/brain/copy";
import { runRules } from "../src/lib/uslub/brain/rules";
import { buildKpis } from "../src/lib/uslub/brain/skeleton";
import { computeStats } from "../src/lib/uslub/brain/stats";
import type { Lang } from "../src/lib/uslub/brain/types";
import { estimateUsd, usageEntry } from "../src/lib/uslub/usage-cost";
import { loadFixtures } from "./brain/eval/fixtures";

describe("owner text cleanup (review fixes)", () => {
  it("strips ids from long text without cutting it or losing line breaks", () => {
    const long = `${"Uyda pishirilgan tort. ".repeat(40)}[F3, F7]\n\nIkkinchi qator [S.ctaRate].`;
    const out = stripIdsAll(long);
    expect(out.length).toBeGreaterThan(800);
    expect(out).toContain("\n\nIkkinchi qator.");
    expect(out).not.toMatch(/\[F3|S\.ctaRate/);
  });

  it("rewords leftover references to the fact list in all three languages (Cyrillic included)", () => {
    expect(ownerText("Narxi: 105.000 — shart F'da ko'rsatilmagan", "uz")).toBe("Narxi: 105.000 — shart ma’lumotlaringizda ko'rsatilmagan");
    expect(ownerText("Условия в F не указаны", "ru")).toBe("Условия в ваших данных не указаны");
    expect(ownerText("Terms are not in F yet", "en")).toBe("Terms are not in your details yet");
    expect(ownerText("Burchak: tort. Факты:. Rasm: tort", "ru")).toBe("Burchak: tort. Rasm: tort");
    expect(ownerText("Birinchi qator\n\nIkkinchi", "uz")).toBe("Birinchi qator\n\nIkkinchi");
  });
});

describe("KPIs speak plain words in uz, ru and en", () => {
  const f = loadFixtures()[0];
  const now = Date.parse(f.capturedAt);
  const stats = computeStats(f.data, now);
  const rules = runRules(stats, { category: f.niche, competitors: [] });
  for (const lang of ["uz", "ru", "en"] as Lang[]) {
    it(lang, () => {
      const kpis = buildKpis(stats, rules, 5, [], lang);
      expect(kpis.length).toBeGreaterThan(1);
      for (const k of kpis) {
        expect(`${k.metric} ${k.how}`).not.toMatch(/src_|t\.me\/s|\bCTR\b|median/i);
        if (lang !== "uz") expect(k.metric).not.toMatch(/hafta/);
      }
    });
  }
});

describe("usage pricing", () => {
  it("prices dated snapshot and fallback ids by family, not as Sonnet", () => {
    const tokens = { input_tokens: 1_000_000, output_tokens: 0 };
    expect(estimateUsd(usageEntry("claude-haiku-5-5-20261001", tokens, 0))).toBeCloseTo(0.1, 6);
    expect(estimateUsd(usageEntry("claude-sonnet-5-5", tokens, 0))).toBeCloseTo(2, 6);
    expect(estimateUsd(usageEntry("claude-sonnet-5", tokens, 0))).toBeCloseTo(2, 6);
  });
});
