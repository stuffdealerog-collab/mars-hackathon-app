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
