/**
 * What kind of channel this is (owner correction 2, 2026-11-25), from the channel's own posts, title and description.
 * Pure: regexes and counts only, no LLM. Goals, rules, plan pillars, owner questions and the Monday report follow it.
 *
 * - business:  prices, how to order, a phone or address, menus, promotions ("buyurtma", "заказ", "12 000 so'm");
 * - blog:      a person writing about their own life in the first person ("men bugun…", "я сегодня…", "I tried…");
 * - expert:    advice, lessons and opinions from a specialist ("5 ta xato", "совет", "how to", "menimcha");
 * - media:     news in the third person, sources, many short posts with links ("ma'lum qildi", "сообщает", "according to");
 * - community: members, meetups, events and chats of a group ("a'zolar", "встреча", "join us").
 * With little evidence the answer is "business" at low confidence (today's sales plan), and the owner confirms the goal.
 */
import type { ChannelType, Goal } from "../contract";
import { normApos } from "./stats";

export interface TypePost {
  text: string;
  isForward?: boolean;
  links?: string[];
}

export interface TypeInput {
  posts: TypePost[];
  title?: string;
  description?: string;
  /** Posts per week, when known: a news digest posts many times a day. */
  postsPerWeek?: number;
}

export interface ChannelTypeGuess {
  type: ChannelType;
  /** 0..1: how sure the guess is (below 0.5 the confirm question matters most). */
  confidence: number;
  scores: Record<ChannelType, number>;
  /** Short machine-readable reasons, e.g. "business:posts 62%", "media:title". */
  signals: string[];
}

export const CHANNEL_TYPES: readonly ChannelType[] = ["business", "blog", "expert", "media", "community"];

/** The goal a channel type starts with: orders for a business, subscribers for everyone else. */
export const defaultGoalFor = (type: ChannelType | undefined | null): Goal => (type == null || type === "business" ? "sale" : "grow");

/** Growth channels (blog, expert, media, community) never get price, order or contact advice. */
export const isGrowthType = (type: ChannelType | undefined | null): boolean => type != null && type !== "business";

/**
 * The type a week's plan is built as: the owner's goal decides the pillars and KPIs ("sale" -> a sales plan, "grow" ->
 * a growth plan), the channel type decides which findings fire. A shop that wants subscribers plans like a community
 * channel; an expert who wants orders (a course) plans like a business.
 */
export function planTypeFor(type: ChannelType | undefined | null, goal: Goal | undefined | null): ChannelType {
  const g = goal ?? defaultGoalFor(type);
  if (g === "sale" || g === "trust" || g === "reach") return "business";
  return isGrowthType(type) ? (type as ChannelType) : "community";
}

const L = String.raw`(?<![\p{L}\d])`; // a word starts here (Cyrillic-safe \b)
const R = String.raw`(?![\p{L}\d])`;
const word = (alts: string) => new RegExp(`${L}(?:${alts})${R}`, "iu");
const stem = (alts: string) => new RegExp(`${L}(?:${alts})`, "iu");

