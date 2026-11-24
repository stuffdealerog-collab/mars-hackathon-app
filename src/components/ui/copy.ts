/**
 * Every word the owner reads on the web, in Uzbek Latin (first), Russian and English.
 * Plain shop words, no jargon. Uzbek uses ‘ in o‘/g‘ and ’ for the tutuq belgisi.
 */

const uz = {
  nav: { studio: "Studiya", bot: "Telegram bot", home: "Bosh sahifa" },
  lang: { uz: "uz", ru: "ru", en: "en", label: "Til" },

  landing: {
    h1: "Kanalingizga postlarni Mercat yozadi. Siz faqat tasdiqlaysiz.",
    sub: "Telegram kanalingiz havolasini qo‘ying. Mercat kanalni o‘qiydi, nima ishlamayotganini raqamlar bilan ko‘rsatadi va bir haftalik postlarni rasmlari bilan tayyorlaydi.",
    howTitle: "Qanday ishlaydi",
    exampleTitle: "Natija qanday ko‘rinadi",
    exampleNote: "Namuna: o‘ylab topilgan non do‘koni. Sizning kanalingizda raqamlar va postlar sizniki bo‘ladi.",
    exampleFindingLabel: "Kanal tahlilidan",
    exampleFinding: "Sotuv postlarining 12 tasidan faqat 1 tasida narx yozilgan.",
    exampleFix: "Narxni postning o‘zida yozing: «Narxi qancha?» degan savollar kamayadi, buyurtma tezlashadi.",
    examplePostLabel: "Tayyor post",
    examplePostName: "Tandir non",
    examplePost:
      "Ertalab 7:00 dan issiq patir bor 🫓\n\nKatta patir — 12 000 so‘m, kichigi — 7 000 so‘m. Chilonzor 9-kvartal, bozor yonida.\n\nOldindan buyurtma: shu kanalga yozing, soat 7 ga tayyorlab qo‘yamiz.",
    price: "7 kun bepul, keyin 149 000 so‘m/oy",
    beta: "beta",
    footer: "MARS AI Hackathon, Toshkent, 2026",
  },

  start: {
    title: "Kanalingiz uchun bir haftalik postlar",
    sub: "Havolani qo‘ying. Mercat kanalni o‘qiydi, nima ishlamayotganini ko‘rsatadi va postlarni rasmlari bilan yozadi. Siz tasdiqlamaguningizcha hech narsa joylanmaydi.",
    linkLabel: "Telegram kanal havolasi",
    linkPh: "t.me/kanal_nomi",
    linkExample: "Masalan: t.me/kanal_nomi yoki @kanal_nomi",
    linkBad: "Havola t.me/kanal_nomi yoki @kanal_nomi ko‘rinishida bo‘lsin.",
    go: "Boshlash",
    emptyToggle: "Kanalim hali bo‘sh",
    time: "Odatda 1–2 daqiqa.",
    stepsTitle: "Qanday ishlaydi",
  },

  steps: [
    { t: "Havolani qo‘ying", d: "Kanal bo‘sh bo‘lsa, biznesingiz haqida bir necha gap yozing." },
    { t: "Tayyorini ko‘ring", d: "Kanaldagi muammolar raqamlar bilan, haftalik reja va rasmli postlar." },
    { t: "Tasdiqlang", d: "Tasdiqlangan postni bot kanalingizga joylaydi. Sizsiz hech narsa chiqmaydi." },
  ],

  fresh: {
    title: "Biznesingiz haqida yozing",
    sub: "Kanalda post bo‘lmasa ham bo‘ladi: tavsifdan yozish uslubi, ishga tushirish rejasi va birinchi postlarni tayyorlaymiz.",
    descLabel: "Nima sotasiz yoki qanday xizmat ko‘rsatasiz?",
    descPh: "Masalan: Chilonzorda uyda tort pishiraman. Buyurtmani 2 kun oldin olaman. Kichik tort 180 000 so‘mdan. Yetkazib berish bor.",
    descHint: "Narx, manzil, kim sotib oladi — qancha aniq yozsangiz, postlar shuncha yaxshi chiqadi.",
    descShort: "Kamida 2–3 gap yozing: nima sotasiz, narxi, qayerda.",
    chanLabel: "Kanal havolasi (ixtiyoriy)",
    chanHint: "Postlar shu kanalga joylanadi.",
    photosLabel: "Mahsulot rasmlari (ixtiyoriy)",
    photosHint: "5 tagacha. Post rasmlari shu suratlar uslubida chiziladi.",
    addPhotos: "Rasm qo‘shish",
    removePhoto: "Rasmni olib tashlash",
    photoBad: "Bu faylni ochib bo‘lmadi. JPG yoki PNG rasm tanlang.",
    go: "Postlarni tayyorlash",
    back: "Kanal havolasi bilan boshlash",
    emptyNotice: "Bu kanalda post kam yoki u yopiq. Biznesingiz haqida yozing — postlarni tavsifdan tayyorlaymiz.",
  },

  work: {
    title: "Tayyorlanmoqda",
    note: "Odatda 1–2 daqiqa. Sahifani yopmang.",
    readChannel: { wait: "Kanalni o‘qish", run: "Kanal o‘qilmoqda…", done: "Kanal o‘qildi · {n} post" },
    readDesc: { wait: "Tavsifni o‘qish", run: "Tavsif o‘qilmoqda…", done: "Tavsif o‘qildi" },
    voice: { wait: "Yozish uslubi", run: "Yozish uslubi aniqlanmoqda…", done: "Yozish uslubi aniqlandi" },
    photos: { wait: "Rasmlaringiz uslubi", run: "Rasmlaringiz o‘rganilmoqda…", done: "Rasmlaringiz uslubi o‘rganildi" },
    plan: { wait: "Haftalik reja", run: "Haftalik reja tuzilmoqda…", count: "Haftalik reja tuzilmoqda · {n}/{m}", done: "Haftalik reja tuzildi · {n} post" },
    posts: { wait: "{n} ta post", run: "{n} ta post yozilmoqda…", done: "{n} ta post yozildi" },
    images: { wait: "Post rasmlari", run: "Rasmlar chizilmoqda · {n}/{m}", done: "Rasmlar tayyor · {n}/{m}" },
    seconds: "{s} s",
  },

  error: {
    title: "Bu safar chiqmadi",
    retry: "Qayta urinish",
    startOver: "Boshidan boshlash",
    network: "Internet bilan bog‘lanib bo‘lmadi. Tarmoqni tekshirib, qayta urinib ko‘ring.",
    timeout: "Javob kechikdi. Qayta urinib ko‘ring.",
    generic: "Nimadir ishlamadi. Qayta urinib ko‘ring.",
  },

  tabs: { channel: "Kanal", posts: "Postlar", video: "Video" },

  channel: {
    subscribers: "obunachi",
    avgViews: "o‘rtacha ko‘rish",
    reach: "obunachilar postni ko‘radi",
    perWeek: "haftasiga post",
    findingsTitle: "Nimani tuzatish kerak",
    findingsNone: "Aniq muammo topilmadi.",
    kind: { problem: "Muammo", opportunity: "Imkoniyat", strength: "Yaxshi tomoni" },
    voiceTitle: "Qanday yozasiz",
    voice: { address: "Murojaat", tone: "Ohang", length: "Post uzunligi", emoji: "Emoji", cta: "Post oxiri" },
    address: { siz: "«siz»", sen: "«sen»", mixed: "«siz» va «sen»", "n/a": "—" },
    emoji: { none: "ishlatilmaydi", low: "kam", medium: "o‘rtacha", high: "ko‘p" },
    length: "~{n} belgi",
    planTitle: "Shu haftalik reja",
    planFreshTitle: "Ishga tushirish rejasi",
    goal: { reach: "Qamrov", trust: "Ishonch", sale: "Sotuv" },
    planHasPost: "Post tayyor",
    planMissing: "Bu sahifada reja saqlanmagan.",
    planRebuild: "Rejani qayta tuzish",
    freshNoStats: "Kanal hali bo‘sh, shuning uchun raqamlar yo‘q. Birinchi postlardan keyin bu yerda paydo bo‘ladi.",
    newChannel: "Boshqa kanal",
  },

  posts: {
    intro: "Har birini o‘qing, kerak bo‘lsa tuzating va tasdiqlang. Tasdiqlangan postni bot kanalingizga joylaydi.",
    none: "Postlar hali yo‘q.",
    edit: "Tahrirlash",
    save: "Saqlash",
    cancel: "Bekor qilish",
    approve: "Tasdiqlash",
    approving: "Saqlanmoqda…",
    approved: "Tasdiqlandi",
    publish: "Kanalga joylash",
    publishing: "Joylanmoqda…",
    published: "Kanalga joylandi",
    openPost: "Postni ko‘rish",
    webNote: "Telegram bot ochiladi: u yerda «Kanalga joylash»ni bosing. Bot kanalingizda admin bo‘lishi kerak.",
    addAdmin: "Botni kanalga admin qilish",
    noChannel: "Kanal havolasi ko‘rsatilmagan. Botni oching va kanalingizni yuboring — post o‘sha yerdan joylanadi.",
    openBot: "Botni ochish",
    approveError: "Tasdiqni saqlab bo‘lmadi. Qayta urinib ko‘ring.",
    textLabel: "Post matni",
    scripts: { uz_latn: "O‘z", uz_cyrl: "Ўз", ru: "Ру", en: "En" },
    scriptNames: { uz_latn: "O‘zbekcha (lotin)", uz_cyrl: "Ўзбекча (кирилл)", ru: "Русский", en: "English" },
    image: {
      running: "Rasm chizilmoqda…",
      failed: "Rasm chiqmadi",
      retry: "Qayta chizish",
      none: "Rasmsiz post",
      alt: "Post uchun rasm",
    },
  },

  video: {
    title: "Video",
    text: "Hozircha ishlab chiqilmoqda… (video yaratish uchun API kalitlar kerak)",
  },

  sample: {
    banner: "Namuna: o‘ylab topilgan non do‘koni, sizning kanalingiz emas.",
    cta: "O‘z kanalim bilan",
  },

  reopen: { loading: "Yuklanmoqda…" },

  tg: {
    outsideTitle: "Bu ekran Telegram ichida ochiladi",
    outsideText: "Botni oching va «Ochish» tugmasini bosing yoki Studiyani brauzerda oching.",
    openBot: "Botni ochish",
    openWeb: "Brauzerda ochish",
    loading: "Yuklanmoqda…",
    authError: "Tizimga kirib bo‘lmadi. Ilovani yopib, qayta oching.",
  },

  weekdays: ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"],
};

