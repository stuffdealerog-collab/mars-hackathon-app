/**
 * Page titles, descriptions and share cards in the three languages: the server's metadata
 * (generateMetadata on / and /studio, by ?lang=) and the client's document.title when the owner
 * switches language. The cards are the brand kit's public/brand/og-<lang>.png.
 */
import type { Lang } from "./format";

// Kept here, not imported from ./lang: the server pages read this module too.
const isLang = (v: unknown): v is Lang => v === "uz" || v === "ru" || v === "en";

type PageMeta = { title: string; description: string };
type LangMeta = {
  landing: PageMeta & { ogTitle: string; ogDescription: string };
  studio: PageMeta;
  ogAlt: string;
};

export const META: Record<Lang, LangMeta> = {
  uz: {
    landing: {
      title: "Mercat — Telegram kanalingiz uchun postlar",
      description:
        "Telegram kanalingiz havolasini qo‘ying: Mercat kanalni o‘qiydi, nimani tuzatish kerakligini raqamlar bilan ko‘rsatadi va bir haftalik postlarni rasmlari bilan tayyorlaydi. Siz faqat tasdiqlaysiz.",
      ogTitle: "Kanalingizga postlarni Mercat yozadi",
      ogDescription: "Havolani qo‘ying: kanal tahlili, haftalik reja va rasmli postlar. Siz faqat tasdiqlaysiz.",
    },
    studio: {
      title: "Studiya",
      description: "Kanalingiz havolasini qo‘ying: Mercat bo‘limi kanalni o‘qiydi, haftalik reja tuzadi va postlarni rasmlari bilan yozadi. Har birini siz tasdiqlaysiz.",
    },
    ogAlt: "Mercat: o‘nta chiroqdan iborat marketing bo‘limi yonib turibdi. Kanalingiz uchun haftalik postlar.",
  },
  ru: {
    landing: {
      title: "Mercat — посты для вашего Telegram-канала",
      description:
        "Вставьте ссылку на свой Telegram-канал: Mercat прочитает канал, покажет в цифрах, что стоит исправить, и подготовит посты на неделю с картинками. Вы только утверждаете.",
      ogTitle: "Посты для вашего канала пишет Mercat",
      ogDescription: "Вставьте ссылку: разбор канала, план на неделю и посты с картинками. Вы только утверждаете.",
    },
    studio: {
      title: "Студия",
      description: "Вставьте ссылку на канал: отдел Mercat прочитает его, составит план на неделю и напишет посты с картинками. Каждый утверждаете вы.",
    },
    ogAlt: "Mercat: горит отдел маркетинга из десяти ламп. Посты на неделю для вашего канала.",
  },
  en: {
    landing: {
      title: "Mercat — posts for your Telegram channel",
      description:
        "Paste your Telegram channel link: Mercat reads the channel, shows in numbers what to fix and prepares a week of posts with pictures. You only approve.",
      ogTitle: "Mercat writes the posts for your channel",
      ogDescription: "Paste the link: a channel review, a week's plan and posts with pictures. You only approve.",
    },
    studio: {
      title: "Studio",
      description: "Paste your channel link: the Mercat department reads it, plans the week and writes posts with pictures. You approve each one.",
    },
    ogAlt: "Mercat: a marketing department of ten lamps, lit. A week of posts for your channel.",
  },
};

/** The page's language from ?lang= (one value or the first of several), Uzbek otherwise. */
export function langOf(value: string | string[] | undefined): Lang {
  const v = Array.isArray(value) ? value[0] : value;
  return isLang(v) ? v : "uz";
}

export const ogImage = (lang: Lang) => ({ url: `/brand/og-${lang}.png`, width: 1200, height: 630, alt: META[lang].ogAlt });

/** The browser tab's title, as the server's metadata would give it for this page and language. */
export const tabTitle = (page: "landing" | "studio", lang: Lang) => (page === "landing" ? META[lang].landing.title : `${META[lang].studio.title} · Mercat`);
