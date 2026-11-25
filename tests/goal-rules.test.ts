import { describe, expect, it, vi } from "vitest";

// Review of PR #54: a channel detected as a business (weak evidence) whose owner then answered "more subscribers"
// still got price and how-to-order findings. The confirmed goal now picks the rule set. buildStrategy runs on frozen
// channel data (eval harness: no network, no saving); every model call fails, so only the code path is tested.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); }, pgErrorCode: () => undefined }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ BOT_USERNAME: "mercatai" }), getPublicUrl: () => undefined }));
vi.mock("@/lib/uslub/http", async () => await import("../src/lib/uslub/http"));
vi.mock("@/lib/uslub/scrape", async () => await import("../src/lib/uslub/scrape"));
vi.mock("@/lib/uslub/context", async () => await import("../src/lib/uslub/context"));
vi.mock("@/lib/uslub/llm", () => ({ getAnthropic: () => { throw new Error("no model in tests"); }, LlmError: class extends Error {} }));
vi.mock("@/lib/telegram-auth", () => ({ authenticateRequest: () => null, validateInitData: () => ({ ok: false }) }));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {} }));
vi.mock("../src/lib/uslub/brain/llm", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/uslub/brain/llm")>("../src/lib/uslub/brain/llm");
  return { ...actual, brainJson: async () => { throw new Error("no model in tests"); } };
});

const { buildStrategy } = await import("../src/lib/uslub/brain/strategy");
const { SALES_RULES } = await import("../src/lib/uslub/brain/rules");
import type { ChannelData, RawPost } from "../src/lib/uslub/brain/types";

const NOW = Date.parse("2026-11-25T09:00:00Z");
const DAY = 86_400_000;

// A cafe that posts its menu: prices hidden, no way to order shown (the sales rules would fire for a sales goal).
function cafe(): ChannelData {
  const texts = Array.from({ length: 18 }, (_, i) =>
    i % 2 ? `Bugun yangi taom: lag'mon va manti. Narxini lichkada aytamiz. Mazali kunlar!` : `Kafemizda ${i + 2} xil choy bor. Kelib tatib ko'ring, do'stlaringizni ham olib keling.`,
  );
  const posts: RawPost[] = texts.map((text, i) => ({
    id: 200 - i,
    channel: "choyxona_test",
    url: `https://t.me/choyxona_test/${200 - i}`,
    text,
    postedAt: new Date(NOW - (i * 2 + 1) * DAY + ((i * 7) % 11) * 3600_000).toISOString(),
    views: 600 + ((i * 97) % 250),
    approx: false,
    media: i % 3 === 0 ? "photo" : "text",
    isForward: false,
    links: [],
  }));
  return { channel: "choyxona_test", title: "Choyxona", subscribers: 1500, posts, complete: false, pages: 2 };
}

const run = (goal?: "sale" | "grow") =>
  buildStrategy({
    knowledge: "",
    channel: "choyxona_test",
    lang: "uz",
    now: NOW,
    web: false,
    save: false,
    channelType: "business",
    ...(goal ? { answers: { goal }, mainGoal: goal } : {}),
    preloaded: { own: cafe(), competitors: [], summaries: [] },
  });

describe("the confirmed goal picks the findings", () => {
  it("a business-typed brand whose owner wants subscribers: no sales rule fires, the plan is a growth plan", async () => {
    const r = await run("grow");
    const fired = r.rules.filter((x) => x.status === "fired").map((x) => x.id);
    for (const id of SALES_RULES) expect(fired, id).not.toContain(id);
    expect(r.goal).toBe("grow");
    expect(r.plan.items.every((it) => ["reach", "engage", "grow"].includes(it.goal))).toBe(true);
  }, 60_000);

  it("the same brand with the sales goal keeps its sales findings", async () => {
    const r = await run("sale");
    const fired = r.rules.filter((x) => x.status === "fired").map((x) => x.id);
    expect(fired.some((id) => SALES_RULES.includes(id))).toBe(true);
  }, 60_000);
});
