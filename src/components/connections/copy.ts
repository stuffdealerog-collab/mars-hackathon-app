/**
 * The Connections card's words, in Uzbek (Latin) first, then Russian and English (pure; the return page reads it too).
 * Plain sentences: what Mercat reads, that it only reads, and what to do when something is off.
 */
import type { ConnectError, ConnectorId, WeekMetric } from "@/lib/connectors/types";

export type Lang = "uz" | "ru" | "en";

interface Copy {
  title: string;
  lead: string;
  names: Record<ConnectorId, string>;
  reads: Record<ConnectorId, string>;
  readsPrefix: string;
  connect: string;
  reconnect: string;
  refresh: string;
  disconnect: string;
  account: string;
  testMode: string;
  week: string;
  metrics: Record<WeekMetric, string>;
  updated: string;
  loading: string;
  ago: { now: string; min: string; hour: string; day: string };
  expiresIn: string;
  confirmDisconnect: string;
  connected: string;
  errors: Record<ConnectError, string>;
  busy: string;
  done: { title: string; text: string; openTelegram: string; openStudio: string; failTitle: string; retry: string };
}

export const COPY: Record<Lang, Copy> = {
  uz: {
    title: "Boshqa tarmoqlar",
    lead: "Instagram, YouTube va reklama raqamlari shu yerda. Mercat faqat o‘qiydi: hech narsa joylamaydi, o‘zgartirmaydi va pul sarflamaydi.",
    names: { instagram: "Instagram", meta_ads: "Meta reklama", youtube: "YouTube", google_ads: "Google Ads" },
    reads: {
      instagram: "ko‘rishlar, qamrov, obunachilar, post va reels natijalari",
      meta_ads: "xarajat, ko‘rsatishlar, bosishlar, boshlangan yozishmalar",
      youtube: "ko‘rishlar, tomosha vaqti, obunachilar, videolar",
      google_ads: "xarajat, ko‘rsatishlar, bosishlar, konversiyalar",
    },
    readsPrefix: "O‘qiymiz:",
    connect: "Ulash",
    reconnect: "Qayta ulash",
    refresh: "Yangilash",
    disconnect: "Uzish",
    account: "Hisob",
    testMode: "sinov rejimi",
    week: "7 kun",
    metrics: { views: "ko‘rish", followers: "obunachi", subscribers: "obunachi", spend: "xarajat", cost: "xarajat", messages: "yozishma", clicks: "bosish" },
    updated: "Yangilandi: {ago}",
    loading: "Raqamlar yuklanmoqda…",
    ago: { now: "hozirgina", min: "{n} daqiqa oldin", hour: "{n} soat oldin", day: "{n} kun oldin" },
    expiresIn: "{n} kundan keyin qayta ulash kerak bo‘ladi",
    confirmDisconnect: "{platform} uzilsinmi? Mercat o‘qigan raqamlar ham o‘chiriladi.",
    connected: "{platform} ulandi. Birinchi raqamlar bir necha daqiqada chiqadi.",
    errors: {
      oauth_denied: "Ulash bekor qilindi.",
      oauth_state: "Havola eskirgan. «Ulash»ni yana bir bor bosing.",
      oauth_failed: "Ulab bo‘lmadi. Birozdan keyin qayta urinib ko‘ring.",
      connector_off: "Bu tarmoq hozir o‘chirilgan.",
      not_professional: "Instagram hisobi professional (biznes yoki muallif) bo‘lishi va Facebook sahifasiga bog‘langan bo‘lishi kerak. Instagram ilovasida: Sozlamalar → Hisob turi va vositalar.",
      no_ad_accounts: "Bu profilda reklama hisobi topilmadi.",
      no_channel: "Bu Google hisobida YouTube kanali yo‘q.",
      access_pending: "Google ruxsatini kutyapmiz: Mercat ilovasi hali tekshiruvda.",
      scope_missing: "Ruxsat to‘liq berilmadi. Qayta ulang va barcha belgilarni qoldiring.",
      expired: "Ulanish tugadi, raqamlar yangilanmayapti.",
      rate_limited: "Tarmoq hozir band. Raqamlar keyinroq yangilanadi.",
      sync_failed: "Oxirgi yangilash o‘tmadi. Keyinroq yana urinamiz.",
    },
    busy: "Kutib turing…",
    done: {
      title: "{platform} ulandi",
      text: "Raqamlar bir necha daqiqada Mercat’da chiqadi. Telegram’ga qayting.",
      openTelegram: "Telegram’da ochish",
      openStudio: "Studiyani ochish",
      failTitle: "{platform} ulanmadi",
      retry: "Ilovaga qaytib, yana urinib ko‘ring.",
    },
  },
  ru: {
    title: "Другие площадки",
    lead: "Цифры Instagram, YouTube и рекламы — здесь. Mercat только читает: ничего не публикует, не меняет и не тратит деньги.",
    names: { instagram: "Instagram", meta_ads: "Реклама Meta", youtube: "YouTube", google_ads: "Google Ads" },
    reads: {
      instagram: "просмотры, охват, подписчики, результаты постов и рилс",
      meta_ads: "расход, показы, клики, начатые переписки",
      youtube: "просмотры, время просмотра, подписчики, видео",
      google_ads: "расход, показы, клики, конверсии",
    },
    readsPrefix: "Читаем:",
    connect: "Подключить",
    reconnect: "Подключить снова",
    refresh: "Обновить",
    disconnect: "Отключить",
    account: "Аккаунт",
    testMode: "тестовый режим",
    week: "7 дней",
    metrics: { views: "просмотров", followers: "подписчиков", subscribers: "подписчиков", spend: "расход", cost: "расход", messages: "переписок", clicks: "кликов" },
    updated: "Обновлено: {ago}",
    loading: "Загружаем цифры…",
    ago: { now: "только что", min: "{n} мин назад", hour: "{n} ч назад", day: "{n} дн. назад" },
    expiresIn: "Через {n} дн. нужно будет подключить снова",
    confirmDisconnect: "Отключить {platform}? Цифры, которые прочитал Mercat, тоже удалятся.",
    connected: "{platform} подключён. Первые цифры появятся через несколько минут.",
    errors: {
      oauth_denied: "Подключение отменено.",
      oauth_state: "Ссылка устарела. Нажмите «Подключить» ещё раз.",
      oauth_failed: "Не удалось подключить. Попробуйте чуть позже.",
      connector_off: "Эта площадка сейчас отключена.",
      not_professional: "Аккаунт Instagram должен быть профессиональным (бизнес или автор) и привязанным к странице Facebook. В приложении Instagram: Настройки → Тип аккаунта и инструменты.",
      no_ad_accounts: "В этом профиле не нашлось рекламного аккаунта.",
      no_channel: "В этом аккаунте Google нет YouTube-канала.",
      access_pending: "Ждём доступ от Google: приложение Mercat ещё на проверке.",
      scope_missing: "Доступ дан не полностью. Подключите снова и оставьте все галочки.",
      expired: "Подключение закончилось, цифры не обновляются.",
      rate_limited: "Площадка сейчас занята, цифры обновятся позже.",
      sync_failed: "Последнее обновление не прошло, попробуем позже.",
    },
    busy: "Секунду…",
    done: {
      title: "{platform} подключён",
      text: "Цифры появятся в Mercat через несколько минут. Вернитесь в Telegram.",
      openTelegram: "Открыть в Telegram",
      openStudio: "Открыть Студию",
      failTitle: "{platform} не подключился",
      retry: "Вернитесь в приложение и попробуйте ещё раз.",
    },
  },
  en: {
    title: "Other platforms",
    lead: "Your Instagram, YouTube and ad numbers, here. Mercat only reads: it never posts, changes anything or spends money.",
    names: { instagram: "Instagram", meta_ads: "Meta ads", youtube: "YouTube", google_ads: "Google Ads" },
    reads: {
      instagram: "views, reach, followers, how posts and reels did",
      meta_ads: "spend, impressions, clicks, messages started",
      youtube: "views, watch time, subscribers, videos",
      google_ads: "spend, impressions, clicks, conversions",
    },
    readsPrefix: "We read:",
    connect: "Connect",
    reconnect: "Connect again",
    refresh: "Refresh",
    disconnect: "Disconnect",
    account: "Account",
    testMode: "test mode",
    week: "7 days",
    metrics: { views: "views", followers: "followers", subscribers: "subscribers", spend: "spent", cost: "spent", messages: "messages", clicks: "clicks" },
    updated: "Updated {ago}",
    loading: "Loading the numbers…",
    ago: { now: "just now", min: "{n} min ago", hour: "{n} h ago", day: "{n} days ago" },
    expiresIn: "You will need to connect again in {n} days",
    confirmDisconnect: "Disconnect {platform}? The numbers Mercat read will be deleted too.",
    connected: "{platform} is connected. The first numbers show up in a few minutes.",
    errors: {
      oauth_denied: "Connecting was cancelled.",
      oauth_state: "The link expired. Press Connect once more.",
      oauth_failed: "Could not connect. Try again a bit later.",
      connector_off: "This platform is switched off right now.",
      not_professional: "The Instagram account must be a professional (business or creator) account linked to a Facebook Page. In the Instagram app: Settings → Account type and tools.",
      no_ad_accounts: "No ad account was found in this profile.",
      no_channel: "This Google account has no YouTube channel.",
      access_pending: "Waiting for Google access: the Mercat app is still under review.",
      scope_missing: "Access was only partly given. Connect again and leave every box ticked.",
      expired: "The connection ended; the numbers are not updating.",
      rate_limited: "The platform is busy; the numbers will update later.",
      sync_failed: "The last update failed; we will try again later.",
    },
    busy: "One moment…",
    done: {
      title: "{platform} is connected",
      text: "The numbers show up in Mercat in a few minutes. Go back to Telegram.",
      openTelegram: "Open in Telegram",
      openStudio: "Open the Studio",
      failTitle: "{platform} did not connect",
      retry: "Go back to the app and try once more.",
    },
  },
};

export const connectCopy = (lang: Lang) => COPY[lang] ?? COPY.uz;

export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));

/** "3 soat oldin" from an ISO time. */
export function agoLabel(iso: string, lang: Lang, now = Date.now()): string {
  const t = connectCopy(lang).ago;
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (min < 2) return t.now;
  if (min < 60) return fill(t.min, { n: min });
  const h = Math.round(min / 60);
  if (h < 36) return fill(t.hour, { n: h });
  return fill(t.day, { n: Math.round(h / 24) });
}
