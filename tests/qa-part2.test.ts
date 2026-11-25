import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

// QA 2026-11-25, engine part 2: owner-visible language (E8), post content rules (E9), bot terms and texts (E10, E11,
// E14), API edge cases (E12). Pure functions plus the real i18n dictionary.
vi.mock("server-only", () => ({}));

import { briefMetaText } from "../src/lib/uslub/brain/plan-checks";
import { ownerText } from "../src/lib/uslub/brain/copy";
import { metricText, mondayOf } from "../src/lib/uslub/brain/skeleton";
import { pluralForm, sufficiency } from "../src/lib/uslub/brain/sufficiency";
import { evidenceText } from "../src/lib/uslub/brain/plain";
import type { LedgerEntry } from "../src/lib/uslub/brain/types";
import { errorText, invalidInputText, type InputIssue } from "../src/lib/uslub/errors";
import { contactBlankIfNone, fixMixedScript, oneContactRoute, replaceHiddenPrice, ruFirstPersonGender } from "../src/lib/uslub/postguard";
import { isInviteLink } from "../src/lib/uslub/scrape";
import { withoutLinkLabelLines } from "../src/lib/uslub/text";
import { formatDay, LOCALES, t } from "../src/lib/i18n";

describe("owner-visible plan fields speak the owner's language (E8)", () => {
  it("the slot metric is in the plan's language, with no ledger ids", () => {
    expect(metricText("sale", 4670, "ru")).toBe("≥47 открытий бота (около 1% переходов) и ≥1 заказ");
    expect(metricText("reach", 1000, "uz")).toBe("72 soatda ≥1200 ko‘rish");
    expect(metricText("trust", undefined, "en")).toBe("first week: we measure the starting numbers");
    for (const l of LOCALES) expect(metricText("sale", 500, l)).not.toMatch(/\[S\.|taxminiy\)|CTR/);
  });

  it("briefMeta says why the time and the approval, without ids or internal words", () => {
    const ru = briefMetaText({ timeSource: "data", reasons: ["narx", "birinchi postlar", "critic:HOOK"], exp: "hour" }, "ru");
    expect(ru).toBe("Время: по данным вашего канала · Подтвердить: цена, первые посты, замечание проверки · Тест: время");
    expect(briefMetaText({ timeSource: "prior", reasons: [] }, "uz")).toBe("Vaqt: taxminiy · Tasdiq: shart emas");
    expect(ru).not.toMatch(/Dalil|S\.|autopilot/);
  });

  it("English labels and 'ledger' in a brief become the owner's words", () => {
    expect(ownerText("Angle: утро без очереди. Facts: цена капучино", "ru")).toBe("Подача: утро без очереди. Факты: цена капучино");
    expect(ownerText("Angle: ertalabki qahva; use the ledger price", "uz")).toBe("Burchak: ertalabki qahva; use ma’lumotlaringiz price");
  });

  it("an Uzbek word half in Cyrillic is written in Latin; whole Russian words stay", () => {
    expect(fixMixedScript("Narxini adminдан so‘rang")).toBe("Narxini admindan so‘rang");
    expect(fixMixedScript("Toshkentда yetkazamiz")).toBe("Toshkentda yetkazamiz");
    expect(fixMixedScript("«Тандыр нон» — Safia")).toBe("«Тандыр нон» — Safia");
  });
});

