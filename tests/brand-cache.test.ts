import { beforeEach, describe, expect, it, vi } from "vitest";

// buildBrand against the in-memory store, a fake t.me/s scrape and a fake DNA call (no network, no Claude).
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); } }));
const safeLogEvent = vi.fn<(telegramId: number | null, type: string, props?: Record<string, unknown>) => Promise<void>>(async () => {});
vi.mock("@/lib/track", () => ({ safeLogEvent }));
const extractBrandDNA = vi.fn(async (a?: { lang?: string }) => ({ name: "Tort uyi", languages: ["uz_latn"], proseLang: a?.lang ?? "uz" }));
vi.mock("../src/lib/uslub/dna", () => ({ extractBrandDNA }));
vi.mock("../src/lib/uslub/scrape", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/uslub/scrape")>("../src/lib/uslub/scrape");
  return {
    ...actual,
    scrapeChannel: async (input: string) => {
      const username = input.replace(/^@/, "");
      // "@rasm_…" channels post pictures only (no captions); "@rasm_long…" has a real channel description.
      if (username.startsWith("rasm_"))
        return {
          username,
          title: "Rasm",
          description: username.startsWith("rasm_long")
            ? "Chilonzordagi gul do‘koni: buketlar, savatlar va to‘y bezaklari. Har kuni 9:00 dan 21:00 gacha, yetkazib berish bor."
            : "",
          posts: [],
          totalMessages: 12,
        };
      return {
        username,
        title: "Tort uyi",
        posts: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, text: `Post ${i + 1}: bugun napoleon va medovik bor.` })),
        totalMessages: 8,
      };
    },
  };
});

const { buildBrand } = await import("../src/lib/uslub/brand");

describe("channel cache never shares a brand row between anonymous callers", () => {
  beforeEach(() => {
    extractBrandDNA.mockClear();
  });

  it("gives every anonymous web caller their own brand id (DNA reused, no second Claude call)", async () => {
    const a = await buildBrand({ channel: "@tort_uyi_cache" });
    const b = await buildBrand({ channel: "@tort_uyi_cache" });
    expect(b.cached).toBe(true);
    expect(b.brand.id).not.toBe(a.brand.id);
    expect(b.brand.ownerTelegramId).toBeNull();
    expect(b.brand.dna).toEqual(a.brand.dna);
    expect(extractBrandDNA).toHaveBeenCalledTimes(1);
  });

  it("returns the same row only to the same Telegram user", async () => {
    const first = await buildBrand({ channel: "@tort_uyi_owner", ownerTelegramId: 7 });
    const again = await buildBrand({ channel: "@tort_uyi_owner", ownerTelegramId: 7 });
    const other = await buildBrand({ channel: "@tort_uyi_owner", ownerTelegramId: 8 });
    const anon = await buildBrand({ channel: "@tort_uyi_owner" });
    expect(again.brand.id).toBe(first.brand.id);
    expect(other.brand.id).not.toBe(first.brand.id);
    expect(anon.brand.id).not.toBe(first.brand.id);
    expect(anon.brand.ownerTelegramId).toBeNull();
  });
});

describe("a channel of pictures only (no captions)", () => {
  beforeEach(() => {
    extractBrandDNA.mockClear();
  });

  it("is not built from nothing: the owner is asked to describe the business (channel_empty, no_text)", async () => {
    await expect(buildBrand({ channel: "@rasm_dokon" })).rejects.toMatchObject({ code: "channel_empty", details: { reason: "no_text", postsFound: 12 } });
    expect(extractBrandDNA).not.toHaveBeenCalled();
  });

  it("with the owner's description becomes a fresh brand", async () => {
    const r = await buildBrand({ channel: "@rasm_dokon2", knowledge: "Chilonzorda gul do‘koni: buketlar, savatlar, to‘y bezaklari." });
    expect(r.switchedToFresh).toBe(true);
    expect(r.brand.mode).toBe("fresh");
    expect(extractBrandDNA).toHaveBeenCalledWith(expect.objectContaining({ mode: "fresh", samplePosts: [] }));
  });

  it("with a real channel description is built from it", async () => {
    const r = await buildBrand({ channel: "@rasm_long_gullar" });
    expect(r.brand.mode).toBe("channel");
    expect(r.channel?.totalMessages).toBe(12);
  });
});

