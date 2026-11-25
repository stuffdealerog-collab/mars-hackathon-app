import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// logEvent writes through getSql(): capture the rows instead of talking to a database.
const inserted: { telegramId: unknown; type: unknown; props: Record<string, unknown> }[] = [];
let dbOn = false;
vi.mock("../src/lib/db", () => ({
  isDbConfigured: () => dbOn,
  getSql: () => (_strings: TemplateStringsArray, ...values: unknown[]) => {
    inserted.push({ telegramId: values[0], type: values[1], props: JSON.parse(String(values[2])) });
    return Promise.resolve([]);
  },
  pgErrorCode: () => undefined,
}));

vi.mock("@/lib/track", async () => await import("../src/lib/track"));

import { anonIpKey, dailyVisitorKey, tashkentDay } from "../src/lib/anon-key";
import { referrerCategory, visitSource } from "../src/lib/source-category";
import { botEventMeta, currentEventMeta, eventEnv, runWithEventMeta, withEventMeta } from "../src/lib/stats-meta";
import { isPageVisit, pageViewFrom, recordPageView, VisitGuard, visitIp, visitKind } from "../src/lib/stats-pageview";
import { logEvent } from "../src/lib/track";

const UUID = "3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const TOKEN_A = "123456:TEST-bot-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaa";

beforeEach(() => {
  inserted.length = 0;
  dbOn = false;
  vi.stubEnv("TELEGRAM_BOT_TOKEN", TOKEN_A);
});
afterEach(() => vi.unstubAllEnvs());

describe("tashkentDay / dailyVisitorKey (cookie-less daily visitor key)", () => {
  it("uses the Tashkent calendar day (UTC+5): the day turns at 19:00 UTC", () => {
    expect(tashkentDay(new Date("2026-11-25T18:59:59Z"))).toBe("2026-11-25");
    expect(tashkentDay(new Date("2026-11-25T19:00:00Z"))).toBe("2026-11-26");
    expect(tashkentDay(new Date("2026-11-24T19:00:00Z"))).toBe("2026-11-25");
  });

  it("is stable within a day and unlinkable across days", () => {
    const morning = new Date("2026-11-25T04:00:00Z"); // 09:00 Tashkent
    const evening = new Date("2026-11-25T18:30:00Z"); // 23:30 Tashkent
    const nextDay = new Date("2026-11-25T19:30:00Z"); // 00:30 the next day
    const key = dailyVisitorKey("203.0.113.7", CHROME, morning);
    expect(key).toMatch(/^v:[0-9a-f]{16}$/);
    expect(dailyVisitorKey("203.0.113.7", CHROME, evening)).toBe(key);
    expect(dailyVisitorKey("203.0.113.7", CHROME, nextDay)).not.toBe(key);
  });

  it("depends on IP, User-Agent and the server key, and contains neither IP nor UA", () => {
    const at = new Date("2026-11-25T10:00:00Z");
    const key = dailyVisitorKey("203.0.113.7", CHROME, at);
    expect(dailyVisitorKey("203.0.113.8", CHROME, at)).not.toBe(key);
    expect(dailyVisitorKey("203.0.113.7", IPHONE, at)).not.toBe(key);
    expect(key).not.toContain("203");
    expect(key).not.toContain("113");
    expect(key.slice(2)).not.toBe(anonIpKey("203.0.113.7", "claude").slice(3));
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456:TEST-bot-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    expect(dailyVisitorKey("203.0.113.7", CHROME, at)).not.toBe(key);
  });
});