export type Copy = typeof uz;

const ru: Copy = {
  nav: { studio: "Студия", bot: "Telegram-бот", home: "Главная" },
  lang: { uz: "uz", ru: "ru", en: "en", label: "Язык" },

  landing: {
    h1: "Посты для вашего канала пишет Mercat. Вы только утверждаете.",
    sub: "Вставьте ссылку на свой Telegram-канал. Mercat прочитает канал, покажет в цифрах, что не работает, и подготовит посты на неделю с картинками.",
    howTitle: "Как это работает",
    exampleTitle: "Как выглядит результат",
    exampleNote: "Пример: выдуманная пекарня. В вашем канале цифры и посты будут ваши.",
    exampleFindingLabel: "Из разбора канала",
    exampleFinding: "Цена указана только в 1 из 12 продающих постов.",
    exampleFix: "Пишите цену прямо в посте: вопросов «сколько стоит?» станет меньше, заказы пойдут быстрее.",
    examplePostLabel: "Готовый пост",
    examplePostName: "Тандир нон",
    examplePost:
      "С 7:00 утра горячие лепёшки 🫓\n\nБольшая патыр — 12 000 сум, маленькая — 7 000 сум. Чиланзар, 9-й квартал, рядом с базаром.\n\nЗаказ заранее: напишите в этот канал, приготовим к 7 утра.",
    price: "7 дней бесплатно, затем 149 000 сум/мес",
    beta: "бета",
    footer: "MARS AI Hackathon, Ташкент, 2026",
  },

  start: {
    title: "Посты на неделю для вашего канала",
    sub: "Вставьте ссылку. Mercat прочитает канал, покажет, что не работает, и напишет посты с картинками. Без вашего одобрения ничего не публикуется.",
    linkLabel: "Ссылка на Telegram-канал",
    linkPh: "t.me/kanal",
    linkExample: "Например: t.me/kanal или @kanal",
    linkBad: "Ссылка должна выглядеть как t.me/kanal или @kanal.",
    go: "Начать",
    emptyToggle: "Мой канал пока пустой",
    time: "Обычно 1–2 минуты.",
    stepsTitle: "Как это работает",
  },

  steps: [
    { t: "Вставьте ссылку", d: "Если канал пустой, напишите пару предложений о своём деле." },
    { t: "Посмотрите результат", d: "Проблемы канала в цифрах, план на неделю и посты с картинками." },
    { t: "Утвердите", d: "Утверждённый пост бот публикует в ваш канал. Без вас ничего не выходит." },
  ],

  fresh: {
    title: "Расскажите о своём деле",
    sub: "Даже если в канале нет постов: по описанию подготовим манеру письма, план запуска и первые посты.",
    descLabel: "Что вы продаёте или какую услугу оказываете?",
    descPh: "Например: пеку торты дома на Чиланзаре. Заказ за 2 дня. Маленький торт от 180 000 сум. Есть доставка.",
    descHint: "Цены, адрес, кто покупает — чем точнее, тем лучше получатся посты.",
    descShort: "Напишите хотя бы 2–3 предложения: что продаёте, цена, где.",
    chanLabel: "Ссылка на канал (необязательно)",
    chanHint: "Посты будут публиковаться в этот канал.",
    photosLabel: "Фото товара (необязательно)",
    photosHint: "До 5 штук. Картинки к постам будут в стиле этих фото.",
    addPhotos: "Добавить фото",
    removePhoto: "Убрать фото",
    photoBad: "Не удалось открыть файл. Выберите фото JPG или PNG.",
    go: "Подготовить посты",
    back: "Начать со ссылки на канал",
    emptyNotice: "В этом канале мало постов или он закрыт. Расскажите о своём деле — подготовим посты по описанию.",
  },

  work: {
    title: "Готовим",
    note: "Обычно 1–2 минуты. Не закрывайте страницу.",
    readChannel: { wait: "Чтение канала", run: "Читаем канал…", done: "Канал прочитан · {n} постов" },
    readDesc: { wait: "Чтение описания", run: "Читаем описание…", done: "Описание прочитано" },
    voice: { wait: "Манера письма", run: "Определяем манеру письма…", done: "Манера письма определена" },
    photos: { wait: "Стиль ваших фото", run: "Изучаем ваши фото…", done: "Стиль ваших фото изучен" },
    plan: { wait: "План на неделю", run: "Составляем план на неделю…", count: "Составляем план на неделю · {n}/{m}", done: "План на неделю готов · {n} постов" },
    posts: { wait: "{n} постов", run: "Пишем {n} постов…", done: "Написано постов: {n}" },
    images: { wait: "Картинки к постам", run: "Рисуем картинки · {n}/{m}", done: "Картинки готовы · {n}/{m}" },
    seconds: "{s} с",
  },

  error: {
    title: "В этот раз не получилось",
    retry: "Попробовать ещё раз",
    startOver: "Начать сначала",
    network: "Нет связи с интернетом. Проверьте сеть и попробуйте ещё раз.",
    timeout: "Ответ задержался. Попробуйте ещё раз.",
    generic: "Что-то не сработало. Попробуйте ещё раз.",
  },

  tabs: { channel: "Канал", posts: "Посты", video: "Видео" },

  channel: {
    subscribers: "подписчиков",
    avgViews: "просмотров в среднем",
    reach: "подписчиков видят посты",
    perWeek: "постов в неделю",
    findingsTitle: "Что исправить",
    findingsNone: "Явных проблем не нашли.",
    kind: { problem: "Проблема", opportunity: "Возможность", strength: "Сильная сторона" },
    voiceTitle: "Как вы пишете",
    voice: { address: "Обращение", tone: "Тон", length: "Длина поста", emoji: "Эмодзи", cta: "В конце поста" },
    address: { siz: "на «вы»", sen: "на «ты»", mixed: "и на «вы», и на «ты»", "n/a": "—" },
    emoji: { none: "без эмодзи", low: "мало", medium: "умеренно", high: "много" },
    length: "~{n} знаков",
    planTitle: "План на эту неделю",
    planFreshTitle: "План запуска",
    goal: { reach: "Охват", trust: "Доверие", sale: "Продажа" },
    planHasPost: "Пост готов",
    planMissing: "План на этой странице не сохранён.",
    planRebuild: "Составить план заново",
    freshNoStats: "Канал пока пустой, поэтому цифр нет. Они появятся здесь после первых постов.",
    newChannel: "Другой канал",
  },

  posts: {
    intro: "Прочитайте каждый, при необходимости поправьте и утвердите. Утверждённый пост бот опубликует в вашем канале.",
    none: "Постов пока нет.",
    edit: "Изменить",
    save: "Сохранить",
    cancel: "Отмена",
    approve: "Утвердить",
    approving: "Сохраняем…",
    approved: "Утверждён",
    publish: "Опубликовать в канал",
    publishing: "Публикуем…",
    published: "Опубликован",
    openPost: "Открыть пост",
    webNote: "Откроется Telegram-бот: нажмите там «Kanalga joylash». Бот должен быть админом вашего канала.",
    addAdmin: "Сделать бота админом канала",
    noChannel: "Канал не указан. Откройте бота и отправьте ему ссылку на канал — пост опубликуется оттуда.",
    openBot: "Открыть бота",
    approveError: "Не удалось сохранить. Попробуйте ещё раз.",
    textLabel: "Текст поста",
    scripts: { uz_latn: "O‘z", uz_cyrl: "Ўз", ru: "Ру", en: "En" },
    scriptNames: { uz_latn: "Узбекский (латиница)", uz_cyrl: "Узбекский (кириллица)", ru: "Русский", en: "Английский" },
    image: {
      running: "Рисуем картинку…",
      failed: "Картинка не получилась",
      retry: "Нарисовать заново",
      none: "Пост без картинки",
      alt: "Картинка к посту",
    },
  },

  video: {
    title: "Видео",
    text: "Пока в разработке… (нам нужны API-ключи для генерации видео)",
  },

  sample: {
    banner: "Пример: выдуманная пекарня, а не ваш канал.",
    cta: "Со своим каналом",
  },

  reopen: { loading: "Загрузка…" },

  tg: {
    outsideTitle: "Этот экран открывается внутри Telegram",
    outsideText: "Откройте бота и нажмите «Открыть» или откройте Студию в браузере.",
    openBot: "Открыть бота",
    openWeb: "Открыть в браузере",
    loading: "Загрузка…",
    authError: "Не удалось войти. Закройте приложение и откройте заново.",
  },

  weekdays: ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"],
};

