import { describe, expect, it } from "vitest";
import { defaultGoalFor, detectChannelType, isGrowthType } from "../src/lib/uslub/brain/channel-type";
import { computeStats } from "../src/lib/uslub/brain/stats";
import { loadFixtures } from "./brain/eval/fixtures";

const posts = (...texts: string[]) => texts.map((text) => ({ text }));

const BAKERY = posts(
  "🎂 Medovik torti — 180 000 so'm. Buyurtma: +998 90 123 45 67. Yetkazib berish Chilonzor bo'ylab bepul!",
  "Yangi: pista kremli eklerlar. Narxi 15 000 so'm. Buyurtma uchun @safia_admin ga yozing.",
  "Bugun vitrinada: Napoleon, Praga, Qizil baxmal. Manzil: Bunyodkor ko'chasi 12, mo'ljal: Metro Novza. Ish vaqti 08:00–22:00.",
  "Tug'ilgan kun uchun tortlarga buyurtmalar 2 kun oldin qabul qilinadi. Narxlar 1 kg uchun 150 000 so'mdan.",
  "Yangi yil to'plamlari: 12 ta pirojniy — 120 000 so'm. Buyurtma va yetkazib berish: t.me/safia_order_bot",
  "Chegirma! Har juma kuni barcha pirojniylarga 10%. Filiallarimiz manzili bio'da.",
);

const BLOG = posts(
  "Bugun ertalab men birinchi marta Chorsu bozoriga yolg'iz bordim. Juda ko'p odam, men esa adashib qoldim 😅 Lekin non hidi hammasiga arzidi.",
  "Kecha o'g'lim bilan parkda yurdik. Men uchun bu haftaning eng yaxshi kuni bo'ldi. Ba'zan kichik narsalar eng muhimi.",
  "Men bu yil 30 ta kitob o'qishni maqsad qildim. Hozircha 12 tasini o'qidim. Eng yoqqani — «O'tkan kunlar», uni ikkinchi marta o'qidim.",
  "Сегодня я наконец-то дописала свой первый рассказ. Мне страшно его показывать, но я решилась. Завтра выложу сюда.",
  "Dam olish kunlari men oilam bilan Chimyonga bordim. Qor, choy va tog' havosi. Hayotim shunday kunlardan iborat bo'lsa edi.",
  "Men nega har kuni yozaman? Chunki yozganimda o'zimni eshitaman. Bugun ham shunchaki yozdim.",
);

const EXPERT = posts(
  "Teri parvarishida 5 ta xato:\n1. Kremni quruq teriga surtish\n2. SPF ni faqat yozda ishlatish\n3. Yuzni issiq suv bilan yuvish\n4. Skrabni har kuni ishlatish\n5. Uxlashdan oldin makiyajni yuvmaslik",
  "Dermatolog sifatida eng ko'p beriladigan savol: akne ovqatdan bo'ladimi? Qisqa javob: ba'zan. Mening tajribamda shirinlik va sut ko'pincha sabab bo'ladi.",
  "Maslahat: retinolni haftasiga 2 marta boshlang. Nima uchun? Teri o'rganishi kerak. Birdan har kuni surtsangiz qizarish bo'ladi.",
  "Bilasizmi, SPF 30 va SPF 50 farqi siz o'ylagandek katta emas. Menimcha, eng muhimi — har 2 soatda qayta surtish.",
  "Afsona: yog'li teriga krem kerak emas. Fakt: yog'li teri ham namlikka muhtoj. Qanday qilib to'g'ri tanlash kerak — keyingi postda.",
  "Совет дерматолога: как правильно выбрать очищающее средство. Почему пенки сушат кожу и что делать.",
);