describe("referrerCategory / visitSource (source of a web visit)", () => {
  it("reduces a referrer to its host category, never the host itself", () => {
    expect(referrerCategory("https://t.me/")).toBe("telegram");
    expect(referrerCategory("https://web.telegram.org/")).toBe("telegram");
    expect(referrerCategory("https://www.google.com/")).toBe("google");
    expect(referrerCategory("https://google.co.uz/")).toBe("google");
    expect(referrerCategory("https://yandex.ru/")).toBe("yandex");
    expect(referrerCategory("https://ya.ru/")).toBe("yandex");
    expect(referrerCategory("https://l.instagram.com/")).toBe("instagram");
    expect(referrerCategory("https://m.facebook.com/")).toBe("facebook");
    expect(referrerCategory("https://youtu.be/")).toBe("youtube");
    expect(referrerCategory("https://www.tiktok.com/")).toBe("tiktok");
    expect(referrerCategory("https://wa.me/")).toBe("whatsapp");
    expect(referrerCategory("https://duckduckgo.com/")).toBe("search");
    expect(referrerCategory("https://someones-private-blog.example/secret")).toBe("other");
    expect(referrerCategory("https://notgoogle.com.evil.example/")).toBe("other");
    expect(referrerCategory("https://mercat-ai.vercel.app/studio", "mercat-ai.vercel.app")).toBe("internal");
    expect(referrerCategory(null)).toBe("direct");
    expect(referrerCategory("")).toBe("direct");
    expect(referrerCategory("not a url at all")).toBe("other");
  });

  it("takes ?src=, then ?utm_source=, then the referrer, and drops ids", () => {
    expect(visitSource({ src: "booth1", utmSource: "instagram", referrer: "https://t.me/" })).toBe("booth1");
    expect(visitSource({ src: "src_expo_2026" })).toBe("expo_2026");
    expect(visitSource({ utmSource: "instagram", referrer: "https://t.me/" })).toBe("instagram");
    expect(visitSource({ utmSource: "Facebook.com" })).toBe("facebook_com");
    expect(visitSource({ src: "", utmSource: "  ", referrer: "https://t.me/" })).toBe("telegram");
    expect(visitSource({ src: UUID })).toBe("other");
    expect(visitSource({ utmSource: `promo-${UUID}` })).toBe("other");
    expect(visitSource({ src: "src_k3x9qa_4" })).toBe("plan");
    expect(visitSource({})).toBe("direct");
    expect(visitSource({ src: `src_${"x".repeat(200)}` })).toBe("x".repeat(32));
    expect(visitSource({ src: "x".repeat(200) })).toBe("other");
  });
});

const visit = (path: string, headers: Record<string, string> = {}, method = "GET") => ({
  method,
  url: `https://mercat-ai.vercel.app${path}`,
  headers: new Headers({ "user-agent": CHROME, "sec-fetch-dest": "document", "x-forwarded-for": "203.0.113.7, 10.0.0.1", ...headers }),
});

