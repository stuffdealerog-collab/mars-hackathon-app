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

// A running promotion was flagged as past ("В посте есть прошедшая дата (10.11.2026, 23.11.2026)"): the start of a
// period is history, the promotion is not. Old results are in the comments.
describe("periods: a promotion still running is not a past date", () => {
  const DAY = "2026-12-01";

  it("'noyabrdan 10' is not 10 November", () => {
    // old: ["2026-11-23", "2026-11-10", "2026-12-10"]
    expect(datesIn("Aksiya 23-noyabrdan 10-dekabrgacha davom etadi", DAY)).toEqual(["2026-11-23", "2026-12-10"]);
    expect(datesIn("Скидка с 23 ноября 10% на всё", DAY)).toEqual(["2026-11-23"]);
  });

  it.each([
    "Aksiya 23-noyabrdan 10-dekabrgacha davom etadi", // old: ["2026-11-23", "2026-11-10"]
    "Aksiya 23-noyabrdan 10-dekabr gacha",
    "Chegirma 23-noyabrdan 10-dekabrga qadar",
    "Акция с 23 ноября по 10 декабря", // old: ["2026-11-23"]
    "Акция с 23.11 по 10.12",
    "Акция 23 ноября – 10 декабря",
    "Акция 23.11–10.12", // old: ["2026-11-23"]
    "Sale from November 23 to December 10", // old: ["2026-11-23"]
    "Sale from 23 November until 10 December",
    "Sale Nov 23-Dec 10",
  ])("%s", (text) => {
    expect(pastDatesIn(text, DAY)).toEqual([]);
  });

  it("a period that is over is named by its end", () => {
    expect(pastDatesIn("Aksiya 1-noyabrdan 20-noyabrgacha edi", DAY)).toEqual(["2026-11-20"]);
    expect(pastDatesIn("Акция с 1 по 20 ноября", DAY)).toEqual(["2026-11-20"]);
    expect(pastDatesIn("Sale from November 1 to November 20", DAY)).toEqual(["2026-11-20"]);
  });

  it("a period over New Year runs on", () => {
    expect(pastDatesIn("Yangi yil aksiyasi 25-dekabrdan 10-yanvargacha", "2026-12-28")).toEqual([]);
  });

  it("two separate dates are still two dates", () => {
    expect(pastDatesIn("Ochilish 23-noyabr edi, keyingi tadbir 10-dekabr", DAY)).toEqual(["2026-11-23"]);
  });
});
