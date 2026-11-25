/**
 * Owner-safe API errors: every route answers `{ error, code }`, where `error` is a plain sentence in the
 * owner's language (uz Latin by default, ru, en) and `code` is a stable id the Studio can map.
 * Pure (no I/O, no server-only imports) so it is unit-tested and usable from client code.
 */

export type ApiLang = "uz" | "ru" | "en";

export const API_LANGS: readonly ApiLang[] = ["uz", "ru", "en"];

export type ErrorCode =
  | "bad_request"
  | "invalid_input"
  | "auth_required"
  | "forbidden"
  | "brand_not_found"
  | "brand_forbidden"
  | "post_not_found"
  | "not_found"
  | "conflict"
  | "publish_in_progress"
  | "own_brand_needed"
  | "rate_limited"
  | "budget_exhausted"
  | "channel_invalid"
  | "channel_empty"
  | "channel_mismatch"
  | "knowledge_needed"
  | "telegram_unavailable"
  | "ai_not_configured"
  | "ai_busy"
  | "ai_refused"
  | "ai_failed"
  | "bot_not_configured"
  | "brand_unowned"
  | "channel_admin_required"
  | "bot_not_admin"
  | "placeholder_left"
  | "batch_changed"
  | "internal";

type Msg = Record<ApiLang, string>;

