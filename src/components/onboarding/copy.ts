/**
 * The intro's words (uz / ru / en). One headline and one line per screen; the demos carry the rest.
 * Uzbek uses ‘ in o‘/g‘ and ’ for the tutuq belgisi. Employee names come from the shared ui/copy.ts.
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
  steps: { title: string; line: string }[];
  /** «Kanalim hali bo‘sh» row in the link demo */
  empty: string;
  /** the one-time admin step, said in one line; {bot} is the bot's @username */
  admin: string;
  /** the quiet line for marketers, where the switch lives */
  pro: { phone: string; desktop: string };
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
    { title: "Mercat — sizning marketing bo‘limingiz", line: "O‘nta xodim. Chiroq faqat xodim ishlayotganda yonadi." },
    { title: "Kanal havolasini yuboring", line: "Kanal hali bo‘sh bo‘lsa, biznesingizni o‘z so‘zlaringiz bilan yozing." },
    { title: "Natijani ko‘ring", line: "Kanal raqamlari, haftalik reja va kanalingiz uslubidagi rasmli postlar." },
    { title: "Tasdiqlang — bot joylaydi", line: "Siz tasdiqlamaguncha kanalga hech narsa chiqmaydi." },
  ],
  empty: "Kanalim hali bo‘sh",
  admin: "Bir marta: {bot} botini kanalga «Xabar joylash» huquqi bilan admin qiling.",
  pro: {
    phone: "Marketolog bo‘lsangiz: «Pro» rejim Sozlamalarda.",
    desktop: "Marketolog bo‘lsangiz: «Pro» rejim panel pastidagi almashtirgichda.",
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
    "O‘nta chiroq ketma-ket yonadi: har biri ishlayotgan xodim.",
    "Havola maydoniga kanal havolasi yoziladi, yuqoridagi tablo kanal nomini ko‘rsatadi.",
    "Tabloda obunachilar soni, haftalik reja va rasmli postlar.",
    "Post tasdiqlanadi, so‘ng bot uni kanalga joylaydi.",
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
    { title: "Mercat — ваш отдел маркетинга", line: "Десять сотрудников. Лампа горит, только пока сотрудник работает." },
    { title: "Пришлите ссылку на канал", line: "Канал пока пустой? Опишите бизнес своими словами." },
    { title: "Посмотрите результат", line: "Цифры канала, план на неделю и посты с картинками в стиле вашего канала." },
    { title: "Утвердите — бот опубликует", line: "Без вашего утверждения в канал не выходит ничего." },
  ],
  empty: "Мой канал пока пустой",
  admin: "Один раз: сделайте {bot} админом канала с правом «Публикация сообщений».",
  pro: {
    phone: "Для маркетологов: режим «Pro» — в Настройках.",
    desktop: "Для маркетологов: режим «Pro» — переключатель внизу панели.",
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
    "Десять ламп загораются по очереди: каждая — работающий сотрудник.",
    "В поле вводится ссылка на канал, табло сверху показывает имя канала.",
    "На табло число подписчиков, план на неделю и посты с картинками.",
    "Пост утверждается, затем бот публикует его в канале.",
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
    { title: "Mercat is your marketing department", line: "Ten employees. A lamp is lit only while its employee works." },
    { title: "Send your channel link", line: "Channel still empty? Describe your business in your own words." },
    { title: "See the result", line: "Your channel’s numbers, a week plan and posts with pictures in your channel’s style." },
    { title: "Approve, and the bot posts", line: "Nothing goes out without your approval." },
  ],
  empty: "My channel is still empty",
  admin: "Once: make {bot} a channel admin with “Post messages”.",
  pro: {
    phone: "For marketers: Pro mode is in Settings.",
    desktop: "For marketers: Pro mode is the switch at the bottom of the panel.",
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
    "Ten lamps light one after another: each is an employee at work.",
    "A channel link is typed into the field; the sign above shows the channel name.",
    "The sign shows the subscriber count, a week plan and posts with pictures.",
    "A post is approved, then the bot posts it to the channel.",
  ],
};

export const INTRO_COPY: Record<Lang, IntroCopy> = { uz, ru, en };
