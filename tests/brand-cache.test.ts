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
    scrapeChannel: async (input: string) => ({
      username: input.replace(/^@/, ""),
      title: "Tort uyi",
      posts: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, text: `Post ${i + 1}: bugun napoleon va medovik bor.` })),
    }),
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
