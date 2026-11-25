import { describe, expect, it } from "vitest";
import { duplicateItems, factPostedAt, isBlockedMarker, ownerFacing, pastFacts } from "../src/lib/uslub/brain/plan-checks";
import type { Strategy } from "../src/lib/uslub/contract";
import { dropVideoMentions, pastDateNote } from "../src/lib/uslub/postguard";
import { slotBrief } from "../src/lib/uslub/slots";

// QA 2026-11-25: the real @safiabakery post behind "a past event announced as upcoming" (E3).
const SAFIA_KB = [
  "Kanal postlari (@safiabakery):",
  "[2026-11-20] Kapuchino 25 000 so‘m, kruassan 18 000 so‘m. Har kuni 08:00 dan 22:00 gacha.",
  "",
  "[2026-11-02] Shota Rustaveli ko‘chasida yangi filialimizni ochmoqdamiz! ☕️ 03.11.2026 Endi sevimli qahvangiz sizga yanada yaqinroq.",
  "",
  "[2026-10-01] Oktabr oyida har bir tortga 10% chegirma!",
].join("\n");
const FIRST_DAY = "2026-11-26";

describe("facts about events that are already over (E3)", () => {
  it("knows which channel post a fact was quoted from", () => {
    expect(factPostedAt("yangi filialimizni ochmoqdamiz", SAFIA_KB)).toBe("2026-11-02");
    expect(factPostedAt("Kapuchino 25 000 so‘m", SAFIA_KB)).toBe("2026-11-20");
    expect(factPostedAt("not in the posts", SAFIA_KB)).toBeUndefined();
  });

  it("an opening dated before the plan, and an old promotion, are past; prices and hours are not", () => {
    const facts = [
      { id: "F1", type: "address", quote: "Shota Rustaveli ko‘chasida yangi filialimizni ochmoqdamiz! ☕️ 03.11.2026" },
      { id: "F2", type: "price", quote: "Kapuchino 25 000 so‘m" },
      { id: "F3", type: "hours", quote: "Har kuni 08:00 dan 22:00 gacha" },
      { id: "F4", type: "offer", quote: "Oktabr oyida har bir tortga 10% chegirma!" },
      { id: "F5", type: "deadline", quote: "Aksiya 30-noyabrgacha" },
    ];
    const past = pastFacts(facts, SAFIA_KB, FIRST_DAY);
    expect([...past.keys()].sort()).toEqual(["F1", "F4"]);
    expect(past.get("F1")).toBe("2026-11-02");
  });

  it("a promotion from an old post that still runs on the plan's first day stays current", () => {
    const kb = "[2026-11-01] Aksiya 1-noyabrdan 31-dekabrgacha: har bir tortga 10% chegirma!\n\n[2026-10-01] Aksiya 1-oktabrdan 20-oktabrgacha edi.";
    const facts = [
      { id: "F1", type: "offer", quote: "Aksiya 1-noyabrdan 31-dekabrgacha: har bir tortga 10% chegirma!" },
      { id: "F2", type: "offer", quote: "Aksiya 1-oktabrdan 20-oktabrgacha edi." },
    ];
    expect([...pastFacts(facts, kb, FIRST_DAY).keys()]).toEqual(["F2"]);
  });
});

describe("plan items that repeat each other (E4)", () => {
  const types = new Map([
    ["F1", "story"], // "thaw the cake for 2 hours"
    ["F2", "product"],
    ["F3", "address"],
    ["F4", "hours"],
  ]);

  it("two slots on the same tip are a duplicate; the later one is flagged", () => {
    const dups = duplicateItems(
      [
        { slot: 3, hook: "Tortni muzlatkichdan 2 soat oldin oling", factIds: ["F1"] },
        { slot: 4, hook: "Napoleon torti — qatlamlari qo‘lda", factIds: ["F2"] },
        { slot: 5, hook: "Muzlatilgan tortni qanday eritish kerak?", factIds: ["F1", "F3"] },
      ],
      types,
    );
    expect([...dups.keys()]).toEqual([5]);
    expect(dups.get(5)).toMatchObject({ of: 3, facts: ["F1"] });
  });

  it("sharing the address or hours is normal; identical fact sets and near-identical hooks are not", () => {
    expect(duplicateItems([{ slot: 1, hook: "Yangi filial", factIds: ["F3", "F2"] }, { slot: 2, hook: "Ish vaqtimiz", factIds: ["F3", "F4"] }], types).size).toBe(0);
    expect(duplicateItems([{ slot: 1, hook: "Manzilimiz: Chilonzor", factIds: ["F3"] }, { slot: 2, hook: "Bizni toping", factIds: ["F3"] }], types).has(2)).toBe(true);
    expect(duplicateItems([{ slot: 1, hook: "Chilonzor 9-kvartalda yangi filial", factIds: [] }, { slot: 2, hook: "Chilonzor 9-kvartalda yangi filial ochildi", factIds: [] }], types).has(2)).toBe(true);
  });
});

