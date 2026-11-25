import { describe, expect, it } from "vitest";
import { questionsForBrand } from "../src/lib/uslub/brain/brand-questions";
import { detectChannelType, isGrowthType } from "../src/lib/uslub/brain/channel-type";
import { templateFinding } from "../src/lib/uslub/brain/plain";
import { runRules, SALES_RULES } from "../src/lib/uslub/brain/rules";
import { computeStats } from "../src/lib/uslub/brain/stats";
import type { ChannelData, RawPost, RuleResult } from "../src/lib/uslub/brain/types";
import type { BrandDNA } from "../src/lib/uslub/contract";
import { adFooters, applyPostEnding, brandPostEnding, dropTrackedLinks, endingBrief, extractPostEnding, isAdPost } from "../src/lib/uslub/ending";

// Owner corrections 1 and 2 on five channels the verifier of PR #54 wrote: a bakery whose phone block sits above its
// address and hours, a personal travel blog that mentions what its trips cost, an IELTS teacher, a news digest that
// signs every post with an ad contact, and a community. Pure: no network, no DB, no model.

const P = (texts: string[]) => texts.map((text) => ({ text }));
const NOW = Date.parse("2026-11-25T10:00:00Z");

const BAKERY = [
  "Medovik torti tayyor 🍯\nNarxi 180 000 so'm.\n\n📞 +998 90 123 45 67\n📍 Chilonzor, 9-kvartal\n⏰ 8:00–21:00",
  "Napoleon — 1 kg 150 000 so'm.\nShanbagacha buyurtma bering.\n\n📞 +998 90 123 45 67\n📍 Chilonzor, 9-kvartal\n⏰ 8:00–21:00",
  "Qizil baxmal tortimiz ertalabdan tayyor.\n\n📞 +998 90 123 45 67\n📍 Chilonzor, 9-kvartal\n⏰ 8:00–21:00",
  "Bugun pirojniylar yangi, 25 000 so'mdan.\n\n📞 +998 90 123 45 67\n📍 Chilonzor, 9-kvartal\n⏰ 8:00–21:00",
  "Tug'ilgan kun tortlari buyurtmaga.\n\n📞 +998 90 123 45 67\n📍 Chilonzor, 9-kvartal\n⏰ 8:00–21:00",
];

const TRAVEL_BLOG_RU = [
  "Вчера вернулась из Грузии. Я до сих пор под впечатлением: Тбилиси вечером — это отдельная любовь. Билеты стоили 250$, отель 30$ за ночь.",
  "Сегодня расскажу, как я собирала чемодан на 10 дней. Мой главный совет — брать меньше, чем хочется.",
  "Я впервые полетела одна. Было страшно, но мне понравилось. В Стамбуле забронировала хостел за 15$, цена с завтраком.",
  "Вчера гуляла по Самарканду до ночи. Регистан с подсветкой — мой любимый вид.",
  "Мой маршрут по Узбекистану на 7 дней: Ташкент, Самарканд, Бухара, Хива. Поезд Afrosiyob — 270 000 сум.",
  "Сама не верю, но завтра лечу в Японию! Расскажу всё в следующих постах.",
];

/** The same blog over a longer stretch (12 posts): the analysis a blog owner sees. */
const TRAVEL_BLOG_RU_LONG = [
  ...TRAVEL_BLOG_RU,
  "Токио оказался тише, чем я думала. Метро — 200 иен, рамен — 900 иен.",
  "Киото: храмы, мох и тишина. Я ходила пешком весь день.",
  "Вернулась домой. Самое сложное в путешествиях — возвращаться к будням.",
  "Собрала для вас бюджет поездки в Японию: перелёт 700$, жильё 40$ в день, еда 20$ в день.",
  "Сегодня просто сижу дома и разбираю фото. Скоро покажу лучшие.",
  "Куда мне поехать весной? Думаю между Вьетнамом и Турцией.",
];

const TRAVEL_BLOG_UZ = [
  "Kecha Istanbuldan qaytdim. Men u yerda 5 kun bo'ldim va juda yoqdi.",
  "Bugun sizga Samarqandga qanday borganimni yozaman. Poyezd chiptasi 270 000 so'm turdi.",
  "Men birinchi marta yolg'iz sayohat qildim. Qo'rqinchli edi, lekin arziydi.",
  "Ertaga Buxoroga ketyapman. Qayerga borishimni maslahat bering!",
  "Mening sevimli joyim — Chimyon tog'lari. Dam olish kunlari yana boraman.",
];

