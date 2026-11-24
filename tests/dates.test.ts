import { describe, expect, it } from "vitest";
import { datesIn, pastDatesIn } from "../src/lib/uslub/dates";

const REF = "2026-11-27";

describe("dates written in posts and facts", () => {
  it("reads the common ways a date is written", () => {
    expect(datesIn("Ochilish sanasi: 03.11.2026", REF)).toEqual(["2026-11-03"]);
    expect(datesIn("2026-11-03 kuni", REF)).toEqual(["2026-11-03"]);
    expect(datesIn("3-noyabr kuni ochildi", REF)).toEqual(["2026-11-03"]);
    expect(datesIn("Открываемся 3 ноября", REF)).toEqual(["2026-11-03"]);
    expect(datesIn("Opening on November 3", REF)).toEqual(["2026-11-03"]);
    expect(datesIn("3 noyabrdan boshlab", REF)).toEqual(["2026-11-03"]);
    expect(datesIn("до 05.12", REF)).toEqual(["2026-12-05"]);
  });

  it("times, prices and counts are not dates", () => {
    expect(datesIn("Har kuni 20.40 da, narxi 25.000 so'm", REF)).toEqual([]);
    expect(datesIn("Kuniga 2 marta, 3 martaba yuving", REF)).toEqual([]);
    expect(datesIn("1.5 kg tort, 12.5% chegirma", REF)).toEqual([]);
    expect(datesIn("Наш market 3 этажа", REF)).toEqual([]);
  });

  it("a date with no year is the nearest such day (January after a November post is next year)", () => {
    expect(datesIn("15-yanvargacha", REF)).toEqual(["2027-01-15"]);
    expect(datesIn("3-noyabr", REF)).toEqual(["2026-11-03"]);
  });

  it("past dates are the ones before the post's day", () => {
    expect(pastDatesIn("Yangi filial ochilmoqda! Ochilish sanasi: 03.11.2026", REF)).toEqual(["2026-11-03"]);
    expect(pastDatesIn("Aksiya 30-noyabrgacha", REF)).toEqual([]);
  });
});
