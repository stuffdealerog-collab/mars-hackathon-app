import { afterAll, describe, expect, it, vi } from "vitest";
import { loadFixtures } from "./brain/eval/fixtures";

// E5 (QA 2026-11-25): every reopen of a brand re-ran /analyze and its paid Sonnet step. The written findings are now
// reused for 12 h while the channel has no new post. A frozen golden channel stands in for t.me; the model is a mock.
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => { throw new Error("outside a request"); } }));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); }, pgErrorCode: () => undefined }));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {} }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({}), getPublicUrl: () => undefined }));
vi.mock("@/lib/telegram-auth", () => ({ authenticateRequest: () => null, validateInitData: () => ({ ok: false }) }));
vi.mock("@/lib/uslub/http", async () => await import("../src/lib/uslub/http"));
vi.mock("@/lib/uslub/scrape", async () => await import("../src/lib/uslub/scrape"));
vi.mock("@/lib/uslub/context", async () => await import("../src/lib/uslub/context"));
vi.mock("@/lib/uslub/llm", () => ({ getAnthropic: () => { throw new Error("no model in tests"); }, LlmError: class extends Error {} }));

const fixture = loadFixtures().find((f) => f.data.posts.length >= 20);
let channel = fixture ? structuredClone(fixture.data) : null;
vi.mock("../src/lib/uslub/brain/scrape", () => ({
  BrainScrapeError: class extends Error {},
  normalizeChannel: (c: string) => c.replace(/^@/, "").toLowerCase(),
  scrapeChannelData: async () => structuredClone(channel),
}));

/** The model explains every fired rule in one plain Uzbek sentence pair, ids at the end (what D1 asks for). */
const brainJson = vi.fn(async (opts: { prompt: string }) => {
  const { firedRules } = JSON.parse(opts.prompt) as { firedRules: { id: string; kind: string }[] };
  return {
    findings: firedRules.map((r) => ({
      rule: r.id,
      kind: r.kind,
      text: `Kanal egasi uchun muhim kuzatuv bor. Shu hafta bitta aniq qadam qo‘ying. [${r.id}]`,
      evidence: [r.id],
    })),
  };
});
vi.mock("../src/lib/uslub/brain/llm", () => ({ brainJson, GROUNDING: () => "", SONNET: "claude-sonnet-5-5", HAIKU: "claude-haiku-5-5" }));

vi.useFakeTimers({ toFake: ["Date"] });
if (fixture) vi.setSystemTime(new Date(fixture.capturedAt));
const { runAudit } = await import("../src/lib/uslub/brain/audit");

afterAll(() => vi.useRealTimers());

describe.skipIf(!fixture)("the audit's written findings are reused (E5)", () => {
  const handle = fixture?.handle ?? "";

  it("the second open of the same channel makes no Claude call and takes no budget unit", async () => {
    const charged = vi.fn(async () => {});
    const first = await runAudit({ channel: handle, lang: "ru", beforeLlm: charged });
    expect(brainJson).toHaveBeenCalledTimes(1);
    expect(charged).toHaveBeenCalledTimes(1);
    expect(first.findings.some((f) => !f.template)).toBe(true);

    const second = await runAudit({ channel: handle, lang: "ru", beforeLlm: charged });
    expect(brainJson).toHaveBeenCalledTimes(1);
    expect(charged).toHaveBeenCalledTimes(1);
    expect(second.audit.findings).toEqual(first.audit.findings);
  });

  it("another language, refresh:true, or a new post on the channel writes them again", async () => {
    brainJson.mockClear();
    await runAudit({ channel: handle, lang: "en" });
    expect(brainJson).toHaveBeenCalledTimes(1);
    await runAudit({ channel: handle, lang: "ru", refresh: true });
    expect(brainJson).toHaveBeenCalledTimes(2);
    const newest = Math.max(...(channel?.posts ?? []).map((p) => p.id));
    channel = { ...(channel as NonNullable<typeof channel>), posts: [{ ...(channel as NonNullable<typeof channel>).posts[0], id: newest + 1 }, ...(channel as NonNullable<typeof channel>).posts] };
    await runAudit({ channel: handle, lang: "ru" });
    expect(brainJson).toHaveBeenCalledTimes(3);
  });

  it("a channel with nothing in the last 90 days answers channel_empty before any Claude call (E12b)", async () => {
    brainJson.mockClear();
    vi.setSystemTime(new Date(Date.parse(fixture?.capturedAt ?? "") + 200 * 86_400_000));
    await expect(runAudit({ channel: handle, lang: "uz" })).rejects.toMatchObject({ status: 422, code: "channel_empty" });
    expect(brainJson).not.toHaveBeenCalled();
    vi.setSystemTime(new Date(fixture?.capturedAt ?? ""));
  });
});
