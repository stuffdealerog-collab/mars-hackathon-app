import { beforeEach, describe, expect, it, vi } from "vitest";
import { factKeys, newFactKeys } from "../src/lib/uslub/fact-keys";

// Review of PR #54: the rewrite guard compared each version's facts with the post plus the owner's phrase, and the
// phrase is in one language. "narxi 210 000" left the English version on the old price, "narxi 210 ming" changed
// nothing, "dushanba" kept ru and en. Facts are now compared by meaning. llmJson is a mock: no network.
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/env", () => ({ getEnv: () => ({ BOT_USERNAME: "mercatai" }), getPublicUrl: () => undefined }));
const llmJson = vi.fn();
vi.mock("../src/lib/uslub/llm", () => ({ llmJson, MODEL_QUALITY: "claude-sonnet-5-5", MODEL_FAST: "claude-haiku-5-5", LlmError: class extends Error {} }));

const { rewritePost } = await import("../src/lib/uslub/copywriter");
import type { BrandProfile, Script } from "../src/lib/uslub/contract";

describe("factKeys: one key per fact, whatever the language", () => {
  it("prices: digit groups, thousands words and k are one number", () => {
    for (const t of ["210 000 so'm", "210,000 UZS", "210.000 сум", "210 ming so‘m", "210 тыс. сум", "210k", "210 000 сўм"]) expect([...factKeys(t)], t).toEqual(["210000"]);
    expect(factKeys("1,5 mln so'm").has("1500000")).toBe(true);
    expect(factKeys("1 000 000").has("1000000")).toBe(true);
  });

  it("weekdays, months, today and tomorrow are the same key in uz, ru and en", () => {
    expect(factKeys("dushanba kuni yetkazamiz")).toEqual(new Set(["wd:1"]));
    expect(factKeys("доставим в понедельник")).toEqual(new Set(["wd:1"]));
    expect(factKeys("we deliver on Mondays")).toEqual(new Set(["wd:1"]));
    expect([...factKeys("25-noyabr")].sort()).toEqual(["25", "mo:11"]);
    expect([...factKeys("25 ноября")].sort()).toEqual(["25", "mo:11"]);
    expect([...factKeys("November 25")].sort()).toEqual(["25", "mo:11"]);
    expect(factKeys("ertaga").has("day:1")).toBe(true);
    // "2 marta" is "twice", not March; "завтрак" is breakfast, not tomorrow.
    expect(factKeys("2 marta").has("mo:3")).toBe(false);
    expect(factKeys("вкусный завтрак").has("day:1")).toBe(false);
  });

  it("a phone is one key however it is written; promo words by meaning", () => {
    expect(factKeys("+998 90 123 45 67")).toEqual(factKeys("+998901234567"));
    expect(factKeys("10% chegirma")).toEqual(new Set(["10", "%", "promo:discount"]));
    expect(factKeys("скидка 10 процентов")).toEqual(new Set(["10", "%", "promo:discount"]));
    expect(newFactKeys("Medovik 180 000 so'm", "Medovik 180,000 UZS — free delivery")).toEqual(["promo:free"]);
  });
});

const brand = { id: "b1", channel: "safiabakery", knowledge: "", samplePosts: [], mode: "channel", dna: { name: "Safia", products: ["Medovik"], languages: ["uz_latn"] } } as unknown as BrandProfile;
const post = (uz: string, ru: string, en: string) => ({ variants: { uz_latn: uz, uz_cyrl: "", ru, en } as Record<Script, string> });

describe("rewritePost keeps the three versions on one set of facts", () => {
  beforeEach(() => llmJson.mockReset());

  it("'narxi 210 000' updates all three versions", async () => {
    llmJson.mockResolvedValue({ uz_latn: "Medovik — 210 000 so'm. Buyurtma bering.", ru: "Медовик — 210 000 сум. Заказывайте.", en: "Medovik — 210,000 UZS. Order now." });
    const r = await rewritePost(brand, post("Medovik — 180 000 so'm. Buyurtma bering.", "Медовик — 180 000 сум. Заказывайте.", "Medovik — 180,000 UZS. Order now."), "narxi 210 000");
    expect(r.kept).toEqual([]);
    expect(r.variants.uz_latn).toContain("210 000");
    expect(r.variants.ru).toContain("210 000 сум");
    expect(r.variants.en).toContain("210,000 UZS");
    expect(r.variants.uz_cyrl).toContain("210 000");
  });

  it("'narxi 210 ming' on a post without a price: 210 000 in every version", async () => {
    llmJson.mockResolvedValue({ uz_latn: "Yangi medovik tayyor. Narxi 210 000 so'm.", ru: "Новый медовик готов. Цена 210 000 сум.", en: "A fresh Medovik is ready. 210,000 UZS." });
    const r = await rewritePost(brand, post("Yangi medovik tayyor.", "Новый медовик готов.", "A fresh Medovik is ready."), "narxi 210 ming");
    expect(r.kept).toEqual([]);
    expect(r.variants.en).toContain("210,000 UZS");
  });

  it("'dushanba kuni yetkazamiz' lets ru and en say понедельник and Monday", async () => {
    llmJson.mockResolvedValue({ uz_latn: "Medovik tayyor. Dushanba kuni yetkazamiz.", ru: "Медовик готов. Доставим в понедельник.", en: "Medovik is ready. We deliver on Monday." });
    const r = await rewritePost(brand, post("Medovik tayyor.", "Медовик готов.", "Medovik is ready."), "dushanba kuni yetkazamiz");
    expect(r.kept).toEqual([]);
    expect(r.variants.ru).toContain("понедельник");
    expect(r.variants.en).toContain("Monday");
  });

  it("an invented number is still kept out", async () => {
    llmJson.mockResolvedValue({ uz_latn: "Medovik — 180 000 so'm.", ru: "Медовик — 180 000 сум. Скидка 15%!", en: "Medovik — 180,000 UZS." });
    const before = post("Medovik — 180 000 so'm. Mazali!", "Медовик — 180 000 сум. Вкусно!", "Medovik — 180,000 UZS. Tasty!");
    const r = await rewritePost(brand, before, "qisqaroq");
    expect(r.kept).toEqual(["ru"]);
    expect(r.variants.ru).toBe(before.variants.ru);
    expect(r.variants.uz_latn).toMatch(/^Medovik — 180 000 so.m.$/);
  });

  it("when the Uzbek version makes something up, all three stay: the versions never disagree on a price", async () => {
    llmJson.mockResolvedValue({ uz_latn: "Medovik — 250 000 so'm.", ru: "Медовик — 210 000 сум.", en: "Medovik — 210,000 UZS." });
    const before = post("Medovik — 180 000 so'm.", "Медовик — 180 000 сум.", "Medovik — 180,000 UZS.");
    const r = await rewritePost(brand, before, "narxi 210 000");
    expect(r.kept).toEqual(["uz_latn", "ru", "en"]);
    expect(r.variants.ru).toBe(before.variants.ru);
    expect(r.variants.en).toBe(before.variants.en);
  });
});