describe("page views (counted server-side by the proxy)", () => {
  it("counts a person opening the landing page or the Studio, with categories only", () => {
    const at = new Date("2026-11-25T10:00:00Z");
    expect(pageViewFrom(visit("/?utm_source=instagram"), at)).toEqual({
      path: "landing",
      source: "instagram",
      device: "desktop",
      surface: "web",
      visitor: dailyVisitorKey("203.0.113.7", CHROME, at),
    });
    expect(pageViewFrom(visit("/studio", { "user-agent": IPHONE, referer: "https://t.me/" }), at)).toMatchObject({
      path: "studio",
      source: "telegram",
      device: "mobile",
    });
    expect(pageViewFrom(visit("/studio/"), at)?.path).toBe("studio");
    expect(pageViewFrom(visit("/", { referer: "https://mercat-ai.vercel.app/studio" }), at)?.source).toBe("internal");
  });

  it("never keeps the query, the fragment, the referrer, the IP or the User-Agent", () => {
    const props = pageViewFrom(
      visit(`/studio?brand=${UUID}&k=handoff-secret-key#k=abc`, { referer: `https://example.org/p/${UUID}` }),
    );
    const json = JSON.stringify(props);
    expect(props?.path).toBe("studio");
    expect(json).not.toContain(UUID);
    expect(json).not.toContain("handoff-secret-key");
    expect(json).not.toContain("example.org");
    expect(json).not.toContain("203.0.113.7");
    expect(json).not.toContain("Chrome");
    expect(Object.keys(props ?? {}).sort()).toEqual(["device", "path", "source", "surface", "visitor"]);
  });

  it("skips bots, link previews, prefetches, RSC navigations, assets and other methods", () => {
    const bots = [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "TelegramBot (like TwitterBot)",
      "facebookexternalhit/1.1",
      "WhatsApp/2.23.20.0",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36",
      "vercel-screenshot/1.0",
      "curl/8.4.0",
      "python-requests/2.31",
      "",
    ];
    for (const ua of bots) expect(isPageVisit(visit("/", { "user-agent": ua })), ua).toBe(false);
    expect(isPageVisit(visit("/", { "sec-purpose": "prefetch" }))).toBe(false);
    expect(isPageVisit(visit("/", { purpose: "prefetch" }))).toBe(false);
    expect(isPageVisit(visit("/", { "next-router-prefetch": "1" }))).toBe(false);
    expect(isPageVisit(visit("/", { rsc: "1" }))).toBe(false);
    expect(isPageVisit(visit("/?_rsc=abc12"))).toBe(false);
    expect(isPageVisit(visit("/", { "sec-fetch-dest": "empty" }))).toBe(false);
    expect(isPageVisit(visit("/", { "sec-fetch-dest": "image" }))).toBe(false);
    expect(isPageVisit(visit("/", {}, "POST"))).toBe(false);
    expect(isPageVisit(visit("/", {}, "HEAD"))).toBe(false);
    expect(pageViewFrom(visit("/qr"))).toBeNull();
    expect(pageViewFrom(visit("/tg"))).toBeNull();
    expect(pageViewFrom(visit("/stats"))).toBeNull();
  });

  it("accepts browsers without Sec-Fetch-Dest only when they ask for HTML", () => {
    const old = { "user-agent": CHROME, "x-forwarded-for": "203.0.113.7" };
    const noDest = (headers: Record<string, string>) => ({ method: "GET", url: "https://mercat-ai.vercel.app/", headers: new Headers(headers) });
    expect(isPageVisit(noDest({ ...old, accept: "text/html,application/xhtml+xml" }))).toBe(true);
    expect(isPageVisit(noDest({ ...old, accept: "*/*" }))).toBe(false);
    expect(isPageVisit(noDest(old))).toBe(false);
  });

  it("counts an in-app jump to the Studio (a next/link click), but not to the landing page or from another site", () => {
    // What the proxy sees for a client navigation: Next.js strips its rsc headers, the browser marks a same-origin fetch.
    const jump = { "sec-fetch-dest": "empty", "sec-fetch-mode": "cors", "sec-fetch-site": "same-origin", referer: "https://mercat-ai.vercel.app/" };
    expect(visitKind(visit("/studio?lang=uz", jump))).toBe("jump");
    expect(pageViewFrom(visit("/studio?mode=fresh&lang=ru", jump))).toMatchObject({ path: "studio", source: "internal" });
    expect(pageViewFrom(visit("/", jump))).toBeNull(); // links back to "/" may prefetch
    expect(pageViewFrom(visit("/studio", { ...jump, "sec-fetch-site": "cross-site" }))).toBeNull();
    expect(pageViewFrom(visit("/studio", { ...jump, "sec-fetch-mode": "no-cors" }))).toBeNull();
    expect(pageViewFrom(visit("/studio", { ...jump, "next-router-prefetch": "1" }))).toBeNull();
    expect(pageViewFrom(visit("/studio", { ...jump, "sec-purpose": "prefetch" }))).toBeNull();
    expect(pageViewFrom(visit("/studio", { ...jump, "user-agent": "TelegramBot (like TwitterBot)" }))).toBeNull();
    expect(visitKind(visit("/studio"))).toBe("load");
  });

  it("no link to /studio prefetches (the proxy could not tell a prefetch from a click)", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(join(__dirname, "..", "src"));
    const offenders: string[] = [];
    let links = 0;
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/<Link\b/g)) {
        const tag = text.slice(m.index, m.index + 400);
        const href = /href=(\{[^}]*\}|"[^"]*")/.exec(tag)?.[1] ?? "";
        const target = /href=\{\s*([A-Za-z_]\w*)\s*\}/.exec(tag)?.[1];
        const resolved = target ? (new RegExp(`const ${target}\\s*=\\s*([^;\\n]+)`).exec(text)?.[1] ?? "") : href;
        if (!/\/studio/.test(resolved)) continue;
        links += 1;
        if (!/prefetch=\{false\}/.test(tag.slice(0, tag.indexOf(">", tag.indexOf("href")) + 1))) offenders.push(`${file}: ${href}`);
      }
    }
    expect(links).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it("reads the client IP from the first forwarded hop", () => {
    expect(visitIp(new Headers({ "x-forwarded-for": "198.51.100.4, 10.0.0.1" }))).toBe("198.51.100.4");
    expect(visitIp(new Headers({ "x-real-ip": "198.51.100.5" }))).toBe("198.51.100.5");
    expect(visitIp(new Headers())).toBe("local");
  });
});

