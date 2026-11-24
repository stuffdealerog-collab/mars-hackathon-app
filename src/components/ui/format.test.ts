import { describe, expect, it } from "vitest";
import { fmt, keepNumbers, num, parseChannel, weekday } from "./format";

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
