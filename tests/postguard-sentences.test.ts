import { describe, expect, it } from "vitest";
import { deletionEdit, detectNeuro } from "../src/lib/uslub/neuro";
import { contactBlankIfNone, dropVideoMentions, oneContactRoute, replaceHiddenPrice } from "../src/lib/uslub/postguard";
import { splitSentences } from "../src/lib/uslub/text";

// A live English post read "To order: [contact].m." (from "7 a.m."): the old splitter broke at every period, so a
// blank replaced half a sentence and left the other half behind. Inputs and old outputs below are the real ones.
describe("splitSentences: a period inside a time, number, link or abbreviation does not end a sentence", () => {
  const cases: [string, string[]][] = [
    ["Fresh bread every morning. Message our admin from 7 a.m. to 9 p.m. See you!", ["Fresh bread every morning. ", "Message our admin from 7 a.m. to 9 p.m. ", "See you!"]],
    ["Write to the admin: t.me/somebakery", ["Write to the admin: t.me/somebakery"]],
    ["Napoleon torti 1.5 kg. Narxi 12.000 so‘m.", ["Napoleon torti 1.5 kg. ", "Narxi 12.000 so‘m."]],
    ["Ждём вас с 9 ч. утра до 18 ч. Звоните!", ["Ждём вас с 9 ч. утра до 18 ч. ", "Звоните!"]],
    ["Ochilish 23.11.2026. Keling!", ["Ochilish 23.11.2026. ", "Keling!"]],
    ["Мы на ул. Навои, д. 5. Ждём!", ["Мы на ул. Навои, д. 5. ", "Ждём!"]],
    ["Toshkent sh. Chilonzor tum. 5-mavze. Keling.", ["Toshkent sh. Chilonzor tum. 5-mavze. ", "Keling."]],
    ["Shifokor A. Karimova qabul qiladi. Yozing.", ["Shifokor A. Karimova qabul qiladi. ", "Yozing."]],
    ["Buyurtma: t.me/mercatai?start=src_ab12_1. Kutamiz!", ["Buyurtma: t.me/mercatai?start=src_ab12_1. ", "Kutamiz!"]],
    ["Торт 30 см. Цена 200 000 сум.", ["Торт 30 см. ", "Цена 200 000 сум."]],
    ["«Salom.» Keyin", ["«Salom.» ", "Keyin"]],
    ["Kutib turing… tez orada", ["Kutib turing… tez orada"]],
  ];
  it.each(cases)("%s", (text, parts) => {
    expect(splitSentences(text)).toEqual(parts);
  });

  it("the pieces always give the text back, line breaks included", () => {
    for (const text of [
      "Salom!\n\nBugun 1.5 kg tort.  Narxi: 120 000 so‘m.\nManzil: ko‘ch. Navoiy 5.",
      "\n\nOdd start. a lowercase next. Done",
      "...",
      "",
      "1. Napoleon\n2. Medovik",
    ])
      expect(splitSentences(text).join("")).toBe(text);
  });

  it("a list number opens a sentence and a line break always ends one", () => {
    expect(splitSentences("1. Napoleon — 120 000 so‘m\n2. Medovik")).toEqual(["1. Napoleon — 120 000 so‘m\n", "2. Medovik"]);
  });
});

describe("blanks and dropped sentences leave no debris", () => {
  it("contactBlankIfNone replaces the whole sentence with the times in it", () => {
    // old: "Fresh bread every morning. To order: [contact].m. to 9 p.m. See you!"
    expect(contactBlankIfNone("Fresh bread every morning. Message our admin from 7 a.m. to 9 p.m. See you!", "en")).toBe(
      "Fresh bread every morning. To order: [contact]. See you!",
    );
  });

  it("contactBlankIfNone leaves a sentence with a real link alone", () => {
    // old: "To order: [contact].me/somebakery"
    expect(contactBlankIfNone("Write to the admin: t.me/somebakery", "en")).toBe("Write to the admin: t.me/somebakery");
    expect(contactBlankIfNone("Adminga yozing: t.me/tortuyi_admin. Kutamiz!", "uz_latn")).toBe("Adminga yozing: t.me/tortuyi_admin. Kutamiz!");
  });

  it("replaceHiddenPrice replaces the whole sentence, not up to the decimal point", () => {
    // old: "Narxi: [narx].5 kg tort."
    expect(replaceHiddenPrice("Narxi lichkada, 1.5 kg tort.", "uz_latn")).toBe("Narxi: [narx].");
    expect(replaceHiddenPrice("Medovik 1.5 kg. Narxi lichkada. Yozing!", "uz_latn")).toBe("Medovik 1.5 kg. Narxi: [narx]. Yozing!");
  });

  it("oneContactRoute drops the phone sentence whole", () => {
    // old: "Order: t.me/mercatai?start=src_ab. m. to 6 p.m."
    expect(oneContactRoute("Order: t.me/mercatai?start=src_ab. Call us on +998 90 123 45 67 from 9 a.m. to 6 p.m.")).toBe("Order: t.me/mercatai?start=src_ab.");
  });

  it("dropVideoMentions drops the video sentence whole", () => {
    expect(dropVideoMentions("Ochiqmiz 9 a.m. dan. Videoni 1.5 daqiqada ko‘ring. Keling!")).toBe("Ochiqmiz 9 a.m. dan. Keling!");
  });

  // Review of PR #50: "г" (год) after a year was read as "г. Ташкент", so the date sentence went with the next one.
  it("a year abbreviation after a number ends its sentence: the date sentence stays", () => {
    expect(splitSentences("Акция до 31 декабря 2026 г. Звоните администратору.")).toEqual(["Акция до 31 декабря 2026 г. ", "Звоните администратору."]);
    expect(splitSentences("Мы в г. Ташкент. Ждём!")).toEqual(["Мы в г. Ташкент. ", "Ждём!"]);
    expect(contactBlankIfNone("Акция до 31 декабря 2026 г. Звоните администратору.", "ru")).toBe("Акция до 31 декабря 2026 г. Для заказа: [контакт].");
    expect(replaceHiddenPrice("Новая коллекция 2026 г. Цену уточняйте у администратора.", "ru")).toBe("Новая коллекция 2026 г. Цена: [цена].");
    expect(oneContactRoute("Заказ: t.me/mercatai?start=src_ab. Скидка до 31.12.2026 г. Пишите @tortuyi_admin.")).toBe(
      "Заказ: t.me/mercatai?start=src_ab. Скидка до 31.12.2026 г.",
    );
  });

  it("the editor's deletion fallback drops a whole sentence, never half of one", () => {
    const text = "Narxi 12.000 so‘m. Zamonaviy dunyoda 1.5 kg tort — noyob imkoniyat. Buyurtma: t.me/x.";
    const out = deletionEdit(text, detectNeuro(text, "uz_latn"));
    expect(out).toBe("Narxi 12.000 so‘m. Buyurtma: t.me/x.");
  });
});