const IELTS = [
  "IELTS Writing Task 2: 5 ta keng tarqalgan xato. 1) Mavzudan chetga chiqish 2) Juda uzun kirish 3) Misol yo'q 4) Xulosa yo'q 5) Takrorlash",
  "Speaking Part 2 ni qanday qilib 7.0 ga topshirish mumkin? Mening maslahatim: har kuni 2 daqiqa gapiring.",
  "Bugungi so'z: 'mitigate' — yumshatmoq. Misol: The government should mitigate the effects of pollution.",
  "Listening da eng ko'p uchraydigan tuzoq — raqamlar. Diqqat bilan tinglang.",
  "Reading bo'limida vaqtni qanday taqsimlash kerak? 20 daqiqa har bir passage uchun.",
  "Shogirdim Dilnoza 8.0 oldi! Tabriklaymiz 🎉",
];

const IELTS_LONG = [
  ...IELTS,
  "Bugungi so'z: 'abundant' — mo'l-ko'l. Misol: Water is abundant in this region.",
  "Writing Task 1 da grafikni tasvirlashda 3 ta qadam: umumiy ko'rinish, asosiy farqlar, raqamlar.",
  "Speaking'da 'I think' o'rniga nima deyish mumkin? In my view, From my perspective, As far as I'm concerned.",
  "Bugungi so'z: 'scrutinize' — sinchiklab tekshirmoq.",
  "Mock test natijalari: o'rtacha 6.5. Keyingi hafta yana yozamiz.",
  "Listening Part 4 — eng qiyin qism. Oldindan savollarni o'qib chiqing.",
];

const NEWS_TEXTS = [
  "Prezident yangi farmonni imzoladi. Bu haqda Prezident matbuot xizmati ma'lum qildi.",
  "Toshkentda ertaga yomg'ir kutilmoqda, deb xabar berdi Gidrometxizmat.",
  "Vazirlar Mahkamasi yangi qaror qabul qildi. Manba: lex.uz",
  "Dollar kursi 12 850 so'mga ko'tarildi, deb ma'lum qildi Markaziy bank.",
  "Hukumat elektr narxlarini oshirishni rasman tasdiqladi.",
  "Toshkent metrosi yangi bekatini ochdi, deb bildirdi shahar hokimligi.",
];
/** Every post signs off with the channel and the contact it sells ads through: a footer, not an ad. */
const NEWS = NEWS_TEXTS.map((t) => `${t}\n\n👉 @kun_digest\n📢 Reklama: @kun_reklama`);

const COMMUNITY = [
  "Shanba kuni uchrashuv! Barcha a'zolar taklif qilinadi. Joy: IT Park, soat 15:00.",
  "Hamjamiyatimizga 500 ta a'zo qo'shildi! Rahmat hammaga.",
  "Keyingi meetup mavzusi: Python va AI. Ro'yxatdan o'ting.",
  "Chatimizda savol bering, a'zolar javob beradi.",
  "Volontyorlar kerak: yangi tadbir uchun 5 kishi.",
];

/** A channel as the analysis reads it (newest first, one post every 3 days). */
function channelData(channel: string, title: string, texts: string[]): ChannelData {
  const posts: RawPost[] = texts.map((text, i) => ({
    id: 100 + texts.length - i,
    channel,
    url: `https://t.me/${channel}/${100 + texts.length - i}`,
    text,
    postedAt: new Date(NOW - (i + 1) * 3 * 86_400_000).toISOString(),
    views: 600 + ((i * 37) % 200),
    approx: false,
    media: i % 2 ? "photo" : "text",
    isForward: false,
    links: [],
  }));
  return { channel, title, subscribers: 2400, posts, complete: false, pages: 1 };
}

