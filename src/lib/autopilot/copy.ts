/**
 * What the autopilot says to the owner, in Uzbek (Latin), Russian and English (pure, no I/O). Kept apart from
 * src/lib/i18n.ts so the bot's dictionary stays with the bot stream; plain sentences, no promises we cannot keep.
 */
import { formatDay, type Locale } from "../i18n";
import type { WeekSkipReason } from "./types";
import { tashkentClock } from "../cron/clock";
import { LATE_LIMIT_HOURS } from "./time";

type Dict = Record<Locale, string>;

const TEXT = {
  post_out: {
    uz: "✅ Post @{channel} kanalida chiqdi ({when}).",
    ru: "✅ Пост вышел в @{channel} ({when}).",
    en: "✅ Your post is out in @{channel} ({when}).",
  },
  open_post: { uz: "Ko‘rish", ru: "Открыть", en: "Open" },

  bot_not_admin: {
    uz: "{when} dagi post chiqmadi: bot @{channel} kanalida admin emas yoki unda «Yozuvli xabarlar» huquqi yo‘q. Botni {hours} soat ichida admin qilsangiz, post o‘zi chiqadi (tunda emas). Undan keyin postni ilovadan joylang.",
    ru: "Пост на {when} не вышел: бот не админ в @{channel} или у него нет права «Публикация сообщений». Если сделать бота админом в течение {hours} ч, пост выйдет сам (но не ночью). Позже — опубликуйте его в приложении.",
    en: "The post for {when} did not go out: the bot is not an admin of @{channel}, or it lacks the \"Post messages\" right. Make it an admin within {hours} hours and the post goes out on its own (not at night). After that, publish it from the app.",
  },
  owner_not_admin: {
    uz: "{when} dagi post chiqmadi: Telegram sizni @{channel} kanalining egasi yoki post joylay oladigan admini deb ko‘rmayapti. Huquqingizni {hours} soat ichida tuzatsangiz, post o‘zi chiqadi (tunda emas). Undan keyin postni ilovadan joylang.",
    ru: "Пост на {when} не вышел: Telegram не видит вас владельцем или админом @{channel} с правом публикации. Если исправить права в течение {hours} ч, пост выйдет сам (но не ночью). Позже — опубликуйте его в приложении.",
    en: "The post for {when} did not go out: Telegram doesn't list you as the owner or an admin of @{channel} who can post. Fix your rights within {hours} hours and the post goes out on its own (not at night). After that, publish it from the app.",
  },
  changed: {
    uz: "{when} dagi post chiqmadi: tasdiqlangandan keyin matni yoki rasmi o‘zgargan. Yangi variantni ko‘rib, qayta tasdiqlang.",
    ru: "Пост на {when} не вышел: после подтверждения изменился текст или картинка. Проверьте новую версию и подтвердите снова.",
    en: "The post for {when} did not go out: its text or picture changed after you approved it. Check the new version and approve it again.",
  },
  blank: {
    uz: "{when} dagi post chiqmadi: matnda to‘ldirilmagan joy bor ({tokens}). To‘ldiring va qayta tasdiqlang.",
    ru: "Пост на {when} не вышел: в тексте осталось пустое место ({tokens}). Заполните его и подтвердите снова.",
    en: "The post for {when} did not go out: the text still has a blank ({tokens}). Fill it in and approve it again.",
  },
  failed: {
    uz: "{when} dagi post chiqmadi: Telegram uni qabul qilmadi. Postni ilovada ochib, qayta joylab ko‘ring.",
    ru: "Пост на {when} не вышел: Telegram его не принял. Откройте пост в приложении и опубликуйте снова.",
    en: "The post for {when} did not go out: Telegram refused it. Open the post in the app and publish it again.",
  },
  expired: {
    uz: "{when} dagi post o‘z vaqtida chiqmadi, endi esa kech: o‘zimiz yubormadik. Hali kerak bo‘lsa, ilovadan joylang.",
    ru: "Пост на {when} не вышел вовремя, а сейчас уже поздно, поэтому сами мы его не отправили. Если он ещё нужен, опубликуйте его в приложении.",
    en: "The post for {when} didn't go out on time and it is too late now, so we didn't send it. If you still want it, publish it from the app.",
  },
  past_date: {
    uz: "{when} dagi post chiqmadi: u rejadagidan boshqa kuni chiqayotgan edi, matnda esa o‘sha kunga bog‘liq so‘z yoki sana bor ({dates}). Matnni tuzatib, qayta tasdiqlang.",
    ru: "Пост на {when} не вышел: он уходил в другой день, а в тексте есть слово или дата, привязанные к дню публикации ({dates}). Исправьте текст и подтвердите снова.",
    en: "The post for {when} did not go out: it was going out on a different day, and the text has a word or date tied to its day ({dates}). Fix the text and approve it again.",
  },
  unknown: {
    uz: "{when} dagi postni yuborayotganda aloqa uzildi. @{channel} kanalini tekshiring: post chiqqan bo‘lsa, hech narsa qilmang; chiqmagan bo‘lsa, ilovada qayta joylang. Ikki marta chiqmasligi uchun o‘zimiz qayta yubormaymiz.",
    ru: "Во время отправки поста на {when} оборвалась связь. Проверьте @{channel}: если пост вышел, ничего делать не нужно; если нет, опубликуйте его в приложении. Сами мы его не повторяем, чтобы он не вышел дважды.",
    en: "The connection dropped while sending the post for {when}. Check @{channel}: if the post is there, there's nothing to do; if not, publish it from the app. We don't resend it ourselves so it never goes out twice.",
  },

  week_title: { uz: "Bu haftaning postlari ({n}):", ru: "Посты на неделю ({n}):", en: "This week's posts ({n}):" },
  week_ready_title: { uz: "Yangi hafta uchun {n} ta post tayyor:", ru: "Посты на новую неделю готовы ({n}):", en: "{n} posts are ready for the new week:" },
  week_none: { uz: "Hozir tasdiqlashga tayyor post yo‘q.", ru: "Сейчас нет постов, готовых к подтверждению.", en: "No posts are ready to approve right now." },
  week_hint: {
    uz: "«Hammasini tasdiqlash» bossangiz, har biri o‘z vaqtida o‘zi chiqadi. Chiqqanda xabar beraman.",
    ru: "Нажмите «Подтвердить все» — каждый пост выйдет сам в своё время. Я напишу, когда он выйдет.",
    en: "Tap \"Approve all\" and each post goes out on its own at its time. I'll message you when it does.",
  },
  week_skipped_title: { uz: "Hozircha chiqmaydi:", ru: "Пока не выйдут:", en: "Not going out yet:" },
  week_approve_all: { uz: "✅ Hammasini tasdiqlash", ru: "✅ Подтвердить все", en: "✅ Approve all" },
  week_review: { uz: "Ko‘rib chiqish", ru: "Посмотреть", en: "Review" },
  week_changed: { uz: "Postlar o‘zgargan. Mana yangi ro‘yxat:", ru: "Посты изменились. Вот новый список:", en: "The posts have changed. Here is the new list:" },
  week_done: {
    uz: "Tasdiqlandi. Postlar o‘z vaqtida chiqadi, har biri chiqqanda xabar beraman:",
    ru: "Готово. Посты выйдут в своё время, я напишу, когда выйдет каждый:",
    en: "Done. The posts go out at their times; I'll message you as each one goes out:",
  },
  week_bot_cannot_post: {
    uz: "Bot hali @{channel} kanalida post joylay olmaydi. Botni admin qiling, aks holda postlar chiqmaydi.",
    ru: "Бот пока не может публиковать в @{channel}. Сделайте его админом, иначе посты не выйдут.",
    en: "The bot can't post in @{channel} yet. Make it an admin, or the posts won't go out.",
  },
  week_bot_not_admin: {
    uz: "Bot hali @{channel} kanalida post joylay olmaydi. Botni kanalga admin qiling («Yozuvli xabarlar» huquqi bilan), keyin «Qayta tekshirish»ni bosing.",
    ru: "Бот пока не может публиковать в @{channel}. Сделайте его админом канала с правом «Публикация сообщений», затем нажмите «Проверить снова».",
    en: "The bot can't post in @{channel} yet. Make it an admin of the channel with the \"Post messages\" right, then tap \"Check again\".",
  },
  week_retry: { uz: "🔄 Qayta tekshirish", ru: "🔄 Проверить снова", en: "🔄 Check again" },
  autopilot_offer: { uz: "🔁 Har hafta shunday tayyorlab bering", ru: "🔁 Готовить так каждую неделю", en: "🔁 Do this every week" },
  autopilot_on: {
    uz: "Avtopilot yoqildi. Har dushanba soat 9:00 da o‘tgan hafta hisobotini va yangi hafta postlarini yuboraman. Tasdig‘ingizsiz hech narsa chiqmaydi. Sinov muddati: {days} kun.",
    ru: "Автопилот включён. Каждый понедельник в 9:00 пришлю отчёт за прошлую неделю и посты на новую. Без вашего подтверждения ничего не выходит. Пробный период: {days} дн.",
    en: "Autopilot is on. Every Monday at 9:00 I'll send last week's report and the new week's posts. Nothing goes out without your approval. Trial: {days} days.",
  },
  autopilot_off: {
    uz: "Avtopilot o‘chirildi. Tasdiqlangan postlar baribir o‘z vaqtida chiqadi.",
    ru: "Автопилот выключен. Уже подтверждённые посты всё равно выйдут в своё время.",
    en: "Autopilot is off. Posts you already approved still go out at their times.",
  },

  admin_ok: {
    uz: "Bot @{channel} kanalida admin bo‘ldi. Tasdiqlangan postlar endi o‘z vaqtida o‘zi chiqadi.",
    ru: "Бот стал админом @{channel}. Подтверждённые посты теперь выходят сами в своё время.",
    en: "The bot is now an admin of @{channel}. Approved posts now go out on their own at their times.",
  },
  admin_no_post: {
    uz: "Bot @{channel} kanalida admin, lekin unda «Yozuvli xabarlar» huquqi yo‘q, shuning uchun postlar chiqmaydi. Shu huquqni yoqing.",
    ru: "Бот — админ @{channel}, но без права «Публикация сообщений», поэтому посты не выйдут. Включите это право.",
    en: "The bot is an admin of @{channel} but without the \"Post messages\" right, so posts won't go out. Turn that right on.",
  },
  admin_removed: {
    uz: "Bot @{channel} kanali adminlaridan chiqarildi. Botni qayta admin qilmaguningizcha navbatdagi postlar chiqmaydi.",
    ru: "Бота убрали из админов @{channel}. Запланированные посты не выйдут, пока вы снова не сделаете его админом.",
    en: "The bot was removed from the admins of @{channel}. Queued posts won't go out until you make it an admin again.",
  },

  cap_reached: {
    uz: "Bu hafta yangi postlar yozilmadi: shu brend uchun oylik limit tugadi. Limit bo‘shagach yana yozaman.",
    ru: "На этой неделе новые посты не написаны: месячный лимит для этого бренда исчерпан. Продолжу, когда лимит освободится.",
    en: "No new posts this week: this brand's monthly limit is used up. I'll continue once it frees up.",
  },
  week_failed: {
    uz: "Bu hafta postlarni yozib bo‘lmadi. Ilovada rejani qo‘lda yangilab ko‘ring.",
    ru: "На этой неделе не получилось написать посты. Обновите план в приложении вручную.",
    en: "I couldn't write this week's posts. Try refreshing the plan in the app.",
  },
  idle: {
    uz: "Avtopilot pauzada: {days} kundan beri sizdan xabar yo‘q. /start bosing — keyingi dushanbadan yana ishlaydi.",
    ru: "Автопилот на паузе: вы не заходили {days} дн. Нажмите /start — со следующего понедельника он снова заработает.",
    en: "Autopilot is paused: we haven't heard from you in {days} days. Tap /start and it resumes next Monday.",
  },
  goal_sale: { uz: "Ko‘proq buyurtma", ru: "Больше заказов", en: "More orders" },
  goal_grow: { uz: "Ko‘proq obunachi", ru: "Больше подписчиков", en: "More subscribers" },
  goal_saved: {
    uz: "Yozib qo‘ydim: {label}. Keyingi hisobotlar shunga qarab bo‘ladi.",
    ru: "Записал: {label}. Следующие отчёты будут под эту цель.",
    en: "Noted: {label}. The next reports follow this goal.",
  },
  not_owner: {
    uz: "Bu brend boshqa foydalanuvchiga tegishli.",
    ru: "Этот бренд принадлежит другому пользователю.",
    en: "This brand belongs to another user.",
  },
  not_found: { uz: "Brend topilmadi.", ru: "Бренд не найден.", en: "Brand not found." },
  orders_recorded: { uz: "Yozib qo‘ydim: {label}", ru: "Записал: {label}", en: "Noted: {label}" },
} satisfies Record<string, Dict>;

