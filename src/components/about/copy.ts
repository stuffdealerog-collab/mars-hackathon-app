import type { AgentRole } from "@/lib/uslub/contract";
import type { Lang } from "../ui/format";

/**
 * /about, "How Mercat works", in Uzbek (Latin), Russian and English. Written from what the product does today
 * (docs/sprint, the value-loop plan, the autopilot and the bot's own messages); what is not live yet says so.
 * Every example is the made-up bakery the landing already shows, marked "namuna".
 */

export type ChapterId = "link" | "analysis" | "plan" | "posts" | "approve" | "autopilot" | "report" | "video" | "where";

/** A day, a time and a topic in a sample week plan. */
type PlanRow = [day: string, time: string, topic: string];

const uz = {
  title: "Mercat qanday ishlaydi",
  lead: "Kanal havolasidan kanalingizda chiqqan postgacha: kim nima qiladi, qayerda siz qaror qilasiz va nima hali tayyor emas.",
  jump: "Kanalimni tekshirish",
  panel: {
    label: "Mercat bo‘limi",
    idle: "Chiroq xodim ishlaganda yonadi",
    held: "Chiroqlar natijani saqlab turibdi",
    waiting: "sizni kutmoqda",
    /** Brend xotirasi's sample result: how the bakery addresses its readers. */
    voice: "«siz», samimiy",
  },
  /** "Who works here": the employees named under a chapter's heading. */
  who: "Ishlaydi:",
  you: "Siz",
  chapters: {
    link: {
      h: "Kanal havolasini qo‘yasiz",
      p: "Ochiq Telegram kanal havolasi yetadi: parol ham, login ham kerak emas. Kanalingiz hali bo‘sh bo‘lsa, «Kanalim hali bo‘sh»ni bosing, biznesingizni bir necha gap bilan yozing va 5 tagacha mahsulot rasmini qo‘shing.",
      fieldLabel: "Kanal havolasi (namuna)",
    },
    analysis: {
      h: "Kanalingizni o‘z raqamlari bilan o‘qiydi",
      p: "Analitik so‘nggi postlaringizni, ularning ko‘rishlarini va chiqqan vaqtini o‘qiydi, kanal turini aniqlaydi: do‘kon, blog, ekspert yoki yangiliklar. Keyin nimani tuzatish kerakligini raqam bilan ko‘rsatadi. Brend xotirasi qanday yozishingizni eslab qoladi.",
      voiceTitle: "Qanday yozasiz",
      voice: [
        ["Ohang", "samimiy, «siz» bilan"],
        ["Boshlanishi", "vaqt va mahsulotdan"],
        ["Narx", "so‘mda: 12 000 so‘m"],
        ["Emoji", "bitta, birinchi qatorda"],
        ["Oxiri", "«adminga yozing»"],
      ] as [string, string][],
    },
    plan: {
      h: "Haftalik reja kanal turiga qarab tuziladi",
      p: "Do‘kon yoki xizmat kanalida maqsad — buyurtma: narx, manzil, qanday buyurtma qilish. Blog yoki ekspert kanalida — o‘sish: muntazam chiqish, seriyalar, so‘rovnomalar, odamlar qaytib keladigan rubrikalar. Har bir postning kuni va vaqti bor; kanalingizda raqam yetarli bo‘lsa, bu sizning eng yaxshi vaqtingiz.",
      shop: {
        title: "Do‘kon kanali",
        goal: "Maqsad: buyurtma",
        rows: [
          ["Du", "07:30", "Ertalabki patir, narxi bilan"],
          ["Ch", "12:00", "«Narxi qancha?» savollariga javob"],
          ["Ju", "17:00", "Dam olish kunlari uchun oldindan buyurtma"],
        ] as PlanRow[],
      },
      blog: {
        title: "Blog",
        goal: "Maqsad: obunachilar",
        rows: [
          ["Se", "20:00", "Seriya: «Bir kunlik menyu», 2-qism"],
          ["Pa", "13:00", "So‘rovnoma: keyingi mavzuni siz tanlang"],
          ["Sh", "11:00", "Hafta xulosasi"],
        ] as PlanRow[],
      },
    },
    posts: {
      h: "Postlar kanalingizdagidek yoziladi",
      p: "Kopirayter siz qanday yozsangiz, shunday yozadi. Post oxiri ham sizdagidek: aloqa raqami, «adminga yozing» yoki havola — postlaringizda qanday bo‘lsa, shunday qoladi. Mercat o‘z havolasini siz so‘ramaguncha qo‘ymaydi. Muharrir robot ohangidagi iboralarni olib tashlaydi, Tarjimon postni kirill yozuviga, rus va ingliz tiliga o‘giradi, Dizayner kanalingiz uslubida rasm tayyorlaydi.",
      scriptLabel: "Post tili",
      ending: "Kanalingizdagi postlar qanday tugasa, shunday tugaydi",
    },
    approve: {
      h: "Siz tasdiqlamaguncha hech narsa chiqmaydi",
      p: "Har bir postni o‘qiysiz. O‘zgartirish kerak bo‘lsa, o‘zingiz tahrirlaysiz yoki bir gap bilan so‘raysiz. Keyin bitta postni yoki butun haftani tasdiqlaysiz.",
      rewriteLabel: "Bir gap bilan o‘zgartirish",
      rewrites: ["qisqaroq", "emojisiz", "narxi 12 000"],
      ready: "5 post tayyor",
    },
    autopilot: {
      h: "Tasdiqlangan post o‘z vaqtida o‘zi chiqadi",
      p: "Buning uchun botni kanalingizga «Xabar joylash» huquqi bilan admin qilasiz: birinchi joylashda so‘raymiz. Post chiqqach, bot xabar beradi. Tasdiqlangandan keyin matn yoki rasm o‘zgarsa, post chiqmaydi va bot sizdan qayta so‘raydi.",
      message: "✅ Post @tandir_namuna kanalida chiqdi (24-noyabr, 07:30).",
      open: "Ko‘rish",
    },
    report: {
      h: "Har dushanba — o‘tgan hafta hisoboti",
      p: "Dushanba soat 9:00 da bot hisobot yuboradi: nechta post chiqdi va ular kanalingizdagi odatiy postga nisbatan qancha ko‘rildi. Do‘kon uchun — post havolalari orqali necha kishi keldi va o‘tgan hafta nechta buyurtma bo‘lgani. Blog uchun — obunachilar qanchaga o‘zgargani va haftaning eng ko‘p ko‘rilgan posti. Avtopilot yoqilgan bo‘lsa, yangi hafta postlari ham tayyor bo‘ladi.",
      message: [
        "📊 O‘tgan hafta (17-noyabr – 23-noyabr)",
        "Rejadagi 5 ta postdan 5 tasi chiqdi.",
        "Har bir post 72 soatda o‘rtacha 640 marta ko‘rildi; kanalingizdagi odatiy post — 520 (+23%).",
        "Post havolalari orqali botga o‘tganlar: 9.",
        "",
        "O‘tgan hafta nechta buyurtma bo‘ldi?",
      ],
      buttons: ["0", "1–3", "4–10", "10+"],
    },
    video: {
      h: "Video: ssenariy Mercat’dan, suratga olish sizdan",
      p: "Rejada video post bo‘lsa, Videograf ssenariy yozadi: birinchi 2 soniyada nima bo‘ladi, nimani olish, nima deyish, ekranda qanday yozuv. Siz telefonda olasiz va botga yuborasiz, Mercat videoni kanalga joylaydi.",
      soon: "Videoni AI o‘zi yaratishi — tez orada",
      script: [
        ["Birinchi 2 soniya", "Tandir qopqog‘i ochiladi, bug‘ ko‘tariladi"],
        ["Nimani olish", "Issiq patirni qo‘lda sindirish, yaqindan"],
        ["Nima deyish", "«Ertalab 7 dan issiq patir bor»"],
        ["Ekranda", "7:00 · 12 000 so‘m"],
      ] as [string, string][],
    },
    where: {
      h: "Telegram ichida va kompyuterda",
      p: "Telegram’da bot va ilova bor: postlarni ko‘rasiz, tasdiqlaysiz, kanalga joylaysiz, hisobot ham shu yerga keladi. Kompyuterda Studiya ochiladi: kanal tahlili, reja va postlar katta ekranda.",
      phone: "Telegram ilovasi",
      desk: "Kompyuterda Studiya",
    },
  },
  privacy: {
    h: "Ma’lumotlaringiz va nazorat",
    items: [
      ["Parol so‘ramaymiz", "Mercat faqat ochiq kanalning t.me sahifasini o‘qiydi."],
      ["Sizsiz hech narsa chiqmaydi", "Faqat siz tasdiqlagan post chiqadi."],
      ["Huquqni o‘zingiz berasiz", "Bot kanalga faqat siz admin qilganingizda post joylaydi. Huquqni istalgan payt olib qo‘yasiz."],
      ["Sotilmaydi", "Ma’lumotlaringiz sotilmaydi, reklama beruvchilarga berilmaydi va AI modellarini o‘qitishda ishlatilmaydi."],
      ["Tashriflar hisobi", "O‘z hisoblagichimiz cookie ishlatmaydi: har kuni almashadigan anonim kalit bilan sanaydi. Bosh sahifa va shu sahifada Google Analytics (reklama signallari o‘chirilgan) va Yandex Metrica (seans yozuvisiz) ham ishlaydi, ular o‘z cookie’larini qo‘yadi. Studiya va bot ularni yuklamaydi."],
      ["Hammasini o‘chirish mumkin", "Yozsangiz, 30 kun ichida hamma ma’lumotingizni o‘chiramiz."],
    ] as [string, string][],
    policy: "Maxfiylik siyosati",
    deletion: "Ma’lumotlarni o‘chirish",
  },
  price: {
    h: "Narx",
    big: "Hozircha bepul",
    p: "Mercat beta bosqichida. To‘lov tizimi hali yo‘q, karta so‘ramaymiz.",
    chip: "beta",
  },
  faq: {
    h: "Ko‘p so‘raladigan savollar",
    items: [
      {
        q: "Kanalimga kirish uchun parol kerakmi?",
        a: "Yo‘q. Mercat ochiq kanalning t.me sahifasini o‘qiydi. Post joylash uchun botni kanalga admin qilasiz: buni o‘zingiz qilasiz va istalgan payt bekor qilasiz.",
      },
      {
        q: "Kanalim yopiq yoki hali bo‘sh bo‘lsa-chi?",
        a: "«Kanalim hali bo‘sh»ni tanlang: biznesingizni bir necha gap bilan yozasiz, xohlasangiz mahsulot rasmlarini qo‘shasiz. Mercat shundan boshlaydi.",
      },
      {
        q: "Postlar qaysi tilda bo‘ladi?",
        a: "Kanalingiz tilida. Har bir postni o‘zbekcha (lotin yoki kirill), ruscha yoki inglizcha ko‘rishingiz mumkin.",
      },
      {
        q: "Mercat mening o‘rnimga post joylab yuboradimi?",
        a: "Faqat siz tasdiqlagan postni, rejadagi vaqtda va bot kanalingizda admin bo‘lsa. Tasdiqdan keyin post o‘zgarsa, u chiqmaydi.",
      },
      {
        q: "Bitta tahlil qancha vaqt oladi?",
        a: "Odatda 1–2 daqiqa. Bo‘lim ishlayotganda xodimlarning chiroqlari yonadi va hozir nima qilinayotgani yozib turiladi.",
      },
      {
        q: "Instagram, YouTube yoki reklama kabinetini ulasa bo‘ladimi?",
        a: "Tez orada. Bu ulanishlar faqat raqamlarni o‘qiydi: Mercat u yerda hech narsa joylamaydi va pul sarflamaydi.",
      },
    ],
  },
  cta: {
    h: "O‘z kanalingizda sinab ko‘ring",
    p: "Havolani qo‘ying: bir-ikki daqiqada kanal tahlili va haftalik postlar tayyor bo‘ladi. Siz faqat tasdiqlaysiz.",
    bot: "Telegram botni ochish",
  },
  sample: "namuna",
};