/** The steps analyzeDeterministic takes without the network: stats, type, rules, template findings. */
function analyse(channel: string, title: string, texts: string[], lang: "uz" | "ru" | "en") {
  const own = channelData(channel, title, texts);
  const stats = computeStats(own, NOW);
  const guess = detectChannelType({ posts: own.posts, title: own.title, postsPerWeek: stats.postsPerWeek, channel });
  const rules = runRules(stats, { category: "", competitors: [], channelType: guess.type, posts: own.posts });
  const fired = rules.filter((r) => r.status === "fired");
  const texts_ = fired.map((r) => templateFinding(r, stats, lang, { channelType: guess.type })).filter((t): t is string => Boolean(t));
  return { guess, stats, fired, findings: texts_ };
}

const CUSTOMER_WORDS = /mijoz|клиент|customer/i;
const SALES_ADVICE = /закажите|buyurtma bering|«order»|"order"|how to order|как заказать|narx|цен[аыуе]|price|manzil|адрес|address/i;

describe("channel type on the verifier's fixtures (owner correction 2)", () => {
  it("the bakery is a business", () => {
    const g = detectChannelType({ posts: P(BAKERY), title: "Safia Bakery", channel: "safiabakery" });
    expect(g.type).toBe("business");
    expect(g.signals).toContain("business:posts 100%");
  });

  it("a Russian travel blog stays a blog: first person through past-tense verbs and possessives, prices told in a story", () => {
    const g = detectChannelType({ posts: P(TRAVEL_BLOG_RU), title: "Аня путешествует" });
    expect(g.type).toBe("blog");
    // "Билеты стоили 250$", "хостел за 15$, цена с завтраком", "Поезд — 270 000 сум": no order, contact or price list.
    expect(g.signals).toContain("business:posts 0%");
    expect(g.confidence).toBeGreaterThanOrEqual(0.6);
    // "Вчера вернулась…", "Вчера гуляла… мой любимый вид" read as the author's own voice.
    expect(detectChannelType({ posts: P(["Вчера вернулась из Грузии. Мой любимый город — Тбилиси, обязательно поеду ещё."]) }).signals).toContain("blog:first-person 100%");
  });

  it("an Uzbek travel blog stays a blog, its ticket price is not a sale", () => {
    const g = detectChannelType({ posts: P(TRAVEL_BLOG_UZ), title: "Sayohatchi Malika" });
    expect(g.type).toBe("blog");
    expect(g.signals).toContain("business:posts 0%");
  });

  it("a home baker writing in the first person still sells: an order word or a phone with the price", () => {
    const g = detectChannelType({
      posts: P([
        "Bugun men medovik pishirdim 😍 Buyurtma qiling, narxi 180 000 so'm.",
        "Kecha qizim uchun tort pishirdim. Sizga ham shunday tort buyurtma qilsangiz bo'ladi — 1 kg 150 000 so'm.",
        "Men uyda pishiraman, faqat tabiiy mahsulotlardan. Buyurtmalar 2 kun oldin qabul qilinadi.\n📞 +998 90 765 43 21",
        "Bugungi tortlarim tayyor! Yetkazib berish Yunusobod bo'ylab. Narxi 160 000 so'm.",
      ]),
      title: "Malika tortlari",
    });
    expect(g.type).toBe("business");
    expect(g.signals).toContain("business:posts 100%");
  });

  it("a shop's price list still sells, even with no contact in the post", () => {
    const shop = P([
      "Mix - палетки в черной коробке\n\n3 шт всего за\n\n150 000 сум",
      "💰 Narxi: 1 200 000 so'm\nXotira: 256 GB",
      "Dell 15 · 7 020 000 сум\nAMD Ryzen 5\n\nDell 15 · 7 650 000 сум\nIntel Core i5",
    ]);
    expect(detectChannelType({ posts: shop }).signals).toContain("business:posts 100%");
  });

  it("an IELTS teacher (tips, the word of the day, exam sections, no prices) is an expert channel, not the business default", () => {
    const g = detectChannelType({ posts: P(IELTS), title: "IELTS with Aziz" });
    expect(g.type).toBe("expert");
    expect(g.signals).not.toContain("default");
    expect(g.scores.expert).toBeGreaterThanOrEqual(0.3);
  });

  it("a news digest whose posts all carry '📢 Reklama: @…' is media: the footer is not an ad", () => {
    expect(adFooters(NEWS).size).toBe(1);
    expect(isAdPost(NEWS[0], adFooters(NEWS))).toBe(false);
    for (const title of ["Kun dayjesti", "Toshkent 24"]) {
      const g = detectChannelType({ posts: P(NEWS), title, channel: "kun_digest", postsPerWeek: 30 });
      expect(g.type, title).toBe("media");
      expect(g.signals).not.toContain("default");
      expect(g.signals).toContain("media:news 100%");
    }
    // A real ad in that channel is still an ad: the marker stands outside the footer.
    expect(isAdPost(`#reklama Eng arzon telefonlar!\n\n${NEWS[0].split("\n\n")[1]}`, adFooters(NEWS))).toBe(true);
  });

  it("a footer seen in a few posts only, or a bare #reklama, is never a footer", () => {
    expect(adFooters([NEWS[0], NEWS_TEXTS[1], NEWS_TEXTS[2], NEWS_TEXTS[3]]).size).toBe(0);
    expect(adFooters(NEWS_TEXTS.map((t) => `${t}\n#reklama`)).size).toBe(0);
  });

  it("the community is a community", () => {
    expect(detectChannelType({ posts: P(COMMUNITY), title: "Tashkent Devs" }).type).toBe("community");
  });
});

