import { describe, expect, it } from "vitest";
import { cleanUrl } from "./clean-url";

const ORIGIN = "https://mercat-ai.vercel.app";
const BRAND = "00000000-0000-0000-0000-000000000000";

describe("cleanUrl", () => {
  it("drops the Studio's ?brand= and the bot's #k= key, keeps the path", () => {
    expect(cleanUrl(`${ORIGIN}/studio?lang=ru&brand=${BRAND}#k=SECRETKEY`)).toBe(`${ORIGIN}/studio`);
  });

  it("drops Telegram's #tgWebAppData= from the Mini App address", () => {
    expect(cleanUrl(`${ORIGIN}/tg#tgWebAppData=user%3D%7B%22id%22%3A1%7D&tgWebAppVersion=8.0`)).toBe(`${ORIGIN}/tg`);
  });

  it("drops a query alone and a fragment alone", () => {
    expect(cleanUrl(`${ORIGIN}/?lang=ru`)).toBe(`${ORIGIN}/`);
    expect(cleanUrl(`${ORIGIN}/studio#k=SECRETKEY`)).toBe(`${ORIGIN}/studio`);
    expect(cleanUrl(`${ORIGIN}/studio?#`)).toBe(`${ORIGIN}/studio`);
  });

  it("keeps the trailing slash exactly as written", () => {
    expect(cleanUrl(`${ORIGIN}/studio/`)).toBe(`${ORIGIN}/studio/`);
    expect(cleanUrl(`${ORIGIN}/studio`)).toBe(`${ORIGIN}/studio`);
    expect(cleanUrl(`${ORIGIN}/tg/intro/?x=1`)).toBe(`${ORIGIN}/tg/intro/`);
  });

  it("gives the root as a single slash, with or without one in the input", () => {
    expect(cleanUrl(ORIGIN)).toBe(`${ORIGIN}/`);
    expect(cleanUrl(`${ORIGIN}?lang=uz`)).toBe(`${ORIGIN}/`);
    expect(cleanUrl(`${ORIGIN}#top`)).toBe(`${ORIGIN}/`);
  });

  it("keeps a port and drops user info", () => {
    expect(cleanUrl("http://localhost:3000/studio?brand=x#k=y")).toBe("http://localhost:3000/studio");
    expect(cleanUrl("https://user:pass@example.com/a?b=c")).toBe("https://example.com/a");
  });

  it("cleans a referrer the same way, including an app referrer", () => {
    expect(cleanUrl("https://www.google.com/search?q=mercat#frag")).toBe("https://www.google.com/search");
    expect(cleanUrl("android-app://org.telegram.messenger/?x=1")).toBe("android-app://org.telegram.messenger/");
  });

  it("gives an empty string for no referrer, a hostless address or a broken one", () => {
    expect(cleanUrl("")).toBe("");
    expect(cleanUrl("about:blank")).toBe("");
    expect(cleanUrl("not a url?brand=x")).toBe("");
  });

  it("never returns a query or a fragment", () => {
    const inputs = [
      `${ORIGIN}/studio?brand=${BRAND}#k=SECRETKEY`,
      `${ORIGIN}/tg#tgWebAppData=user%3Dsecret`,
      `${ORIGIN}/a%3Fb/c?d#e`,
      "https://example.com/?",
      "https://example.com/#",
    ];
    for (const input of inputs) {
      const out = cleanUrl(input);
      expect(out).not.toMatch(/[?#]/);
      expect(out).not.toMatch(/SECRETKEY|brand=|tgWebAppData/);
    }
  });
});