export type AboutCopy = typeof uz;

const ru: AboutCopy = {
  title: "Как работает Mercat",
  lead: "От ссылки на канал до поста в вашем канале: кто что делает, где решаете вы и что ещё не готово.",
  jump: "Проверить мой канал",
  panel: {
    label: "Отдел Mercat",
    idle: "Лампа горит, когда сотрудник работает",
    held: "Лампы хранят результат",
    waiting: "ждёт вас",
    voice: "на «вы», тепло",
  },
  who: "Работают:",
  you: "Вы",
  chapters: {
    link: {
      h: "Вы вставляете ссылку на канал",
      p: "Хватит ссылки на открытый Telegram-канал: ни пароль, ни логин не нужны. Если канал пока пустой, нажмите «Мой канал пока пустой», опишите бизнес в нескольких предложениях и добавьте до 5 фото товаров.",
      fieldLabel: "Ссылка на канал (образец)",
    },
    analysis: {
      h: "Читает канал по его собственным цифрам",
      p: "Аналитик читает ваши последние посты, их просмотры и время выхода и определяет тип канала: магазин, блог, эксперт или новости. Потом показывает в цифрах, что стоит исправить. Память бренда запоминает, как вы пишете.",
      voiceTitle: "Как вы пишете",
      voice: [
        ["Тон", "тёплый, на «вы»"],
        ["Начало", "со времени и товара"],
        ["Цена", "в сумах: 12 000 сум"],
        ["Эмодзи", "одно, в первой строке"],
        ["Концовка", "«пишите админу»"],
      ],
    },
    plan: {
      h: "План на неделю под тип канала",
      p: "У магазина или сервиса цель — заказы: цена, адрес, как заказать. У блога или эксперта — рост: регулярность, серии, опросы, рубрики, к которым возвращаются. У каждого поста есть день и время; если цифр в канале хватает, это ваше лучшее время.",
      shop: {
        title: "Канал магазина",
        goal: "Цель: заказы",
        rows: [
          ["Пн", "07:30", "Утренний патыр, с ценой"],
          ["Ср", "12:00", "Ответ на вопросы «сколько стоит?»"],
          ["Пт", "17:00", "Предзаказ на выходные"],
        ],
      },
      blog: {
        title: "Блог",
        goal: "Цель: подписчики",
        rows: [
          ["Вт", "20:00", "Серия «Меню на день», часть 2"],
          ["Чт", "13:00", "Опрос: следующую тему выбираете вы"],
          ["Сб", "11:00", "Итоги недели"],
        ],
      },
    },
    posts: {
      h: "Посты пишутся так, как пишете вы",
      p: "Копирайтер пишет вашим языком. И заканчивает пост так же, как вы: номер телефона, «пишите админу» или ссылка — как в ваших постах, так и останется. Свою ссылку Mercat не добавляет, пока вы не попросите. Редактор убирает роботские фразы, Переводчик переводит пост на кириллицу, русский и английский, Дизайнер готовит картинку в стиле канала.",
      scriptLabel: "Язык поста",
      ending: "Пост заканчивается так же, как посты в вашем канале",
    },
    approve: {
      h: "Без вашего подтверждения ничего не выходит",
      p: "Вы читаете каждый пост. Если нужно что-то поменять, правите сами или просите одной фразой. Потом подтверждаете один пост или сразу всю неделю.",
      rewriteLabel: "Изменить одной фразой",
      rewrites: ["короче", "без эмодзи", "цена 12 000"],
      ready: "5 постов готовы",
    },
    autopilot: {
      h: "Подтверждённый пост выходит сам, в своё время",
      p: "Для этого бот должен быть админом канала с правом «Публикация сообщений»: попросим об этом при первой публикации. Когда пост выйдет, бот напишет. Если после подтверждения изменились текст или картинка, пост не выйдет, и бот спросит вас снова.",
      message: "✅ Пост вышел в @tandir_namuna (24 ноября, 07:30).",
      open: "Открыть",
    },
    report: {
      h: "Каждый понедельник — отчёт за неделю",
      p: "В понедельник в 9:00 бот присылает отчёт: сколько постов вышло и сколько их посмотрели по сравнению с обычным постом канала. Для магазина — сколько человек пришло по ссылкам из постов и сколько было заказов. Для блога — как изменилось число подписчиков и какой пост недели посмотрели больше всего. Если включён автопилот, готовы и посты на новую неделю.",
      message: [
        "📊 Прошлая неделя (17 ноября – 23 ноября)",
        "Вышло 5 из 5 постов по плану.",
        "За 72 часа каждый пост в среднем посмотрели 640 раз; обычный пост в канале — 520 (+23%).",
        "Перешли в бота по ссылкам из постов: 9.",
        "",
        "Сколько заказов было за прошлую неделю?",
      ],
      buttons: ["0", "1–3", "4–10", "10+"],
    },
    video: {
      h: "Видео: сценарий от Mercat, съёмка за вами",
      p: "Если в плане есть видеопост, Видеограф пишет сценарий: что происходит в первые 2 секунды, что снять, что сказать, какая надпись на экране. Вы снимаете на телефон и отправляете боту, Mercat публикует видео в канале.",
      soon: "Видео, которое делает сам ИИ, — скоро",
      script: [
        ["Первые 2 секунды", "Открывается тандыр, поднимается пар"],
        ["Что снять", "Горячий патыр ломают руками, крупно"],
        ["Что сказать", "«С 7 утра горячий патыр»"],
        ["На экране", "7:00 · 12 000 сум"],
      ],
    },
    where: {
      h: "В Telegram и на компьютере",
      p: "В Telegram есть бот и приложение: смотрите посты, подтверждаете, публикуете, туда же приходит отчёт. На компьютере открывается Студия: разбор канала, план и посты на большом экране.",
      phone: "Приложение в Telegram",
      desk: "Студия на компьютере",
    },
  },
  privacy: {
    h: "Ваши данные и контроль",
    items: [
      ["Пароль не нужен", "Mercat читает только публичную страницу t.me открытого канала."],
      ["Без вас ничего не выходит", "Выходят только посты, которые вы подтвердили."],
      ["Права даёте вы", "Бот публикует в канале, только если вы сделали его админом. Права можно забрать в любой момент."],
      ["Не продаём", "Ваши данные не продаются, не передаются рекламодателям и не используются для обучения моделей ИИ."],
      ["Счётчики посещений", "Наш собственный счётчик работает без cookie: считает по анонимному ключу, который меняется каждый день. На главной и на этой странице работают ещё Google Analytics (рекламные сигналы выключены) и Яндекс Метрика (без записи сеансов), они ставят свои cookie. Студия и бот их не загружают."],
      ["Можно удалить всё", "Напишите нам, и за 30 дней мы удалим все ваши данные."],
    ],
    policy: "Политика конфиденциальности",
    deletion: "Удаление данных",
  },
  price: {
    h: "Цена",
    big: "Пока бесплатно",
    p: "Mercat в бета-версии. Платёжной системы ещё нет, карту не просим.",
    chip: "бета",
  },
  faq: {
    h: "Частые вопросы",
    items: [
      {
        q: "Нужен ли пароль от канала?",
        a: "Нет. Mercat читает публичную страницу t.me открытого канала. Чтобы публиковать, вы сами делаете бота админом канала и можете отменить это в любой момент.",
      },
      {
        q: "А если канал закрытый или пока пустой?",
        a: "Выберите «Мой канал пока пустой»: опишите бизнес в нескольких предложениях и, если хотите, добавьте фото товаров. Mercat начнёт с этого.",
      },
      {
        q: "На каком языке будут посты?",
        a: "На языке вашего канала. Каждый пост можно посмотреть на узбекском (латиница или кириллица), русском или английском.",
      },
      {
        q: "Mercat будет публиковать за меня?",
        a: "Только посты, которые вы подтвердили, во время по плану и если бот — админ канала. Если пост изменился после подтверждения, он не выйдет.",
      },
      {
        q: "Сколько длится разбор?",
        a: "Обычно 1–2 минуты. Пока отдел работает, горят лампы сотрудников и видно, что происходит сейчас.",
      },
      {
        q: "Можно подключить Instagram, YouTube или рекламный кабинет?",
        a: "Скоро. Эти подключения будут только читать цифры: Mercat ничего там не публикует и не тратит деньги.",
      },
    ],
  },
  cta: {
    h: "Попробуйте на своём канале",
    p: "Вставьте ссылку: за минуту-две будут разбор канала и посты на неделю. Вы только подтверждаете.",
    bot: "Открыть Telegram-бота",
  },
  sample: "образец",
};

