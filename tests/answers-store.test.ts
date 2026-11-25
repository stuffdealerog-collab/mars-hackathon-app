import { beforeEach, describe, expect, it, vi } from "vitest";

// Review of PR #54: every POST /answers added a brand_knowledge row, and loadKnowledge read the newest 30 rows of any
// kind, so after ~30 saves the owner's price list and website fell out. Now: one answers row per brand (insert + delete
// in one transaction), sources counted apart from it, answers first in the text. A fake SQL client records queries.
vi.mock("server-only", () => ({}));

type Query = { text: string; values: unknown[]; then: (ok: (rows: unknown[]) => void) => void };
const log: { text: string; values: unknown[] }[] = [];
const transactions: Query[][] = [];
let reply: (text: string) => unknown[] = () => [];
const sql = Object.assign(
  (strings: TemplateStringsArray, ...values: unknown[]): Query => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    return { text, values, then: (ok) => (log.push({ text, values }), ok(reply(text))) };
  },
  {
    transaction: async (qs: Query[]) => {
      transactions.push(qs);
      return qs.map((q) => reply(q.text));
    },
  },
);
vi.mock("@/lib/db", () => ({ isDbConfigured: () => true, getSql: () => sql, pgErrorCode: () => undefined }));

const { saveAnswers } = await import("../src/lib/uslub/brain/answers-store");
const { answersFirst, loadKnowledge } = await import("../src/lib/uslub/brain/kbstore");

const BRAND = "5b0f3a52-8a5e-4c55-9b1c-0f3e2a7d9c11";
const row = (kind: string, text: string, i: number) => ({ id: `r${i}`, kind, url: null, title: kind === "gdoc" ? "Menyu" : null, text, structured: {}, created_at: new Date(Date.UTC(2026, 10, 25 - i)) });

beforeEach(() => {
  log.length = 0;
  transactions.length = 0;
  reply = () => [];
});

describe("answers store", () => {
  it("a save replaces the brand's answers row: insert the merged answers and delete the older rows, in one transaction", async () => {
    reply = (text) => (text.startsWith("SELECT structured") ? [{ structured: { goal: "sale", contact: "+998 90 123 45 67" } }] : []);
    const saved = await saveAnswers(BRAND, { prices: [{ name: "Medovik", price: "180 000 so'm" }] });
    expect(saved).toMatchObject({ goal: "sale", contact: "+998 90 123 45 67", prices: [{ name: "Medovik", price: "180 000 so'm" }] });
    expect(transactions).toHaveLength(1);
    const [insert, del] = transactions[0];
    expect(insert.text).toMatch(/^INSERT INTO brand_knowledge .* 'answers'/);
    expect(del.text).toBe("DELETE FROM brand_knowledge WHERE brand_id = ? AND kind = 'answers' AND id <> ?");
    // The row it keeps is the one it just inserted.
    expect(del.values).toEqual([BRAND, insert.values[0]]);
  });

  it("loadKnowledge: the answers row first, 30 sources counted without it", async () => {
    reply = (text) =>
      text.includes("kind = 'answers'")
        ? [row("answers", "[Egasining javoblari]\nNarxlar:\nMedovik — 180 000 so'm", 0)]
        : Array.from({ length: 30 }, (_, i) => row(i === 29 ? "gdoc" : "manual", i === 29 ? "Narxlar ro'yxati: Napoleon — 150 000 so'm" : `Eslatma ${i}`, i + 1));
    const kb = await loadKnowledge(BRAND);
    expect(transactions[0]?.[1]?.text).toContain("kind <> 'answers' ORDER BY created_at DESC LIMIT 30");
    expect(kb.text.startsWith("[answers]\n[Egasining javoblari]")).toBe(true);
    expect(kb.text).toContain("Napoleon — 150 000 so'm");
    expect(kb.sources).toHaveLength(31);
  });

  it("answersFirst keeps only the newest answers row, first", () => {
    const rows = [row("gdoc", "a", 0), row("answers", "new", 1), row("website", "b", 2), row("answers", "old", 3)];
    expect(answersFirst(rows).map((r) => r.text)).toEqual(["new", "a", "b"]);
  });
});