const MESSAGES: Record<ErrorCode, Msg> = {
  bad_request: {
    uz: "So‘rov noto‘g‘ri. Sahifani yangilab, qayta urinib ko‘ring.",
    ru: "Некорректный запрос. Обновите страницу и попробуйте ещё раз.",
    en: "The request was not valid. Reload the page and try again.",
  },
  // {detail} is a whole sentence from invalidInputText (which field, what is wrong, in the owner's words).
  invalid_input: {
    uz: "{detail}",
    ru: "{detail}",
    en: "{detail}",
  },
  auth_required: {
    uz: "Bu amal uchun Telegram orqali kiring: botni oching.",
    ru: "Для этого войдите через Telegram: откройте бота.",
    en: "Sign in through Telegram for this: open the bot.",
  },
  forbidden: {
    uz: "Bu amalga ruxsatingiz yo‘q.",
    ru: "У вас нет доступа к этому действию.",
    en: "You don't have access to this.",
  },
  brand_not_found: {
    uz: "Brend topilmadi. Kanal havolasini qaytadan yuboring.",
    ru: "Бренд не найден. Отправьте ссылку на канал ещё раз.",
    en: "Brand not found. Send the channel link again.",
  },
  brand_forbidden: {
    uz: "Bu brend boshqa Telegram foydalanuvchisiga tegishli.",
    ru: "Этот бренд принадлежит другому пользователю Telegram.",
    en: "This brand belongs to another Telegram user.",
  },
  post_not_found: {
    uz: "Post topilmadi. Postlarni qaytadan yarating.",
    ru: "Пост не найден. Создайте посты заново.",
    en: "Post not found. Create the posts again.",
  },
  not_found: {
    uz: "Topilmadi.",
    ru: "Не найдено.",
    en: "Not found.",
  },
  conflict: {
    uz: "Buni hozir bajarib bo‘lmaydi. Sahifani yangilab, qayta urinib ko‘ring.",
    ru: "Сейчас это сделать нельзя. Обновите страницу и попробуйте снова.",
    en: "This can't be done right now. Reload the page and try again.",
  },
  publish_in_progress: {
    uz: "Bu post hozir kanalga joylanmoqda. Bir daqiqadan keyin kanalni tekshiring, qayta bosish shart emas.",
    ru: "Этот пост сейчас публикуется в канал. Проверьте канал через минуту, нажимать ещё раз не нужно.",
    en: "This post is being posted to the channel right now. Check the channel in a minute; no need to tap again.",
  },
  own_brand_needed: {
    uz: "Bu brend faqat ochiq kanal postlaridan tuzilgan. Ma’lumot qo‘shish uchun avval biznesingiz tavsifi bilan o‘z brendingizni yarating.",
    ru: "Этот бренд собран только из открытых постов канала. Чтобы добавить данные, сначала создайте свой бренд с описанием бизнеса.",
    en: "This brand was built from public channel posts only. To add your details, first create your own brand with a business description.",
  },
  rate_limited: {
    uz: "Juda ko‘p so‘rov. {seconds} soniyadan keyin qayta urinib ko‘ring.",
    ru: "Слишком много запросов. Попробуйте через {seconds} с.",
    en: "Too many requests. Try again in {seconds} s.",
  },
  budget_exhausted: {
    uz: "Bugungi limit tugadi. Ertaga qayta urinib ko‘ring yoki Telegram’da {bot} boti orqali davom eting.",
    ru: "Дневной лимит исчерпан. Попробуйте завтра или продолжите в Telegram через бота {bot}.",
    en: "Today's limit is used up. Try again tomorrow, or continue in Telegram with {bot}.",
  },
  channel_invalid: {
    uz: "Kanal havolasi noto‘g‘ri. Misol: @kanal_nomi yoki https://t.me/kanal_nomi",
    ru: "Неверная ссылка на канал. Пример: @kanal_nomi или https://t.me/kanal_nomi",
    en: "That channel link is not valid. Example: @channel_name or https://t.me/channel_name",
  },
  channel_empty: {
    uz: "{channel} kanalida hali o‘qiydigan postlar yo‘q yoki u yopiq. Biznesingizni tasvirlab bering — reja va birinchi postlarni noldan tuzamiz.",
    ru: "В канале {channel} пока нечего читать, или он закрыт. Опишите ваш бизнес — составим план и первые посты с нуля.",
    en: "{channel} has no posts to read yet, or it is private. Describe your business and we'll build the plan and first posts from scratch.",
  },
  channel_mismatch: {
    uz: "Bu kanal brendingiz kanaliga mos emas.",
    ru: "Этот канал не совпадает с каналом бренда.",
    en: "This channel does not match the brand's channel.",
  },
  knowledge_needed: {
    uz: "Kanal havolasini yuboring yoki biznesingizni bir necha gapda yozing: nima sotasiz, kimga, qayerda.",
    ru: "Пришлите ссылку на канал или опишите бизнес в нескольких предложениях: что продаёте, кому, где.",
    en: "Send a channel link or describe your business in a few sentences: what you sell, to whom, where.",
  },
  telegram_unavailable: {
    uz: "Telegram hozir javob bermadi. Bir daqiqadan keyin qayta urinib ko‘ring.",
    ru: "Telegram сейчас не ответил. Попробуйте через минуту.",
    en: "Telegram did not answer. Try again in a minute.",
  },
  ai_not_configured: {
    uz: "AI hozircha ulanmagan. Administratorga xabar bering.",
    ru: "ИИ пока не подключён. Сообщите администратору.",
    en: "AI is not connected yet. Please tell the administrator.",
  },
  ai_busy: {
    uz: "AI hozir band. Bir daqiqadan keyin qayta urinib ko‘ring.",
    ru: "ИИ сейчас занят. Попробуйте через минуту.",
    en: "The AI is busy right now. Try again in a minute.",
  },
  ai_refused: {
    uz: "AI bu so‘rovni bajarmadi. Matnni o‘zgartirib, qayta urinib ko‘ring.",
    ru: "ИИ не выполнил этот запрос. Измените текст и попробуйте снова.",
    en: "The AI declined this request. Rephrase it and try again.",
  },
  ai_failed: {
    uz: "AI javob bera olmadi. Qayta urinib ko‘ring.",
    ru: "ИИ не смог ответить. Попробуйте ещё раз.",
    en: "The AI could not answer. Please try again.",
  },
  bot_not_configured: {
    uz: "Telegram bot hozircha ulanmagan.",
    ru: "Telegram-бот пока не подключён.",
    en: "The Telegram bot is not connected yet.",
  },
  brand_unowned: {
    uz: "Bu brend hali Telegram akkauntingizga ulanmagan. Postni bot orqali joylang — bot kanal egasini tekshirib, brendni sizga biriktiradi.",
    ru: "Этот бренд ещё не привязан к вашему Telegram. Опубликуйте пост через бота — он проверит владельца канала и привяжет бренд к вам.",
    en: "This brand is not linked to your Telegram yet. Post through the bot: it checks the channel owner and links the brand to you.",
  },
  channel_admin_required: {
    uz: "Postni faqat kanal egasi yoki post yozish huquqi bor admin joylay oladi.",
    ru: "Публиковать может только владелец канала или админ с правом публикации.",
    en: "Only the channel's owner or an admin who can post may publish there.",
  },
  bot_not_admin: {
    uz: "Botni kanalga admin qiling va «Yozuvli xabarlar» huquqini bering, keyin qayta urinib ko‘ring.",
    ru: "Сделайте бота админом канала с правом «Публикация сообщений» и попробуйте ещё раз.",
    en: "Make the bot an admin of the channel with the \"Post messages\" right, then try again.",
  },
  placeholder_left: {
    uz: "Postda to‘ldirilmagan joy qoldi: {facts}. Shu ma’lumotni yozing yoki o‘sha gapni o‘chiring, keyin qayta tasdiqlang.",
    ru: "В посте осталось незаполненное место: {facts}. Впишите эти данные или удалите это предложение, затем подтвердите снова.",
    en: "The post still has a blank to fill: {facts}. Add that detail or delete the sentence, then approve again.",
  },
  // «Approve the week»: the batch is not the one the owner saw (a new batch, a finished picture, an edit).
  batch_changed: {
    uz: "Hafta postlari siz ko‘rganingizdan keyin o‘zgardi. Yangi ro‘yxatni ko‘rib, qayta tasdiqlang.",
    ru: "Посты недели изменились после того, как вы их открыли. Посмотрите новый список и подтвердите снова.",
    en: "The week's posts changed after you opened them. Look at the new list and approve again.",
  },
  internal: {
    uz: "Kutilmagan xatolik. Qayta urinib ko‘ring.",
    ru: "Неожиданная ошибка. Попробуйте ещё раз.",
    en: "Something went wrong. Please try again.",
  },
};

