/**
 * Is this scraped channel a real, living business channel? Pure.
 * Catches the cases that silently poisoned v1 benchmarks: a guessed handle that
 * belongs to a squatter (t.me/s/lesailes_uz = 1 subscriber, "Hamkorlik uchun",
 * formerly "Sotiladi" — not Les Ailes), an empty channel, a dead one, or a handle
 * with no public preview at all (t.me/bonapetit_uz).
 */
import { decode } from "./scrape";
import type { ChannelData } from "./types";

export type ValidityCode = "ok" | "empty" | "squatted" | "tiny" | "stale" | "no_preview";
export type Msg = { uz: string; ru: string; en: string };

export interface Validity {
  ok: boolean;
  code: ValidityCode;
  message: Msg;
  evidence: string;
}

export const SQUAT_RE = /sotiladi|sotuvda|продается|продаётся|продаю|for sale|hamkorlik uchun|reklama uchun|реклама|prodam/i;
export const TINY_SUBS = 300;
export const STALE_DAYS = 60;
const DAY = 86_400_000;

/** Texts of service messages on a t.me/s page ("Channel name was changed to «Sotiladi»"). */
export function serviceTexts(html: string): string[] {
  const out: string[] = [];
  for (const chunk of html.split(/<div class="tgme_widget_message_wrap/).slice(1)) {
    const head = /<div class="(tgme_widget_message[^"]*)"/.exec(chunk);
    if (!head || !/service_message/.test(head[1])) continue;
    const m = /class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(chunk);
    if (!m) continue;
    const text = decode(m[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (text) out.push(text);
  }
  return out;
}

/** True when the t.me/s request was redirected away from the preview (t.me/<handle> contact page). */
export function previewRedirected(finalUrl: string): boolean {
  try {
    return !/^\/s\//.test(new URL(finalUrl).pathname);
  } catch {
    return false;
  }
}

/** Validity for a handle whose t.me/s page has no public preview. */
export function noPreview(handle: string): Validity {
  const h = `@${handle.replace(/^@/, "")}`;
  return {
    ok: false,
    code: "no_preview",
    message: {
      uz: `${h} — ochiq ko‘rinishi yo‘q (bu kanal emas, yopiq kanal yoki shaxsiy akkaunt). Postlarini o‘qib bo‘lmaydi, taqqoslashga olinmadi.`,
      ru: `${h} — нет публичного просмотра (это не канал, закрытый канал или личный аккаунт). Посты прочитать нельзя, в сравнение не взят.`,
      en: `${h} has no public preview (not a channel, a private channel or a personal account). Its posts can't be read, so it was left out.`,
    },
    evidence: "t.me/s redirects to the contact page",
  };
}

const quoteTitle = (t?: string) => (t ? `«${t}»` : "—");

export function channelValidity(
  data: ChannelData,
  now: number,
  opts: { role?: "own" | "competitor"; serviceTexts?: string[] } = {},
): Validity {
  const role = opts.role ?? "competitor";
  const h = `@${data.channel}`;
  const subs = data.subscribers;
  const posts = data.posts.length;
  const renames = (opts.serviceTexts ?? []).map((t) => /«([^»]+)»/.exec(t)?.[1] ?? t).filter((t) => SQUAT_RE.test(t));
  const newest = data.posts.reduce((m, p) => Math.max(m, Date.parse(p.postedAt)), Number.NEGATIVE_INFINITY);
  const ageDays = Number.isFinite(newest) ? (now - newest) / DAY : undefined;
  const evidence = [
    `subscribers=${subs ?? "?"}`,
    `posts=${posts}`,
    `title=${quoteTitle(data.title)}`,
    ...(renames.length ? [`renamed: ${renames.map((r) => `«${r}»`).join(", ")}`] : []),
    ...(ageDays != null ? [`newest post ${Math.round(ageDays)}d ago`] : []),
  ].join(" · ");
  const subsUz = subs != null ? `${subs} obunachi` : "obunachilar soni noma'lum";
  const subsRu = subs != null ? `${subs} подписчиков` : "число подписчиков неизвестно";
  const subsEn = subs != null ? `${subs} subscribers` : "subscriber count unknown";
  const tail: Msg =
    role === "competitor"
      ? { uz: "Taqqoslashga olinmadi.", ru: "В сравнение не взят.", en: "Left out of the comparison." }
      : { uz: "Havolani tekshiring.", ru: "Проверьте ссылку.", en: "Please check the link." };

  const squatTitle = SQUAT_RE.test(data.title ?? "");
  if ((squatTitle || renames.length) && ((subs ?? 0) < 1000 || posts === 0)) {
    return {
      ok: false,
      code: "squatted",
      message: {
        uz: `${h} — ${subsUz}, kanal nomi ${quoteTitle(data.title)}. Bu brend kanali emasga o‘xshaydi. ${tail.uz}`,
        ru: `${h} — ${subsRu}, название канала ${quoteTitle(data.title)}. Похоже, это не канал бренда. ${tail.ru}`,
        en: `${h} has ${subsEn} and is titled ${quoteTitle(data.title)}. It does not look like the brand's channel. ${tail.en}`,
      },
      evidence,
    };
  }
  if (posts === 0) {
    return {
      ok: false,
      code: "empty",
      message: {
        uz: `${h} — kanalda o‘qiladigan post yo‘q (${subsUz}). ${tail.uz}`,
        ru: `${h} — в канале нет читаемых постов (${subsRu}). ${tail.ru}`,
        en: `${h} has no readable posts (${subsEn}). ${tail.en}`,
      },
      evidence,
    };
  }
  if (role === "competitor" && subs != null && subs < TINY_SUBS) {
    return {
      ok: false,
      code: "tiny",
      message: {
        uz: `${h} — atigi ${subsUz}. Bunday kichik kanal bilan taqqoslash xato xulosa beradi. ${tail.uz}`,
        ru: `${h} — всего ${subsRu}. Сравнение с таким маленьким каналом даст ложные выводы. ${tail.ru}`,
        en: `${h} has only ${subsEn}. Comparing with a channel this small gives misleading conclusions. ${tail.en}`,
      },
      evidence,
    };
  }
  if (ageDays != null && ageDays > STALE_DAYS) {
    const d = Math.round(ageDays);
    return {
      ok: false,
      code: "stale",
      message: {
        uz: `${h} — oxirgi post ${d} kun oldin chiqqan. Kanal faol emas. ${tail.uz}`,
        ru: `${h} — последний пост вышел ${d} дн. назад. Канал неактивен. ${tail.ru}`,
        en: `${h} last posted ${d} days ago. The channel is inactive. ${tail.en}`,
      },
      evidence,
    };
  }
  return {
    ok: true,
    code: "ok",
    message: { uz: `${h} — faol kanal (${subsUz}).`, ru: `${h} — активный канал (${subsRu}).`, en: `${h} is an active channel (${subsEn}).` },
    evidence,
  };
}
