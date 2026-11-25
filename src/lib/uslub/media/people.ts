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

/** Medical words nicheOf() does not cover (it knows clinic, klinik, stomat, dental, medic, tibbiy, shifo). */
const MED_RE = words([
  `${B}apteka`,
  `${B}dorixona`,
  `${B}дорихона`,
  `${B}аптек`,
  `${B}pharm`,
  `${B}farmats`,
  `${B}фармац`,
  `${B}laborator`,
  `${B}лаборатор`,
  `${B}hospital`,
  `${B}kasalxona`,
  `${B}касалхона`,
  `${B}больниц`,
  `${B}poliklinik`,
  `${B}поликлиник`,
  `${B}doktor`,
  `${B}доктор`,
  `${B}shifokor`,
  `${B}шифокор`,
  `${B}врач`,
  `${B}doctor`,
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
  // Uzbek (Latin)
  `${B}jamoa(?!t)`,
  `${B}xodim`,
  `${B}tanish(?:ing|tiramiz|tiraman)${E}`,
  `${B}usta(?:lar\\p{L}*|miz\\p{L}*|si|ga|ni|dan)?${E}`,
  `${B}ustoz`,
  `${B}o'?qituvchi`,
  `${B}shifokor`,
  `${B}doktor`,
  // Uzbek (Cyrillic)
  `${B}жамоа(?!т)`,
  `${B}ходим`,
  `${B}таниш(?:инг|тирамиз|тираман)${E}`,
  `${B}уста(?:лар\\p{L}*|миз\\p{L}*|си|га|ни|дан)?${E}`,
  `${B}устоз`,
  `${B}ўқитувчи`,
  `${B}шифокор`,
  // Russian
  `${B}команд(?:а|ой|у|ы|е)${E}`,
  `${B}сотрудник`,
  `${B}персонал(?:а|ом|у|е)?${E}`,
  `${B}коллектив`,
  `${B}(?:по)?знакомьтесь`,
  `${B}врач`,
  `${B}доктор`,
  `${B}мастер(?!-?\\s?класс|ск)`,
  `${B}преподавател`,
  `${B}учител`,
  // English
  `${B}meet\\s+(?:the|our)${E}`,
  `${B}our\\s+(?:team|staff|doctors?|masters?|teachers?|people)${E}`,
  `${B}the\\s+team${E}`,
  `${B}staff${E}`,
  `${B}employees?${E}`,
  `${B}doctors?${E}`,
]);

const norm = (s: string | undefined) => (s ?? "").replace(/[ʻʼ’‘`´]/g, "'");

/** A medical business: the niche classifier says clinic, or the name / description / products name a medical service. */
export function isMedicalBrand(a: Pick<PeopleRuleInput, "brandName" | "oneLiner" | "products">): boolean {
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
