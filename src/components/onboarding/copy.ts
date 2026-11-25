/**
 * The intro's words (uz / ru / en). One headline and one line per screen; the demos carry the rest.
 * Uzbek uses ‘ in o‘/g‘ and ’ for the tutuq belgisi. Employee names come from the shared ui/copy.ts.
 *
 * The add-the-bot card quotes only Telegram labels that read the same on Android, iPhone and
 * Desktop (translations.telegram.org, 2026-11-25): uz «Adminlar», «Admin qo‘shish»; ru
 * «Администраторы»; en “Post messages”. Labels that differ by app are said in plain words:
 * the post right (uz «Yozuvli xabarlar» / «Xabarlar joylashtirish» / «Xabarlar nashr qilish»;
 * ru «Отправка публикаций» on phones, «Публикация сообщений» on Desktop), ru «Добавить» (Android)
 * vs «Добавить администратора» (iPhone), en Admins (iPhone) vs Administrators.
 */
import type { Lang } from "../ui/format";

export type IntroCopy = {
  skip: string;
  next: string;
  back: string;
  start: string;
  close: string;
  /** the Settings / Help entry that opens the intro again */
  again: string;
  /** "{i} / {n}" for the progress dots */
  of: string;
  /** one per card, in STEP_KINDS order (steps.ts) */
  steps: { title: string; line: string }[];
  /** «Kanalim hali bo‘sh» row in the link demo */
  empty: string;
  /** The add-the-bot card. {bot} is the bot's @username, {channel} the owner's channel. */
  admin: {
    /** the card's title when the owner's channel is known (at a publish) */
    title: string;
    /** three short steps for doing it by hand in Telegram */
    how: string[];
    /** the lime button: Telegram's channel picker with the post right already on */
    add: string;
    /** quiet: close the intro, do it later */
    later: string;
    /** quiet, once the link was opened: open it again */
    reopen: string;
    /** lime, once the link was opened: close the intro (at a publish: publish again) */
    done: string;
    /** at a publish: the post is being published again */
    checking: string;
    /** at a publish: it came back, the bot is still not an admin */
    notYet: string;
    /** `yours`: the channel's name when the host does not know it */
    demo: { list: string; you: string; owner: string; bot: string; can: string; yours: string };
  };
  demo: {
    working: string;
    subscribers: string;
    views: string;
    week: string[];
    plan: string;
    approve: string;
    approved: string;
    published: string;
    posts: { text: string; when: string }[];
  };
  /** what the demo shows, for screen readers (the demos themselves are pictures) */
  alt: string[];
};

const uz: IntroCopy = {
  skip: "O‘tkazib yuborish",
  next: "Keyingi",
  back: "Orqaga",
  start: "Boshlash",
  close: "Yopish",
  again: "Qanday ishlaydi",
  of: "{i} / {n}",
  steps: [
    { title: "Mercat — sizning marketing bo‘limingiz", line: "Har bir xodimning o‘z chirog‘i bor. Chiroq faqat u ishlayotganda yonadi." },
    { title: "Kanal havolasini yuboring", line: "Kanal hali bo‘sh bo‘lsa, biznesingizni o‘z so‘zlaringiz bilan yozing." },
    { title: "Natijani ko‘ring", line: "Kanal raqamlari, haftalik reja va kanalingiz uslubidagi rasmli postlar." },
    { title: "Tasdiqlang — bot joylaydi", line: "Siz tasdiqlamaguncha kanalga hech narsa chiqmaydi." },
    { title: "Botni kanalga qo‘shing", line: "Busiz bot kanalga post joylay olmaydi." },
  ],
  empty: "Kanalim hali bo‘sh",
  admin: {
    title: "Botni «{channel}» kanaliga qo‘shing",
    how: [
      "Kanal sozlamalarini oching, «Adminlar» bo‘limiga kiring.",
      "«Admin qo‘shish» tugmasini bosing, qidiruvga {bot} deb yozing.",
      "Post joylash huquqini o‘chirmang va saqlang.",
    ],
    add: "Botni kanalga qo‘shish",
    later: "Keyinroq qilaman",
    reopen: "Yana ochish",
    done: "Tayyor",
    checking: "Postni qayta joylayapmiz…",
    notYet: "Bot hali admin emas. Kanalingizni tanlang, «Saqlash»ni bosing, keyin «Tayyor»ni.",
    demo: { list: "Adminlar", you: "Siz", owner: "kanal egasi", bot: "bot", can: "post joylay oladi", yours: "Kanalingiz" },
  },
  demo: {
    working: "ishlayapti",
    subscribers: "obunachi",
    views: "o‘rtacha ko‘rish",
    week: ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"],
    plan: "Haftalik reja",
    approve: "Tasdiqlash",
    approved: "Tasdiqlandi",
    published: "Kanalga joylandi",
    posts: [
      { text: "Tandirdan yangi non — har kuni soat 7:00 da.", when: "Du · 09:00" },
      { text: "Shanba kuni somsa ikki baravar ko‘p.", when: "Ch · 18:00" },
      { text: "Buyurtmani bir kun oldin qoldiring.", when: "Ju · 12:00" },
    ],
  },
  alt: [
    "Chiroqlar ketma-ket yonadi: har biri ishlayotgan xodim.",
    "Havola maydoniga kanal havolasi yoziladi, yuqoridagi tablo kanal nomini ko‘rsatadi.",
    "Tabloda obunachilar soni, haftalik reja va rasmli postlar.",
    "Post tasdiqlanadi, so‘ng bot uni kanalga joylaydi.",
    "Kanal adminlari ro‘yxatiga bot qo‘shiladi, post joylash huquqi yoqiladi.",
  ],
};