describe("internal markers never reach the owner (E1)", () => {
  it("recognises the strategist's BLOCKED marker in any form", () => {
    expect(isBlockedMarker("BLOCKED — price needed [R.HIDDEN_PRICE]")).toBe(true);
    expect(isBlockedMarker("  blocked: price needed")).toBe(true);
    expect(isBlockedMarker("«BLOCKED — price needed»")).toBe(true);
    expect(isBlockedMarker("Kapuchino — 25 000 so‘m — har kuni ertalab")).toBe(false);
  });

  it("an offer, risk or example that is only the marker is removed, the rest is kept without ids", () => {
    const st: Strategy = {
      positioning: "Для тех, кто спешит утром, Safia — пекарня у метро [F2].",
      audiences: [{ name: "Студенты", job: "Быстрый завтрак", pains: ["BLOCKED — price needed"], triggers: [], whereTheyAre: ["UNKNOWN — Mijoz radar search needed"] }],
      offer: "BLOCKED — price needed [R.HIDDEN_PRICE]",
      proofPoints: [],
      pillars: [{ name: "Утро", goal: "sale", share: 0.3, examples: ["BLOCKED — price needed", "Капучино 25 000 сум [F2]"] }],
      kpis: [],
      risks: ["BLOCKED — price needed [R.HIDDEN_PRICE]", "Мало отзывов [R.TRUST_GAP]"],
    };
    ownerFacing(st, "ru", "Пока неизвестно");
    expect(st.offer).toBe("");
    expect(st.risks).toEqual(["Мало отзывов"]);
    expect(st.pillars[0].examples).toEqual(["Капучино 25 000 сум"]);
    expect(st.audiences[0].pains).toEqual([]);
    expect(st.audiences[0].whereTheyAre).toEqual(["Пока неизвестно"]);
    expect(JSON.stringify(st)).not.toMatch(/BLOCKED|\[F\d|\[R\./);
  });
});

describe("a picture post never talks about a video (E4)", () => {
  it("drops the sentence that mentions the video and keeps the rest of the post", () => {
    const post = "Muzlatilgan tortni 2 soat oldin oling. Videoni saqlab qo‘ying!\n\nBuyurtma: https://t.me/mercatai?start=src_ab12cd_3";
    expect(dropVideoMentions(post)).toBe("Muzlatilgan tortni 2 soat oldin oling.\n\nBuyurtma: https://t.me/mercatai?start=src_ab12cd_3");
    expect(dropVideoMentions("Достаньте торт за 2 часа. Сохраните это видео, чтобы не забыть.")).toBe("Достаньте торт за 2 часа.");
    expect(dropVideoMentions("🎥 Watch the video!\nNapoleon cake, 180 000 so‘m.")).toBe("Napoleon cake, 180 000 so‘m.");
    expect(dropVideoMentions("Napoleon torti 180 000 so‘m.")).toBe("Napoleon torti 180 000 so‘m.");
  });

  it("the copywriter's brief names the format and the post's day", () => {
    const slot = { day: "2026-11-27", time: "20:40", goal: "reach" as const, hook: "Tortni qanday eritish kerak?", cta: "", brief: "Maslahat" };
    expect(slotBrief(slot)).toMatch(/FORMAT: the post goes out with a picture .* never mention a video/);
    expect(slotBrief({ ...slot, format: "video" })).toMatch(/FORMAT: a short video/);
    expect(slotBrief(slot)).toMatch(/DATES: the post goes out on 2026-11-27/);
  });
});

describe("a written post that names a date already past (E3)", () => {
  it("gets an owner note in their language; a future date does not", () => {
    const variants = { uz_latn: "Yangi filial ochilmoqda! Ochilish sanasi: 03.11.2026", ru: "Открываем новый филиал 3 ноября!", en: "" };
    expect(pastDateNote(variants, "2026-11-27", "ru")).toMatch(/прошедшая дата \(03\.11\.2026\)/);
    expect(pastDateNote(variants, "2026-11-27", "uz")).toMatch(/o‘tib ketgan sana bor \(03\.11\.2026\)/);
    expect(pastDateNote({ uz_latn: "Aksiya 30-noyabrgacha davom etadi" }, "2026-11-27", "en")).toBeNull();
  });
});
