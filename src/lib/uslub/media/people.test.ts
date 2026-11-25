import { describe, expect, it } from "vitest";
import { isMedicalBrand, isTeamPost, peopleRule } from "./people";

const bakery = { brandName: "Safia", oneLiner: "Toshkentdagi qandolatchilik uyi", products: ["Napoleon", "Medovik"] };

describe("peopleRule: medical businesses never get photoreal people", () => {
  it.each([
    ["Klinika", "kardiologiya va UZI", []],
    ["Shifo Med", "oilaviy poliklinika", []],
    ["Dental Pro", "tish davolash, implantlar", []],
    ["Здоровье", "медицинский центр в Ташкенте", []],
    ["Oson Apteka", "dorilar yetkazib berish", []],
    ["Lab Test", "laboratoriya tahlillari", []],
    ["Doktor Aliyev", "", []],
    ["Detskiy", "консультация педиатра онлайн", []],
    ["Smile", "", ["стоматологические услуги"]],
    ["City Hospital", "family doctors", []],
  ])("%s / %s -> none", (brandName, oneLiner, products) => {
    const a = { brandName, oneLiner, products: products as string[] };
    expect(isMedicalBrand(a)).toBe(true);
    expect(peopleRule({ ...a, brief: "Yangi xizmat", text: "Narxlar haqida" })).toBe("none");
  });

  it.each([
    ["Safia", "Toshkentdagi qandolatchilik uyi"],
    ["Avto Servis", "avto diagnostika va ta'mirlash"],
    ["Coffee Lab", "specialty coffee"],
    ["Uzum Market", "onlayn do'kon"],
  ])("%s / %s is not medical", (brandName, oneLiner) => {
    expect(isMedicalBrand({ brandName, oneLiner, products: [] })).toBe(false);
  });
});

describe("peopleRule: 'meet the team' and staff posts get no invented faces", () => {
  it.each([
    ["Jamoamiz bilan tanishing", undefined],
    ["Bizning xodimlarimiz", undefined],
    ["Ustalarimiz har kuni ertalab non yopadi", undefined],
    ["Ustozlarimiz haqida", undefined],
    ["O‘qituvchilarimizni tanishtiramiz", undefined],
    ["Жамоамиз билан танишинг", undefined],
    ["Знакомьтесь: наша команда", undefined],
    ["Наши сотрудники каждый день", undefined],
    ["Наш мастер Дилноза", undefined],
    ["Meet the team behind the counter", undefined],
    ["A day with our staff", undefined],
    [undefined, "Bizning jamoa"],
  ])("brief %s / hook %s -> none", (brief, hook) => {
    expect(isTeamPost({ brief, hook })).toBe(true);
    expect(peopleRule({ ...bakery, brief, hook, text: "" })).toBe("none");
  });

  it("a staff post is found in the text too", () => {
    expect(peopleRule({ ...bakery, brief: "Juma posti", text: "Bugun sizni qandolatchimiz bilan tanishtiramiz!" })).toBe("none");
  });

  it.each([
    "Napoleon torti dam olish uchun",
    "Jamoat transportida yangi aksiya",
    "Сотрудничество с поставщиками",
    "Персональная скидка 10%",
    "Мастер-класс по выпечке в субботу",
    "Мастерская тортов открылась",
    "Yangi ustara keldi",
    "Командировочным скидка",
    "New Napoleon cake for the weekend",
  ])("an ordinary post keeps the default rule: %s", (brief) => {
    expect(peopleRule({ ...bakery, brief, text: brief })).toBe("default");
  });
});