export const isApiLang = (x: unknown): x is ApiLang => x === "uz" || x === "ru" || x === "en";

/** First supported language among the candidates (body.lang, ?lang=, Accept-Language). Default uz. */
export function pickApiLang(...candidates: (string | null | undefined)[]): ApiLang {
  for (const c of candidates) {
    if (!c) continue;
    for (const part of c.split(",")) {
      const base = part.trim().split(/[-_;]/)[0]?.toLowerCase();
      if (isApiLang(base)) return base;
    }
  }
  return "uz";
}

export function errorText(code: ErrorCode, lang: ApiLang, vars: Record<string, string | number> = {}): string {
  // invalid_input without a ready sentence (a thrower that only knows the field): build it here.
  if (code === "invalid_input" && !vars.detail) vars = { ...vars, detail: invalidInputText({ code: "custom", path: String(vars.field ?? "").split(".") }, lang) };
  const tpl = MESSAGES[code]?.[lang] ?? MESSAGES.internal[lang];
  return tpl.replace(/\{(\w+)\}/g, (_m, k: string) => (k in vars ? String(vars[k]) : "")).replace(/\s+([.:,])/g, "$1").replace(/:\s*\.$/, ".");
}

/** Default code for an HTTP status (when a thrower gave none). */
export function codeForStatus(status: number): ErrorCode {
  if (status === 400) return "bad_request";
  if (status === 401) return "auth_required";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status === 503) return "ai_not_configured";
  if (status === 502 || status === 504) return "ai_failed";
  return "internal";
}

/** Codes whose message is always the localized dictionary text (never a thrower's raw message). */
export const hasMessage = (code: string): code is ErrorCode => code in MESSAGES;

/* ------------------------------------------------------------ validation errors in the owner's words */

/** The parts of a zod issue we read (zod 4). */
export type InputIssue = {
  code: string;
  path: PropertyKey[];
  origin?: string;
  maximum?: number | bigint;
  minimum?: number | bigint;
  input?: unknown;
  errors?: InputIssue[][];
};

const FIELD: Record<string, Msg> = {
  knowledge: { uz: "Tavsif", ru: "Описание", en: "The description" },
  channel: { uz: "Kanal havolasi", ru: "Ссылка на канал", en: "The channel link" },
  samplePosts: { uz: "Namuna postlar", ru: "Примеры постов", en: "Sample posts" },
  slots: { uz: "Postlar", ru: "Посты", en: "Posts" },
  brief: { uz: "Topshiriq", ru: "Задание", en: "The brief" },
  text: { uz: "Matn", ru: "Текст", en: "The text" },
  goal: { uz: "Maqsad", ru: "Цель", en: "The goal" },
  category: { uz: "Soha", ru: "Сфера", en: "The category" },
  brandName: { uz: "Brend nomi", ru: "Название бренда", en: "The brand name" },
  competitors: { uz: "Raqobatchilar", ru: "Конкуренты", en: "Competitors" },
  count: { uz: "Postlar soni", ru: "Число постов", en: "The number of posts" },
  urls: { uz: "Havolalar", ru: "Ссылки", en: "Links" },
  products: { uz: "Mahsulotlar", ru: "Товары", en: "Products" },
  brandId: { uz: "Brend", ru: "Бренд", en: "The brand" },
  postId: { uz: "Post", ru: "Пост", en: "The post" },
  hook: { uz: "Birinchi qator", ru: "Первая строка", en: "The opening line" },
  cta: { uz: "Chaqiriq", ru: "Призыв", en: "The call to action" },
  day: { uz: "Kun", ru: "День", en: "The day" },
  time: { uz: "Vaqt", ru: "Время", en: "The time" },
  address: { uz: "Manzil", ru: "Адрес", en: "The address" },
  hours: { uz: "Ish vaqti", ru: "Часы работы", en: "The opening hours" },
  phone: { uz: "Telefon", ru: "Телефон", en: "The phone" },
  lang: { uz: "Til", ru: "Язык", en: "The language" },
};

