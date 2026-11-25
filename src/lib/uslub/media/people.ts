import { nicheOf } from "../brain/bench";

/**
 * Whether a post picture may show people.
 *
 * "none": no person at all, no faces, bodies, hands or silhouettes. Used for
 *   - medical businesses (clinics, dentists, pharmacies, labs): an AI doctor or patient next to the real
 *     doctors' names misleads patients, and a clinic's own photos are mostly of its doctors;
 *   - "meet the team" / staff posts in any business: an invented face presented as a real employee.
 *   The picture then shows the place, the equipment, the tools or one object close-up.
 * "default": the usual rules (people only when the post is about them).
 *
 * A false "none" costs little (a product or place shot without people); a missed one puts an invented
 * person in front of the owner's customers, so the word lists lean wide.
 * Pure (see people.test.ts). Text is matched in Uzbek (Latin and Cyrillic), Russian and English.
 */
export type PeopleRule = "none" | "default";

export interface PeopleRuleInput {
  brandName: string;
  oneLiner: string;
  products: string[];
  brief?: string;
  hook?: string;
  text?: string;
}

// Word edges that also work for Cyrillic (JS `\b` only knows ASCII letters).
const B = String.raw`(?<!\p{L})`;
const E = String.raw`(?!\p{L})`;
const words = (parts: string[]) => new RegExp(parts.join("|"), "iu");

/**
 * Uzbek/Russian/English forms of "doctor" as a word, not as a stem: "Докторская колбаса", "doktorskaya"
 * and "doctoral" are not medical.
 */
const DOCTOR = [
  `${B}доктор(?:а|у|ом|е|ы|ов|ам|ами|ах)?${E}`,
  `${B}doktor(?:lar\\p{L}*|imiz|ga|ni|dan|ning|da)?${E}`,
  `${B}doctors?${E}`,
];

/**
 * Medical words nicheOf() does not cover (it knows clinic, klinik, stomat, dental, medic, tibbiy, shifo).
 * Stems that also name ordinary businesses are anchored: "hospital" (not "hospitality"), "laboratory"
 * only as a medical one ("Coffee Laboratory" is a cafe).
 */
const MED_RE = words([
  `${B}apteka`,
  `${B}dorixona`,
  `${B}дорихона`,
  `${B}dori(?:lar\\p{L}*|-darmon\\p{L}*|ni|ga)?${E}`,
  `${B}аптек`,
  `${B}лекарств`,
  `${B}pharm`,
  `${B}drugstore`,
  `${B}farmats`,
  `${B}фармац`,
  `${B}tibbiy\\s+laborator`,
  `${B}laboratoriya\\s+tahlil`,
  `${B}лаборатори[яи]\\s+анализ`,
  `${B}лабораторн\\p{L}*\\s+(?:анализ|исследован|диагностик)`,
  `${B}medical\\s+lab`,
  `${B}blood\\s+tests?${E}`,
  `${B}hospitals?${E}`,
  `${B}kasalxona`,
  `${B}касалхона`,
  `${B}больниц`,
  `${B}poliklinik`,
  `${B}поликлиник`,
  ...DOCTOR,
  `${B}shifokor`,
  `${B}шифокор`,
  `${B}врач`,
  `${B}dentist`,
  `${B}стоматолог`,
  `${B}tish\\s+davola`,
  `${B}тиш\\s+давола`,
  `${B}медицин`,
  `${B}медцентр`,
  `${B}tibbiyot`,
  `${B}тиббиёт`,
  `${B}(?:uzi|узи|mrt|мрт)${E}`,
  `${B}kardiolog`,
  `${B}кардиолог`,
  `${B}ginekolog`,
  `${B}гинеколог`,
  `${B}pediatr`,
  `${B}педиатр`,
  `${B}nevrolog`,
  `${B}невролог`,
  `${B}reabilitats`,
  `${B}реабилитац`,
]);

/**
 * A post about the people of the business: introducing the team, a staff member, a doctor, a master or
 * a teacher. Not "jamoat" (public), "сотрудничество" (cooperation), "персональный" (personal),
 * "мастер-класс" (workshop) or "мастерская" (a workshop as a place).
 */
