import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/uslub/export/image (PR #55 review): one post's own picture, to whoever may read that post's drafts, never a
// URL the caller names; the size cap holds while reading, with or without content-length. In-memory store, fetch mocked.
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => { throw new Error("outside a request"); } }));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); }, pgErrorCode: () => undefined }));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {} }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ TELEGRAM_BOT_TOKEN: "test-token", BOT_USERNAME: "mercatai" }), getPublicUrl: () => undefined }));
vi.mock("../../../../../lib/env", () => ({ getEnv: () => ({ TELEGRAM_BOT_TOKEN: "test-token", BOT_USERNAME: "mercatai" }), getPublicUrl: () => undefined }));
vi.mock("@/lib/telegram-auth", () => ({
  authenticateRequest: (req: Request) => {
    const m = /^tma (\d+)$/.exec(req.headers.get("authorization") ?? "");
    return m ? { id: Number(m[1]) } : null;
  },
  validateInitData: () => ({ ok: false }),
}));
vi.mock("@/lib/uslub/http", async () => await import("../../../../../lib/uslub/http"));
vi.mock("@/lib/uslub/store", async () => await import("../../../../../lib/uslub/store"));
vi.mock("@/lib/uslub/context", async () => await import("../../../../../lib/uslub/context"));
vi.mock("@/lib/uslub/errors", async () => await import("../../../../../lib/uslub/errors"));
vi.mock("../../../../../lib/uslub/llm", () => ({ llmJson: vi.fn(), MODEL_QUALITY: "q", MODEL_FAST: "f", LlmError: class extends Error {} }));

const store = await import("../../../../../lib/uslub/store");
const route = await import("./route");
import type { BrandDNA, PostImage } from "../../../../../lib/uslub/contract";

const PICTURE = "https://v3.fal.media/files/zebra/abc.png";
const DNA = { name: "Non Voy", languages: ["uz_latn"] } as unknown as BrandDNA;

let ip = 0;
const get = (query: string, auth?: string) =>
  route.GET(new Request(`http://localhost/api/uslub/export/image?${query}`, { headers: { "x-forwarded-for": `10.9.0.${++ip}`, ...(auth ? { authorization: auth } : {}) } }));

async function makePost(owner: number | null, image: PostImage | null = { status: "ready", url: PICTURE, refsUsed: 1 }) {
  const brand = await store.saveBrand({ channel: "nonvoy", knowledge: "", samplePosts: [], dna: DNA, mode: "channel" }, owner, "custom");
  const id = crypto.randomUUID();
  await store.savePosts([
    { id, brandId: brand.id, brief: "", variants: { uz_latn: "Patir bor.", uz_cyrl: "", ru: "", en: "" }, neuroHits: {}, humanScore: 90, status: "draft", createdAt: new Date().toISOString(), ...(image ? { image } : {}) },
  ]);
  return id;
}

const png = (bytes: number, headers: Record<string, string> = { "content-type": "image/png" }) => new Response(new Uint8Array(bytes), { status: 200, headers });
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => png(10));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("GET /api/uslub/export/image", () => {
  it("passes the owner's post picture through, fetched from the post's own address", async () => {
    const id = await makePost(42);
    const res = await get(`postId=${id}`, "tma 42");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect((await res.arrayBuffer()).byteLength).toBe(10);
    expect(String(fetchMock.mock.calls[0][0])).toBe(PICTURE);
  });

  it("serves a brand nobody has claimed to the id holder, as the drafts are", async () => {
    const id = await makePost(null);
    expect((await get(`postId=${id}`)).status).toBe(200);
  });

  it("refuses another owner's post and an anonymous caller of an owned one, before fetching anything", async () => {
    const id = await makePost(42);
    expect((await get(`postId=${id}`, "tma 7")).status).toBe(403);
    expect((await get(`postId=${id}`)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never takes a URL from the caller", async () => {
    const res = await get(`url=${encodeURIComponent(PICTURE)}`);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("404 for an unknown post, a post without a picture, or a picture that is not on fal.media", async () => {
    expect((await get(`postId=${crypto.randomUUID()}`)).status).toBe(404);
    expect((await get(`postId=${await makePost(null, null)}`)).status).toBe(404);
    expect((await get(`postId=${await makePost(null, { status: "ready", url: "https://example.com/a.png", refsUsed: 0 })}`)).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops a picture over 15 MB, whether or not the host says its length", async () => {
    const id = await makePost(null);
    fetchMock.mockImplementationOnce(async () => png(16, { "content-type": "image/png", "content-length": String(16 * 1024 * 1024) }));
    expect((await get(`postId=${id}`)).status).toBe(400);
    // No content-length, and a host that would send 64 MB: the bytes are counted as they come, reading stops past 15 MB.
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent >= 64) return c.close();
        sent++;
        c.enqueue(chunk);
      },
    });
    fetchMock.mockImplementationOnce(async () => new Response(body, { status: 200, headers: { "content-type": "image/png" } }));
    expect((await get(`postId=${id}`)).status).toBe(400);
    expect(sent).toBeLessThan(20);
  });

  it("refuses what is not a picture", async () => {
    const id = await makePost(null);
    fetchMock.mockImplementationOnce(async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }));
    expect((await get(`postId=${id}`)).status).toBe(404);
  });
});