describe("VisitGuard (per-instance flood guard)", () => {
  it("writes one row per visitor and page per window, and caps rows per minute", () => {
    const guard = new VisitGuard(30 * 60_000, 3);
    const t0 = Date.UTC(2026, 10, 25, 10, 0, 0);
    expect(guard.take("v:a|landing", t0)).toBe(true);
    expect(guard.take("v:a|landing", t0 + 60_000)).toBe(false);
    expect(guard.take("v:a|studio", t0 + 1)).toBe(true);
    expect(guard.take("v:b|landing", t0 + 2)).toBe(true);
    expect(guard.take("v:c|landing", t0 + 3)).toBe(false); // 4th row in the same minute
    expect(guard.take("v:c|landing", t0 + 61_000)).toBe(true); // next minute
    expect(guard.take("v:a|landing", t0 + 31 * 60_000)).toBe(true); // window over
  });

  it("keeps its memory bounded", () => {
    const guard = new VisitGuard(60_000, 1_000_000, 10);
    for (let i = 0; i < 50; i++) expect(guard.take(`v:${i}|landing`, 1000 + i)).toBe(true);
  });
});

describe("event meta (surface, visitor, env on every event)", () => {
  it("tags env 'prod' only on Vercel production", () => {
    expect(eventEnv({ VERCEL_ENV: "production" })).toBe("prod");
    expect(eventEnv({ VERCEL_ENV: "preview" })).toBe("dev");
    expect(eventEnv({ NODE_ENV: "production" })).toBe("dev");
    expect(eventEnv({})).toBe("dev");
  });

  it("adds the ambient surface and visitor, and fills the Telegram id from the verified user", () => {
    expect(withEventMeta("brand_created", { brand_id: "b" }, null, { surface: "web", visitor: "v:1" }, "prod")).toEqual({
      telegramId: null,
      props: { brand_id: "b", surface: "web", visitor: "v:1", env: "prod" },
    });
    // A verified Telegram user: the id goes to telegram_id and the visitor key is not kept.
    expect(withEventMeta("posts_generated", {}, null, { surface: "miniapp", visitor: "v:1", telegramId: 42 }, "prod")).toEqual({
      telegramId: 42,
      props: { surface: "miniapp", env: "prod" },
    });
    expect(withEventMeta("posts_generated", {}, 7, { surface: "web", visitor: "v:1", telegramId: 42 }, "dev").telegramId).toBe(7);
  });

  it("infers the surface of bot and Mini App events logged outside a run", () => {
    expect(withEventMeta("start", {}, 5, undefined, "prod").props).toEqual({ surface: "bot", env: "prod" });
    expect(withEventMeta("miniapp_open", {}, 5, undefined, "prod").props.surface).toBe("miniapp");
    expect(withEventMeta("post_approved", {}, null, undefined, "prod").props).toEqual({ env: "prod" });
  });

  it("lets a surface or visitor the caller set win, drops an invalid surface, and never lets a caller pick env", () => {
    expect(withEventMeta("page_view", { surface: "web", visitor: "v:x", env: "dev" }, null, { surface: "bot", visitor: "v:y" }, "prod").props).toEqual({
      surface: "web",
      visitor: "v:x",
      env: "prod",
    });
    expect(withEventMeta("start", { surface: "mars" }, 1, undefined, "prod").props.surface).toBe("bot");
    // A dev machine cannot tag a row "prod", and keeps no visitor key at all.
    expect(withEventMeta("brand_created", { env: "prod", visitor: "v:x" }, null, { surface: "web", visitor: "v:y" }, "dev").props).toEqual({
      surface: "web",
      env: "dev",
    });
  });

  it("logEvent writes the meta inside a run and only the type's surface outside one", async () => {
    dbOn = true;
    vi.stubEnv("VERCEL_ENV", "production");
    await runWithEventMeta({ surface: "web", visitor: "v:0123456789abcdef" }, () => logEvent(null, "brand_created", { brand_id: "b1" }));
    await logEvent(9, "start", { payload: "landing" });
    await logEvent(null, "post_approved", { post_id: "p1" });
    expect(inserted).toEqual([
      { telegramId: null, type: "brand_created", props: { brand_id: "b1", surface: "web", visitor: "v:0123456789abcdef", env: "prod" } },
      { telegramId: 9, type: "start", props: { payload: "landing", surface: "bot", env: "prod" } },
      { telegramId: null, type: "post_approved", props: { post_id: "p1", env: "prod" } },
    ]);
  });

  it("the bot middleware tags everything the update logs", async () => {
    let seen: unknown;
    await botEventMeta({}, async () => {
      seen = currentEventMeta();
    });
    expect(seen).toEqual({ surface: "bot" });
    expect(currentEventMeta()).toBeUndefined();
  });
});

