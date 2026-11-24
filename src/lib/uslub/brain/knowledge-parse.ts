/**
 * Brand memory ("Brend xotirasi") — pure helpers for owner knowledge ingestion:
 * URL classification, private-address checks (SSRF guard), HTML/JSON-LD/CSV parsing
 * and turning the owner's structured answers into plain KB lines.
 * No I/O and no server-only import, so every rule is unit-tested.
 */

export type KnowledgeKind = "gdoc" | "gsheet" | "pdf" | "website" | "manual";

export type KnowledgeErrorCode =
  | "BAD_URL"
  | "PRIVATE_ADDRESS"
  | "FETCH_FAILED"
  | "TOO_LARGE"
  | "TOO_MANY_REDIRECTS"
  | "NOT_SHARED"
  | "UNSUPPORTED"
  | "EMPTY"
  | "PDF_FAILED";

/** User-facing error (Uzbek Latin message) for one knowledge source. */
export class KnowledgeError extends Error {
  constructor(
    readonly code: KnowledgeErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const MSG = {
  badUrl: "Havola noto‘g‘ri. To‘liq manzil yuboring, masalan: https://misol.uz",
  privateAddress: "Bu manzil ichki tarmoqqa tegishli, uni ochib bo‘lmaydi.",
  fetchFailed: "Sahifa ochilmadi. Havola ishlayotganini tekshiring.",
  tooLarge: "Fayl juda katta (sayt va hujjat: 2 MB gacha, PDF: 5 MB va 20 sahifagacha).",
  tooManyRedirects: "Havola juda ko‘p marta boshqa manzilga yo‘naltiryapti.",
  notShared: "Hujjat yopiq. Hujjatni 'Havolaga ega har kim ko‘ra oladi' qilib oching va qayta yuboring.",
  unsupported: "Bu turdagi faylni o‘qiy olmaymiz. Sayt, Google Docs, Google Sheets yoki PDF havolasini yuboring.",
  empty: "Bu manbada matn topilmadi.",
  pdfFailed: "PDF faylni o‘qib bo‘lmadi. Matnni nusxalab yuboring.",
} as const;

export const TEXT_CAP = 15_000; // chars per source
export const KB_CAP = 20_000; // chars of merged brand memory

/* ------------------------------------------------------------------ URLs */

export interface ClassifiedUrl {
  kind: Exclude<KnowledgeKind, "manual">;
  url: string; // normalised original URL
  fetchUrl: string; // what we actually download
}

/** "misol.uz" -> https URL; only http(s). Throws BAD_URL. */
export function normalizeUrl(raw: string): URL {
  const s = raw.trim();
  if (!s || /\s/.test(s)) throw new KnowledgeError("BAD_URL", MSG.badUrl);
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    throw new KnowledgeError("BAD_URL", MSG.badUrl);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new KnowledgeError("BAD_URL", MSG.badUrl);
  if (u.username || u.password) throw new KnowledgeError("BAD_URL", MSG.badUrl);
  if (!u.hostname.includes(".") && !/^\[.*\]$/.test(u.hostname)) throw new KnowledgeError("BAD_URL", MSG.badUrl);
  return u;
}

/** Google Docs -> txt export, Google Sheets -> csv export (gid kept), .pdf -> pdf, else website. */
export function classifyUrl(raw: string): ClassifiedUrl {
  const u = normalizeUrl(raw);
  const host = u.hostname.toLowerCase();
  if (host === "docs.google.com") {
    const doc = /^\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{10,})/.exec(u.pathname);
    if (doc) return { kind: "gdoc", url: u.toString(), fetchUrl: `https://docs.google.com/document/d/${doc[1]}/export?format=txt` };
    const sheet = /^\/spreadsheets\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{10,})/.exec(u.pathname);
    if (sheet) {
      const gid = u.searchParams.get("gid") ?? /(?:^|[#&])gid=(\d+)/.exec(u.hash)?.[1];
      const g = gid && /^\d+$/.test(gid) ? `&gid=${gid}` : "";
      return { kind: "gsheet", url: u.toString(), fetchUrl: `https://docs.google.com/spreadsheets/d/${sheet[1]}/export?format=csv${g}` };
    }
  }
  if (/\.pdf$/i.test(u.pathname)) return { kind: "pdf", url: u.toString(), fetchUrl: u.toString() };
  return { kind: "website", url: u.toString(), fetchUrl: u.toString() };
}

/* ------------------------------------------------------- private addresses */

function v4Parts(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.every((x) => x >= 0 && x <= 255) ? p : null;
}

function privateV4(p: number[]): boolean {
  const [a, b] = p;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10/8
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local + cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // 172.16/12
    (a === 192 && b === 168) || // 192.168/16
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    (a === 192 && b === 0 && p[2] === 0) || // 192.0.0/24 IETF
    (a === 198 && (b === 18 || b === 19)) || // benchmarking 198.18/15
    a >= 224 // multicast, reserved, broadcast
  );
}

/** Expands an IPv6 literal to 8 hextets (handles "::" and an embedded IPv4 tail). */
function v6Hextets(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const v4tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (v4tail) {
    const p = v4Parts(v4tail[1]);
    if (!p) return null;
    s = `${s.slice(0, -v4tail[1].length)}${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const all = [...head, ...Array(fill).fill("0"), ...tail];
  if (all.length !== 8 || !all.every((h) => /^[0-9a-f]{1,4}$/.test(h))) return null;
  return all.map((h) => Number.parseInt(h, 16));
}

/**
 * True for any address we must never fetch from the server: private, loopback,
 * link-local, CGNAT, metadata, multicast and unspecified ranges (IPv4 and IPv6,
 * including IPv4-mapped and NAT64-embedded IPv4). Unparseable input counts as private.
 */
export function isPrivateAddress(ip: string): boolean {
  const v4 = v4Parts(ip);
  if (v4) return privateV4(v4);
  const h = v6Hextets(ip);
  if (!h) return true;
  if (h.every((x) => x === 0)) return true; // ::
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return true; // ::1
  if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((h[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((h[0] & 0xff00) === 0xff00) return true; // multicast
  const embedded = [h[6] >> 8, h[6] & 0xff, h[7] >> 8, h[7] & 0xff];
  if (h.slice(0, 5).every((x) => x === 0) && (h[5] === 0xffff || h[5] === 0)) return privateV4(embedded); // ::ffff:a.b.c.d, ::a.b.c.d
  if (h[0] === 0x64 && h[1] === 0xff9b) return privateV4(embedded); // NAT64 64:ff9b::/96
  return false;
}

/* ----------------------------------------------------------------- HTML */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", ndash: "–", mdash: "—" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (all, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

/** Collapses runs of spaces and blank lines; keeps single line breaks. */
export const squash = (s: string) =>
  s
    .replace(/ /g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Cuts at the last line break (or space) before `max` chars. */
export function capText(s: string, max = TEXT_CAP): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const nl = cut.lastIndexOf("\n");
  const at = nl > max * 0.8 ? nl : cut.lastIndexOf(" ");
  return (at > max * 0.8 ? cut.slice(0, at) : cut).trimEnd();
}

/** Visible text of a page: drops scripts, styles, nav, footer, svg, forms' hidden parts; keeps line structure. */
export function htmlToVisibleText(html: string, max = TEXT_CAP): string {
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const stripped = body
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|nav|footer|form|select|button)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|header|main|table|ul|ol|dd|dt|blockquote)>/gi, "\n")
    .replace(/<(td|th)\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return capText(squash(decodeEntities(stripped)), max);
}

export interface PageMeta {
  title?: string;
  description?: string;
}

export function extractMeta(html: string): PageMeta {
  const metaContent = (re: RegExp) => {
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
      if (re.test(tag)) {
        const c = /\bcontent\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
        const v = c ? decodeEntities(c[2] ?? c[3] ?? "").trim() : "";
        if (v) return v;
      }
    }
    return undefined;
  };
  const og = metaContent(/property\s*=\s*["']og:title["']/i);
  const t = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const title = og ?? (t ? squash(decodeEntities(t)) || undefined : undefined);
  const description = metaContent(/name\s*=\s*["']description["']/i) ?? metaContent(/property\s*=\s*["']og:description["']/i);
  return { title, description };
}

/* -------------------------------------------------------------- JSON-LD */

export interface ProductFact {
  name: string;
  price?: string | number;
  currency?: string;
}

/** Facts pulled deterministically from schema.org JSON-LD (never guessed). */
export interface StructuredFacts {
  name?: string;
  phone?: string;
  address?: string;
  hours?: string;
  products: ProductFact[];
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: Json | undefined): string | undefined => {
  if (typeof v === "string") return squash(decodeEntities(v)) || undefined;
  if (typeof v === "number") return String(v);
  if (isObj(v) && typeof v.name === "string") return str(v.name);
  return undefined;
};
const types = (o: Obj): string[] => {
  const t = o["@type"];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase());
};
const asList = (v: Json | undefined): Json[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

const BUSINESS = /localbusiness|organization|restaurant|cafe|bakery|store|shop|foodestablishment|clinic|dentist|medicalbusiness|beautysalon|hairsalon|school|educationalorganization|hotel|autorepair|place/;
const PRODUCT = /^(product|menuitem|service|offer|aggregateoffer|course|individualproduct)$/;

function addressOf(v: Json | undefined): string | undefined {
  if (typeof v === "string") return str(v);
  if (!isObj(v)) return undefined;
  const parts = [v.streetAddress, v.addressLocality, v.addressRegion].map((x) => str(x)).filter(Boolean);
  return parts.length ? [...new Set(parts)].join(", ") : undefined;
}

function hoursOf(o: Obj): string | undefined {
  const plain = asList(o.openingHours)
    .map((x) => str(x))
    .filter(Boolean);
  if (plain.length) return plain.join("; ");
  const spec = asList(o.openingHoursSpecification)
    .filter(isObj)
    .map((s) => {
      const days = asList(s.dayOfWeek)
        .map((d) => str(d)?.replace(/^https?:\/\/schema\.org\//i, ""))
        .filter(Boolean)
        .join(", ");
      const opens = str(s.opens)?.slice(0, 5);
      const closes = str(s.closes)?.slice(0, 5);
      return opens && closes ? `${days ? `${days} ` : ""}${opens}–${closes}` : undefined;
    })
    .filter(Boolean);
  return spec.length ? spec.join("; ") : undefined;
}

function offerPrice(v: Json | undefined): { price?: string | number; currency?: string } {
  for (const o of asList(v).filter(isObj)) {
    const price = typeof o.price === "number" || typeof o.price === "string" ? o.price : typeof o.lowPrice === "number" || typeof o.lowPrice === "string" ? o.lowPrice : undefined;
    if (price !== undefined && String(price).trim() !== "") return { price, currency: str(o.priceCurrency) };
  }
  return {};
}

/** Parses every `<script type="application/ld+json">` block (arrays and @graph included). Bad JSON is skipped. */
export function extractJsonLd(html: string): StructuredFacts {
  const out: StructuredFacts = { products: [] };
  const seen = new Set<string>();
  const visit = (node: Json | undefined, depth: number) => {
    if (depth > 6 || node == null) return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n, depth + 1);
      return;
    }
    if (!isObj(node)) return;
    const t = types(node);
    if (t.some((x) => BUSINESS.test(x)) && !t.some((x) => PRODUCT.test(x))) {
      out.name ??= str(node.name);
      out.phone ??= str(node.telephone);
      out.address ??= addressOf(node.address);
      out.hours ??= hoursOf(node);
    }
    if (t.some((x) => PRODUCT.test(x))) {
      const isOffer = t.some((x) => x === "offer" || x === "aggregateoffer");
      const name = isOffer ? str(node.itemOffered) ?? str(node.name) : str(node.name);
      const { price, currency } = isOffer ? offerPrice(node) : offerPrice(node.offers);
      if (name && name.length <= 160) {
        const key = `${name.toLowerCase()}|${price ?? ""}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.products.push({ name, ...(price !== undefined ? { price } : {}), ...(currency ? { currency } : {}) });
        }
      }
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === "@context") continue;
      if (typeof v === "object" && v !== null) visit(v, depth + 1);
    }
  };
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1].trim()) as Json, 0);
    } catch {
      // invalid JSON-LD: skip, never guess
    }
  }
  out.products = out.products.slice(0, 60);
  return out;
}