const en: AboutCopy = {
  title: "How Mercat works",
  lead: "From your channel link to a post in your channel: who does what, where you decide, and what isn't ready yet.",
  jump: "Check my channel",
  panel: {
    label: "The Mercat department",
    idle: "A lamp lights while its employee works",
    held: "The lamps hold their results",
    waiting: "waiting for you",
    voice: "polite “siz”, warm",
  },
  who: "At work:",
  you: "You",
  chapters: {
    link: {
      h: "You paste your channel link",
      p: "A public Telegram channel link is enough: no password, no login. If the channel is still empty, tap “My channel is still empty”, describe the business in a few sentences and add up to 5 product photos.",
      fieldLabel: "Channel link (sample)",
    },
    analysis: {
      h: "It reads your channel by its own numbers",
      p: "The Analyst reads your latest posts, their views and the times they went out, and works out what kind of channel it is: a shop, a blog, an expert or news. Then it shows in numbers what to fix. Brand memory keeps how you write.",
      voiceTitle: "How you write",
      voice: [
        ["Tone", "warm, polite “siz”"],
        ["Opening", "the time and the product"],
        ["Price", "in so‘m: 12 000 so‘m"],
        ["Emoji", "one, in the first line"],
        ["Ending", "“message the admin”"],
      ],
    },
    plan: {
      h: "The week's plan fits the kind of channel",
      p: "For a shop or a service the goal is orders: the price, the address, how to order. For a blog or an expert it is growth: a steady rhythm, series, polls, regular sections people come back for. Every post has a day and a time; when your channel has enough numbers, it is your best time.",
      shop: {
        title: "A shop's channel",
        goal: "Goal: orders",
        rows: [
          ["Mon", "07:30", "Morning patir, with the price"],
          ["Wed", "12:00", "Answering “how much is it?”"],
          ["Fri", "17:00", "Pre-orders for the weekend"],
        ],
      },
      blog: {
        title: "A blog",
        goal: "Goal: subscribers",
        rows: [
          ["Tue", "20:00", "Series “A day's menu”, part 2"],
          ["Thu", "13:00", "Poll: you pick the next topic"],
          ["Sat", "11:00", "The week in short"],
        ],
      },
    },
    posts: {
      h: "Posts are written the way your channel writes",
      p: "The Copywriter writes in your voice, and ends a post the way you do: a phone number, “message the admin” or a link — whatever your posts carry stays. Mercat never adds its own link unless you ask. The Editor removes phrases that sound like a robot, the Translator turns the post into Cyrillic, Russian and English, and the Designer draws a picture in your channel's style.",
      scriptLabel: "Post language",
      ending: "It ends the way the posts in your channel end",
    },
    approve: {
      h: "Nothing goes out until you approve it",
      p: "You read every post. If something should change, edit it yourself or ask in one phrase. Then approve one post or the whole week at once.",
      rewriteLabel: "Change it in one phrase",
      rewrites: ["shorter", "no emoji", "price 12,000"],
      ready: "5 posts ready",
    },
    autopilot: {
      h: "An approved post goes out on its own, on time",
      p: "For that the bot has to be an admin of your channel with the “Post messages” right; we ask at your first post. When a post is out, the bot tells you. If the text or the picture changed after you approved it, the post does not go out and the bot asks you again.",
      message: "✅ Your post is out in @tandir_namuna (24 November, 07:30).",
      open: "Open",
    },
    report: {
      h: "Every Monday, last week's report",
      p: "On Monday at 9:00 the bot sends a report: how many posts went out and how they were viewed against a typical post in your channel. For a shop, how many people came through the post links and how many orders there were. For a blog, how the subscriber count changed and the most viewed post of the week. With the autopilot on, the new week's posts are ready too.",
      message: [
        "📊 Last week (17 November – 23 November)",
        "5 of 5 planned posts went out.",
        "Each post got 640 views on average in 72 hours; a typical post in your channel gets 520 (+23%).",
        "People who came to the bot through the post links: 9.",
        "",
        "How many orders did you get last week?",
      ],
      buttons: ["0", "1–3", "4–10", "10+"],
    },
    video: {
      h: "Video: Mercat writes the script, you film",
      p: "When the plan has a video post, the Videographer writes the script: what happens in the first 2 seconds, what to film, what to say, the words on screen. You film it on your phone and send it to the bot, and Mercat posts the video to your channel.",
      soon: "Video made by AI itself — soon",
      script: [
        ["First 2 seconds", "The tandir lid opens, steam rises"],
        ["What to film", "Hands breaking a hot patir, close up"],
        ["What to say", "“Hot patir from 7 in the morning”"],
        ["On screen", "7:00 · 12,000 UZS"],
      ],
    },
    where: {
      h: "In Telegram and on your computer",
      p: "In Telegram there is the bot and the app: you see the posts, approve them and post them, and the report arrives there too. On a computer the Studio opens: the channel review, the plan and the posts on a big screen.",
      phone: "The Telegram app",
      desk: "The Studio on a computer",
    },
  },
  privacy: {
    h: "Your data and your control",
    items: [
      ["No password", "Mercat reads only the public t.me page of an open channel."],
      ["Nothing goes out without you", "Only posts you approved go out."],
      ["You give the rights", "The bot posts in your channel only after you make it an admin. You can take the rights back any time."],
      ["Not for sale", "Your data is not sold, not given to advertisers and not used to train AI models."],
      ["Visit counters", "Our own visit counter uses no cookies: it counts with an anonymous key that changes every day. The home page and this page also run Google Analytics (ad signals off) and Yandex Metrica (no session recording), which set their own cookies. The Studio and the bot never load them."],
      ["You can delete everything", "Write to us and we delete all your data within 30 days."],
    ],
    policy: "Privacy policy",
    deletion: "Data deletion",
  },
  price: {
    h: "Price",
    big: "Free for now",
    p: "Mercat is in beta. There is no payment system yet, and we never ask for a card.",
    chip: "beta",
  },
  faq: {
    h: "Questions people ask",
    items: [
      {
        q: "Do I need to give my channel's password?",
        a: "No. Mercat reads the public t.me page of an open channel. To post, you make the bot an admin of the channel yourself, and you can undo that any time.",
      },
      {
        q: "What if my channel is private or still empty?",
        a: "Choose “My channel is still empty”: describe the business in a few sentences and, if you like, add product photos. Mercat starts from that.",
      },
      {
        q: "What language will the posts be in?",
        a: "Your channel's language. You can see every post in Uzbek (Latin or Cyrillic), Russian or English.",
      },
      {
        q: "Will Mercat post for me?",
        a: "Only posts you approved, at their planned time, and only if the bot is an admin of your channel. If a post changed after you approved it, it does not go out.",
      },
      {
        q: "How long does a review take?",
        a: "Usually 1–2 minutes. While the department works, the employees' lamps light up and a line says what is happening now.",
      },
      {
        q: "Can I connect Instagram, YouTube or an ad account?",
        a: "Soon. These connections will only read numbers: Mercat posts nothing there and spends no money.",
      },
    ],
  },
  cta: {
    h: "Try it on your own channel",
    p: "Paste the link: in a minute or two you get the channel review and a week of posts. You only approve.",
    bot: "Open the Telegram bot",
  },
  sample: "sample",
};

