import { describe, expect, it } from "vitest";
import { applyPostEnding, classifyEnding, contactLineFor, contactsIn, endingBrief, ensureTrackedLink, extractPostEnding } from "../src/lib/uslub/ending";
import { oneContactRoute } from "../src/lib/uslub/postguard";

const CAKES = [
  "Medovik torti tayyor 🍯\nNarxi 180 000 so'm.\n\n📞 Buyurtma: +998 90 123 45 67",
  "Napoleon — 1 kg 150 000 so'm.\nShanbagacha buyurtma bering.\n\n📞 Buyurtma: +998 90 123 45 67",
  "#reklama Hamkorimiz @partner_shop dan chegirma! Yozing: +998 71 000 00 00",
  "Qizil baxmal tortimiz. Ertalabdan tayyor.\n📞 Buyurtma: +998 90 123 45 67\n#tort #safia",
  "Bugun pirojniylar yangi.\n📞 Buyurtma: +998 (90) 123-45-67",
];

describe("extractPostEnding", () => {
  it("learns the contact line the channel ends with, skipping ads, ranked by frequency", () => {
    const e = extractPostEnding(CAKES, { channel: "safiabakery", bot: "mercatai" });
    expect(e.pattern).toBe("contact");
    expect(e.contact).toBe("📞 Buyurtma: +998 90 123 45 67");
    expect(e.examples.length).toBeGreaterThan(0);
    expect(e.examples.join(" ")).not.toContain("partner_shop");
  });

  it("forwards are not the channel's voice", () => {
    const e = extractPostEnding([...CAKES.slice(0, 2).map((text) => ({ text, isForward: true })), "Yangi tort.\nYoqimli ishtaha!", "Bugun ochiqmiz.\nKeling!"]);
    expect(e.contact).toBeUndefined();
    expect(e.pattern).toBe("none");
  });

  it("a channel whose posts just end has the 'none' pattern and no contact", () => {
    const e = extractPostEnding(["Bugun Chorsuga bordim. Odamlar ko'p edi.", "Kitob o'qib tugatdim. Juda yoqdi.", "Ertaga yana yozaman."]);
    expect(e).toMatchObject({ pattern: "none" });
    expect(e.contact).toBeUndefined();
  });

  it("hashtags the channel repeats become the hashtag habit; one-off topic tags do not", () => {
    const e = extractPostEnding(["Post bir.\n#maslahat #teri", "Post ikki.\n#maslahat #akne", "Post uch.\n#maslahat #spf", "Post to'rt.\n#maslahat"]);
    expect(e.pattern).toBe("hashtags");
    expect(e.hashtags).toEqual(["#maslahat"]);
  });

  it("never takes the channel's own handle, its post links, invite links or Mercat's bot as a contact", () => {
    const keys = contactsIn("Obuna: @safiabakery · t.me/safiabakery/120 · t.me/+AbCdEf · t.me/mercatai?start=src_ab12cd_1 · @manager_dilnoza", { channel: "safiabakery", bot: "mercatai" }).map((c) => c.key);
    expect(keys).toEqual(["tg:manager_dilnoza"]);
    expect(classifyEnding("Kanalimiz: @safiabakery", { channel: "safiabakery" })).toBe("link");
    expect(classifyEnding("Narxlar uchun adminga yozing")).toBe("admin");
  });

  it("a contact seen only once in a big channel may be a partner's: not reused", () => {
    const e = extractPostEnding(["Yangi tort bor.\nYozing: @once_partner", "Bugun ochiqmiz, keling.", "Ertaga dam olamiz.", "Yangi menyu tayyor."]);
    expect(e.contact).toBeUndefined();
  });
});

