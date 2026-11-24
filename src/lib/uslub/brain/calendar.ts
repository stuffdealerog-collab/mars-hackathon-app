/** Local calendar 24 Nov 2026 – 31 Jan 2027 (spec §F). Every calendar item needs approval. */

export interface CalEvent {
  id: string;
  date: string; // ISO start date (Tashkent)
  name: { uz: string; ru: string; en: string };
  fits: RegExp; // category match
  excludes?: RegExp;
  use: string;
  offerOnly: boolean;
  confidence: "fixed" | "approx" | "folk" | "seasonal" | "verify";
}

const SHOP = /shop|do'kon|dokon|magazin|магазин|clothing|kiyim|одежд|ecom|online|beauty|go'zallik|салон|cafe|kafe|кафе|restoran|food|gift|sovg'a/i;

export const CALENDAR: CalEvent[] = [
  { id: "blackfriday", date: "2026-11-27", name: { uz: "Qora juma", ru: "Чёрная пятница", en: "Black Friday" }, fits: SHOP, excludes: /clinic|klinika|клиник|med|stomat/i, use: "Sale only with an offer fact; otherwise the honest 'our price all year' trust post.", offerOnly: false, confidence: "fixed" },
  { id: "cybermonday", date: "2026-11-30", name: { uz: "Kiber dushanba", ru: "Киберпонедельник", en: "Cyber Monday" }, fits: /online|ecom|internet/i, use: "Optional, offer facts only.", offerOnly: true, confidence: "fixed" },
  { id: "ny-booking", date: "2026-12-01", name: { uz: "Yangi yil bronlari mavsumi", ru: "Сезон новогодних броней", en: "New Year booking season" }, fits: /cafe|kafe|кафе|restoran|banket|beauty|go'zallik|салон|photo|foto|educ|o'quv|курс/i, use: "Booking posts tied to capacity facts.", offerOnly: false, confidence: "fixed" },
  { id: "constitution", date: "2026-12-08", name: { uz: "Konstitutsiya kuni", ru: "День Конституции", en: "Constitution Day" }, fits: /./, use: "Opening-hours notice only if the owner confirms; no greeting-only post.", offerOnly: false, confidence: "fixed" },
  { id: "korporativ", date: "2026-12-15", name: { uz: "Korporativ mavsumi", ru: "Сезон корпоративов", en: "Corporate party season" }, fits: /cafe|kafe|кафе|restoran|shop|do'kon|beauty|салон/i, use: "Offer facts only.", offerOnly: true, confidence: "approx" },
  { id: "chilla", date: "2026-12-22", name: { uz: "Qish chillasi", ru: "Зимняя чилля", en: "Qish chillasi (deep winter)" }, fits: /cafe|kafe|кафе|clothing|kiyim|одежд|clinic|klinika|educ|o'quv/i, use: "Content hook only, never a sale pretext.", offerOnly: false, confidence: "folk" },
  { id: "newyear-eve", date: "2026-12-31", name: { uz: "Yangi yil kechasi", ru: "Новогодняя ночь", en: "New Year's Eve" }, fits: /cafe|kafe|кафе|restoran|beauty|салон|shop|do'kon|gift/i, use: "Sale with offer facts.", offerOnly: true, confidence: "fixed" },
  { id: "vatan", date: "2027-01-14", name: { uz: "Vatan himoyachilari kuni", ru: "День защитников Родины", en: "Defenders of the Motherland Day" }, fits: /shop|do'kon|barber|sartarosh|cafe|kafe|кафе/i, excludes: /clinic|klinika|клиник/i, use: "Offer or value; clinics: no sale framing.", offerOnly: false, confidence: "fixed" },
];

/** Events within `days` of `now` that fit the category. */
export function upcomingEvents(category: string, now: number, days = 14): (CalEvent & { daysAway: number })[] {
  const out: (CalEvent & { daysAway: number })[] = [];
  for (const e of CALENDAR) {
    const t = Date.parse(`${e.date}T00:00:00+05:00`);
    const daysAway = Math.ceil((t - now) / 86_400_000);
    if (daysAway < 0 || daysAway > days) continue;
    if (!e.fits.test(category) || e.excludes?.test(category)) continue;
    out.push({ ...e, daysAway });
  }
  return out;
}
