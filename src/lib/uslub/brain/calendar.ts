/**
 * Local calendar (spec §F), rolling: yearly MM-DD holidays recur every year; Black Friday is computed; lunar holidays
 * (Ramadan, the two Hayits) have per-year dates marked confidence "verify" (announced by the Muslim Board of
 * Uzbekistan, ±1 day). Every calendar item needs the owner's approval.
 * - kind "event":    a content hook (a post for the day, never a made-up promotion);
 * - kind "preorder": people order ahead (New Year cakes, 8 March flowers): a sale slot built on real product and price
 *                    facts, with no invented deadline or discount;
 * - kind "notice":   a day off (Constitution Day): an owner question about opening hours, never a content slot.
 */

export interface CalEvent {
  id: string;
  date: string; // ISO start date (Tashkent)
  /** Last day the event still applies (a preorder window, a season); defaults to `date`. */
  until?: string;
  name: { uz: string; ru: string; en: string };
  fits: RegExp; // category match
  excludes?: RegExp;
  use: string;
  offerOnly: boolean;
  kind: "event" | "preorder" | "notice";
  /** How many days ahead the event shows (default 14). */
  leadDays?: number;
  confidence: "fixed" | "approx" | "folk" | "seasonal" | "verify";
}

type Rule = Omit<CalEvent, "date" | "until"> & { md: string; untilMd?: string };

const SHOP = /shop|do'kon|dokon|magazin|магазин|clothing|kiyim|одежд|ecom|online|beauty|go'zallik|салон|cafe|kafe|кафе|restoran|food|gift|sovg'a|подар/i;
/** People order these ahead for a holiday: cakes, bakeries, confectionery, flowers, gifts. */
const PREORDER = /bakery|nonvoy|non\b|qandolat|кондитер|пекар|tort|торт|cake|desert|десерт|shirinlik|pishiriq|выпечк|gul|flower|цвет|букет|sovg'a|подар|gift/i;
const PREORDER_TEXT = "Preorder slot: the real products and prices for the holiday; the order deadline comes from the owner, never invented.";
const CLINIC = /clinic|klinika|клиник|med|stomat/i;

