import { describe, expect, it } from "vitest";
import { isCleanLanding, isSafeQueryKey, referrerIsClean, staysOnLanding } from "./landing";

const O = "https://mercat-ai.vercel.app";
const BRAND = "00000000-0000-0000-0000-000000000000";

describe("staysOnLanding", () => {
  it("lets the landing keep its language and campaign tags", () => {
    expect(staysOnLanding(`${O}/`, O)).toBe(true);
    expect(staysOnLanding(`${O}/?lang=ru`, O)).toBe(true);
    expect(staysOnLanding(`${O}/?lang=en&utm_source=tg&utm_campaign=x&ysclid=1&yclid=2&gclid=3&fbclid=4`, O)).toBe(true);
    expect(staysOnLanding("/?lang=uz", O)).toBe(true);
  });

  it("sends every other page to a full load", () => {
    expect(staysOnLanding(`${O}/studio`, O)).toBe(false);
    expect(staysOnLanding(`${O}/studio?channel=t.me%2Fnon`, O)).toBe(false);
    expect(staysOnLanding(`${O}/studio?mode=fresh`, O)).toBe(false);
    expect(staysOnLanding(`${O}/tg`, O)).toBe(false);
    expect(staysOnLanding(`${O}/stats`, O)).toBe(false);
    expect(staysOnLanding("/studio?brand=x", O)).toBe(false);
  });

  it("treats the landing with a brand id or any unknown key as leaving it", () => {
    expect(staysOnLanding(`${O}/?lang=ru&brand=${BRAND}`, O)).toBe(false);
    expect(staysOnLanding(`${O}/?k=SECRETKEY`, O)).toBe(false);
    expect(staysOnLanding(`${O}/?channel=t.me%2Fnon`, O)).toBe(false);
    expect(staysOnLanding(`${O}/?tgWebAppStartParam=brand_${BRAND}`, O)).toBe(false);
  });

  it("never stays for another origin or a broken address", () => {
    expect(staysOnLanding("https://example.com/", O)).toBe(false);
    expect(staysOnLanding("http://[", O)).toBe(false);
  });
});

describe("isCleanLanding", () => {
  it("wants no fragment at all", () => {
    expect(isCleanLanding(`${O}/?lang=ru`, O)).toBe(true);
    expect(isCleanLanding(`${O}/#k=SECRETKEY`, O)).toBe(false);
    expect(isCleanLanding(`${O}/#tgWebAppData=user%3D1`, O)).toBe(false);
    expect(isCleanLanding(`${O}/#`, O)).toBe(false);
    expect(isCleanLanding(`${O}/studio?lang=ru`, O)).toBe(false);
  });
});

describe("referrerIsClean", () => {
  it("accepts no referrer, other sites, and our pages without secrets", () => {
    expect(referrerIsClean("", O)).toBe(true);
    expect(referrerIsClean("https://www.google.com/", O)).toBe(true);
    expect(referrerIsClean("https://t.me/", O)).toBe(true);
    expect(referrerIsClean(`${O}/studio`, O)).toBe(true);
    expect(referrerIsClean(`${O}/?lang=ru`, O)).toBe(true);
  });

  it("refuses our own page whose address carries an id", () => {
    expect(referrerIsClean(`${O}/studio?lang=ru&brand=${BRAND}`, O)).toBe(false);
    expect(referrerIsClean(`${O}/studio?channel=t.me%2Fnon`, O)).toBe(false);
    expect(referrerIsClean(`${O}/tg?tgWebAppStartParam=brand_${BRAND}`, O)).toBe(false);
    expect(referrerIsClean("not a url", O)).toBe(false);
  });
});

describe("isSafeQueryKey", () => {
  it("knows the language and campaign keys only", () => {
    for (const k of ["lang", "utm_source", "utm_medium", "ysclid", "yclid", "gclid", "fbclid"]) expect(isSafeQueryKey(k)).toBe(true);
    for (const k of ["brand", "k", "channel", "mode", "mock", "post", "intro", "tgWebAppStartParam", ""]) expect(isSafeQueryKey(k)).toBe(false);
  });
});