describe("post endings on the verifier's fixtures (owner correction 1)", () => {
  it("the bakery's phone block sits above its address and hours: the phone is the channel's contact", () => {
    const e = extractPostEnding(BAKERY, { channel: "safiabakery", bot: "mercatai" });
    expect(e.pattern).toBe("contact");
    expect(e.contact).toBe("📞 +998 90 123 45 67");
    expect(endingBrief(e)).toContain("📞 +998 90 123 45 67");
    expect(endingBrief(e)).not.toMatch(/Add nothing at the end/);
  });

  it("a new bakery post keeps the phone, in its own form, above the address and hours, exactly once", () => {
    const e = extractPostEnding(BAKERY, { channel: "safiabakery", bot: "mercatai" });
    const out = applyPostEnding("Praga torti — 160 000 so'm.\n\n📍 Chilonzor, 9-kvartal\n⏰ 8:00–21:00", e, "uz_latn");
    expect(out).toBe("Praga torti — 160 000 so'm.\n\n📞 +998 90 123 45 67\n📍 Chilonzor, 9-kvartal\n⏰ 8:00–21:00");
    expect(applyPostEnding(out, e, "uz_latn")).toBe(out);
    // A post without the closing lines gets the phone at its end; a [kontakt] blank is filled with the number.
    expect(applyPostEnding("Praga torti tayyor.", e, "uz_latn")).toBe("Praga torti tayyor.\n\n📞 +998 90 123 45 67");
    expect(applyPostEnding("Buyurtma: [kontakt].", e, "uz_latn")).toBe("Buyurtma: +998 90 123 45 67.");
  });

  it("the blog's posts just end: nothing is added, and a tracked link without the opt-in goes", () => {
    const e = extractPostEnding(TRAVEL_BLOG_UZ, { channel: "malika_travel", bot: "mercatai" });
    expect(e.pattern).toBe("none");
    expect(e.contact).toBeUndefined();
    expect(applyPostEnding("Bugun Xivaga bordim.", e, "uz_latn")).toBe("Bugun Xivaga bordim.");
    expect(dropTrackedLinks("Xiva.\nYozing: https://t.me/mercatai?start=src_ab12cd_2", "mercatai")).toBe("Xiva.");
  });

  it("the news digest's posts are its own (the ad footer is not an ad): its ending is learned, footer included", () => {
    const e = extractPostEnding(NEWS, { channel: "kun_digest", bot: "mercatai" });
    expect(e.examples).toHaveLength(3);
    expect(e.examples[0]).toBe("👉 @kun_digest\n📢 Reklama: @kun_reklama");
    expect(e.pattern).toBe("contact");
    expect(e.contact).toBe("📢 Reklama: @kun_reklama");
    // The footer is the last line, right under the channel's signature: a new post that signs off gets it there.
    expect(applyPostEnding("Yangi bekat ochildi.\n\n👉 @kun_digest", e, "uz_latn", { channel: "kun_digest" })).toBe("Yangi bekat ochildi.\n\n👉 @kun_digest\n📢 Reklama: @kun_reklama");
  });

  it("a brand made before endings were learned reads its contact from its stored posts (questions pre-fill it)", () => {
    const old = { channel: "safiabakery", samplePosts: [...BAKERY].reverse(), dna: { name: "Safia" } as unknown as BrandDNA, knowledge: "", channelType: "business" as const };
    expect(brandPostEnding(old, "mercatai")?.contact).toBe("📞 +998 90 123 45 67");
    const q = questionsForBrand(old, { goal: "sale" }, "uz", { bot: "mercatai" });
    expect(q[0]).toMatchObject({ key: "order", prefill: "phone" });
    expect(q[0].text).toContain("+998 90 123 45 67");
    // A fresh brand has no posts to learn from.
    expect(brandPostEnding({ ...old, mode: "fresh" }, "mercatai")).toBeUndefined();
  });
});