const NEWS = posts(
  "⚡️ Toshkentda metro yangi bekati ochildi, deya ma'lum qildi transport vazirligi. Batafsil: https://kun.uz/news/1",
  "Prezident yangi farmonni imzoladi. Unga ko'ra, 1-yanvardan pensiyalar 15% ga oshadi. Manba: https://gazeta.uz/a",
  "Ob-havo: ertaga Toshkentda +5 daraja, yomg'ir kutilmoqda, deb xabar berdi Gidromet. https://daryo.uz/b",
  "Markaziy bank dollar kursini e'lon qildi: 1 dollar — 12 850 so'm. Manba: cbu.uz",
  "Hukumat yangi soliq imtiyozlarini tasdiqladi, deya xabar berdi Moliya vazirligi matbuot xizmati.",
  "Срочно: в Ташкенте временно перекроют улицу Навои, сообщает ГУВД. Подробнее по ссылке https://podrobno.uz/c",
);

describe("detectChannelType", () => {
  it("a bakery is a business that sells (goal: orders)", () => {
    const g = detectChannelType({ posts: BAKERY, title: "Safia Bakery", description: "Tortlar va pirojniylar, yetkazib berish" });
    expect(g.type).toBe("business");
    expect(g.confidence).toBeGreaterThanOrEqual(0.5);
    expect(defaultGoalFor(g.type)).toBe("sale");
    expect(isGrowthType(g.type)).toBe(false);
  });

  it("a personal blog is a blog (goal: subscribers)", () => {
    const g = detectChannelType({ posts: BLOG, title: "Dilnoza yozadi", description: "Shaxsiy blog: kitoblar, oila, hayot" });
    expect(g.type).toBe("blog");
    expect(defaultGoalFor(g.type)).toBe("grow");
    expect(isGrowthType(g.type)).toBe(true);
  });

  it("a dermatologist's advice channel is an expert channel", () => {
    const g = detectChannelType({ posts: EXPERT, title: "Dermatolog Aziza", description: "Teri haqida maslahatlar" });
    expect(g.type).toBe("expert");
    expect(defaultGoalFor(g.type)).toBe("grow");
  });

  it("a news digest is media, also without a telling title", () => {
    expect(detectChannelType({ posts: NEWS, title: "Toshkent 24", postsPerWeek: 40 }).type).toBe("media");
    expect(detectChannelType({ posts: NEWS, title: "Yangiliklar dayjesti" }).type).toBe("media");
  });

  it("a club channel is a community", () => {
    const g = detectChannelType({
      posts: posts(
        "Shanba kuni klub a'zolari uchun uchrashuv: soat 10:00 da Bobur bog'ida yuguramiz. Qo'shiling!",
        "Yangi a'zolarimizni tabriklaymiz! Hamjamiyatimizda endi 300 kishi.",
        "Keyingi tadbir — 5 km poyga. Ro'yxatdan o'ting: forma pinned postda.",
        "Встреча участников клуба в это воскресенье, присоединяйтесь к нашему чату.",
      ),
      title: "Tashkent Runners Club",
    });
    expect(g.type).toBe("community");
  });

  it("forwards and ads are not the channel's voice; an empty channel defaults to business at low confidence", () => {
    const g = detectChannelType({ posts: [...BLOG.map((p) => ({ ...p, isForward: true })), { text: "#reklama Eng arzon telefonlar 1 200 000 so'm, buyurtma +998 90 000 00 00" }] });
    expect(g.type).toBe("business");
    expect(g.confidence).toBeLessThan(0.5);
    expect(g.signals).toContain("default");
  });

  it("the golden business channels stay business (no sales plan lost)", () => {
    const fixtures = loadFixtures();
    if (!fixtures.length) return;
    const wrong: string[] = [];
    for (const f of fixtures) {
      const now = Date.parse(f.capturedAt);
      const g = detectChannelType({ posts: f.data.posts, title: f.data.title, postsPerWeek: computeStats(f.data, now).postsPerWeek });
      if (g.type !== "business") wrong.push(`${f.handle}:${g.type}`);
    }
    // These are shops, clinics, cafes and schools: at most a few may read otherwise, and the owner confirms the goal.
    expect(wrong.length / fixtures.length, wrong.join(", ")).toBeLessThanOrEqual(0.1);
  });
});