export const ABOUT: Record<Lang, AboutCopy> = { uz, ru, en };

/** The sample bakery's post in the four post languages the Studio offers. The last paragraph is its ending. */
export const SAMPLE_POST = {
  uz_latn: "Ertalab 7:00 dan issiq patir bor 🫓\n\nKatta patir — 12 000 so‘m, kichigi — 7 000 so‘m. Chilonzor 9-kvartal, bozor yonida.\n\nOldindan buyurtma uchun adminga yozing, soat 7 ga tayyorlab qo‘yamiz.",
  uz_cyrl: "Эрталаб 7:00 дан иссиқ патир бор 🫓\n\nКатта патир — 12 000 сўм, кичиги — 7 000 сўм. Чилонзор 9-квартал, бозор ёнида.\n\nОлдиндан буюртма учун админга ёзинг, соат 7 га тайёрлаб қўямиз.",
  ru: "С 7:00 утра горячий патыр 🫓\n\nБольшой патыр — 12 000 сум, маленький — 7 000 сум. Чиланзар, 9-й квартал, рядом с базаром.\n\nДля предзаказа напишите админу — приготовим к 7 утра.",
  en: "Hot patir from 7:00 in the morning 🫓\n\nLarge patir — 12,000 UZS, small — 7,000 UZS. Chilanzar, block 9, next to the bazaar.\n\nTo pre-order, message the admin and we'll have it ready by 7.",
} as const;

