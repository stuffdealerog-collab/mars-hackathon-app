import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: () => {} }));

import { readTraction, tractionQuery } from "../src/lib/traction";
import { parseTractionBody, readTractionRow, tractionBody } from "../src/lib/traction-model";

/** A tagged-template stand-in for the Neon client: records the query text and values, answers with `rows`. */
function fakeSql(rows: unknown[]) {
  const seen: { text: string; values: unknown[] }[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    seen.push({ text: strings.join("$?"), values });
    return { rows };
  }) as unknown as Parameters<typeof tractionQuery>[0];
  (sql as unknown as { transaction: unknown }).transaction = async (queries: { rows: unknown[] }[], opts: unknown) => {
    expect(opts).toEqual({ readOnly: true });
    return queries.map((q) => q.rows);
  };
  return { sql, seen };
}

describe("readTractionRow", () => {
  it("adds Telegram and web people and keeps only two counts", () => {
    expect(readTractionRow({ telegram_people: 58, web_people: 12, channels: 25, telegram_id: 1, channel: "secret" })).toEqual({ people: 70, channels: 25 });
    expect(readTractionRow({ telegram_people: "58", web_people: "0", channels: "25" })).toEqual({ people: 58, channels: 25 });
  });

  it("refuses a missing or malformed row", () => {
    expect(readTractionRow(undefined)).toBeNull();
    expect(readTractionRow({ telegram_people: -1, web_people: 0, channels: 1 })).toBeNull();
    expect(readTractionRow({ telegram_people: 1.5, web_people: 0, channels: 1 })).toBeNull();
    expect(readTractionRow({ telegram_people: 1, channels: 1 })).toBeNull();
    expect(readTractionRow({ telegram_people: "", web_people: 0, channels: 1 })).toBeNull();
  });
});

describe("tractionQuery / readTraction", () => {
  it("reads in one read-only round trip and returns counts only", async () => {
    const { sql, seen } = fakeSql([{ telegram_people: 60, web_people: 6, channels: 25 }]);
    expect(await readTraction(sql, [111, 222])).toEqual({ people: 66, channels: 25 });
    const q = seen[0];
    expect(q.values).toContainEqual(["111", "222"]); // the team, bound as a parameter
    expect(q.text).toMatch(/count\(\*\)::int FROM app_users/);
    expect(q.text).toMatch(/count\(DISTINCT e\.props->>'visitor'\)/);
    expect(q.text).toMatch(/count\(DISTINCT lower\(b\.channel\)\)/);
    // Nothing but aggregates is selected.
    expect(q.text).not.toMatch(/SELECT\s+(u|e|b)\.(telegram_id|channel|username|first_name)/);
  });

  it("leaves page views, error answers and dev traffic out of the web count", () => {
    const { sql, seen } = fakeSql([]);
    tractionQuery(sql, []);
    const q = seen[0];
    expect(q.values).toContainEqual(expect.arrayContaining(["page_view", "api_error", "llm_usage"]));
    expect(q.text).toMatch(/e\.props->>'env' IS DISTINCT FROM 'dev'/);
    expect(q.text).toMatch(/e\.telegram_id IS NULL/);
    expect(q.values).toContainEqual([]); // no team configured: nobody left out
  });

  it("gives null for an empty answer", async () => {
    const { sql } = fakeSql([]);
    expect(await readTraction(sql, [])).toBeNull();
  });
});

describe("tractionBody / parseTractionBody", () => {
  it("round-trips the counts and hides everything else", () => {
    const body = tractionBody({ people: 70, channels: 25 });
    expect(body).toEqual({ ok: true, people: 70, channels: 25 });
    expect(parseTractionBody(JSON.parse(JSON.stringify(body)))).toEqual({ people: 70, channels: 25 });
    expect(tractionBody(null)).toEqual({ ok: false });
  });

  it("hides the counter on any unexpected answer", () => {
    expect(parseTractionBody({ ok: false })).toBeNull();
    expect(parseTractionBody({ ok: true, people: "70", channels: 25 })).toEqual({ people: 70, channels: 25 });
    expect(parseTractionBody({ ok: true, people: null, channels: 25 })).toBeNull();
    expect(parseTractionBody("nope")).toBeNull();
    expect(parseTractionBody(null)).toBeNull();
  });
});
