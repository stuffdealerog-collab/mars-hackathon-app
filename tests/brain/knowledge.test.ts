import { describe, expect, it } from "vitest";
import {
  capText,
  classifyUrl,
  csvToText,
  extractJsonLd,
  extractMeta,
  formatPrice,
  htmlToVisibleText,
  isGoogleLoginPage,
  isPdfBytes,
  isPrivateAddress,
  KnowledgeError,
  pdfPageCount,
  structuredToKb,
  websiteToKb,
} from "../../src/lib/uslub/brain/knowledge-parse";

describe("classifyUrl", () => {
  it("turns a Google Doc into its txt export", () => {
    const c = classifyUrl("https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp_qrs-TUV/edit?usp=sharing");
    expect(c.kind).toBe("gdoc");
    expect(c.fetchUrl).toBe("https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp_qrs-TUV/export?format=txt");
  });

  it("turns a Google Sheet into a csv export and keeps the gid", () => {
    const hash = classifyUrl("https://docs.google.com/spreadsheets/d/1ZyXwVuTsRqPoNmLk/edit#gid=123456");
    expect(hash).toMatchObject({ kind: "gsheet", fetchUrl: "https://docs.google.com/spreadsheets/d/1ZyXwVuTsRqPoNmLk/export?format=csv&gid=123456" });
    const query = classifyUrl("https://docs.google.com/spreadsheets/u/0/d/1ZyXwVuTsRqPoNmLk/edit?gid=7");
    expect(query.fetchUrl).toBe("https://docs.google.com/spreadsheets/d/1ZyXwVuTsRqPoNmLk/export?format=csv&gid=7");
    expect(classifyUrl("https://docs.google.com/spreadsheets/d/1ZyXwVuTsRqPoNmLk/edit").fetchUrl).toBe(
      "https://docs.google.com/spreadsheets/d/1ZyXwVuTsRqPoNmLk/export?format=csv",
    );
  });

  it("detects PDFs by path and treats everything else as a website", () => {
    expect(classifyUrl("https://safia.uz/files/menu.PDF").kind).toBe("pdf");
    expect(classifyUrl("safia.uz/menu").kind).toBe("website");
    expect(classifyUrl("safia.uz/menu").url).toBe("https://safia.uz/menu");
  });

  it("rejects non-http schemes, credentials and garbage", () => {
    for (const bad of ["ftp://safia.uz/a", "javascript:alert(1)", "file:///etc/passwd", "https://user:pw@safia.uz", "not a url", "localhost"]) {
      expect(() => classifyUrl(bad), bad).toThrow(KnowledgeError);
    }
  });
});

