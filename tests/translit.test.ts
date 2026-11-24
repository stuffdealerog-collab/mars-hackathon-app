import { describe, expect, it } from "vitest";
import { latinToCyrillic, normalizeUzLatin } from "../src/lib/uslub/translit";

const cases: Array<[string, string]> = [
  // basic letters and digraphs
  ["Toshkent", "Тошкент"],
  ["choyxona", "чойхона"],
  ["tong", "тонг"],
  ["qo‘shiq", "қўшиқ"],
  ["xalq", "халқ"],
  ["hamma", "ҳамма"],
  ["xona va hovli", "хона ва ҳовли"],
  // o‘ / g‘ with every apostrophe variant
  ["O'zbekiston", "Ўзбекистон"],
  ["O‘zbekiston", "Ўзбекистон"],
  ["Oʻzbekiston", "Ўзбекистон"],
  ["O’zbekiston", "Ўзбекистон"],
  ["O`zbekiston", "Ўзбекистон"],
  ["g'isht", "ғишт"],
  ["bog‘", "боғ"],
  // tutuq belgisi
  ["ma'lumot", "маълумот"],
  ["sanʼat", "санъат"],
  ["e'lon", "эълон"],
  ["mas'uliyat", "масъулият"],
  // s'h is s + h, not sh
  ["Is'hoq", "Исҳоқ"],
  ["Isʼhoq", "Исҳоқ"],
  // e -> э at the start and after vowels
  ["ertaga", "эртага"],
  ["Ekspress", "Экспресс"],
  ["poeziya", "поэзия"],
  ["kecha", "кеча"],
  // y combinations
  ["yer", "ер"],
  ["yoz", "ёз"],
  ["yulduz", "юлдуз"],
  ["yangi", "янги"],
  ["yo'l", "йўл"],
  ["yil", "йил"],
  ["kiyim", "кийим"],
  // ts in loanwords vs native verb forms
  ["informatsiya", "информация"],
  ["militsiya", "милиция"],
  ["ketsa", "кетса"],
  // Russian loanwords
  ["sentabr", "сентябрь"],
  ["1-sentabrdan", "1-сентябрдан"],
  ["oktabr", "октябрь"],
  ["noyabr", "ноябрь"],
  ["dekabr", "декабрь"],
  ["iyun", "июнь"],
  ["kompyuter", "компьютер"],
  ["aksiya", "акция"],
  ["konsert", "концерт"],
  // case
  ["TOSHKENT", "ТОШКЕНТ"],
  ["SHAHAR", "ШАҲАР"],
  ["Shahar", "Шаҳар"],
  ["G'ALABA", "ҒАЛАБА"],
];

describe("latinToCyrillic", () => {
  it.each(cases)("%s -> %s", (latin, cyr) => {
    expect(latinToCyrillic(latin)).toBe(cyr);
  });

  it("transliterates a full sentence with punctuation and numbers", () => {
    expect(latinToCyrillic("Bugun 20% chegirma! Manzil: Chilonzor, 5-uy.")).toBe(
      "Бугун 20% чегирма! Манзил: Чилонзор, 5-уй.",
    );
  });

  it("preserves URLs, handles, hashtags and e-mails", () => {
    const text = "Buyurtma: https://t.me/uslub_bot yoki @uslub_ai #chegirma info@shop.uz";
    expect(latinToCyrillic(text)).toBe(
      "Буюртма: https://t.me/uslub_bot ёки @uslub_ai #chegirma info@shop.uz",
    );
  });

  it("preserves emoji and Cyrillic/Russian text", () => {
    expect(latinToCyrillic("🔥 Yangi menyu — новое меню 🍕")).toBe("🔥 Янги меню — новое меню 🍕");
  });

  it("keeps foreign brand names that cannot be Uzbek Latin", () => {
    expect(latinToCyrillic("Click orqali to'lang")).toBe("Click орқали тўланг");
    expect(latinToCyrillic("Wildberries")).toBe("Wildberries");
  });

  it("keeps English brand words, camelCase names and product codes", () => {
    expect(latinToCyrillic("The North Face etiklari")).toBe("The North Face этиклари");
    expect(latinToCyrillic("PS5 va iPhone 15 Pro, Samsung A54")).toBe("PS5 ва iPhone 15 Про, Самсунг A54");
    expect(latinToCyrillic("2024-yil")).toBe("2024-йил");
  });

  it("keeps listed brand names in Latin", () => {
    expect(latinToCyrillic("Safia filiallarida Uzum karta", ["Safia", "Uzum"])).toBe("Safia филиалларида Uzum карта");
  });

  it("keeps quote marks around words", () => {
    expect(latinToCyrillic("'Salom' dedi")).toBe("'Салом' деди");
  });

  it("is a no-op on empty text", () => {
    expect(latinToCyrillic("")).toBe("");
  });
});

describe("normalizeUzLatin", () => {
  it("normalizes all apostrophe variants", () => {
    expect(normalizeUzLatin("O'zbek g`ilos ma'no")).toBe("Oʻzbek gʻilos maʼno");
  });
});
