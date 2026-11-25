/**
 * What the bot tells the owner about connections, in Uzbek (Latin), Russian and English (pure). Kept apart from
 * src/lib/i18n.ts, like the autopilot's copy, so the bot's dictionary stays with the bot stream.
 */
import type { Locale } from "../i18n";
import type { ConnectorId } from "./types";

type Dict = Record<Locale, string>;

export const PLATFORM: Record<ConnectorId, Dict> = {
  instagram: { uz: "Instagram", ru: "Instagram", en: "Instagram" },
  meta_ads: { uz: "Meta reklama", ru: "Реклама Meta", en: "Meta ads" },
  youtube: { uz: "YouTube", ru: "YouTube", en: "YouTube" },
  google_ads: { uz: "Google Ads", ru: "Google Ads", en: "Google Ads" },
};

const TEXT = {
  done: {
    uz: "✅ {platform} ulandi: {account}.\nMercat u yerdan faqat raqamlarni o‘qiydi: ko‘rishlar, obunachilar, reklama natijalari. Hech narsa joylamaydi va o‘zgartirmaydi. Uzish istalgan payt: «Boshqa tarmoqlar» bo‘limida.",
    ru: "✅ {platform} подключён: {account}.\nMercat только читает оттуда цифры: просмотры, подписчиков, результаты рекламы. Ничего не публикует и не меняет. Отключить можно в любой момент в разделе «Другие площадки».",
    en: "✅ {platform} is connected: {account}.\nMercat only reads the numbers there: views, followers, ad results. It never posts or changes anything. You can disconnect any time under Other platforms.",
  },
  done_empty: {
    uz: "{platform} ulandi, lekin o‘qiydigan narsa topilmadi: {reason} Tuzatib, qayta ulang.",
    ru: "{platform} подключён, но читать нечего: {reason} Исправьте и подключите снова.",
    en: "{platform} is connected, but there is nothing to read: {reason} Fix it and connect again.",
  },
  expired: {
    uz: "{platform} ulanishi tugadi ({account}), raqamlar endi yangilanmaydi. Qayta ulash uchun ilovada «Boshqa tarmoqlar»ni oching. {days} kun ichida qayta ulamasangiz, Mercat bu raqamlarni o‘chiradi.",
    ru: "Подключение {platform} закончилось ({account}), цифры больше не обновляются. Чтобы подключить снова, откройте «Другие площадки» в приложении. Если не подключить снова за {days} дней, Mercat удалит эти цифры.",
    en: "The {platform} connection ended ({account}); its numbers no longer update. To connect again, open Other platforms in the app. If you do not connect again within {days} days, Mercat deletes these numbers.",
  },
  open_app: { uz: "Ilovani ochish", ru: "Открыть приложение", en: "Open the app" },
} satisfies Record<string, Dict>;

const REASON = {
  not_professional: {
    uz: "Instagram hisobi professional (biznes yoki muallif) emas yoki Facebook sahifasiga bog‘lanmagan.",
    ru: "аккаунт Instagram не профессиональный (бизнес или автор) или не привязан к странице Facebook.",
    en: "the Instagram account is not a professional (business or creator) account, or it is not linked to a Facebook Page.",
  },
  no_ad_accounts: {
    uz: "bu profilda reklama hisobi yo‘q.",
    ru: "в этом профиле нет рекламного аккаунта.",
    en: "this profile has no ad account.",
  },
  no_channel: {
    uz: "bu Google hisobida YouTube kanali yo‘q.",
    ru: "в этом аккаунте Google нет YouTube-канала.",
    en: "this Google account has no YouTube channel.",
  },
} satisfies Record<string, Dict>;

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);

export function connectText(locale: Locale, key: keyof typeof TEXT, vars: Record<string, string> = {}): string {
  return fill(TEXT[key][locale], vars);
}

export function emptyReason(locale: Locale, code: string | undefined): string {
  const r = code && code in REASON ? REASON[code as keyof typeof REASON] : null;
  return r ? r[locale] : "";
}

/** "@safia.bakery" or the account's name. */
export const accountLabel = (a: { name: string; handle?: string }) => (a.handle ? `@${a.handle}` : a.name);
