import { describe, expect, it } from "vitest";
import { detectLang } from "../src/lib/uslub/brain/stats";
import { analyzeNeuro, deletionEdit, detectNeuro, RU_IN_UZ_HINT, russianInUzbek } from "../src/lib/uslub/neuro";
import { loadFixtures } from "./brain/eval/fixtures";

// A live Uzbek post said "Pereshlite do‘stlaringizga" and still scored 95/100: the editor only knew clichés.
describe("Russian words inside an Uzbek Latin post are hits the editor rewrites", () => {
  it("finds Russian calls to action written in Latin, and whole Cyrillic words", () => {
    const text = "Yangi tortlar keldi! Pereshlite do‘stlaringizga. Podpishites kanalga. Buyurtma uchun Звоните: +998 90 123 45 67";
    expect(russianInUzbek(text).map((h) => h.phrase)).toEqual(["Pereshlite", "Podpishites", "Звоните"]);
    expect(detectNeuro(text, "uz_latn").every((h) => h.suggestion === RU_IN_UZ_HINT)).toBe(true);
    expect(analyzeNeuro(text, "uz_latn").humanScore).toBeLessThan(80);
  });

  it("catches Russian imperative endings on long words", () => {
    expect(russianInUzbek("Zakazyvayte hozir, uspeyte!").map((h) => h.phrase)).toEqual(["Zakazyvayte", "uspeyte"]);
    expect(russianInUzbek("Prihodite bizga, smotrite yangi kolleksiyani").map((h) => h.phrase)).toEqual(["Prihodite", "smotrite"]);
  });

  it("leaves English words, everyday loanwords, links and handles alone", () => {
    for (const text of [
      "Bizning website orqali buyurtma bering, favorite tortingizni tanlang.",
      "Zakaz va dostavka bepul! Aksiya faqat bugun.",
      "Buyurtma: t.me/pishite_bot yoki @zakazhite_admin #pereshlite",
      "Saytimiz: zvonite.uz/menu",
    ])
      expect(russianInUzbek(text)).toEqual([]);
  });

  it("is only an Uzbek Latin rule: Russian and English texts are not checked for it", () => {
    expect(detectNeuro("Звоните нам: +998 90 123 45 67", "ru")).toEqual([]);
    expect(detectNeuro("Spasibo, see you!", "en")).toEqual([]);
  });

  it("the deletion fallback drops the sentence instead of cutting the Russian word out of it", () => {
    const text = "Yangi tortlar keldi. Pereshlite do‘stlaringizga, ular ham xursand bo‘ladi.";
    expect(deletionEdit(text, detectNeuro(text, "uz_latn"))).toBe("Yangi tortlar keldi.");
  });

  it("finds nothing in real Uzbek Latin channel posts (golden corpus sweep)", () => {
    const posts = loadFixtures().flatMap((f) => f.data.posts.map((p) => p.text)).filter((t) => detectLang(t) === "uz-Latn");
    expect(posts.length).toBeGreaterThan(200);
    // 1 359 Uzbek Latin posts of the golden channels: no hit (the one candidate, the brand "AMBRELITE", is in capitals).
    expect(posts.flatMap((t) => russianInUzbek(t).map((h) => h.phrase))).toEqual([]);
  });
});