describe("post content rules (E9)", () => {
  it("a hidden price becomes a price blank the owner fills (approve refuses until then)", () => {
    expect(replaceHiddenPrice("Торт «Наполеон» на заказ. Цену уточняйте у администратора. Пишите!", "ru")).toBe("Торт «Наполеон» на заказ. Цена: [цена]. Пишите!");
    expect(replaceHiddenPrice("Napoleon torti. Narxi lichkada.", "uz_latn")).toBe("Napoleon torti. Narxi: [narx].");
    expect(replaceHiddenPrice("Napoleon cake, 180 000 so‘m.", "en")).toBe("Napoleon cake, 180 000 so‘m.");
  });

  it("one way to order: with the tracked link, no extra @admin line and never Direct", () => {
    const post = "Kapuchino 25 000 so‘m. Buyurtma uchun @safia_admin ga yozing. Direct’ga ham yozishingiz mumkin.\nBuyurtma: https://t.me/mercatai?start=src_d9957e_1";
    expect(oneContactRoute(post)).toBe("Kapuchino 25 000 so‘m.\nBuyurtma: https://t.me/mercatai?start=src_d9957e_1");
    // Without a tracked link the brand's own contact stays (only Direct goes).
    expect(oneContactRoute("Buyurtma: @safia_admin ga yozing. Yoki Direct’ga.")).toBe("Buyurtma: @safia_admin ga yozing.");
  });

  it("a new channel with no known contact gets a contact blank instead of 'write to the admin'", () => {
    expect(contactBlankIfNone("Yangi to‘plam keldi. Buyurtma uchun admin bilan yozing!", "uz_latn")).toBe("Yangi to‘plam keldi. Buyurtma uchun: [kontakt].");
    expect(contactBlankIfNone("Пишите администратору: @shop_admin", "ru")).toBe("Пишите администратору: @shop_admin");
  });

  it("the owner's grammatical gender comes from their own Russian posts", () => {
    expect(ruFirstPersonGender(["Сегодня я приготовила торт", "Я сама пеку каждое утро, рада вам!"])).toBe("f");
    expect(ruFirstPersonGender(["Я испёк хлеб. Сам выбирал муку, рад гостям."])).toBe("m");
    expect(ruFirstPersonGender(["Мы ждём вас каждый день"])).toBeNull();
  });

  it("lines made only of link labels ('Сайт | Telegram | Instagram') are dropped; a call-to-action link stays", () => {
    const html = 'Торты на заказ<br/><a href="https://x.uz">Сайт</a> | <a href="https://t.me/x">Telegram</a> | <a href="https://instagram.com/x">Instagram</a><br/><a href="https://t.me/x_admin">Buyurtma berish</a>';
    expect(withoutLinkLabelLines(html).replace(/<[^>]+>/g, "")).toBe("Торты на заказ\nBuyurtma berish");
  });
});

describe("bot texts (E10, E11, E14)", () => {
  it("one name for the score and the Studio, in every language", () => {
    expect(t("uz", "bot.post_header", { i: 1, score: 90 })).toBe("✍️ Post 1 · tabiiylik: 90/100");
    expect(t("ru", "bot.post_header", { i: 1, score: 90 })).toBe("✍️ Пост 1 · естественность: 90/100");
    expect(t("en", "bot.post_header", { i: 1, score: 90 })).toBe("✍️ Post 1 · natural: 90/100");
    expect(t("ru", "bot.done")).toBe("Готово! Весь план — в приложении: для остальных дней нажмите «Написать пост». Там же версии постов на кириллице, русском и английском. Без вашего одобрения ничего не публикуется.");
    expect(t("uz", "bot.open_studio")).toBe("🧩 Studiya’da ochish");
    for (const l of LOCALES) expect(`${t(l, "bot.done")} ${t(l, "pub.not_found")} ${t(l, "bot.results_no_plan")}`).not.toMatch(/Studio’da|в Studio/);
    for (const l of LOCALES) expect(`${t(l, "bot.done_no_plan")} ${t(l, "bot.photos_has_brand")} ${t(l, "bot.photos_skipped")}`).not.toMatch(/Studio’da|в Studio/);
  });

  it("the texts that say which bot to add name it, and the uz admin right is Telegram's own label", () => {
    for (const l of LOCALES) {
      expect(t(l, "bot.help", { bot: "@mercatai" })).toContain("@mercatai");
      expect(t(l, "pub.ask_channel")).toContain("@mercatai");
      expect(t(l, "pub.bot_not_admin_send", { channel: "safia" })).toContain("@mercatai");
      expect(t(l, "bot.profile.description").length).toBeLessThanOrEqual(512);
    }
    expect(t("uz", "pub.ask_channel")).toContain("«Yozuvli xabarlar»");
    expect(t("uz", "pub.bot_not_admin", { channel: "safia" })).not.toContain("Post yozish");
    expect(errorText("bot_not_admin", "uz")).toContain("«Yozuvli xabarlar»");
  });

  it("the lead alert and dates are in the owner's language", () => {
    expect(formatDay("2026-11-26", "uz")).toBe("26-noyabr");
    expect(formatDay("2026-11-26", "ru")).toBe("26 ноября");
    expect(formatDay("2026-11-26", "en")).toBe("26 November");
    const ru = t("ru", "bot.lead_alert", { who: "Ali", post: "«Капучино»", day: formatDay("2026-11-27", "ru") });
    expect(ru).toBe("🔔 Новая заявка: Ali\nпо ссылке из поста «Капучино» (27 ноября).\nНапишите клиенту сами. Если купит — нажмите кнопку, план это учтёт.");
    expect(t("en", "bot.lead_sold")).toBe("✅ Sold");
    expect(t("ru", "bot.lead_post", { slot: 3 })).toBe("пост 3");
  });

  it("Russian counts agree with their number", () => {
    expect([1, 2, 5, 11, 21, 22, 112].map((n) => pluralForm(n, "пост", "поста", "постов"))).toEqual(["пост", "поста", "постов", "постов", "пост", "поста", "постов"]);
    const ru = sufficiency({ competitors: 2 }, "ru").map((x) => x.text);
    expect(ru).toContain("Конкуренты: сравнили 2 настоящих канала");
    expect(sufficiency({ competitors: 5 }, "ru").map((x) => x.text)).toContain("Конкуренты: сравнили 5 настоящих каналов");
  });
});