describe("request context feeds the event meta", () => {
  it("a bot/ route is the bot; a web run keeps its visitor; the verified user and the Mini App update it", async () => {
    const { runWithContext, setContextSurface, setContextUser } = await import("../src/lib/uslub/context");
    expect(runWithContext({ route: "bot/onboard", lang: "uz", telegramId: 5 }, () => currentEventMeta())).toEqual({
      surface: "bot",
      visitor: null,
      telegramId: 5,
    });
    const meta = runWithContext({ route: "uslub/brand", lang: "uz", telegramId: null, surface: "web", visitor: "v:1" }, () => {
      setContextUser(77);
      setContextSurface("miniapp");
      return currentEventMeta();
    });
    expect(meta).toEqual({ surface: "miniapp", visitor: "v:1", telegramId: 77 });
    // The analytics fields never land in the request context object itself.
    const ctx = runWithContext({ route: "uslub/brand", lang: "uz", telegramId: null, surface: "web", visitor: "v:1" }, async () =>
      (await import("../src/lib/uslub/context")).currentContext(),
    );
    expect(Object.keys((await ctx) ?? {}).sort()).toEqual(["lang", "route", "telegramId", "usage"]);
  });
});

describe("proxy counts page views and leaves the page alone", () => {
  it("counts nothing outside production, even with a database", async () => {
    dbOn = true;
    const { proxy } = await import("../src/proxy");
    const waitUntil = vi.fn();
    const req = new Request("https://mercat-ai.vercel.app/", {
      headers: { "user-agent": CHROME, "sec-fetch-dest": "document", "x-forwarded-for": "198.51.100.77" },
    });
    expect(proxy(req as never, { waitUntil } as never).headers.get("x-middleware-next")).toBe("1");
    expect(waitUntil).not.toHaveBeenCalled();
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(recordPageView(visit("/", { "x-forwarded-for": "198.51.100.78" }))).toBeNull();
    expect(inserted).toEqual([]);
  });

  it("hands the write to waitUntil for a counted visit and passes the request on", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const { proxy, config } = await import("../src/proxy");
    expect(config.matcher).toEqual(expect.arrayContaining(["/", "/studio", "/stats"]));
    const waitUntil = vi.fn();
    const at = (path: string, headers: Record<string, string> = {}) =>
      new Request(`https://mercat-ai.vercel.app${path}`, {
        headers: { "user-agent": CHROME, "sec-fetch-dest": "document", "x-forwarded-for": "198.51.100.9", ...headers },
      }) as never;

    const res = proxy(at("/?utm_source=ig"), { waitUntil } as never);
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("cache-control")).toBeNull();
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0][0];

    // Same visitor again within the window, a prefetch and a bot: nothing to write.
    proxy(at("/"), { waitUntil } as never);
    proxy(at("/studio", { "sec-purpose": "prefetch" }), { waitUntil } as never);
    proxy(at("/studio", { "user-agent": "TelegramBot (like TwitterBot)" }), { waitUntil } as never);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    // Without an event (should never happen) the page still passes.
    expect(proxy(at("/studio", { "x-forwarded-for": "198.51.100.10" })).headers.get("x-middleware-next")).toBe("1");
  });

  it("writes one page_view row with the env tag when the database is on", async () => {
    dbOn = true;
    vi.stubEnv("VERCEL_ENV", "production");
    const write = recordPageView(visit("/?src=booth7", { "x-forwarded-for": "192.0.2.44" }), new Date("2026-11-25T10:00:00Z"));
    await write;
    expect(inserted).toHaveLength(1);
    expect(inserted[0].type).toBe("page_view");
    expect(inserted[0].telegramId).toBeNull();
    expect(inserted[0].props).toMatchObject({ path: "landing", source: "booth7", surface: "web", env: "prod" });
    expect(inserted[0].props.visitor).toMatch(/^v:[0-9a-f]{16}$/);
  });
});