export type CopyKey = keyof typeof TEXT;

/** Every text, for the wording tests (no machine-sounding words, the same placeholders in each language). */
export const COPY: Readonly<Record<CopyKey, Dict>> = TEXT;

export function say(locale: Locale, key: CopyKey, vars: Record<string, string | number> = {}): string {
  const template: string = TEXT[key][locale] ?? TEXT[key].uz;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

const REASON: Record<WeekSkipReason, Dict> = {
  published: { uz: "allaqachon chiqqan", ru: "уже вышел", en: "already out" },
  no_channel: { uz: "kanal ulanmagan", ru: "канал не подключён", en: "no channel linked" },
  blank: { uz: "to‘ldirilmagan joy: {tokens}", ru: "пустое место: {tokens}", en: "a blank to fill: {tokens}" },
  past_date: { uz: "o‘tib ketgan sana: {dates}", ru: "прошедшая дата: {dates}", en: "a date that has passed: {dates}" },
  no_slot: { uz: "rejadan emas, vaqti belgilanmagan", ru: "не из плана, время не задано", en: "not from the plan, no time set" },
  slot_passed: { uz: "vaqti o‘tib ketgan", ru: "время уже прошло", en: "its time has passed" },
  picture_rendering: { uz: "rasm hali tayyorlanmoqda", ru: "картинка ещё готовится", en: "the picture is still being made" },
  video_missing: { uz: "sizning videongiz kerak", ru: "нужно ваше видео", en: "needs your video" },
};

/** Why a post stays out of the week, as a short phrase. */
export function skipReason(locale: Locale, reason: WeekSkipReason, extra: { tokens?: string[]; dates?: string[] } = {}): string {
  const list = (xs?: string[]) => (xs ?? []).slice(0, 5).map((x) => `«${x}»`).join(", ");
  return (REASON[reason][locale] ?? REASON[reason].uz).replace("{tokens}", list(extra.tokens)).replace("{dates}", (extra.dates ?? []).join(", "));
}

/** "1-dekabr, 12:40" / "1 декабря, 12:40" / "1 December, 12:40" on the Tashkent clock. */
export function whenLabel(ms: number, locale: Locale): string {
  const c = tashkentClock(new Date(ms));
  return `${formatDay(c.date, locale)}, ${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}`;
}

/** 1240 -> "1 240" (uz, ru) / "1,240" (en). */
export function fmtNum(n: number, locale: Locale): string {
  const s = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, locale === "en" ? "," : " ");
  return n < 0 ? `-${s}` : s;
}

/** +12% / -8% / 0% */
export const fmtDelta = (value: number, base: number) => {
  const pct = Math.round(((value - base) / base) * 100);
  return pct > 0 ? `+${pct}%` : `${pct}%`;
};

/** Owner-safe sentence for a queue status code (publish_queue.last_error), for the Studio's schedule state. */
export function queueErrorText(locale: Locale, code: string | null | undefined, vars: { when: string; channel: string }): string | undefined {
  switch (code) {
    case "bot_not_admin":
      return say(locale, "bot_not_admin", { ...vars, hours: LATE_LIMIT_HOURS });
    case "owner_not_admin":
      return say(locale, "owner_not_admin", { ...vars, hours: LATE_LIMIT_HOURS });
    case "past_date":
      return say(locale, "past_date", { ...vars, dates: "…" });
    case "changed":
      return say(locale, "changed", vars);
    case "blank":
      return say(locale, "blank", { ...vars, tokens: "…" });
    case "expired":
      return say(locale, "expired", vars);
    case "unknown":
      return say(locale, "unknown", vars);
    case "failed":
      return say(locale, "failed", vars);
    default:
      return undefined;
  }
}
