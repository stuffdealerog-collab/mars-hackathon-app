import { describe, expect, it, vi } from "vitest";

// Review of PR #54: (1) answering the questions makes a channel_only brand 'custom', and a rebuild then never read
// the channel's new posts again; (2) the ending was learned from forwards too, so a partner's phone became the
// channel's contact. buildBrand against the in-memory store, a fake t.me/s scrape and a fake DNA call.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); } }));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {} }));
vi.mock("../src/lib/env", () => ({ getEnv: () => ({ BOT_USERNAME: "mercatai" }), getPublicUrl: () => undefined }));
const extractBrandDNA = vi.fn(async () => ({ name: "Safia", languages: ["uz_latn"], products: ["Medovik"], proseLang: "uz" }));
vi.mock("../src/lib/uslub/dna", () => ({ extractBrandDNA }));

type FakePost = { id: number; text: string; isForward?: boolean };
const pages = new Map<string, FakePost[]>();
vi.mock("../src/lib/uslub/scrape", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/uslub/scrape")>("../src/lib/uslub/scrape");
  return {
    ...actual,
    scrapeChannel: async (input: string) => {
      const username = input.replace(/^@/, "");
      const posts = pages.get(username) ?? [];
      return { username, title: "Safia", posts, totalMessages: posts.length };
    },
  };
});

const { buildBrand } = await import("../src/lib/uslub/brand");
const store = await import("../src/lib/uslub/store");
const { parseChannelHtml } = await import("../src/lib/uslub/scrape");
const { samplesFromOf } = await import("../src/lib/uslub/samples");

const own = (round: string) => Array.from({ length: 6 }, (_, i): FakePost => ({ id: i + 1, text: `${round}: bugun ${i + 1}-partiya medovik tayyor bo‘ldi.\n📞 +998 90 123 45 67` }));

describe("samples keep up with the channel after the owner answers", () => {
  it("answer once (the row becomes 'custom'), rebuild after 24 h: the sample posts are the channel's newest again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-11-20T10:00:00Z"));
      pages.set("safia_samples", own("Eski"));
      const first = await buildBrand({ channel: "@safia_samples", ownerTelegramId: 61 });
      expect(first.brand.source).toBe("channel_only");
      expect(samplesFromOf(first.brand.dna)).toBe("channel");
      // What POST /answers does to a channel_only row.
      await store.setBrandSource(first.brand.id, "custom");

      pages.set("safia_samples", own("Yangi"));
      vi.setSystemTime(new Date("2026-11-21T11:00:00Z")); // 25 h later
      const later = await buildBrand({ channel: "@safia_samples", ownerTelegramId: 61 });
      expect(later.brand.id).toBe(first.brand.id);
      expect(later.brand.source).toBe("custom");
      expect(later.brand.samplePosts.every((p) => p.startsWith("Yangi"))).toBe(true);
      expect(samplesFromOf(later.brand.dna)).toBe("channel");
    } finally {
      vi.useRealTimers();
    }
  });

  it("samples the owner pasted are theirs: a rebuild keeps them", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-11-20T10:00:00Z"));
      pages.set("safia_given", own("Kanal"));
      const given = ["Medovik — 180 000 so‘m. Buyurtma: +998 90 123 45 67", "Napoleon — 150 000 so‘m. Buyurtma: +998 90 123 45 67"];
      const first = await buildBrand({ channel: "@safia_given", ownerTelegramId: 62, samplePosts: given });
      expect(samplesFromOf(first.brand.dna)).toBe("owner");
      expect(first.brand.samplePosts.slice(0, 2)).toEqual(given);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("forwards never teach the channel its contact", () => {
  it("a partner's forwarded posts ending with the partner's contact give no contact; the channel's own do", async () => {
    const partner = "📞 +998 91 555 44 33 / @partner_admin";
    pages.set("safia_fwd", [
      ...Array.from({ length: 4 }, (_, i): FakePost => ({ id: i + 1, text: `Hamkorimizdan yangilik ${i + 1}: yangi do‘kon ochildi.\n${partner}`, isForward: true })),
      ...Array.from({ length: 4 }, (_, i): FakePost => ({ id: i + 10, text: `Bugun ${i + 1}-partiya medovik va napoleon pishdi. Mazali kunlar!` })),
    ]);
    const plain = await buildBrand({ channel: "@safia_fwd" });
    expect(plain.brand.dna.postEnding?.contact).toBeUndefined();
    expect(plain.brand.dna.postEnding?.pattern).toBe("none");

    pages.set("safia_fwd2", [
      ...Array.from({ length: 4 }, (_, i): FakePost => ({ id: i + 1, text: `Hamkorimizdan yangilik ${i + 1}: yangi do‘kon ochildi.\n${partner}`, isForward: true })),
      ...own("O‘zimiz").slice(0, 3),
    ]);
    const withOwn = await buildBrand({ channel: "@safia_fwd2" });
    expect(withOwn.brand.dna.postEnding?.contact).toBe("📞 +998 90 123 45 67");
  });

  it("the t.me/s page marks a forwarded post", () => {
    const html = [
      '<div class="tgme_widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="safia/1"><div class="tgme_widget_message_forwarded_from">Forwarded from <a>Partner</a></div>',
      '<div class="tgme_widget_message_text js-message_text">Hamkor posti. 📞 +998 91 555 44 33</div></div></div>',
      '<div class="tgme_widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="safia/2">',
      '<div class="tgme_widget_message_text js-message_text">O‘zimizning post</div></div></div>',
    ].join("");
    const posts = parseChannelHtml("safia", html).posts;
    expect(posts.map((p) => [p.id, p.isForward ?? false])).toEqual([
      [1, true],
      [2, false],
    ]);
  });
});
