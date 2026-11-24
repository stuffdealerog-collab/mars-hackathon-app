import { describe, expect, it, vi } from "vitest";
import { buildAnalysisContent, normalizeAnalysis, type AnalyzeFn, type StyleAnalysis } from "./analyze";
import { extractChannelPhotos, fetchChannelPhotos, isTelegramCdn, normalizeChannelName, pickCandidates, type ChannelPhoto } from "./channel";
import { isPublicHttps, parseDataUrl, sniffImageType, type ImageBytes } from "./images";
import { learnVisualStyle, MAX_REFS, type LearnDeps } from "./learn";
import { falUpload, isFalMedia } from "./storage";

/* ---------------------------------------------------------------- fixtures */

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpegDataUrl = `data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}`;

const cdn = (id: string) => `https://cdn4.telesco.pe/file/${id}.jpg`;

/** One t.me/s message block, close to the real markup. */
function message(id: number, opts: { photos?: string[]; thumb?: string; views?: string; service?: boolean; date?: string } = {}) {
  const cls = opts.service ? "tgme_widget_message text_not_supported_wrap js-widget_message service_message" : "tgme_widget_message text_not_supported_wrap js-widget_message";
  const photos = (opts.photos ?? [])
    .map((u) => `<a class="tgme_widget_message_photo_wrap 1 2" href="https://t.me/shop/${id}" style="width:800px;background-image:url('${u}')"></a>`)
    .join("");
  const thumb = opts.thumb ? `<i class="tgme_widget_message_video_thumb" style="background-image:url('${opts.thumb}')"></i>` : "";
  return `<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="${cls}" data-post="shop/${id}">${photos}${thumb}
    <span class="tgme_widget_message_views">${opts.views ?? "1.2K"}</span><time datetime="${opts.date ?? "2026-11-20T10:00:00+00:00"}">x</time></div></div>`;
}

const page = (...blocks: string[]) => `<html><body>${blocks.join("\n")}</body></html>`;

/* ----------------------------------------------------------------- channel */

describe("channel photos", () => {
  it("normalizes channel names and rejects junk", () => {
    expect(normalizeChannelName("@safiabakery")).toBe("safiabakery");
    expect(normalizeChannelName("https://t.me/s/Safiabakery/1676")).toBe("Safiabakery");
    expect(normalizeChannelName("t.me/lifesmileuz?x=1")).toBe("lifesmileuz");
    expect(normalizeChannelName("https://evil.example/x")).toBeNull();
    expect(normalizeChannelName("ab")).toBeNull();
  });

  it("extracts photos and video covers from the preview, skips service messages and foreign hosts", () => {
    const html = page(
      message(10, { photos: [cdn("a"), cdn("b")], views: "3.4K" }),
      message(11, { service: true, photos: [cdn("s")] }),
      message(12, { thumb: cdn("v") }),
      message(13, { photos: ["https://evil.example/x.jpg", `${cdn("c")}?a=1&amp;b=2`] }),
    );
    const photos = extractChannelPhotos(html);
    expect(photos.map((p) => p.url)).toEqual([cdn("a"), cdn("b"), cdn("v"), `${cdn("c")}?a=1&b=2`]);
    expect(photos[0]).toMatchObject({ postId: 10, postUrl: "https://t.me/shop/10", views: 3400, kind: "photo" });
    expect(photos[2].kind).toBe("video_thumb");
    expect(isTelegramCdn("https://cdn1.telesco.pe/file/x.jpg")).toBe(true);
    expect(isTelegramCdn("http://cdn1.telesco.pe/file/x.jpg")).toBe(false);
  });

  it("picks newest first, at most two per album, photos before video covers", () => {
    const p = (postId: number, n: number, kind: ChannelPhoto["kind"] = "photo"): ChannelPhoto => ({
      url: cdn(`${postId}-${n}`),
      postId,
      postUrl: "",
      kind,
    });
    const picked = pickCandidates([p(1, 1), p(5, 1, "video_thumb"), p(3, 1), p(3, 2), p(3, 3), p(4, 1)], 4);
    expect(picked.map((x) => x.url)).toEqual([cdn("4-1"), cdn("3-1"), cdn("3-2"), cdn("1-1")]);
  });

  it("pages back with ?before= until enough photos are found", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url);
      const html = url.includes("before=")
        ? page(message(3, { photos: [cdn("old")] }))
        : page(message(8, { photos: [cdn("new")] }), message(9, { photos: [cdn("newer")] }));
      return new Response(html, { status: 200 });
    });
    const photos = await fetchChannelPhotos("@shop", { want: 3, pages: 2, fetch: fetchImpl });
    expect(urls).toEqual(["https://t.me/s/shop", "https://t.me/s/shop?before=8"]);
    expect(photos.map((p) => p.url)).toEqual([cdn("new"), cdn("newer"), cdn("old")]);
  });

  it("returns nothing for an invalid channel without fetching", async () => {
    const fetchImpl = vi.fn();
    expect(await fetchChannelPhotos("not a channel!", { fetch: fetchImpl })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ images */

describe("image inputs", () => {
  it("sniffs real image bytes", () => {
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(new TextEncoder().encode("<svg onload=x>"))).toBeNull();
  });

  it("decodes data URLs only when the bytes are an image", () => {
    expect(parseDataUrl(jpegDataUrl)).toMatchObject({ type: "image/jpeg" });
    const fake = `data:image/png;base64,${Buffer.from("<html>").toString("base64")}`;
    expect(() => parseDataUrl(fake)).toThrow(/not a PNG/);
    expect(() => parseDataUrl("data:image/svg+xml;base64,AAAA")).toThrow();
  });

  it("allows only public https links for server-side downloads", () => {
    expect(isPublicHttps("https://cdn4.telesco.pe/file/a.jpg")).toBe(true);
    for (const bad of [
      "http://example.com/a.jpg",
      "https://localhost/a.jpg",
      "https://127.0.0.1/a.jpg",
      "https://10.0.0.5/a.jpg",
      "https://192.168.1.2/a.jpg",
      "https://172.20.0.1/a.jpg",
      "https://169.254.169.254/latest",
      "https://[::1]/a.jpg",
      "https://user:pw@example.com/a.jpg",
      "https://metadata.internal/a",
    ]) {
      expect(isPublicHttps(bad), bad).toBe(false);
    }
  });
});

/* ----------------------------------------------------------------- storage */

describe("fal storage re-hosting", () => {
  it("initiates, uploads the bytes and returns the fal.media URL", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("/storage/upload/initiate")) {
        return Response.json({ upload_url: "https://upload.fal.example/put?sig=1", file_url: "https://v3b.fal.media/files/b/x/ref.jpg" });
      }
      return new Response(null, { status: 200 });
    });
    const url = await falUpload({ bytes: JPEG, type: "image/jpeg" }, { key: "test-key-1234567890", name: "brand-ref-1", fetch: fetchImpl });
    expect(url).toBe("https://v3b.fal.media/files/b/x/ref.jpg");
    expect(calls[0].init?.headers).toMatchObject({ Authorization: "Key test-key-1234567890" });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ content_type: "image/jpeg", file_name: "brand-ref-1.jpg" });
    expect(calls[1]).toMatchObject({ url: "https://upload.fal.example/put?sig=1", init: { method: "PUT" } });
  });

  it("refuses a file URL outside fal's CDN and a missing key", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ upload_url: "https://u.example/p", file_url: "https://evil.example/x.jpg" }));
    await expect(falUpload({ bytes: JPEG, type: "image/jpeg" }, { key: "k".repeat(20), name: "x", fetch: fetchImpl })).rejects.toThrow(/no upload URL/);
    await expect(falUpload({ bytes: JPEG, type: "image/jpeg" }, { key: undefined, name: "x" })).rejects.toThrow(/FAL_KEY/);
    expect(isFalMedia("https://v3b.fal.media/files/a.jpg")).toBe(true);
    expect(isFalMedia("https://fal.media.evil.example/a.jpg")).toBe(false);
  });
});