// ~35% of brand rows were duplicates (42 rows for 19 channels): every re-run of a channel made a new row, and plans,
// answers and the visual style stayed on the old one. The caller's own row now comes back.
describe("running the same channel again reuses the caller's row", () => {
  beforeEach(() => {
    extractBrandDNA.mockClear();
    safeLogEvent.mockClear();
  });
  const reusedEvents = () => safeLogEvent.mock.calls.filter((c) => c[1] === "brand_reused");

  it("an anonymous browser that holds the id gets that row back, with no Claude call and no budget unit", async () => {
    const charged = vi.fn(async () => {});
    const first = await buildBrand({ channel: "@tort_uyi_reuse", beforeLlm: charged });
    expect(charged).toHaveBeenCalledTimes(1);
    const again = await buildBrand({ channel: "@tort_uyi_reuse", brandId: first.brand.id, beforeLlm: charged });
    expect(again.brand.id).toBe(first.brand.id);
    expect(again).toMatchObject({ cached: true, reused: true });
    expect(extractBrandDNA).toHaveBeenCalledTimes(1);
    expect(charged).toHaveBeenCalledTimes(1);
    expect(reusedEvents()).toEqual([[null, "brand_reused", { brand_id: first.brand.id, channel: "tort_uyi_reuse", via: "brand_id", dna_rewritten: false }]]);
  });

  it("a Telegram user gets their row back days later, without sending an id", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-11-20T10:00:00Z"));
      const first = await buildBrand({ channel: "@tort_uyi_days", ownerTelegramId: 42 });
      vi.setSystemTime(new Date("2026-11-25T10:00:00Z"));
      const again = await buildBrand({ channel: "@tort_uyi_days", ownerTelegramId: 42 });
      expect(again.brand.id).toBe(first.brand.id);
      expect(again.reused).toBe(true);
      expect(reusedEvents()[0]?.[2]).toMatchObject({ via: "owner" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("another language rewrites the DNA in place: same id, one Claude call", async () => {
    const charged = vi.fn(async () => {});
    const first = await buildBrand({ channel: "@tort_uyi_lang", ownerTelegramId: 43, lang: "uz" });
    const ru = await buildBrand({ channel: "@tort_uyi_lang", ownerTelegramId: 43, lang: "ru", beforeLlm: charged });
    expect(ru.brand.id).toBe(first.brand.id);
    expect((ru.brand.dna as { proseLang?: string }).proseLang).toBe("ru");
    expect(extractBrandDNA).toHaveBeenCalledTimes(2);
    expect(charged).toHaveBeenCalledTimes(1);
    expect(reusedEvents()[0]?.[2]).toMatchObject({ dna_rewritten: true });
  });

  it("never hands out a row someone else owns, and an owned caller never gets an unowned row", async () => {
    const owned = await buildBrand({ channel: "@tort_uyi_guard", ownerTelegramId: 44 });
    const anon = await buildBrand({ channel: "@tort_uyi_guard", brandId: owned.brand.id });
    expect(anon.brand.id).not.toBe(owned.brand.id);
    expect(anon.brand.ownerTelegramId).toBeNull();
    const other = await buildBrand({ channel: "@tort_uyi_guard", ownerTelegramId: 45, brandId: anon.brand.id });
    expect(other.brand.id).not.toBe(anon.brand.id);
    expect(other.brand.ownerTelegramId).toBe(45);
    expect(reusedEvents()).toEqual([]);
  });

  it("an id for another channel, or new text from the owner, builds as before", async () => {
    const a = await buildBrand({ channel: "@tort_uyi_one" });
    const b = await buildBrand({ channel: "@tort_uyi_two", brandId: a.brand.id });
    expect(b.brand.id).not.toBe(a.brand.id);
    const withText = await buildBrand({ channel: "@tort_uyi_one", brandId: a.brand.id, knowledge: "Napoleon torti 180 000 so‘m, Chilonzor." });
    expect(withText.brand.id).not.toBe(a.brand.id);
    expect(withText.reused).toBeUndefined();
  });
});
