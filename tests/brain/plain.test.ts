import { describe, expect, it } from "vitest";
import { evidenceText, numText, pctText, plainOrNull, templateFinding, timeRange, whyText } from "../../src/lib/uslub/brain/plain";
import { runRules, statsLedger } from "../../src/lib/uslub/brain/rules";
import { computeStats } from "../../src/lib/uslub/brain/stats";
import type { ChannelStats, Lang, RuleResult } from "../../src/lib/uslub/brain/types";
import { loadFixtures } from "./eval/fixtures";

const LANGS: Lang[] = ["uz", "ru", "en"];
const fixtures = loadFixtures();

/** What an owner must never see in a finding. */
const JARGON = /\b[SRPFW]\.[A-Za-z_]|\[[A-Z]|\bn=\d|hiddenPrice|priceShareInSale|ctaRate|reachRate|viewCV|lift\b|undefined|NaN|\btrigger\b/;

function analysed(i: number) {
  const f = fixtures[i];
  const now = Date.parse(f.capturedAt);
  const stats = computeStats(f.data, now);
  const rules = runRules(stats, { category: f.niche, competitors: [], kb: { hasPrices: true, hasProducts: true, hasOffer: false, proofFacts: 0 } });
  const ledger = new Map(statsLedger(stats, []).map((e) => [e.id, e]));
  const value = (id: string) => {
    const v = ledger.get(id)?.value;
    return typeof v === "number" ? v : undefined;
  };
  return { f, stats, rules, ledger, value };
}

describe("owner-readable findings (templates)", () => {
  it("has golden fixtures to check against", () => {
    expect(fixtures.length).toBeGreaterThan(20);
  });

  it("every fired rule on every golden channel reads as plain text in uz, ru and en", () => {
    let checked = 0;
    for (let i = 0; i < fixtures.length; i++) {
      const { stats, rules, value } = analysed(i);
      for (const r of rules.filter((x) => x.status === "fired")) {
        for (const lang of LANGS) {
          const text = templateFinding(r, stats, lang, { value });
          if (text == null) continue;
          checked++;
          expect(text, `${fixtures[i].handle} ${r.id} ${lang}`).not.toMatch(JARGON);
          expect(plainOrNull(text, lang), `${fixtures[i].handle} ${r.id} ${lang}: ${text}`).toBe(text);
          // Two sentences at most a few hundred characters: a fact with its comparison point, then one fix.
          expect(text.length).toBeLessThan(520);
          expect(text.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length).toBeGreaterThanOrEqual(2);
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("never says 'price hidden' with a zero count: the v1 contradiction", () => {
    const s = { priceShareInSale: 0.122, hiddenPriceCount: 0 } as ChannelStats;
    const rule = { id: "R.HIDDEN_PRICE", kind: "problem", status: "fired", ids: [] } as unknown as RuleResult;
    const uz = templateFinding(rule, s, "uz") as string;
    expect(uz).toContain("12%");
    expect(uz).not.toMatch(/lichkada» deyilgan/);
    expect(uz).toMatch(/narx bo‘ladi/);
    const ru = templateFinding(rule, s, "ru") as string;
    expect(ru).toMatch(/^Цена указана только в 12% продающих постов\./);
    expect(templateFinding(rule, { ...s, priceShareInSale: 0.8 }, "en")).toBeNull();
    expect(templateFinding(rule, { ...s, priceShareInSale: 0.8, hiddenPriceCount: 3 }, "en")).toMatch(/"price in DM": 3/);
  });

  it("speaks the requested language", () => {
    const { stats, rules, value } = analysed(0);
    const r = rules.find((x) => x.status === "fired" && templateFinding(x, stats, "uz", { value }));
    expect(r).toBeDefined();
    const ru = templateFinding(r as RuleResult, stats, "ru", { value }) as string;
    const en = templateFinding(r as RuleResult, stats, "en", { value }) as string;
    expect(ru).toMatch(/[а-яё]{4}/i);
    expect(en).not.toMatch(/[а-яё]/i);
    expect(en).not.toMatch(/[‘ʻ]/);
  });
});

describe("LLM findings: plain-language gate", () => {
  it("keeps a plain sentence and drops the trailing ledger citation", () => {
    expect(plainOrNull("Postlarning faqat 5% ida keyingi qadam aytilgan. Har bir postga bitta aniq qadam qo‘shamiz. [S.ctaRate, R.DEAD_ENDS]")).toBe(
      "Postlarning faqat 5% ida keyingi qadam aytilgan. Har bir postga bitta aniq qadam qo‘shamiz.",
    );
  });

  it("rejects developer text: variable names, n=, ×, ids inside the sentence", () => {
    expect(plainOrNull("Narx yashirilgan: hiddenPrice 0 · priceShareInSale 12.2% [S.hiddenPriceCount]")).toBeNull();
    expect(plainOrNull("Qamrov past (n=30), lift 0.62× qo‘shni postlarga nisbatan bo‘ldi")).toBeNull();
    expect(plainOrNull("Post P.safia/1203 eng yaxshi natija berdi, shuni takrorlaymiz har hafta")).toBeNull();
    expect(plainOrNull("Kanalda reachRate juda past, buni tuzatamiz bu hafta albatta")).toBeNull();
  });

  it("rejects jargon and English glosses inside Uzbek or Russian (seen live on @gayane_torty)", () => {
    const ru = "Наш ориентир (rule of thumb) — не реже 2 постов в неделю. Не больше одного продающего поста, не в первых двух слотах.";
    expect(plainOrNull(ru, "ru")).toBeNull();
    expect(plainOrNull("A rule of thumb for channels this size is 10% of subscribers. We add one post this week.", "en")).not.toBeNull();
    expect(plainOrNull("Sotuv postini birinchi ikki slotga qo‘ymaymiz, bu hafta 2 ta post.", "uz")).toBeNull();
  });
});

describe("numbers and labels", () => {
  it("formats percentages and counts per language", () => {
    expect(pctText(0.524, "uz")).toBe("52%");
    expect(pctText(0.004, "ru")).toBe("0,4%");
    expect(pctText(0.004, "en")).toBe("0.4%");
    expect(numText(8860, "en")).toBe("8,860");
    expect(numText(8860, "uz")).toBe("8 860");
    expect(numText(1.46, "ru", 1)).toBe("1,5");
    expect(timeRange("19-22")).toBe("19:00–22:00");
    expect(timeRange("7-10")).toBe("07:00–10:00");
  });

  it("evidence lines use words, not ledger ids", () => {
    const { ledger } = analysed(0);
    const text = evidenceText(["S.reachRate", "S.ctaRate", "R.DEAD_ENDS", "S.unknownThing"], ledger, "uz");
    expect(text).not.toMatch(/S\.|R\./);
    expect(text.length).toBeGreaterThan(0);
  });

  it("explains a top post without English jargon in Uzbek", () => {
    const { f } = analysed(0);
    const p = f.data.posts[0];
    const why = whyText(p, 2.1, "uz");
    expect(why).toMatch(/2,1 baravar/);
    expect(why).not.toMatch(/neighbours|price shown|has CTA/);
  });
});