describe("isPrivateAddress (SSRF guard)", () => {
  it.each([
    "10.0.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.10",
    "100.64.0.1",
    "100.127.255.255",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.1.2.3",
    "64:ff9b::a9fe:a9fe",
    "[::1]",
    "not-an-ip",
  ])("refuses %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "185.199.108.153", "172.32.0.1", "100.128.0.1", "2a00:1450:4001:80b::200e", "::ffff:8.8.8.8"])("allows %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

const PAGE = `<!doctype html><html><head>
<title>Safia — rasmiy sayt</title>
<meta name="description" content="Toshkentdagi qandolat kafesi &amp; novvoyxona">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Bakery","name":"Safia Bakery",
 "telephone":"+998 71 200 00 00",
 "address":{"@type":"PostalAddress","streetAddress":"Novza ko'chasi, 12","addressLocality":"Toshkent"},
 "openingHoursSpecification":[{"@type":"OpeningHoursSpecification","dayOfWeek":["Monday","Sunday"],"opens":"08:00:00","closes":"22:00:00"}]}
</script>
<script type="application/ld+json">
[{"@context":"https://schema.org","@type":"Product","name":"Napoleon torti","offers":{"@type":"Offer","price":"120000","priceCurrency":"UZS"}},
 {"@type":"Product","name":"Oreo chizkeyk","offers":[{"@type":"Offer","price":45000,"priceCurrency":"UZS"}]},
 {"@graph":[{"@type":"MenuItem","name":"Kapuchino","offers":{"@type":"AggregateOffer","lowPrice":"18000","priceCurrency":"UZS"}}]}]
</script>
<script type="application/ld+json">{ this is not json }</script>
<style>.x{color:red}</style>
</head><body>
<nav><a href="/">Bosh sahifa</a><a href="/menu">Menyu</a></nav>
<h1>Safia</h1><p>Har kuni yangi non&nbsp;va tortlar.</p>
<script>window.secret = "do not index";</script>
<footer>© 2026 Safia</footer>
</body></html>`;

describe("website parsing", () => {
  it("pulls business facts and prices from JSON-LD and skips broken blocks", () => {
    const s = extractJsonLd(PAGE);
    expect(s.name).toBe("Safia Bakery");
    expect(s.phone).toBe("+998 71 200 00 00");
    expect(s.address).toBe("Novza ko'chasi, 12, Toshkent");
    expect(s.hours).toBe("Monday, Sunday 08:00–22:00");
    expect(s.products).toEqual([
      { name: "Napoleon torti", price: "120000", currency: "UZS" },
      { name: "Oreo chizkeyk", price: 45000, currency: "UZS" },
      { name: "Kapuchino", price: "18000", currency: "UZS" },
    ]);
  });

  it("keeps visible text only (no scripts, styles, nav or footer)", () => {
    const t = htmlToVisibleText(PAGE);
    expect(t).toContain("Har kuni yangi non va tortlar.");
    expect(t).not.toMatch(/secret|color:red|Bosh sahifa|© 2026/);
  });

  it("reads title and description", () => {
    expect(extractMeta(PAGE)).toEqual({ title: "Safia — rasmiy sayt", description: "Toshkentdagi qandolat kafesi & novvoyxona" });
  });

  it("puts deterministic facts first in the KB text", () => {
    const { text, title } = websiteToKb(PAGE);
    expect(title).toBe("Safia — rasmiy sayt");
    expect(text.split("\n").slice(0, 6)).toEqual([
      "Nomi: Safia Bakery",
      "Mahsulot: Napoleon torti — 120 000 so'm",
      "Mahsulot: Oreo chizkeyk — 45 000 so'm",
      "Mahsulot: Kapuchino — 18 000 so'm",
      "Manzil: Novza ko'chasi, 12, Toshkent",
      "Ish vaqti: Monday, Sunday 08:00–22:00",
    ]);
    expect(text).toContain("Telefon: +998 71 200 00 00");
    expect(text).toContain("Har kuni yangi non");
  });
});

describe("Google export checks", () => {
  it("flags a sign-in page instead of the shared file", () => {
    expect(isGoogleLoginPage("https://accounts.google.com/v3/signin/identifier?continue=x", "text/html")).toBe(true);
    expect(isGoogleLoginPage("https://docs.google.com/document/d/x/export?format=txt", "text/html; charset=utf-8", "<html>")).toBe(true);
    expect(isGoogleLoginPage("https://docs.google.com/document/d/x/export?format=txt", "text/plain; charset=utf-8", "Narxlar")).toBe(false);
    expect(isGoogleLoginPage("https://docs.google.com/spreadsheets/d/x/export?format=csv", "text/csv", "a,b")).toBe(false);
  });

  it("turns a price sheet into lines", () => {
    const csv = 'Mahsulot,Narx\r\n"Napoleon torti, katta",120000\r\nKapuchino,18000\r\n,\r\n"Say ""salom""",\n';
    expect(csvToText(csv)).toBe('Mahsulot — Narx\nNapoleon torti, katta — 120000\nKapuchino — 18000\nSay "salom"');
  });
});

describe("structuredToKb", () => {
  it("writes the owner's answers as citable Uzbek lines", () => {
    const kb = structuredToKb({
      products: [{ name: "Napoleon torti", price: 120000 }, { name: "Oreo chizkeyk", price: "45 000" }, { name: "Kapuchino", price: "18 ming so'm" }, { name: "Non" }, { name: "  " }],
      address: "Novza ko'chasi, 12",
      landmark: "Novza metrosi yonida",
      hours: "08:00–22:00, har kuni",
      phone: "+998 71 200 00 00",
      delivery: "Yandex Eats orqali",
      extra: "Tortga buyurtma 1 kun oldin olinadi.",
    });
    expect(kb.split("\n")).toEqual([
      "Mahsulot: Napoleon torti — 120 000 so'm",
      "Mahsulot: Oreo chizkeyk — 45 000 so'm",
      "Mahsulot: Kapuchino — 18 ming so'm",
      "Mahsulot: Non",
      "Manzil: Novza ko'chasi, 12",
      "Mo'ljal: Novza metrosi yonida",
      "Ish vaqti: 08:00–22:00, har kuni",
      "Telefon: +998 71 200 00 00",
      "Yetkazib berish: Yandex Eats orqali",
      "Tortga buyurtma 1 kun oldin olinadi.",
    ]);
    expect(structuredToKb({})).toBe("");
  });

  it("formats prices by currency", () => {
    expect(formatPrice(1250000)).toBe("1 250 000 so'm");
    expect(formatPrice("25", "USD")).toBe("25 $");
    expect(formatPrice(9.5, "EUR")).toBe("9.5 EUR");
    expect(formatPrice("kelishilgan")).toBe("kelishilgan");
  });
});

describe("caps and PDF helpers", () => {
  it("caps text at a line break and never exceeds the limit", () => {
    const long = Array.from({ length: 3000 }, (_, i) => `Qator ${i} — mahsulot`).join("\n");
    const capped = capText(long, 15_000);
    expect(capped.length).toBeLessThanOrEqual(15_000);
    expect(capped.endsWith("mahsulot")).toBe(true);
    expect(htmlToVisibleText(`<p>${"a ".repeat(20_000)}</p>`).length).toBeLessThanOrEqual(15_000);
    expect(capText("qisqa", 100)).toBe("qisqa");
  });

  it("recognises PDF bytes and counts pages", () => {
    const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj << /Type /Pages /Count 2 >>\n2 0 obj << /Type /Page >>\n3 0 obj << /Type/Page >>");
    expect(isPdfBytes(pdf)).toBe(true);
    expect(isPdfBytes(new TextEncoder().encode("<html>"))).toBe(false);
    expect(pdfPageCount(pdf)).toBe(2);
  });
});
