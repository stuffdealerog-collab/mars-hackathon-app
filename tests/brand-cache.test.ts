import { beforeEach, describe, expect, it, vi } from "vitest";

// buildBrand against the in-memory store, a fake t.me/s scrape and a fake DNA call (no network, no Claude).
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); } }));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {} }));
const extractBrandDNA = vi.fn(async () => ({ name: "Tort uyi", languages: ["uz_latn"], proseLang: "uz" }));
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
