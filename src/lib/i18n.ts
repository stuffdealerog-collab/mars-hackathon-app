// Shared by the bot (server) and the Mini App (client) — keep it free of server-only imports.

export const LOCALES = ["uz", "ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "uz";

const dictionaries = {
  uz: {
    "bot.greeting":
      "Assalomu alaykum, {name}! Xush kelibsiz.\nIlovani ochish uchun quyidagi tugmani bosing.",
    "bot.greeting_no_app": "Assalomu alaykum, {name}! Xush kelibsiz.",
    "bot.open_app": "Ilovani ochish",
    "bot.help": "Boshlash uchun /start buyrugʻini yuboring.",
    "bot.ai_unavailable": "AI yordamchi hozircha sozlanmagan. Tez orada ishga tushadi!",
    "bot.error": "Kechirasiz, xatolik yuz berdi. Keyinroq qayta urinib koʻring.",
    "pub.not_found": "Post topilmadi. Studio’da postni qayta yarating va «Kanalga joylash»ni yana bosing.",
    "pub.not_yours": "Bu post boshqa foydalanuvchining brendiga tegishli.",
    "pub.preview": "Post tayyor. Tekshiring va kanalga joylang:",
    "pub.button": "📢 Kanalga joylash (@{channel})",
    "pub.ask_channel": "Bu post qaysi kanalga joylansin? Kanal nomini yuboring, masalan: @kanal_nomi\n\nAvval botni kanalga admin qiling va «Post yozish» huquqini bering.",
    "pub.channel_bad": "Kanal nomi noto‘g‘ri. Misol: @kanal_nomi",
    "pub.user_not_admin": "Siz @{channel} kanalining egasi yoki admini emassiz. Postni faqat kanal egasi yoki post yozish huquqi bor admin joylay oladi.",
    "pub.user_cannot_post": "Sizda @{channel} kanalida post yozish huquqi yo‘q. Kanal egasidan bu huquqni so‘rang.",
    "pub.bot_not_admin": "Botni @{channel} kanaliga admin qiling va «Post yozish» huquqini bering, keyin tugmani yana bosing.",
    "pub.add_bot": "➕ Botni kanalga qo‘shish",
    "pub.channel_linked": "✅ @{channel} ulandi. Endi postni joylashingiz mumkin:",
    "pub.channel_taken": "Bu brend boshqa kanalga ulangan: @{channel}.",
    "pub.publishing": "Joylanmoqda…",
    "pub.done": "✅ Kanalga joylandi: {url}",
    "pub.failed": "⚠️ Joylab bo‘lmadi: {error}",
    "pub.already": "Bu post allaqachon kanalda: {url}",
    "pub.script.uz_latn": "Lotin",
    "pub.script.uz_cyrl": "Кирилл",
    "pub.script.ru": "Rus tili",
    "pub.script.en": "English",
    "app.loading": "Yuklanmoqda…",
    "app.hello": "Salom, {name}!",
    "app.subtitle": "Ilova hali tayyorlanmoqda. Tez orada yangi imkoniyatlar qoʻshiladi.",
    "app.placeholder": "Bu yerda mahsulotingiz boʻladi.",
    "app.open_in_telegram": "Bu sahifani Telegram ichida oching.",
    "app.auth_error": "Tizimga kirib boʻlmadi. Ilovani yopib, qayta oching.",
  },
  ru: {
    "bot.greeting":
      "Здравствуйте, {name}! Добро пожаловать.\nНажмите кнопку ниже, чтобы открыть приложение.",
    "bot.greeting_no_app": "Здравствуйте, {name}! Добро пожаловать.",
    "bot.open_app": "Открыть приложение",
    "bot.help": "Отправьте /start, чтобы начать.",
    "bot.ai_unavailable": "ИИ-ассистент пока не настроен. Скоро заработает!",
    "bot.error": "Извините, что-то пошло не так. Попробуйте позже.",
    "pub.not_found": "Пост не найден. Создайте пост в Studio заново и снова нажмите «Опубликовать».",
    "pub.not_yours": "Этот пост принадлежит бренду другого пользователя.",
    "pub.preview": "Пост готов. Проверьте и опубликуйте в канал:",
    "pub.button": "📢 Опубликовать в канал (@{channel})",
    "pub.ask_channel": "В какой канал опубликовать пост? Пришлите имя канала, например: @kanal_nomi\n\nСначала сделайте бота админом канала с правом «Публикация сообщений».",
    "pub.channel_bad": "Неверное имя канала. Пример: @kanal_nomi",
    "pub.user_not_admin": "Вы не владелец и не админ канала @{channel}. Публиковать может только владелец или админ с правом публикации.",
    "pub.user_cannot_post": "У вас нет права публиковать в канале @{channel}. Попросите его у владельца канала.",
    "pub.bot_not_admin": "Сделайте бота админом канала @{channel} с правом «Публикация сообщений», затем нажмите кнопку ещё раз.",
    "pub.add_bot": "➕ Добавить бота в канал",
    "pub.channel_linked": "✅ @{channel} подключён. Теперь можно публиковать:",
    "pub.channel_taken": "Этот бренд уже привязан к другому каналу: @{channel}.",
    "pub.publishing": "Публикую…",
    "pub.done": "✅ Опубликовано: {url}",
    "pub.failed": "⚠️ Не удалось опубликовать: {error}",
    "pub.already": "Этот пост уже в канале: {url}",
    "pub.script.uz_latn": "Lotin",
    "pub.script.uz_cyrl": "Кирилл",
    "pub.script.ru": "Русский",
    "pub.script.en": "English",
    "app.loading": "Загрузка…",
    "app.hello": "Привет, {name}!",
    "app.subtitle": "Приложение в разработке. Скоро здесь появится что-то классное.",
    "app.placeholder": "Здесь будет ваш продукт.",
    "app.open_in_telegram": "Откройте эту страницу внутри Telegram.",
    "app.auth_error": "Не удалось войти. Закройте и откройте приложение заново.",
  },
  en: {
    "bot.greeting": "Hi {name}! Welcome.\nTap the button below to open the app.",
    "bot.greeting_no_app": "Hi {name}! Welcome.",
    "bot.open_app": "Open app",
    "bot.help": "Send /start to begin.",
    "bot.ai_unavailable": "The AI assistant isn't configured yet. Coming soon!",
    "bot.error": "Sorry, something went wrong. Please try again later.",
    "pub.not_found": "Post not found. Create it again in the Studio and tap Publish again.",
    "pub.not_yours": "This post belongs to another user's brand.",
    "pub.preview": "Your post is ready. Check it and post it to the channel:",
    "pub.button": "📢 Post to the channel (@{channel})",
    "pub.ask_channel": "Which channel should this go to? Send its name, for example: @channel_name\n\nFirst make the bot an admin of the channel with the \"Post messages\" right.",
    "pub.channel_bad": "That channel name is not valid. Example: @channel_name",
    "pub.user_not_admin": "You are not the owner or an admin of @{channel}. Only the owner or an admin who can post may publish there.",
    "pub.user_cannot_post": "You don't have the right to post in @{channel}. Ask the channel owner for it.",
    "pub.bot_not_admin": "Make the bot an admin of @{channel} with the \"Post messages\" right, then tap the button again.",
    "pub.add_bot": "➕ Add the bot to the channel",
    "pub.channel_linked": "✅ @{channel} is connected. You can post now:",
    "pub.channel_taken": "This brand is already linked to another channel: @{channel}.",
    "pub.publishing": "Posting…",
    "pub.done": "✅ Posted: {url}",
    "pub.failed": "⚠️ Could not post: {error}",
    "pub.already": "This post is already in the channel: {url}",
    "pub.script.uz_latn": "Lotin",
    "pub.script.uz_cyrl": "Кирилл",
    "pub.script.ru": "Русский",
    "pub.script.en": "English",
    "app.loading": "Loading…",
    "app.hello": "Hello, {name}!",
    "app.subtitle": "This app is under construction. Something great is coming soon.",
    "app.placeholder": "Your product goes here.",
    "app.open_in_telegram": "Open this page inside Telegram.",
    "app.auth_error": "Couldn't sign you in. Close and reopen the app.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type MessageKey = keyof (typeof dictionaries)["en"];

/** Maps a Telegram `language_code` (IETF tag) to a supported locale. Default: uz. */
export function pickLocale(code?: string | null): Locale {
  const base = (code ?? "").toLowerCase().split(/[-_]/)[0];
  if (base === "uz") return "uz";
  if (base === "en") return "en";
  if (["ru", "uk", "be", "kk", "ky", "tg"].includes(base)) return "ru";
  return DEFAULT_LOCALE;
}

export function t(
  locale: Locale,
  key: MessageKey,
  vars: Record<string, string | number> = {},
): string {
  const template: string = dictionaries[locale]?.[key] ?? dictionaries[DEFAULT_LOCALE][key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