/* ---------------------------------------------------------------- analysis */

const analysis = (over: Partial<StyleAnalysis> = {}): StyleAnalysis => ({
  images: [],
  palette: ["#F4EFE6", "red", "#3b2a20", "#12345"],
  light: "soft window daylight",
  composition: "close-up, 45 degrees",
  props: ["wooden board"],
  mood: "warm",
  avoid: ["neon light"],
  prompt: 'Warm natural photo of one product on a wooden table."}',
  ...over,
});

describe("style analysis output", () => {
  it("keeps only valid image numbers, valid colours, and always forbids text", () => {
    const { keep, style } = normalizeAnalysis(
      analysis({
        images: [
          { index: 1, kind: "food", keep: true },
          { index: 2, kind: "text", keep: false },
          { index: 9, kind: "food", keep: true },
        ],
      }),
      3,
    );
    expect([...keep]).toEqual([0]);
    expect(style.palette).toEqual(["#f4efe6", "#3b2a20"]);
    expect(style.avoid[0]).toMatch(/text, letters or logos/);
    expect(style.prompt.endsWith("table.")).toBe(true);
  });

  it("labels every image and puts the brand description last", () => {
    const img: ImageBytes = { bytes: JPEG, type: "image/jpeg" };
    const blocks = buildAnalysisContent(
      [
        { img, source: "owner", label: "photo the owner added" },
        { img, source: "channel", label: "channel photo, 2026-11-20" },
      ],
      { name: "Safia", oneLiner: "bakery", products: ["Napoleon"], knowledge: "", mode: "channel" },
    );
    expect(blocks.filter((b) => b.type === "image")).toHaveLength(2);
    expect(blocks[0]).toEqual({ type: "text", text: "Image 1 (photo the owner added):" });
    const last = blocks.at(-1);
    expect(last?.type === "text" && last.text).toMatch(/Business: Safia[\s\S]*2 images above/);
  });
});

/* ------------------------------------------------------------------ learn */