describe("API edge cases (E12)", () => {
  it("a private invite link is recognised (it becomes channel_empty: private, not 'invalid link')", () => {
    expect(isInviteLink("https://t.me/+AbCdEfGh123")).toBe(true);
    expect(isInviteLink("t.me/joinchat/AAAAAE1234")).toBe(true);
    expect(isInviteLink("+AbCdEfGh123")).toBe(true);
    expect(isInviteLink("https://t.me/safiabakery")).toBe(false);
    expect(isInviteLink("@safiabakery")).toBe(false);
  });

  it("validation errors name the field and the limit in the owner's words", () => {
    const Body = z.object({ knowledge: z.string().max(8000).optional(), slots: z.array(z.object({ day: z.string().min(4) })).max(7).optional() });
    const issue = (body: unknown) => Body.safeParse(body).error?.issues[0] as unknown as InputIssue;
    expect(invalidInputText(issue({ knowledge: "x".repeat(8001) }), "uz")).toBe("Tavsif 8000 belgidan oshmasin.");
    expect(invalidInputText(issue({ slots: Array(8).fill({ day: "2026-11-27" }) }), "ru")).toBe("Посты: не больше 7.");
    expect(invalidInputText(issue({ slots: [{ day: "x" }] }), "en")).toBe("Posts #1: the day is too short.");
    // A field the owner never typed is not named.
    expect(invalidInputText({ code: "invalid_type", path: ["initData"], input: 5 }, "ru")).toBe("Данные неполные или неверные.");
  });

  it("a union body (/posts) reports the branch the caller meant, not 'body'", () => {
    const Posts = z.union([
      z.object({ brandId: z.string(), slots: z.array(z.object({ day: z.string() })).min(1).max(7) }),
      z.object({ brandId: z.string(), brief: z.string().min(2).max(2000) }),
    ]);
    const issue = Posts.safeParse({ brandId: "b", slots: Array(9).fill({ day: "2026-11-27" }) }).error?.issues[0] as unknown as InputIssue;
    expect(invalidInputText(issue, "uz")).toBe("Postlar: ko‘pi bilan 7 ta.");
  });

  it("evidence for an hour, weekday or format bucket is readable, never empty", () => {
    const e = (id: string, label: string, display: string, value: number | string): [string, LedgerEntry] => [id, { id, label, display, value, source: "stats" } as LedgerEntry];
    const ledger = new Map([e("S.hourLift.19-22", "hourLift 19-22", "1.40×", 1.4), e("S.weekdayLift.Mon", "weekdayLift Mon", "0.80×", 0.8), e("S.formatLift.photo", "formatLift photo", "n=2", "insufficient")]);
    expect(evidenceText(["S.hourLift.19-22", "S.weekdayLift.Mon", "S.formatLift.photo"], ledger, "ru")).toBe("посты в 19:00–22:00: +40% · посты в понедельник: −20%");
    expect(evidenceText(["S.hourLift.19-22"], ledger, "uz")).toBe("19:00–22:00 dagi postlar: +40%");
  });

  it("weekOf is the Monday of the plan's first week", () => {
    expect(mondayOf("2026-11-26")).toBe("2026-11-23");
    expect(mondayOf("2026-11-23")).toBe("2026-11-23");
    expect(mondayOf("2026-11-29")).toBe("2026-11-23");
  });
});