const ru: IntroCopy = {
  skip: "Пропустить",
  next: "Далее",
  back: "Назад",
  start: "Начать",
  close: "Закрыть",
  again: "Как это работает",
  of: "{i} / {n}",
  steps: [
    { title: "Mercat — ваш отдел маркетинга", line: "У каждого сотрудника своя лампа. Она горит, только пока он работает." },
    { title: "Пришлите ссылку на канал", line: "Канал пока пустой? Опишите бизнес своими словами." },
    { title: "Посмотрите результат", line: "Цифры канала, план на неделю и посты с картинками в стиле вашего канала." },
    { title: "Утвердите — бот опубликует", line: "Без вашего утверждения в канал не выходит ничего." },
    { title: "Добавьте бота в канал", line: "Без этого бот не сможет публиковать посты." },
  ],
  empty: "Мой канал пока пустой",
  admin: {
    title: "Добавьте бота в «{channel}»",
    how: [
      "Откройте настройки канала → «Администраторы».",
      "Добавьте администратора и найдите {bot}.",
      "Право на публикацию оставьте включённым и сохраните.",
    ],
    add: "Добавить бота в канал",
    later: "Сделаю позже",
    reopen: "Открыть ещё раз",
    done: "Готово",
    checking: "Публикуем пост ещё раз…",
    notYet: "Бот пока не админ. Выберите свой канал, сохраните и нажмите «Готово».",
    demo: { list: "Администраторы", you: "Вы", owner: "владелец", bot: "бот", can: "может публиковать", yours: "Ваш канал" },
  },
  demo: {
    working: "работает",
    subscribers: "подписчиков",
    views: "просмотров в среднем",
    week: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
    plan: "План на неделю",
    approve: "Утвердить",
    approved: "Утверждено",
    published: "Опубликовано в канале",
    posts: [
      { text: "Свежий хлеб из тандыра — каждый день в 7:00.", when: "Пн · 09:00" },
      { text: "В субботу самсы вдвое больше.", when: "Ср · 18:00" },
      { text: "Заказ оставляйте за день.", when: "Пт · 12:00" },
    ],
  },
  alt: [
    "Лампы загораются по очереди: каждая — работающий сотрудник.",
    "В поле вводится ссылка на канал, табло сверху показывает имя канала.",
    "На табло число подписчиков, план на неделю и посты с картинками.",
    "Пост утверждается, затем бот публикует его в канале.",
    "Бот появляется в списке администраторов канала с правом публиковать.",
  ],
};

const en: IntroCopy = {
  skip: "Skip",
  next: "Next",
  back: "Back",
  start: "Start",
  close: "Close",
  again: "How it works",
  of: "{i} / {n}",
  steps: [
    { title: "Mercat is your marketing department", line: "Each employee has a lamp. It is lit only while they work." },
    { title: "Send your channel link", line: "Channel still empty? Describe your business in your own words." },
    { title: "See the result", line: "Your channel’s numbers, a week plan and posts with pictures in your channel’s style." },
    { title: "Approve, and the bot posts", line: "Nothing goes out without your approval." },
    { title: "Add the bot to your channel", line: "Without this, the bot can’t post to your channel." },
  ],
  empty: "My channel is still empty",
  admin: {
    title: "Add the bot to {channel}",
    how: [
      "Open your channel’s settings and go to the admins.",
      "Add an admin and search for {bot}.",
      "Leave “Post messages” on and save.",
    ],
    add: "Add bot to channel",
    later: "I’ll do it later",
    reopen: "Open again",
    done: "Done",
    checking: "Publishing the post again…",
    notYet: "The bot isn’t an admin yet. Pick your channel, save, then press Done.",
    demo: { list: "Administrators", you: "You", owner: "owner", bot: "bot", can: "can post", yours: "Your channel" },
  },
  demo: {
    working: "working",
    subscribers: "subscribers",
    views: "average views",
    week: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
    plan: "Week plan",
    approve: "Approve",
    approved: "Approved",
    published: "Posted to the channel",
    posts: [
      { text: "Fresh tandir bread, every day at 7:00.", when: "Mon · 09:00" },
      { text: "Twice the somsa on Saturday.", when: "Wed · 18:00" },
      { text: "Order a day ahead.", when: "Fri · 12:00" },
    ],
  },
  alt: [
    "Lamps light one after another: each is an employee at work.",
    "A channel link is typed into the field; the sign above shows the channel name.",
    "The sign shows the subscriber count, a week plan and posts with pictures.",
    "A post is approved, then the bot posts it to the channel.",
    "The bot joins the channel’s admins with the right to post.",
  ],
};

export const INTRO_COPY: Record<Lang, IntroCopy> = { uz, ru, en };