function learnDeps(over: Partial<LearnDeps> = {}) {
  const rehosted: string[] = [];
  const deps: LearnDeps = {
    channelPhotos: vi.fn(async () =>
      [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ url: cdn(`p${i}`), postId: 100 + i, postUrl: "", kind: "photo" as const, date: "2026-11-2" + (i % 9) })),
    ),
    download: vi.fn(async (url: string) => {
      if (url.includes("p3")) throw new Error("gone");
      return { bytes: JPEG, type: "image/jpeg" as const };
    }),
    rehost: vi.fn(async (_img: ImageBytes, name: string) => {
      rehosted.push(name);
      return `https://v3b.fal.media/files/${name}.jpg`;
    }),
    analyze: vi.fn<AnalyzeFn>(async (images) => analysis({ images: images.map((_, i) => ({ index: i + 1, kind: "food" as const, keep: i !== 1 })) })),
    now: () => Date.parse("2026-11-25T08:00:00Z"),
    ...over,
  };
  return { deps, rehosted };
}

const brand = { id: "11111111-2222-4333-8444-555555555555", channel: "shop", mode: "channel" as const, name: "Shop", oneLiner: "", products: [], knowledge: "" };

describe("learnVisualStyle", () => {
  it("puts owner photos first, keeps what Claude kept, re-hosts each once and caps the refs", async () => {
    const { deps, rehosted } = learnDeps();
    const owned = "https://v3b.fal.media/files/earlier-owner.jpg";
    const v = await learnVisualStyle({ brand, ownerImages: [jpegDataUrl, owned] }, deps);
    // images: owner data, owner fal, then channel p8..p1 newest first (p3 failed to download); #2 dropped by Claude
    const analyzed = vi.mocked(deps.analyze).mock.calls[0][0];
    expect(analyzed.map((a) => a.source)).toEqual(["owner", "owner", "channel", "channel", "channel", "channel", "channel", "channel", "channel"]);
    expect(v.refs).toHaveLength(MAX_REFS);
    expect(v.refs[0]).toEqual({ url: "https://v3b.fal.media/files/11111111-ref-1.jpg", source: "owner" });
    expect(v.refs.slice(1).every((r) => r.source === "channel")).toBe(true);
    expect(v.refs.map((r) => r.url)).not.toContain(owned); // Claude dropped image 2 in this run
    expect(rehosted).toHaveLength(MAX_REFS);
    expect(v.learnedAt).toBe("2026-11-25T08:00:00.000Z");
    expect(v.avoid[0]).toMatch(/text/);
  });

  it("does not copy an already re-hosted owner photo again", async () => {
    const { deps, rehosted } = learnDeps({
      analyze: vi.fn<AnalyzeFn>(async (images) => analysis({ images: images.map((_, i) => ({ index: i + 1, kind: "product" as const, keep: i === 0 })) })),
    });
    const owned = "https://v3b.fal.media/files/earlier-owner.jpg";
    const v = await learnVisualStyle({ brand, ownerImages: [owned] }, deps);
    expect(v.refs).toEqual([{ url: owned, source: "owner" }]);
    expect(rehosted).toEqual([]);
  });

  it("fresh brands skip the channel; no photos at all still yields a style", async () => {
    const { deps } = learnDeps();
    const v = await learnVisualStyle({ brand: { ...brand, mode: "fresh" } }, deps);
    expect(deps.channelPhotos).not.toHaveBeenCalled();
    expect(vi.mocked(deps.analyze).mock.calls[0][0]).toEqual([]);
    expect(v.refs).toEqual([]);
    expect(v.prompt).toMatch(/wooden table/);
  });

  it("a failed re-host drops that ref instead of failing the style; bad owner files are reported", async () => {
    const { deps } = learnDeps({ rehost: vi.fn(async () => Promise.reject(new Error("fal down"))) });
    const v = await learnVisualStyle({ brand }, deps);
    expect(v.refs).toEqual([]);
    await expect(learnVisualStyle({ brand, ownerImages: ["data:image/png;base64,AAAA"] }, deps)).rejects.toThrow(/photo 1/);
    await expect(learnVisualStyle({ brand, ownerImages: Array(6).fill(jpegDataUrl) }, deps)).rejects.toThrow(/at most 5/);
  });
});

/* ------------------------------------------------------------------ access */

describe("who may change a brand's pictures", () => {
  it("anyone with the id while the brand has no owner; only the owner once it has one", async () => {
    const { canChangeBrandPictures } = await import("./access");
    expect(canChangeBrandPictures({ ownerTelegramId: null }, null)).toBe(true);
    expect(canChangeBrandPictures({ ownerTelegramId: 42 }, 42)).toBe(true);
    expect(canChangeBrandPictures({ ownerTelegramId: 42 }, null)).toBe(false);
    expect(canChangeBrandPictures({ ownerTelegramId: 42 }, 7)).toBe(false);
  });

  it("style analyses have their own daily caps", async () => {
    const { readMediaConfig } = await import("../media/config");
    expect(readMediaConfig({})).toMatchObject({ visualDailyLimit: 60, visualBrandDailyLimit: 8 });
    expect(readMediaConfig({ MEDIA_VISUAL_DAILY_LIMIT: "5", MEDIA_VISUAL_BRAND_DAILY_LIMIT: "2" })).toMatchObject({ visualDailyLimit: 5, visualBrandDailyLimit: 2 });
  });
});
