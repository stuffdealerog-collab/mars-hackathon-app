import { describe, expect, it, vi } from "vitest";

// The publish claim on Postgres (store.ts claimPublish / releasePublish) against a fake `posts` table. Every query
// runs when it is called and answers a few ms later, like a network round trip, so two callers started together
// both read the row before either writes it: the compare-and-set decides who sends.
type Row = { status: string; published_url: string | null };
const table = new Map<string, Row>();
const delay = () => new Promise((r) => setTimeout(r, 3));

function fakeSql(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> {
  const q = strings.join("?").replace(/\s+/g, " ").trim();
  const result = run(q, values);
  return delay().then(() => result);
}

function run(q: string, v: unknown[]): unknown[] {
  if (q === "SELECT status, published_url FROM posts WHERE id = ?") {
    const row = table.get(v[0] as string);
    return row ? [{ ...row }] : [];
  }
  if (q.startsWith("SELECT id, brand_id, brief, variants, neuro_hits, human_score, status, published_url")) {
    const row = table.get(v[0] as string);
    return row ? [{ id: v[0], brand_id: "b", brief: "", variants: {}, neuro_hits: {}, human_score: 0, ...row, created_at: new Date() }] : [];
  }
  const cas = /^UPDATE posts SET status = \? WHERE id = \? AND status = \?( RETURNING id)?$/.exec(q);
  if (cas) {
    const [status, id, expected] = v as [string, string, string];
    const row = table.get(id);
    if (!row || row.status !== expected) return [];
    row.status = status;
    return cas[1] ? [{ id }] : [];
  }
  if (q === "UPDATE posts SET status = 'published', published_url = ? WHERE id = ?") {
    const row = table.get(v[1] as string);
    if (row) Object.assign(row, { status: "published", published_url: v[0] as string });
    return [];
  }
  throw new Error(`unexpected query: ${q}`);
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => true, getSql: () => fakeSql }));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {} }));

const store = await import("../src/lib/uslub/store");

const newPost = (status = "approved") => {
  const id = crypto.randomUUID();
  table.set(id, { status, published_url: null });
  return id;
};

describe("publish claim on Postgres", () => {
  it("of two callers reading the same row at once, exactly one claims it; the post still reads as approved", async () => {
    const id = newPost();
    const results = await Promise.all([store.claimPublish(id), store.claimPublish(id)]);
    expect(results.map((r) => r.kind).sort()).toEqual(["busy", "claimed"]);
    expect(table.get(id)!.status).toMatch(/^publishing:approved:\d+$/);
    expect((await store.getPost(id))?.status).toBe("approved");
  });

  it("a release puts the old status back, and only for the claim that holds the post", async () => {
    const id = newPost("draft");
    const first = await store.claimPublish(id, Date.now() - store.PUBLISH_CLAIM_STALE_MS - 1);
    const second = await store.claimPublish(id); // the first one's claim had expired: taken over
    if (first.kind !== "claimed" || second.kind !== "claimed") throw new Error("expected two claims");
    await store.releasePublish(id, first); // the expired call finally gives up: no effect on the new claim
    expect(table.get(id)!.status).toBe(second.token);
    await store.releasePublish(id, second);
    expect(table.get(id)!.status).toBe("draft");
  });

  it("once published, a claim answers with the link and a late release changes nothing", async () => {
    const id = newPost();
    const claim = await store.claimPublish(id);
    if (claim.kind !== "claimed") throw new Error("expected a claim");
    await store.markPublished(id, "https://t.me/tortlar_uz/5", "@tortlar_uz", 7);
    await store.releasePublish(id, claim);
    expect(table.get(id)).toEqual({ status: "published", published_url: "https://t.me/tortlar_uz/5" });
    expect(await store.claimPublish(id)).toEqual({ kind: "published", url: "https://t.me/tortlar_uz/5" });
  });

  it("a missing post is reported as missing", async () => {
    expect((await store.claimPublish(crypto.randomUUID())).kind).toBe("missing");
    expect((await store.claimPublish("not-a-uuid")).kind).toBe("missing");
  });
});
