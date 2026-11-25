import { describe, expect, it } from "vitest";
import { coverCrop, instagramCaption, instagramFileName, ownHashtags } from "./instagram";

describe("instagramCaption", () => {
  it("drops Mercat's tracked link and the line it sits on", () => {
    const text = "Issiq patir bor.\n\n👉 Buyurtma: t.me/mercatai?start=src_k3x9qa_4\n\nChilonzor 9";
    expect(instagramCaption(text)).toBe("Issiq patir bor.\n\nChilonzor 9");
  });

  it("turns a Telegram @handle into a t.me link (an Instagram @ points at someone else)", () => {
    expect(instagramCaption("Buyurtma uchun @nonvoy_admin ga yozing")).toBe("Buyurtma uchun t.me/nonvoy_admin ga yozing");
    expect(instagramCaption("Yozing: @Dilnoza_Shop.")).toBe("Yozing: t.me/Dilnoza_Shop.");
  });

  it("leaves e-mails, existing t.me links and phone numbers alone", () => {
    const text = "Pochta: info@nonvoy.uz\nKanal: t.me/nonvoy\n📞 +998 90 123 45 67";
    expect(instagramCaption(text)).toBe(text);
  });

  it("adds the channel's own hashtags once, none when the channel uses none", () => {
    expect(instagramCaption("Patir", { hashtags: ["#patir", "nonvoy", "#patir"] })).toBe("Patir\n\n#patir #nonvoy");
    expect(instagramCaption("Patir #patir", { hashtags: ["#patir", "#non"] })).toBe("Patir #patir\n\n#non");
    expect(instagramCaption("Patir", { hashtags: [] })).toBe("Patir");
  });

  it("keeps at most 5 of the channel's hashtags", () => {
    const tags = ["#a1", "#b2", "#c3", "#d4", "#e5", "#f6", "#g7"];
    expect(instagramCaption("X", { hashtags: tags }).split("\n").at(-1)).toBe("#a1 #b2 #c3 #d4 #e5");
  });

  it("collapses blank lines and keeps Uzbek ‘ and ’", () => {
    expect(instagramCaption("O‘zbek  non\n\n\n\nMa’lumot uchun")).toBe("O‘zbek  non\n\nMa’lumot uchun");
  });

  it("clips to Instagram's 2 200 characters", () => {
    const long = "So‘z ".repeat(800);
    const out = instagramCaption(long, { hashtags: ["#non"] });
    expect(out.length).toBeLessThanOrEqual(2200);
    expect(out.endsWith("#non")).toBe(true);
  });
});

describe("ownHashtags", () => {
  it("reads the DNA's hashtags and the post ending's, normalised", () => {
    expect(ownHashtags({ hashtags: ["patir", "#Non"], postEnding: { pattern: "hashtags", hashtags: ["#non", "#toshkent"], examples: [] } })).toEqual(["#patir", "#Non", "#toshkent"]);
    expect(ownHashtags(undefined)).toEqual([]);
  });
});

describe("coverCrop", () => {
  it("crops a square to 4:5 from the middle", () => {
    expect(coverCrop(1000, 1000)).toEqual({ sx: 100, sy: 0, sw: 800, sh: 1000 });
  });

  it("crops a tall picture top and bottom", () => {
    expect(coverCrop(1000, 2000)).toEqual({ sx: 0, sy: 375, sw: 1000, sh: 1250 });
  });

  it("leaves a 4:5 picture whole", () => {
    expect(coverCrop(1024, 1280)).toEqual({ sx: 0, sy: 0, sw: 1024, sh: 1280 });
  });
});

describe("instagramFileName", () => {
  it("names the file after the channel and day", () => {
    expect(instagramFileName("@Non_voy", "2026-11-27")).toBe("non_voy-2026-11-27-instagram.jpg");
    expect(instagramFileName("Tandir non", undefined, "2026-11-25")).toBe("tandir-non-2026-11-25-instagram.jpg");
  });
});
