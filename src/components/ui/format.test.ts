import { describe, expect, it } from "vitest";
import { fmt, isMachineEvidence, keepNumbers, num, ownerText, parseChannel, plural, rank, weekday } from "./format";

describe("rank (the Ctrl K palette)", () => {
  it("puts a prefix above a word start above letters in order", () => {
    expect(rank("pos", "Postlar")).toBe(3);
    expect(rank("tas", "Matnni nusxalash · Tasdiqlash")).toBe(2);
    expect(rank("pst", "Postlar")).toBe(1);
    expect(rank("xyz", "Postlar")).toBe(0);
  });
  it("finds Cyrillic and Uzbek words, ignores case and an empty query", () => {
    expect(rank("одоб", "Tasdiqlash Одобрить approve")).toBe(2);
    expect(rank("ko‘r", "Postlarni ko‘rish")).toBe(2);
    expect(rank("POST", "postlar")).toBe(3);
    expect(rank("  ", "anything")).toBe(1);
  });
});

const NBSP = "\u00a0";

describe("parseChannel", () => {
  it.each([
    ["t.me/safiabakery", "safiabakery"],
    ["https://t.me/safiabakery/", "safiabakery"],
    ["https://t.me/s/safiabakery", "safiabakery"],
    ["@safia_bakery", "safia_bakery"],
    ["  telegram.me/Kanal_1  ", "Kanal_1"],
    ["safiabakery", "safiabakery"],
  ])("%s -> %s", (input, out) => expect(parseChannel(input)).toBe(out));

  it.each(["", "t.me/", "t.me/abc", "https://t.me/+invite", "instagram.com/shop", "@1shop", "t.me/shop/123"])("rejects %s", (input) =>
    expect(parseChannel(input)).toBeNull(),
  );
});

describe("num", () => {
  it("groups thousands with a no-break space and uses a decimal comma in uz/ru", () => {
    expect(num(8860, "uz")).toBe(`8${NBSP}860`);
    expect(num(1234567, "ru")).toBe(`1${NBSP}234${NBSP}567`);
    expect(num(3.24, "uz", 1)).toBe("3,2");
  });
  it("keeps English separators in en", () => {
    expect(num(8860, "en")).toBe("8,860");
    expect(num(3.24, "en", 1)).toBe("3.2");
  });
});

describe("keepNumbers", () => {
  it("joins thousand groups so they never wrap", () => {
    expect(keepNumbers("Katta patir — 12 000 so‘m, 1 250 000 so‘m")).toBe(`Katta patir — 12${NBSP}000 so‘m, 1${NBSP}250${NBSP}000 so‘m`);
  });
  it("leaves ordinary spaces between numbers and words alone", () => {
    expect(keepNumbers("soat 7 ga, 9-kvartal 12 ta")).toBe("soat 7 ga, 9-kvartal 12 ta");
    expect(keepNumbers("2026 1234")).toBe("2026 1234");
  });
});

describe("plural", () => {
  const ru = ["пост", "поста", "постов"];
  it("follows Russian plural rules", () => {
    expect([1, 2, 5, 21, 22, 25, 111].map((n) => plural(ru, n, "ru"))).toEqual(["пост", "поста", "постов", "пост", "поста", "постов", "постов"]);
  });
  it("uses the plural form for English counts other than one", () => {
    expect(plural(["post", "posts", "posts"], 1, "en")).toBe("post");
    expect(plural(["post", "posts", "posts"], 7, "en")).toBe("posts");
  });
});

describe("fmt", () => {
  it("fills placeholders and keeps unknown ones visible", () => {
    expect(fmt("{n} ta post · {m}", { n: 5 })).toBe("5 ta post · {m}");
  });
});

describe("weekday", () => {
  it("reads an ISO date in local time (no UTC drift)", () => {
    expect(weekday("2026-11-30")).toBe(1); // Monday
    expect(weekday("2026-11-29T23:00:00Z")).toBe(0); // the date part decides: Sunday
    expect(weekday("not a date")).toBeNull();
  });
});

describe("ownerText", () => {
  it("drops rule and stat ids and fixes Uzbek apostrophes", () => {
    const raw = "Postlar o'rtacha 1190 ko'rish oladi. Shu hafta qamrovga e'tibor beramiz. [S.reachRate, S.medianViews, R.LOW_REACH]";
    expect(ownerText(raw, "uz")).toBe("Postlar o‘rtacha 1190 ko‘rish oladi. Shu hafta qamrovga e’tibor beramiz.");
  });
  it("leaves clean text alone and only sets typographic apostrophes elsewhere", () => {
    expect(ownerText("Narx yozilmagan.", "uz")).toBe("Narx yozilmagan.");
    expect(ownerText("Don't hide the price.", "en")).toBe("Don’t hide the price.");
  });
});

describe("isMachineEvidence", () => {
  it("spots internal ids", () => {
    expect(isMachineEvidence("S.reachRate=20% (n=23, 90d) · R.LOW_REACH")).toBe(true);
    expect(isMachineEvidence("Sotuv postlarining 12 tasidan faqat 1 tasida narx bor.")).toBe(false);
  });
});