const SAY: Record<ApiLang, Record<string, (f: string, n?: string) => string>> = {
  uz: {
    longText: (f, n) => `${f} ${n} belgidan oshmasin.`,
    manyItems: (f, n) => `${f}: ko‘pi bilan ${n} ta.`,
    shortText: (f) => `${f} juda qisqa.`,
    fewItems: (f, n) => `${f}: kamida ${n} ta kerak.`,
    bigNumber: (f, n) => `${f} ${n} dan oshmasin.`,
    required: (f) => `${f} kerak.`,
    wrong: (f) => `${f} noto‘g‘ri.`,
  },
  ru: {
    longText: (f, n) => `${f}: не больше ${n} знаков.`,
    manyItems: (f, n) => `${f}: не больше ${n}.`,
    shortText: (f) => `${f}: слишком коротко.`,
    fewItems: (f, n) => `${f}: нужно хотя бы ${n}.`,
    bigNumber: (f, n) => `${f}: не больше ${n}.`,
    required: (f) => `Нужно указать: ${f.toLowerCase()}.`,
    wrong: (f) => `${f}: неверное значение.`,
  },
  en: {
    longText: (f, n) => `${f} must be at most ${n} characters.`,
    manyItems: (f, n) => `${f}: at most ${n}.`,
    shortText: (f) => `${f} is too short.`,
    fewItems: (f, n) => `${f}: at least ${n} needed.`,
    bigNumber: (f, n) => `${f} must be at most ${n}.`,
    required: (f) => `${f} is required.`,
    wrong: (f) => `${f} is not valid.`,
  },
};

const GENERIC: Msg = { uz: "Ma’lumot to‘liq emas yoki noto‘g‘ri.", ru: "Данные неполные или неверные.", en: "Some input is missing or wrong." };

/** A union body (e.g. /posts: slots or a brief): the branch the caller meant is the one with the fewest problems. */
function innermost(issue: InputIssue): InputIssue {
  if (issue.code !== "invalid_union" || !issue.errors?.length) return issue;
  const branch = [...issue.errors].filter((b) => b.length).sort((a, b) => a.length - b.length)[0];
  if (!branch) return issue;
  const inner = innermost(branch[0]);
  return { ...inner, path: [...issue.path, ...inner.path] };
}

/** One sentence for the owner: which field, what is wrong ("Tavsif 8000 belgidan oshmasin."). */
export function invalidInputText(raw: InputIssue | undefined, lang: ApiLang): string {
  if (!raw) return GENERIC[lang];
  const issue = innermost(raw);
  const keys = issue.path.filter((k): k is string => typeof k === "string");
  const index = issue.path.find((k): k is number => typeof k === "number");
  const key = keys.at(-1);
  if (!key) return GENERIC[lang];
  // A field the owner never typed (initData, an internal id) has no name in their words: the plain sentence.
  let field = FIELD[key]?.[lang];
  if (!field) return GENERIC[lang];
  if (index != null && keys.length > 1 && FIELD[keys[0]]) field = `${FIELD[keys[0]][lang]} #${index + 1}: ${field.charAt(0).toLowerCase()}${field.slice(1)}`;
  const say = SAY[lang];
  const n = (v: number | bigint | undefined) => String(v ?? "");
  switch (issue.code) {
    case "too_big":
      return issue.origin === "string" ? say.longText(field, n(issue.maximum)) : issue.origin === "array" ? say.manyItems(field, n(issue.maximum)) : say.bigNumber(field, n(issue.maximum));
    case "too_small":
      return issue.origin === "array" ? say.fewItems(field, n(issue.minimum)) : issue.origin === "string" ? (issue.input === "" || Number(issue.minimum) <= 1 ? say.required(field) : say.shortText(field)) : say.wrong(field);
    case "invalid_type":
      return issue.input === undefined || issue.input === null ? say.required(field) : say.wrong(field);
    default:
      return say.wrong(field);
  }
}