const TEAM_RE = words([
  // Uzbek (Latin); "xodim" is also spelled "hodim"
  `${B}jamoa(?!t)`,
  `${B}[xh]odim`,
  `${B}mutaxassis`,
  `${B}tanish(?:ing|tiramiz|tiraman)${E}`,
  `${B}usta(?:lar\\p{L}*|miz\\p{L}*|si|ga|ni|dan)?${E}`,
  `${B}ustoz`,
  `${B}o'?qituvchi`,
  `${B}shifokor`,
  `${B}bizning\\s+(?:\\p{L}+\\s+)?(?:sartarosh|stilist|barber|oshpaz|barista|kosmetolog)`,
  // Uzbek (Cyrillic)
  `${B}жамоа(?!т)`,
  `${B}[хҳ]одим`,
  `${B}мутахассис`,
  `${B}таниш(?:инг|тирамиз|тираман)${E}`,
  `${B}уста(?:лар\\p{L}*|миз\\p{L}*|си|га|ни|дан)?${E}`,
  `${B}устоз`,
  `${B}ўқитувчи`,
  `${B}шифокор`,
  // Russian
  `${B}команд(?:а|ой|у|ы|е)${E}`,
  `${B}сотрудник`,
  `${B}специалист`,
  `${B}персонал(?:а|ом|у|е)?${E}`,
  `${B}коллектив`,
  `${B}(?:по)?знакомьтесь`,
  `${B}врач`,
  `${B}мастер(?!-?\\s?класс|ск)`,
  `${B}преподавател`,
  `${B}учител`,
  `${B}наш(?:а|и|его|ему|им)?\\s+(?:стилист|барбер|косметолог|бариста|повар|парикмахер)`,
  // English
  `${B}meet\\s+(?:the|our)${E}`,
  `${B}our\\s+(?:team|staff|doctors?|masters?|teachers?|people|barbers?|stylists?|baristas?|chefs?|specialists?)${E}`,
  `${B}the\\s+team${E}`,
  `${B}staff${E}`,
  `${B}employees?${E}`,
  `${B}specialists?${E}`,
  // "doctor" in all three languages, as a word (see DOCTOR)
  ...DOCTOR,
]);

const norm = (s: string | undefined) => (s ?? "").replace(/[ʻʼ’‘`´]/g, "'");

/** Niches whose description settles that the business is not medical, whatever its name says. */
const NOT_MEDICAL_NICHES = new Set(["cafe", "fastfood", "clothing", "furniture", "flowers", "electronics"]);
/** Food and hospitality words nicheOf() does not know ("Doktor Kebab", "Medici Restaurant", "Grand Hotel"). */
const FOOD_OR_STAY_RE = words([
  `${B}(?:kebab|kabob|shashlik|plov|palov|shaurm|restaurant|ristorante|trattoria|grill|hotel|mehmonxona)`,
  `${B}(?:кебаб|кабоб|шашлык|плов|шаурм|гриль|гостиниц|отел[ьяюе])`,
]);

/**
 * A medical business: its description names a medical service, or (when the description does not say it
 * is another kind of business) the niche classifier says clinic or the name / products name one.
 * A medical verdict drops the brand's reference photos, so a name alone ("Pizza Doctor", "Shifo Burger",
 * "Coffee Laboratory") never outweighs a description of a cafe, shop or restaurant.
 */
export function isMedicalBrand(a: Pick<PeopleRuleInput, "brandName" | "oneLiner" | "products">): boolean {
  const about = norm(a.oneLiner);
  if (MED_RE.test(about)) return true;
  const aboutNiche = nicheOf(about);
  if (aboutNiche === "clinic") return true;
  if (NOT_MEDICAL_NICHES.has(aboutNiche) || FOOD_OR_STAY_RE.test(about)) return false;
  const all = [a.brandName, a.oneLiner, ...a.products].map(norm).join(" ");
  return nicheOf(all) === "clinic" || MED_RE.test(all);
}

/** A post (its plan hook, brief or text) about the business's people. */
export function isTeamPost(a: Pick<PeopleRuleInput, "brief" | "hook" | "text">): boolean {
  return [a.hook, a.brief, a.text].some((s) => TEAM_RE.test(norm(s)));
}

export function peopleRule(a: PeopleRuleInput): PeopleRule {
  return isMedicalBrand(a) || isTeamPost(a) ? "none" : "default";
}