/* ---------------------------------------------------------------- Google */

/** True when a Google export answered with a sign-in page instead of the file (not shared publicly). */
export function isGoogleLoginPage(finalUrl: string, contentType: string, text = ""): boolean {
  let host = "";
  try {
    host = new URL(finalUrl).hostname.toLowerCase();
  } catch {
    return true;
  }
  if (host === "accounts.google.com") return true;
  if (/text\/html/i.test(contentType)) return true; // exports are text/plain or text/csv
  return /ServiceLogin|accounts\.google\.com\/v3\/signin|<title>\s*(Sign in|Kirish|Вход)/i.test(text.slice(0, 4000));
}

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (q) {
      if (c === '"' && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && csv[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** A sheet as KB lines: one row per line, non-empty cells joined with " — ". */
export function csvToText(csv: string, max = TEXT_CAP): string {
  const lines = parseCsv(csv)
    .map((r) => r.map((c) => squash(c)).filter(Boolean).join(" — "))
    .filter(Boolean);
  return capText(lines.join("\n"), max);
}

/* -------------------------------------------------------- owner answers */

export interface OwnerFields {
  products?: { name: string; price?: string | number }[];
  address?: string;
  landmark?: string;
  hours?: string;
  phone?: string;
  delivery?: string;
  extra?: string;
}

/** 120000 -> "120 000" (plain spaces, so the lint's price parser reads it back). */
export function groupThousands(n: number): string {
  const [int, frac] = String(Math.round(n * 100) / 100).split(".");
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}${frac ? `.${frac}` : ""}`;
}

/** Price as the owner would write it: numbers get "so'm" (or the currency), text is kept as typed. */
export function formatPrice(price: string | number, currency?: string): string {
  const cur = (currency ?? "").trim().toUpperCase();
  const unit = !cur || cur === "UZS" || cur === "SUM" || cur === "SOM" ? "so'm" : cur === "USD" ? "$" : cur;
  if (typeof price === "number") return `${groupThousands(price)} ${unit}`;
  const s = price.trim();
  if (/^\d+([.,]\d+)?$/.test(s.replace(/\s/g, ""))) return `${groupThousands(Number(s.replace(/\s/g, "").replace(",", ".")))} ${unit}`;
  return s;
}

/**
 * The owner's answers as plain Uzbek KB lines. The strategy's fact extractor
 * keeps a fact only if its quote is an exact substring of the KB, so these
 * lines are what makes a price or an address citable.
 */
export function structuredToKb(f: OwnerFields): string {
  const lines: string[] = [];
  for (const p of f.products ?? []) {
    const name = squash(p.name);
    if (!name) continue;
    const price = p.price !== undefined && String(p.price).trim() !== "" ? formatPrice(p.price) : "";
    lines.push(price ? `Mahsulot: ${name} — ${price}` : `Mahsulot: ${name}`);
  }
  const add = (label: string, v?: string) => {
    const s = v ? squash(v) : "";
    if (s) lines.push(`${label}: ${s}`);
  };
  add("Manzil", f.address);
  add("Mo'ljal", f.landmark);
  add("Ish vaqti", f.hours);
  add("Telefon", f.phone);
  add("Yetkazib berish", f.delivery);
  const extra = f.extra ? squash(f.extra) : "";
  if (extra) lines.push(extra);
  return lines.join("\n");
}

/** JSON-LD facts as the same KB lines (website name/phone/address/hours/prices). */
export function factsToKb(s: StructuredFacts): string {
  const lines: string[] = [];
  if (s.name) lines.push(`Nomi: ${s.name}`);
  const body = structuredToKb({
    products: s.products.map((p) => ({ name: p.name, price: p.price !== undefined ? formatPrice(p.price, p.currency) : undefined })),
    address: s.address,
    hours: s.hours,
    phone: s.phone,
  });
  if (body) lines.push(body);
  return lines.join("\n");
}

/** Website KB text: deterministic JSON-LD facts first (so the cap never cuts them), then meta, then visible text. */
export function websiteToKb(html: string, max = TEXT_CAP): { text: string; title?: string; structured: StructuredFacts } {
  const structured = extractJsonLd(html);
  const meta = extractMeta(html);
  const head = [factsToKb(structured), meta.description ? `Tavsif: ${meta.description}` : ""].filter(Boolean).join("\n");
  const visible = htmlToVisibleText(html, max);
  const text = capText([head, visible].filter(Boolean).join("\n\n"), max);
  return { text, title: meta.title ?? structured.name, structured };
}

/** Rough page count of a PDF ("/Type /Page" objects); 0 when the objects are compressed. */
export function pdfPageCount(bytes: Uint8Array): number {
  const s = new TextDecoder("latin1").decode(bytes);
  return (s.match(/\/Type\s*\/Page(?!s)\b/g) ?? []).length;
}

export const isPdfBytes = (bytes: Uint8Array) =>
  bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