export type PostScript = keyof typeof SAMPLE_POST;
export const POST_SCRIPTS: { id: PostScript; label: string; lang: string }[] = [
  { id: "uz_latn", label: "O‘zbek", lang: "uz-Latn" },
  { id: "uz_cyrl", label: "Ўзбек", lang: "uz-Cyrl" },
  { id: "ru", label: "Рус", lang: "ru" },
  { id: "en", label: "Eng", lang: "en" },
];

/**
 * Which employees light while a chapter is read, in pipeline order. The SMM-menejer waits for the owner at "approve"
 * ("you": the lime dot) and holds a result from "autopilot" on.
 */
export const CHAPTER_LAMPS: Record<ChapterId, { role: AgentRole; state: "on" | "you" }[]> = {
  link: [],
  analysis: [
    { role: "brand", state: "on" },
    { role: "analyst", state: "on" },
  ],
  plan: [{ role: "strategist", state: "on" }],
  posts: [
    { role: "copywriter", state: "on" },
    { role: "editor", state: "on" },
    { role: "translator", state: "on" },
    { role: "designer", state: "on" },
  ],
  approve: [{ role: "publisher", state: "you" }],
  autopilot: [{ role: "publisher", state: "on" }],
  report: [],
  video: [],
  where: [],
};

export const CHAPTERS: ChapterId[] = ["link", "analysis", "plan", "posts", "approve", "autopilot", "report", "video", "where"];