const en: Copy = {
  nav: { studio: "Studio", bot: "Telegram bot", home: "Home" },
  lang: { uz: "uz", ru: "ru", en: "en", label: "Language" },

  landing: {
    h1: "Mercat writes the posts for your channel. You just approve them.",
    sub: "Paste your Telegram channel link. Mercat reads the channel, shows in numbers what isn’t working and prepares a week of posts with pictures.",
    howTitle: "How it works",
    exampleTitle: "What you get",
    exampleNote: "Example: a made-up bakery. In your channel, the numbers and posts will be yours.",
    exampleFindingLabel: "From the channel review",
    exampleFinding: "Only 1 of 12 sales posts shows a price.",
    exampleFix: "Put the price in the post itself: fewer “how much?” questions, faster orders.",
    examplePostLabel: "Ready post",
    examplePostName: "Tandir non",
    examplePost:
      "Hot flatbread from 7:00 in the morning 🫓\n\nLarge patir — 12,000 UZS, small — 7,000 UZS. Chilonzor, block 9, next to the bazaar.\n\nOrder ahead: write to this channel and we’ll have it ready by 7.",
    price: "7 days free, then 149,000 UZS a month",
    beta: "beta",
    footer: "MARS AI Hackathon, Tashkent, 2026",
  },

  start: {
    title: "A week of posts for your channel",
    sub: "Paste the link. Mercat reads the channel, shows what isn’t working and writes posts with pictures. Nothing is published until you approve it.",
    linkLabel: "Telegram channel link",
    linkPh: "t.me/channel",
    linkExample: "For example: t.me/channel or @channel",
    linkBad: "Use a link like t.me/channel or @channel.",
    go: "Start",
    emptyToggle: "My channel is still empty",
    time: "Usually 1–2 minutes.",
    stepsTitle: "How it works",
  },

  steps: [
    { t: "Paste the link", d: "If the channel is empty, write a few sentences about your business." },
    { t: "See what’s ready", d: "Your channel’s problems in numbers, a week’s plan and posts with pictures." },
    { t: "Approve", d: "The bot publishes approved posts to your channel. Nothing goes out without you." },
  ],

  fresh: {
    title: "Tell us about your business",
    sub: "No posts in the channel yet? Fine: from your description we prepare how you write, a launch plan and the first posts.",
    descLabel: "What do you sell, or what service do you offer?",
    descPh: "For example: I bake cakes at home in Chilonzor. Orders 2 days ahead. Small cakes from 180,000 UZS. Delivery available.",
    descHint: "Prices, address, who buys — the more precise you are, the better the posts.",
    descShort: "Write at least 2–3 sentences: what you sell, the price, where.",
    chanLabel: "Channel link (optional)",
    chanHint: "Posts will be published to this channel.",
    photosLabel: "Product photos (optional)",
    photosHint: "Up to 5. Post pictures will follow the style of these photos.",
    addPhotos: "Add photos",
    removePhoto: "Remove photo",
    photoBad: "This file could not be opened. Choose a JPG or PNG photo.",
    go: "Prepare posts",
    back: "Start with a channel link",
    emptyNotice: "This channel has few posts or is private. Tell us about your business and we’ll prepare posts from the description.",
  },

  work: {
    title: "Preparing",
    note: "Usually 1–2 minutes. Keep this page open.",
    readChannel: { wait: "Reading the channel", run: "Reading the channel…", done: "Channel read · {n} posts" },
    readDesc: { wait: "Reading your description", run: "Reading your description…", done: "Description read" },
    voice: { wait: "How you write", run: "Learning how you write…", done: "Learned how you write" },
    photos: { wait: "Your photos’ style", run: "Studying your photos…", done: "Learned the style of your photos" },
    plan: { wait: "Plan for the week", run: "Planning the week…", count: "Planning the week · {n}/{m}", done: "Week planned · {n} posts" },
    posts: { wait: "{n} posts", run: "Writing {n} posts…", done: "{n} posts written" },
    images: { wait: "Post pictures", run: "Drawing pictures · {n}/{m}", done: "Pictures ready · {n}/{m}" },
    seconds: "{s} s",
  },

  error: {
    title: "That didn’t work this time",
    retry: "Try again",
    startOver: "Start over",
    network: "Could not reach the internet. Check your connection and try again.",
    timeout: "The answer took too long. Try again.",
    generic: "Something didn’t work. Try again.",
  },

  tabs: { channel: "Channel", posts: "Posts", video: "Video" },

  channel: {
    subscribers: "subscribers",
    avgViews: "average views",
    reach: "of subscribers see a post",
    perWeek: "posts a week",
    findingsTitle: "What to fix",
    findingsNone: "No clear problems found.",
    kind: { problem: "Problem", opportunity: "Opportunity", strength: "Strength" },
    voiceTitle: "How you write",
    voice: { address: "Address", tone: "Tone", length: "Post length", emoji: "Emoji", cta: "Post ending" },
    address: { siz: "formal «siz»", sen: "informal «sen»", mixed: "«siz» and «sen»", "n/a": "—" },
    emoji: { none: "none", low: "few", medium: "some", high: "many" },
    length: "~{n} characters",
    planTitle: "This week’s plan",
    planFreshTitle: "Launch plan",
    goal: { reach: "Reach", trust: "Trust", sale: "Sale" },
    planHasPost: "Post ready",
    planMissing: "The plan isn’t saved on this page.",
    planRebuild: "Plan again",
    freshNoStats: "The channel is still empty, so there are no numbers yet. They will show up here after the first posts.",
    newChannel: "Another channel",
  },

  posts: {
    intro: "Read each one, fix it if needed and approve. The bot publishes approved posts to your channel.",
    none: "No posts yet.",
    edit: "Edit",
    save: "Save",
    cancel: "Cancel",
    approve: "Approve",
    approving: "Saving…",
    approved: "Approved",
    publish: "Publish to channel",
    publishing: "Publishing…",
    published: "Published",
    openPost: "Open the post",
    webNote: "The Telegram bot opens: tap “Kanalga joylash” there. The bot must be an admin of your channel.",
    addAdmin: "Make the bot a channel admin",
    noChannel: "No channel is set. Open the bot and send it your channel link — the post will be published from there.",
    openBot: "Open the bot",
    approveError: "Could not save the approval. Try again.",
    textLabel: "Post text",
    scripts: { uz_latn: "O‘z", uz_cyrl: "Ўз", ru: "Ру", en: "En" },
    scriptNames: { uz_latn: "Uzbek (Latin)", uz_cyrl: "Uzbek (Cyrillic)", ru: "Russian", en: "English" },
    image: {
      running: "Drawing the picture…",
      failed: "The picture didn’t work",
      retry: "Draw again",
      none: "Post without a picture",
      alt: "Picture for the post",
    },
  },

  video: {
    title: "Video",
    text: "In development… (we need API keys for video generation)",
  },

  sample: {
    banner: "Example: a made-up bakery, not your channel.",
    cta: "Use my channel",
  },

  reopen: { loading: "Loading…" },

  tg: {
    outsideTitle: "This screen opens inside Telegram",
    outsideText: "Open the bot and tap “Open”, or open the Studio in your browser.",
    openBot: "Open the bot",
    openWeb: "Open in browser",
    loading: "Loading…",
    authError: "Could not sign in. Close the app and open it again.",
  },

  weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

export const COPY: Record<"uz" | "ru" | "en", Copy> = { uz, ru, en };