const RE = {
  price: /\d[\d\s.,]*\s?(so'?m|сўм|сум|sum\b|uzs|ming\b|минг|тыс|\$|usd|y\.e)/iu,
  order: stem(
    "buyurtma|zakaz|заказ|yetkazib|yetkazish|доставк|delivery|sotib ol|sotuvda|купить|в наличии|mavjud|narx|цен[аыуе]|price|chegirma|aksiya|скидк|акци|bron|брон|savatcha|корзин|menyu|меню|filial|филиал|do'kon|магазин|optom|оптом|kafolat|гарант|nasiya|рассрочк|to'lov|оплат",
  ),
  phone: /\+?998[\s-]?\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/,
  place: /ko'chasi|mavzesi|tumani|mo'ljal|ориентир|ул\.|метро|ish vaqti|режим работы|\d{1,2}[:.]\d{2}\s?[-–—]\s?\d{1,2}[:.]\d{2}/iu,
  // First person singular: pronouns, and Uzbek 1sg verb endings (bordim, yozaman, o'ylayapman).
  iUz: /(?<![\p{L}'])(men|meni|menga|mening|menda|mendan|o'zim|o'zimning)(?![\p{L}'])|(?<![\p{L}'])\p{L}{3,}(dim|yapman|ayman|aman)(?![\p{L}'])/iu,
  iRu: word("я|мне|меня|мой|моя|моё|мои|моих|сама|сам"),
  iEn: /(?<![\p{L}'])(i|i'm|i've|i'd|my|me|myself)(?![\p{L}'])/u,
  diary: word("bugun|kecha|ertaga|hayotim|oilam|сегодня|вчера|завтра|моя жизнь|today|yesterday|this morning|my life|weekend|dam olish"),
  advice: stem(
    "maslahat|tavsiya|qanday qilib|nima uchun|sabablari|xato|qoida|bilasizmi|foydali|o'rganing|darslik|совет|рекоменд|как правильно|как выбрать|почему|ошибк|правил[оа]|урок|разбор|лайфхак|how to|tips?\\b|mistake|guide|lesson|why you|did you know|myth|afsona|миф",
  ),
  opinion: stem("menimcha|fikrimcha|tajribam|по-моему|по моему мнению|я считаю|мой опыт|i think|in my opinion|my experience"),
  specialist: stem(
    "shifokor|doktor|vrach|врач|psixolog|психолог|advokat|юрист|lawyer|trener|тренер|coach|коуч|ustoz|устоз|учител|teacher|mutaxassis|специалист|эксперт|expert|dietolog|нутрициолог|marketolog|маркетолог|pediatr|педиатр",
  ),
  news: stem(
    "yangilik|xabar ber|ma'lum qil|bildirdi|aytib o'tdi|ta'kidladi|manba|новост|сообщ|заявил|по данным|источник|news|reported|according to|breaking|срочно|tezkor|rasman|официально|prezident|президент|vazir|министр|hukumat|правительств",
  ),
  community: stem(
    "a'zo|участник|member|klub|club|клуб|jamiyat|hamjamiyat|сообществ|community|uchrashuv|встреч|meetup|tadbir|мероприят|qo'shiling|присоединяй|join us|ro'yxatdan o'ting|регистрац|volontyor|волонт|volunteer|bitiruvchi|выпускник|alumni|chatimiz|guruhimiz|наш чат|our chat",
  ),
  numberedList: /(^|\n)\s*(\d{1,2}[.)]|[•▪️◾️—–-])\s+\S/g,
  link: /https?:\/\/|t\.me\/|www\./i,
};

const TITLE: Record<ChannelType, RegExp> = {
  business: stem(
    "shop|store|market|do'kon|dokon|magazin|магазин|savdo|cafe|kafe|кафе|restoran|ресторан|bakery|nonvoy|qandolat|кондитер|tort|торт|cake|klinika|clinic|клиник|stomat|salon|салон|mchj|ооо|llc|delivery|yetkazib|доставк|optom|оптом|buyurtma|заказ|gul|flower|цвет|mebel|мебел|kiyim|одежд|butik|boutique|o'quv markaz|учебн|academy|akademiya|академ|center|markaz|центр|university|universitet|университет|school|maktab|школ|college|kollej|колледж|litsey|лицей|ta'lim|talim|образов|education|jewel|zargar|ювелир|official|rasmiy",
  ),
  blog: stem("blog|блог|diary|kundalik|дневник|hayotim|shaxsiy|личн|my life|vlog|влог"),
  expert: stem(
    "maslahat|совет|doktor|dr\\.|врач|shifokor|psixolog|психолог|advokat|юрист|lawyer|coach|коуч|trener|тренер|ustoz|учител|teacher|expert|эксперт|mutaxassis|специалист|dietolog|нутрициолог|marketolog|маркетолог",
  ),
  media: stem("news|yangilik|новост|daily|digest|dayjest|дайджест|media|медиа|gazeta|газета|jurnal|журнал|xabar|хабар|press|пресс|podcast|подкаст|kun\\.uz|daryo"),
  community: stem("club|klub|клуб|community|сообществ|hamjamiyat|jamiyat|chat|чат|group|guruh|групп|alumni|bitiruvchi|выпускник|volunteer|волонт|mahalla|махалл|ota-ona|родител|muxlis|фанат"),
};

const count = (re: RegExp, text: string) => (text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`)) ?? []).length;
const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * The channel type from its posts (forwards and ads are not the channel's own voice), title and description.
 * Every score is a share of the channel's own posts showing that type's signals, plus a title bonus; the highest wins.
 */
export function detectChannelType(inp: TypeInput): ChannelTypeGuess {
  const own = inp.posts.filter((p) => !p.isForward && p.text.trim().length >= 20 && !/#reklama|#реклама|(^|[^\p{L}])реклама([^\p{L}]|$)|\breklama\b|#ad\b|erid/iu.test(p.text));
  const n = Math.max(1, own.length);
  const share = (pred: (t: string, p: TypePost) => boolean) => own.filter((p) => pred(normApos(p.text).toLowerCase(), p)).length / n;

  const biz = share((t) => RE.price.test(t) || RE.phone.test(t) || RE.place.test(t) || count(RE.order, t) >= 2 || (RE.order.test(t) && /[@+]\w|t\.me\//.test(t)));
  const firstPerson = (t: string) => count(RE.iUz, t) + count(RE.iRu, t) + count(RE.iEn, t);
  const iShare = share((t) => firstPerson(t) >= 2);
  const diary = share((t) => firstPerson(t) >= 1 && RE.diary.test(t));
  const teach = share((t) => RE.advice.test(t) || RE.opinion.test(t) || count(RE.numberedList, t) >= 3);
  const specialist = share((t) => RE.specialist.test(t));
  const news = share((t) => RE.news.test(t) && firstPerson(t) <= 1);
  const linky = share((t, p) => RE.link.test(t) || (p.links?.some((l) => !/t\.me\/s?\/?[\w]+\/\d+$/.test(l)) ?? false));
  const comm = share((t) => RE.community.test(t));
  const forwards = inp.posts.length ? inp.posts.filter((p) => p.isForward).length / inp.posts.length : 0;

  const about = normApos(`${inp.title ?? ""}\n${inp.description ?? ""}`).toLowerCase();
  const titled = (t: ChannelType) => (TITLE[t].test(about) ? 1 : 0);
  const ppw = inp.postsPerWeek ?? 0;

  const scores: Record<ChannelType, number> = {
    business: 1.3 * biz + 0.35 * titled("business"),
    blog: 0.7 * iShare + 0.6 * diary + 0.3 * titled("blog") - 0.5 * biz,
    expert: 0.8 * teach + 0.3 * specialist + 0.2 * iShare + 0.3 * titled("expert") - 0.6 * biz,
    // Links, a fast rhythm and forwards only count once the posts read like news (a school's links are not a digest).
    media: 0.9 * news + Math.min(1, news / 0.2) * (0.2 * linky + (ppw >= 28 ? 0.25 : ppw >= 14 ? 0.15 : 0) + 0.15 * forwards) + 0.3 * titled("media") - 0.4 * biz - 0.3 * iShare,
    community: 0.9 * comm + 0.3 * titled("community") - 0.4 * biz,
  };
  for (const t of CHANNEL_TYPES) scores[t] = r2(Math.max(0, scores[t]));

  const signals = [
    `business:posts ${Math.round(biz * 100)}%`,
    `blog:first-person ${Math.round(iShare * 100)}%`,
    `expert:advice ${Math.round(teach * 100)}%`,
    `media:news ${Math.round(news * 100)}%`,
    `community:${Math.round(comm * 100)}%`,
    ...CHANNEL_TYPES.filter((t) => titled(t)).map((t) => `${t}:title`),
  ];

  const ranked = [...CHANNEL_TYPES].sort((a, b) => scores[b] - scores[a] || CHANNEL_TYPES.indexOf(a) - CHANNEL_TYPES.indexOf(b));
  const [top, second] = ranked;
  // Too little evidence for anything: keep the sales plan the product had before, and let the owner confirm. Another
  // type must show clearly (a score of 0.3) to replace it: most channels pasted into Mercat sell something.
  if (!own.length || scores[top] < (top === "business" ? 0.15 : 0.3)) return { type: "business", confidence: 0.3, scores, signals: [...signals, "default"] };
  const margin = scores[top] / (scores[top] + scores[second] + 0.05);
  return { type: top, confidence: r2(Math.min(0.95, Math.max(0.35, margin))), scores, signals };
}