const YEARLY: Rule[] = [
  { id: "newyear-preorder", md: "12-01", untilMd: "12-30", name: { uz: "Yangi yil buyurtmalari", ru: "Новогодние предзаказы", en: "New Year preorders" }, fits: PREORDER, use: PREORDER_TEXT, offerOnly: false, kind: "preorder", leadDays: 7, confidence: "seasonal" },
  { id: "ny-booking", md: "12-01", name: { uz: "Yangi yil bronlari mavsumi", ru: "Сезон новогодних броней", en: "New Year booking season" }, fits: /cafe|kafe|кафе|restoran|banket|beauty|go'zallik|салон|photo|foto|educ|o'quv|курс/i, use: "Booking posts tied to capacity facts.", offerOnly: false, kind: "event", confidence: "fixed" },
  { id: "constitution", md: "12-08", name: { uz: "Konstitutsiya kuni", ru: "День Конституции", en: "Constitution Day" }, fits: /./, use: "Opening-hours question to the owner only; never a content slot or a greeting post.", offerOnly: false, kind: "notice", confidence: "fixed" },
  { id: "korporativ", md: "12-15", name: { uz: "Korporativ mavsumi", ru: "Сезон корпоративов", en: "Corporate party season" }, fits: /cafe|kafe|кафе|restoran|shop|do'kon|beauty|салон/i, use: "Offer facts only.", offerOnly: true, kind: "event", confidence: "approx" },
  { id: "chilla", md: "12-22", name: { uz: "Qish chillasi", ru: "Зимняя чилля", en: "Qish chillasi (deep winter)" }, fits: /cafe|kafe|кафе|clothing|kiyim|одежд|clinic|klinika|educ|o'quv/i, use: "Content hook only, never a sale pretext.", offerOnly: false, kind: "event", confidence: "folk" },
  { id: "newyear-eve", md: "12-31", name: { uz: "Yangi yil kechasi", ru: "Новогодняя ночь", en: "New Year's Eve" }, fits: /cafe|kafe|кафе|restoran|beauty|салон|shop|do'kon|gift/i, use: "Sale with offer facts.", offerOnly: true, kind: "event", confidence: "fixed" },
  { id: "vatan", md: "01-14", name: { uz: "Vatan himoyachilari kuni", ru: "День защитников Родины", en: "Defenders of the Motherland Day" }, fits: /shop|do'kon|barber|sartarosh|cafe|kafe|кафе|gift|sovg'a/i, excludes: CLINIC, use: "Offer or value; clinics: no sale framing.", offerOnly: false, kind: "event", confidence: "fixed" },
  { id: "women-preorder", md: "03-01", untilMd: "03-07", name: { uz: "8-mart buyurtmalari", ru: "Предзаказы к 8 Марта", en: "8 March preorders" }, fits: PREORDER, use: PREORDER_TEXT, offerOnly: false, kind: "preorder", leadDays: 7, confidence: "seasonal" },
  { id: "women", md: "03-08", name: { uz: "Xotin-qizlar kuni", ru: "Международный женский день", en: "International Women's Day" }, fits: /./, excludes: CLINIC, use: "A post for the day; a sale only with offer facts.", offerOnly: false, kind: "event", confidence: "fixed" },
  { id: "navruz", md: "03-21", name: { uz: "Navro‘z", ru: "Навруз", en: "Navruz" }, fits: /./, use: "A post for the day (sumalak, family, spring); a sale only with offer facts.", offerOnly: false, kind: "event", confidence: "fixed" },
  { id: "xotira", md: "05-09", name: { uz: "Xotira va qadrlash kuni", ru: "День памяти и почестей", en: "Day of Remembrance and Honour" }, fits: /./, use: "A quiet post only if it fits the channel; never a sale.", offerOnly: false, kind: "event", confidence: "fixed" },
  { id: "school", md: "08-20", untilMd: "09-02", name: { uz: "Maktabga tayyorgarlik", ru: "Сборы в школу", en: "Back to school" }, fits: /kiyim|clothing|одежд|kanstovar|канц|book|kitob|книг|educ|o'quv|курс|shop|do'kon/i, use: "Back-to-school products with real prices.", offerOnly: false, kind: "event", confidence: "seasonal" },
  { id: "independence", md: "09-01", name: { uz: "Mustaqillik kuni", ru: "День независимости", en: "Independence Day" }, fits: /./, use: "Opening-hours question; a post for the day only if it fits the channel.", offerOnly: false, kind: "notice", confidence: "fixed" },
  { id: "teachers", md: "10-01", name: { uz: "O‘qituvchi va murabbiylar kuni", ru: "День учителя", en: "Teachers' Day" }, fits: /educ|o'quv|курс|school|maktab|gul|flower|цвет|gift|sovg'a|подар|tort|торт|cake/i, use: "A thank-you post; gifts and flowers with real prices.", offerOnly: false, kind: "event", confidence: "fixed" },
];

/** Lunar holidays: per-year dates to verify (the Muslim Board announces them). */
const LUNAR: (Omit<CalEvent, "fits" | "use" | "offerOnly" | "kind" | "confidence"> & { kind: CalEvent["kind"]; use: string; fits: RegExp })[] = [
  { id: "ramadan-2027", date: "2027-02-08", until: "2027-03-09", name: { uz: "Ramazon oyi", ru: "Рамадан", en: "Ramadan" }, fits: /cafe|kafe|кафе|restoran|food|bakery|nonvoy|tort|торт|qandolat|shop|do'kon|gift/i, use: "Iftar or gift posts with real products and hours; no promises.", kind: "event" },
  { id: "ramazon-hayit-2027", date: "2027-03-10", name: { uz: "Ramazon hayiti", ru: "Рамазан хайит", en: "Eid al-Fitr" }, fits: /./, use: "Greeting post only with something real to say; opening hours as an owner question.", kind: "event" },
  { id: "qurbon-hayit-2027", date: "2027-05-17", name: { uz: "Qurbon hayiti", ru: "Курбан хайит", en: "Eid al-Adha" }, fits: /./, use: "Opening hours as an owner question; no sale framing.", kind: "notice" },
  { id: "ramadan-2028", date: "2028-01-28", until: "2028-02-26", name: { uz: "Ramazon oyi", ru: "Рамадан", en: "Ramadan" }, fits: /cafe|kafe|кафе|restoran|food|bakery|nonvoy|tort|торт|qandolat|shop|do'kon|gift/i, use: "Iftar or gift posts with real products and hours; no promises.", kind: "event" },
  { id: "ramazon-hayit-2028", date: "2028-02-27", name: { uz: "Ramazon hayiti", ru: "Рамазан хайит", en: "Eid al-Fitr" }, fits: /./, use: "Greeting post only with something real to say; opening hours as an owner question.", kind: "event" },
  { id: "qurbon-hayit-2028", date: "2028-05-05", name: { uz: "Qurbon hayiti", ru: "Курбан хайит", en: "Eid al-Adha" }, fits: /./, use: "Opening hours as an owner question; no sale framing.", kind: "notice" },
];

const pad = (n: number) => String(n).padStart(2, "0");

/** Black Friday: the Friday after the fourth Thursday of November. */
function blackFriday(year: number): string {
  const d = new Date(Date.UTC(year, 10, 1));
  const firstThu = 1 + ((4 - d.getUTCDay() + 7) % 7);
  return `${year}-11-${pad(firstThu + 21 + 1)}`;
}

/** Every calendar event of one year (yearly rules, Black Friday, Cyber Monday, that year's lunar dates). */
export function eventsOfYear(year: number): CalEvent[] {
  const out: CalEvent[] = YEARLY.map(({ md, untilMd, ...r }) => ({ ...r, date: `${year}-${md}`, ...(untilMd ? { until: `${year}-${untilMd}` } : {}) }));
  const bf = blackFriday(year);
  const cm = new Date(`${bf}T00:00:00Z`);
  cm.setUTCDate(cm.getUTCDate() + 3);
  out.push(
    { id: "blackfriday", date: bf, name: { uz: "Qora juma", ru: "Чёрная пятница", en: "Black Friday" }, fits: SHOP, excludes: CLINIC, use: "Sale only with an offer fact; otherwise the honest 'our price all year' trust post.", offerOnly: false, kind: "event", confidence: "fixed" },
    { id: "cybermonday", date: cm.toISOString().slice(0, 10), name: { uz: "Kiber dushanba", ru: "Киберпонедельник", en: "Cyber Monday" }, fits: /online|ecom|internet/i, use: "Optional, offer facts only.", offerOnly: true, kind: "event", confidence: "fixed" },
  );
  for (const l of LUNAR) if (l.date.startsWith(String(year))) out.push({ ...l, offerOnly: false, confidence: "verify" });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const at = (iso: string) => Date.parse(`${iso}T00:00:00+05:00`);

/**
 * Events that fit the category and are within their lead days of `now` (default 14), or running now (a preorder
 * window): daysAway is 0 while it runs. Rolls over the year end.
 */
export function upcomingEvents(category: string, now: number, days = 14): (CalEvent & { daysAway: number })[] {
  const year = new Date(now + 5 * 3600_000).getUTCFullYear();
  const out: (CalEvent & { daysAway: number })[] = [];
  for (const e of [...eventsOfYear(year), ...eventsOfYear(year + 1)]) {
    const start = at(e.date);
    const end = at(e.until ?? e.date) + 86_400_000;
    if (now >= end) continue;
    const daysAway = Math.max(0, Math.ceil((start - now) / 86_400_000));
    if (daysAway > Math.min(days, e.leadDays ?? days)) continue;
    if (!e.fits.test(category) || e.excludes?.test(category)) continue;
    out.push({ ...e, daysAway });
  }
  return out;
}
