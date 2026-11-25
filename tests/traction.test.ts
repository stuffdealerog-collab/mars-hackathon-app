import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: () => {} }));

import { FAILURE_HOLD_MS, forgetTractionFailure, readPublicTraction, readTraction, tractionQuery, type Traction } from "../src/lib/traction";
import { peopleCountable, readTractionRow, tractionBody } from "../src/lib/traction-model";

/** A tagged-template stand-in for the Neon client: records each query's text and values, answers the last with `rows`. */
function fakeSql(rows: unknown[]) {
  const seen: { text: string; values: unknown[] }[] = [];
  const options: unknown[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    seen.push({ text: strings.join("$?"), values });
    return { rows };
  }) as unknown as Parameters<typeof tractionQuery>[0];
  (sql as unknown as { transaction: unknown }).transaction = async (queries: { rows: unknown[] }[], opts: unknown) => {
    options.push(opts);
    return queries.map((q, i) => (i === queries.length - 1 ? q.rows : []));
  };
  return { sql, seen, options };
}

describe("readTractionRow", () => {
  it("keeps only the two counts", () => {
    expect(readTractionRow({ telegram_people: 58, channels: 25, telegram_id: 1, channel: "secret" })).toEqual({ people: 58, channels: 25 });
    expect(readTractionRow({ telegram_people: "58", channels: "25" })).toEqual({ people: 58, channels: 25 });
  });

  it("drops the people count when it may not be shown", () => {
    expect(readTractionRow({ telegram_people: 58, channels: 25 }, { people: false })).toEqual({ people: null, channels: 25 });
  });

  it("refuses a missing or malformed row", () => {
    expect(readTractionRow(undefined)).toBeNull();
    expect(readTractionRow({ telegram_people: -1, channels: 1 })).toBeNull();
    expect(readTractionRow({ telegram_people: 1.5, channels: 1 })).toBeNull();
    expect(readTractionRow({ channels: 1 })).toBeNull();
    expect(readTractionRow({ telegram_people: "", channels: 1 })).toBeNull();
  });
});

describe("peopleCountable (the team is never counted as people)", () => {
  it("counts people in production only when the team's ids are set", () => {
    expect(peopleCountable([], "production")).toBe(false);
    expect(peopleCountable([111], "production")).toBe(true);
  });

  it("counts them in development and tests, where the number is never public", () => {
    expect(peopleCountable([], "development")).toBe(true);
    expect(peopleCountable([], "test")).toBe(true);
  });
});

describe("tractionQuery / readTraction", () => {
  it("reads in one read-only round trip, with a statement timeout first, and returns counts only", async () => {
    const { sql, seen, options } = fakeSql([{ telegram_people: 60, channels: 25 }]);
    expect(await readTraction(sql, [111, 222])).toEqual({ people: 60, channels: 25 });
    expect(seen[0].text).toMatch(/^SET LOCAL statement_timeout = '3s'$/);
    const q = seen[1];
    expect(q.values).toContainEqual(["111", "222"]); // the team, bound as a parameter
    expect(q.text).toMatch(/count\(\*\)::int FROM app_users/);
    expect(q.text).toMatch(/count\(DISTINCT lower\(b\.channel\)\)/);
    // Nothing but aggregates is selected.
    expect(q.text).not.toMatch(/SELECT\s+(u|e|b)\.(telegram_id|channel|username|first_name)/);
    expect(options[0]).toMatchObject({ readOnly: true, fetchOptions: { signal: expect.any(AbortSignal) } });
  });

  it("counts people as a floor: Telegram users without the team, no web visitor keys", () => {
    const { sql, seen } = fakeSql([]);
    tractionQuery(sql, []);
    const q = seen[0];
    // Web visitor keys change every day: adding them could only push the number up.
    expect(q.text).not.toMatch(/events|visitor/);
    expect(q.text).toMatch(/u\.telegram_id <> ALL/);
    expect(q.values).toContainEqual([]); // no team configured: nobody left out (and production then hides people)
  });

  it("leaves people out on request, and gives null for an empty answer", async () => {
    expect(await readTraction(fakeSql([{ telegram_people: 60, channels: 25 }]).sql, [], { people: false })).toEqual({ people: null, channels: 25 });
    expect(await readTraction(fakeSql([]).sql, [])).toBeNull();
  });
});

describe("readPublicTraction (what the pages and the route show)", () => {
  const counts: Traction = { people: 60, channels: 25 };
  beforeEach(() => {
    forgetTractionFailure();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("hides the counter after a database error for a minute, then asks again", async () => {
    let t = 1_000_000;
    const now = () => t;
    const load = vi.fn<() => Promise<Traction | null>>().mockRejectedValueOnce(new Error("timeout")).mockResolvedValue(counts);
    expect(await readPublicTraction({ now, load })).toBeNull();
    t += FAILURE_HOLD_MS - 1;
    expect(await readPublicTraction({ now, load })).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    t += 1;
    expect(await readPublicTraction({ now, load })).toEqual(counts);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("never waits past waitMs: a slow read gives nothing now and fills the cache for later", async () => {
    vi.useFakeTimers();
    try {
      let finish: (t: Traction) => void = () => {};
      const slow = new Promise<Traction>((resolve) => {
        finish = resolve;
      });
      const answer = readPublicTraction({ waitMs: 1200, load: () => slow });
      await vi.advanceTimersByTimeAsync(1200);
      expect(await answer).toBeNull();
      finish(counts);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("GET /api/public/traction", () => {
  beforeEach(() => {
    forgetTractionFailure();
    vi.resetModules();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  async function routeWith(load: () => Promise<Traction | null>) {
    vi.doMock("next/server", () => ({ connection: async () => {} }));
    vi.doMock("@/lib/traction", async () => {
      const real = await vi.importActual<typeof import("../src/lib/traction")>("../src/lib/traction");
      return { ...real, readPublicTraction: (o: Parameters<typeof real.readPublicTraction>[0] = {}) => real.readPublicTraction({ ...o, load }) };
    });
    vi.doMock("@/lib/traction-model", () => import("../src/lib/traction-model"));
    return import("../src/app/api/public/traction/route");
  }

  it("answers { ok: false } with the one-minute cache on a database error", async () => {
    const { GET } = await routeWith(async () => {
      throw new Error("db down");
    });
    const res = await GET();
    expect(await res.json()).toEqual({ ok: false });
    expect(res.headers.get("cache-control")).toBe("public, max-age=30, s-maxage=60");
  });

  it("answers the counts with the ten-minute cache, and people as null when it may not be shown", async () => {
    const { GET } = await routeWith(async () => ({ people: null, channels: 25 }));
    const res = await GET();
    expect(await res.json()).toEqual({ ok: true, people: null, channels: 25 });
    expect(res.headers.get("cache-control")).toContain("s-maxage=600");
  });
});

describe("tractionBody", () => {
  it("carries the counts and nothing else", () => {
    expect(tractionBody({ people: 70, channels: 25 })).toEqual({ ok: true, people: 70, channels: 25 });
    expect(tractionBody(null)).toEqual({ ok: false });
  });
});