describe("applyPostEnding", () => {
  const ending = extractPostEnding(CAKES, { channel: "safiabakery" });

  it("ends a new post with the channel's own contact, in its own form, exactly once", () => {
    const once = applyPostEnding("Praga torti — 160 000 so'm.", ending, "uz_latn");
    expect(once.endsWith("📞 Buyurtma: +998 90 123 45 67")).toBe(true);
    expect(applyPostEnding(once, ending, "uz_latn")).toBe(once);
  });

  it("keeps a post that already has the contact (any spelling of the number)", () => {
    const t = "Praga torti. Buyurtma: +998 (90) 123-45-67";
    expect(applyPostEnding(t, ending, "uz_latn")).toBe(t);
  });

  it("fills a contact blank with the channel's contact", () => {
    expect(applyPostEnding("Praga torti. Buyurtma uchun: [kontakt].", ending, "uz_latn")).toBe("Praga torti. Buyurtma uchun: +998 90 123 45 67.");
  });

  it("other languages get the contact without Uzbek words", () => {
    expect(contactLineFor("📞 Buyurtma: +998 90 123 45 67", "ru")).toBe("📞 +998 90 123 45 67");
    expect(contactLineFor("📞 Заказ: +998 90 123 45 67", "ru")).toBe("📞 Заказ: +998 90 123 45 67");
    expect(contactLineFor("+998 90 123 45 67", "en")).toBe("+998 90 123 45 67");
  });

  it("adds nothing when the channel's posts add nothing, and drops a contact blank the writer left", () => {
    const none = { pattern: "none" as const, examples: ["Ertaga yana yozaman."] };
    expect(applyPostEnding("Bugun yangi kitob o'qidim.", none, "uz_latn")).toBe("Bugun yangi kitob o'qidim.");
    expect(applyPostEnding("Bugun yangi tort. Buyurtma uchun: [kontakt].", none, "uz_latn")).toBe("Bugun yangi tort.");
  });

  it("appends the channel's recurring hashtags when the post has none", () => {
    const tags = { pattern: "hashtags" as const, hashtags: ["#maslahat"], examples: ["#maslahat"] };
    expect(applyPostEnding("Retinolni sekin boshlang.", tags, "uz_latn")).toBe("Retinolni sekin boshlang.\n\n#maslahat");
    expect(applyPostEnding("Retinol.\n#maslahat #teri", tags, "uz_latn")).toBe("Retinol.\n#maslahat #teri");
  });

  it("the copywriter brief says to add nothing for a 'none' channel, and quotes the contact otherwise", () => {
    expect(endingBrief({ pattern: "none", examples: ["Ertaga yana."] })).toMatch(/Add nothing at the end/);
    expect(endingBrief(ending)).toContain("📞 Buyurtma: +998 90 123 45 67");
    expect(endingBrief(undefined)).toBe("");
  });
});

describe("oneContactRoute keeps the owner's contact", () => {
  it("a tracked link no longer deletes the channel's phone line", () => {
    const text = "Praga torti 160 000 so'm.\nQo'ng'iroq qiling: +998 90 123 45 67.\nYozish uchun: https://t.me/mercatai?start=src_ab12cd_2";
    const keep = contactsIn("+998 90 123 45 67").map((c) => c.key);
    expect(oneContactRoute(text, keep)).toContain("+998 90 123 45 67");
    // Direct is Instagram's inbox: it still goes.
    expect(oneContactRoute("Tort tayyor. Direct'ga yozing.", keep)).toBe("Tort tayyor.");
  });
});

describe("ensureTrackedLink", () => {
  const link = "https://t.me/mercatai?start=src_ab12cd_3";

  it("leaves a post that already has the exact link", () => {
    const t = `Buyurtma: ${link}`;
    expect(ensureTrackedLink(t, link, "uz_latn")).toBe(t);
  });

  it("repairs a mangled copy instead of adding a second link", () => {
    expect(ensureTrackedLink("Yozing: t.me/mercatai?start=src_ab12cd", link, "uz_latn")).toBe(`Yozing: ${link}`);
    expect(ensureTrackedLink("Yozing: https://t.me/mercatai", link, "ru")).toBe(`Yozing: ${link}`);
  });

  it("appends one line when the writer dropped it, and never removes the channel's contact", () => {
    const out = ensureTrackedLink("Tort tayyor.\n📞 +998 90 123 45 67", link, "en");
    expect(out).toBe(`Tort tayyor.\n📞 +998 90 123 45 67\n\nMessage us: ${link}`);
  });

  it("ignores anything that is not a tracked plan link", () => {
    expect(ensureTrackedLink("Tort.", "https://example.com", "uz_latn")).toBe("Tort.");
  });
});

describe("dropTrackedLinks", () => {
  it("without the opt-in a Mercat link the writer left goes, with its label-only line; other links stay", async () => {
    const { dropTrackedLinks } = await import("../src/lib/uslub/ending");
    // A call to action left with nothing to act on goes with its link (review of PR #54).
    expect(dropTrackedLinks("Tort tayyor.\nYozing: https://t.me/mercatai?start=src_ab12cd_1", "mercatai")).toBe("Tort tayyor.");
    expect(dropTrackedLinks("Tort tayyor.\n👉 https://t.me/mercatai?start=src_ab12cd_1", "mercatai")).toBe("Tort tayyor.");
    expect(dropTrackedLinks("Sayt: https://safia.uz · @safia_admin", "mercatai")).toBe("Sayt: https://safia.uz · @safia_admin");
  });
});
