import { HttpError } from "../http";
import { LlmError } from "../llm";
import { MediaError } from "./jobs";

/**
 * `{ error, code }` for the picture routes (/api/uslub/visual, /api/uslub/media/post-image), in the
 * caller's language: `lang` from the body or `?lang=` (uz | ru | en, default uz), the same shape the
 * engine's routes return. Codes are stable for the UI; the text is for the owner.
 */
export type Lang = "uz" | "ru" | "en";

export type PictureErrorCode =
  | "bad_input"
  | "bad_image"
  | "too_large"
  | "not_found"
  | "forbidden"
  | "login_required"
  | "rate_limited"
  | "daily_limit"
  | "post_limit"
  | "style_limit"
  | "not_configured"
  | "storage_failed"
  | "ai_failed"
  | "generation_failed"
  | "fetch_failed"
  | "internal";

const TEXT: Record<PictureErrorCode, Record<Lang, string>> = {
  bad_input: {
    uz: "So‘rov noto‘g‘ri. Sahifani yangilab, qayta urinib ko‘ring.",
    ru: "Неверный запрос. Обновите страницу и попробуйте ещё раз.",
    en: "The request is not valid. Reload the page and try again.",
  },
  bad_image: {
    uz: "Rasmni o‘qib bo‘lmadi. JPG yoki PNG rasm yuboring.",
    ru: "Не удалось прочитать фото. Пришлите JPG или PNG.",
    en: "The photo could not be read. Send a JPG or PNG.",
  },
  too_large: {
    uz: "Rasmlar juda katta. Kamroq yoki kichikroq rasm yuboring.",
    ru: "Фото слишком большие. Пришлите меньше фото или поменьше размером.",
    en: "The photos are too large. Send fewer or smaller photos.",
  },
  not_found: { uz: "Post yoki brend topilmadi.", ru: "Пост или бренд не найден.", en: "Post or brand not found." },
  forbidden: {
    uz: "Bu brend boshqa Telegram foydalanuvchisiga tegishli.",
    ru: "Этот бренд принадлежит другому пользователю Telegram.",
    en: "This brand belongs to another Telegram user.",
  },
  login_required: {
    uz: "Rasm yaratish uchun Telegram bot orqali kiring.",
    ru: "Чтобы создавать картинки, войдите через Telegram-бота.",
    en: "Sign in through the Telegram bot to make pictures.",
  },
  rate_limited: {
    uz: "Juda ko‘p so‘rov. Bir daqiqadan keyin qayta urinib ko‘ring.",
    ru: "Слишком много запросов. Попробуйте через минуту.",
    en: "Too many requests. Try again in a minute.",
  },
  daily_limit: {
    uz: "Bugungi rasm limiti tugadi. Ertaga yana urinib ko‘ring.",
    ru: "Лимит картинок на сегодня закончился. Попробуйте завтра.",
    en: "Today's picture limit is used up. Try again tomorrow.",
  },
  post_limit: {
    uz: "Bu post uchun variantlar tugadi.",
    ru: "Для этого поста варианты закончились.",
    en: "No more versions for this post.",
  },
  style_limit: {
    uz: "Bugun uslubni o‘rganish limiti tugadi. Ertaga urinib ko‘ring.",
    ru: "Лимит на изучение стиля на сегодня закончился. Попробуйте завтра.",
    en: "Today's limit for learning the style is used up. Try again tomorrow.",
  },
  not_configured: {
    uz: "Rasm yaratish hali ulanmagan.",
    ru: "Создание картинок ещё не подключено.",
    en: "Picture making is not connected yet.",
  },
  storage_failed: {
    uz: "Rasmni saqlab bo‘lmadi. Qayta urinib ko‘ring.",
    ru: "Не удалось сохранить фото. Попробуйте ещё раз.",
    en: "The photo could not be saved. Try again.",
  },
  ai_failed: {
    uz: "AI hozir javob bermadi. Birozdan keyin qayta urinib ko‘ring.",
    ru: "AI сейчас не ответил. Попробуйте чуть позже.",
    en: "The AI did not answer just now. Try again shortly.",
  },
  generation_failed: {
    uz: "Rasm chiqmadi. Qayta urinib ko‘ring.",
    ru: "Картинка не получилась. Попробуйте ещё раз.",
    en: "The picture did not come out. Try again.",
  },
  fetch_failed: {
    uz: "Kanal rasmlarini hozir o‘qib bo‘lmadi. Birozdan keyin qayta urinib ko‘ring.",
    ru: "Сейчас не удалось прочитать фото канала. Попробуйте чуть позже.",
    en: "The channel's photos could not be read just now. Try again shortly.",
  },
  internal: {
    uz: "Nimadir buzildi. Qayta urinib ko‘ring.",
    ru: "Что-то пошло не так. Попробуйте ещё раз.",
    en: "Something went wrong. Try again.",
  },
};

export const pictureErrorText = (code: PictureErrorCode, lang: Lang) => TEXT[code][lang];

export function parseLang(v: unknown): Lang | undefined {
  return v === "uz" || v === "ru" || v === "en" ? v : undefined;
}

/** `?lang=` first, then a body field; uz by default. */
export function langOf(req: Request, body?: { lang?: unknown } | null): Lang {
  return parseLang(new URL(req.url).searchParams.get("lang")) ?? parseLang(body?.lang) ?? "uz";
}

/** A known failure of a picture route. */
export class PictureError extends Error {
  constructor(
    readonly status: number,
    readonly code: PictureErrorCode,
    detail?: string,
  ) {
    super(detail ?? code);
    this.name = "PictureError";
  }
}

const MEDIA_CODES: Record<MediaError["code"], PictureErrorCode> = {
  not_configured: "not_configured",
  bad_input: "bad_image",
  limit: "daily_limit",
  not_found: "not_found",
  login_required: "login_required",
};

/** Any error -> status + code. Unknown errors are logged here and become `internal`. */
export function classifyPictureError(err: unknown): { status: number; code: PictureErrorCode } {
  if (err instanceof PictureError) return { status: err.status, code: err.code };
  if (err instanceof MediaError) return { status: err.status, code: MEDIA_CODES[err.code] };
  if (err instanceof LlmError) return { status: err.status === 429 ? 429 : 502, code: "ai_failed" };
  if (err instanceof HttpError) {
    if (err.status === 404) return { status: 404, code: "not_found" };
    if (err.status === 403) return { status: 403, code: "forbidden" };
    if (err.status === 429) return { status: 429, code: "rate_limited" };
    if (err.status === 413) return { status: 413, code: "too_large" };
    if (err.status === 400) return { status: 400, code: "bad_input" };
    return { status: err.status, code: "internal" };
  }
  console.error("[uslub/pictures]", err instanceof Error ? err.message : err);
  return { status: 500, code: "internal" };
}

export function pictureErrorResponse(err: unknown, lang: Lang): Response {
  const { status, code } = classifyPictureError(err);
  return Response.json({ error: pictureErrorText(code, lang), code }, { status, headers: { "Cache-Control": "no-store" } });
}