describe("the analysis a blog or a teacher sees (owner correction 2)", () => {
  it("the travel blog gets growth findings: no sales rules, no customers, no price or order advice", () => {
    const a = analyse("anya_travels", "Аня путешествует", TRAVEL_BLOG_RU_LONG, "ru");
    expect(a.guess.type).toBe("blog");
    expect(a.fired.map((r) => r.id).filter((id) => SALES_RULES.includes(id))).toEqual([]);
    expect(a.findings.length).toBeGreaterThan(0);
    for (const t of a.findings) {
      expect(t).not.toMatch(CUSTOMER_WORDS);
      expect(t).not.toMatch(SALES_ADVICE);
    }
  });

  it("the IELTS teacher gets growth findings in Uzbek, none of them about customers or orders", () => {
    const a = analyse("ielts_with_aziz", "IELTS with Aziz", IELTS_LONG, "uz");
    expect(a.guess.type).toBe("expert");
    expect(a.fired.map((r) => r.id).filter((id) => SALES_RULES.includes(id))).toEqual([]);
    for (const t of a.findings) {
      expect(t).not.toMatch(CUSTOMER_WORDS);
      expect(t).not.toMatch(SALES_ADVICE);
    }
  });

  it("flat views on a growth channel: readers and subscribers, never customers, in every language", () => {
    const { stats } = analyse("anya_travels", "Аня путешествует", TRAVEL_BLOG_RU_LONG, "ru");
    const rule: RuleResult = { id: "R.SUSPECT_BOOSTED", name: "", status: "fired", kind: "problem", severity: 2, trigger: "", ids: [], effects: "" };
    for (const lang of ["uz", "ru", "en"] as const) {
      const growth = templateFinding(rule, stats, lang, { channelType: "blog" }) ?? "";
      expect(growth).not.toMatch(CUSTOMER_WORDS);
      expect(growth).toMatch(/o‘quvchi|подписчик|readers/);
      // A business keeps its own wording.
      expect(templateFinding(rule, stats, lang, { channelType: "business" })).toMatch(CUSTOMER_WORDS);
    }
  });

  it("no shared finding a growth channel can get says 'customers'", () => {
    const { stats } = analyse("anya_travels", "Аня путешествует", TRAVEL_BLOG_RU_LONG, "ru");
    const ids = ["R.COLD_START", "R.SUSPECT_BOOSTED", "R.LOW_REACH", "R.INCONSISTENT", "R.OVERPOSTING", "R.DECLINING", "R.FORMAT_WINNER", "R.TIME_WINNER", "R.LANGUAGE_WINNER", "R.REPLICATE_WINNERS", "R.COMPETITOR_OUTPERFORMS", "R.CALENDAR", "R.NOISE"];
    for (const type of ["blog", "expert", "media", "community"] as const) {
      expect(isGrowthType(type)).toBe(true);
      for (const id of ids)
        for (const lang of ["uz", "ru", "en"] as const) {
          const t = templateFinding({ id, name: "", status: "fired", kind: "problem", severity: 1, trigger: "", ids: [], effects: "" }, stats, lang, { channelType: type });
          if (t) expect(t, `${type} ${id} ${lang}`).not.toMatch(CUSTOMER_WORDS);
        }
    }
  });
});
