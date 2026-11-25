import { describe, expect, it } from "vitest";
import { ABOUT_PATH, COUNTED_PATHS, countedPathOf, isCleanLanding, isSafeQueryKey, referrerIsClean, sessionHistoryIsClean, staysOnLanding } from "./landing";

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

describe("sessionHistoryIsClean", () => {
  const studio = `${O}/studio?lang=ru&brand=${BRAND}`;

  it("refuses the reloaded '/' of Studio -> logo -> reload: Back would show the Studio's address in it", () => {
    const entries = [
      { url: studio, sameDocument: true },
      { url: `${O}/`, sameDocument: true },
    ];
    expect(sessionHistoryIsClean(O, entries, "reload", 2)).toBe(false);
    expect(sessionHistoryIsClean(O, entries, "back_forward", 2)).toBe(false);
  });

  it("refuses a Studio entry ahead of the landing too (Forward)", () => {
    expect(sessionHistoryIsClean(O, [{ url: `${O}/?lang=ru`, sameDocument: true }, { url: studio, sameDocument: true }], "back_forward", 2)).toBe(false);
  });

  it("refuses a same-document entry whose address it cannot read", () => {
    expect(sessionHistoryIsClean(O, [{ url: null, sameDocument: true }, { url: `${O}/`, sameDocument: true }], "navigate", 2)).toBe(false);
  });

  it("ignores entries of other documents: they are a full load away", () => {
    const entries = [
      { url: studio, sameDocument: false },
      { url: null, sameDocument: false },
      { url: `${O}/?lang=ru`, sameDocument: true },
    ];
    expect(sessionHistoryIsClean(O, entries, "navigate", 3)).toBe(true);
    expect(sessionHistoryIsClean(O, entries, "reload", 3)).toBe(true);
  });

  it("accepts landing-only entries in the same document", () => {
    expect(sessionHistoryIsClean(O, [{ url: `${O}/`, sameDocument: true }, { url: `${O}/?lang=en`, sameDocument: true }], "reload", 2)).toBe(true);
  });

  it("without the Navigation API, counts only a fresh load or a tab with no history behind it", () => {
    expect(sessionHistoryIsClean(O, null, "navigate", 5)).toBe(true);
    expect(sessionHistoryIsClean(O, null, "reload", 1)).toBe(true);
    expect(sessionHistoryIsClean(O, null, "reload", 2)).toBe(false);
    expect(sessionHistoryIsClean(O, null, "back_forward", 3)).toBe(false);
    expect(sessionHistoryIsClean(O, null, undefined, 3)).toBe(true);
  });
});

describe("isSafeQueryKey", () => {
  it("knows the language and campaign keys only", () => {
    for (const k of ["lang", "utm_source", "utm_medium", "ysclid", "yclid", "gclid", "fbclid"]) expect(isSafeQueryKey(k)).toBe(true);
    for (const k of ["brand", "k", "channel", "mode", "mock", "post", "intro", "tgWebAppStartParam", ""]) expect(isSafeQueryKey(k)).toBe(false);
  });
});

describe("the explainer (/about) as a second counted page", () => {
  it("counts only '/' and '/about'", () => {
    expect(COUNTED_PATHS).toEqual(["/", "/about"]);
  });

  it("knows which counted page a document opened on", () => {
    expect(countedPathOf(`${O}/`, O)).toBe("/");
    expect(countedPathOf(`${O}/?lang=ru&utm_source=tg`, O)).toBe("/");
    expect(countedPathOf(`${O}/about`, O)).toBe("/about");
    expect(countedPathOf(`${O}/about?lang=en`, O)).toBe("/about");
    expect(countedPathOf("/about?lang=uz", O)).toBe("/about");
  });

  it("refuses every other page, an unknown key, another origin and Telegram's addresses", () => {
    expect(countedPathOf(`${O}/studio?lang=ru`, O)).toBeNull();
    expect(countedPathOf(`${O}/about/x`, O)).toBeNull();
    expect(countedPathOf(`${O}/about?brand=${BRAND}`, O)).toBeNull();
    expect(countedPathOf(`${O}/about?k=SECRETKEY`, O)).toBeNull();
    expect(countedPathOf(`${O}/?tgWebAppStartParam=x`, O)).toBeNull();
    expect(countedPathOf(`${O}/about#tgWebAppData=user%3D1`, O)).toBeNull();
    expect(countedPathOf("https://example.com/about", O)).toBeNull();
    expect(countedPathOf("http://[", O)).toBeNull();
  });

  it("keeps an /about document on /about: the landing and the Studio are full loads from it", () => {
    expect(staysOnLanding(`${O}/about?lang=ru`, O, ABOUT_PATH)).toBe(true);
    expect(staysOnLanding(`${O}/about?lang=ru&utm_campaign=x`, O, ABOUT_PATH)).toBe(true);
    expect(staysOnLanding(`${O}/`, O, ABOUT_PATH)).toBe(false);
    expect(staysOnLanding(`${O}/studio?lang=ru`, O, ABOUT_PATH)).toBe(false);
    expect(staysOnLanding(`${O}/about?brand=${BRAND}`, O, ABOUT_PATH)).toBe(false);
  });

  it("keeps a landing document off /about too: each document counts one page", () => {
    expect(staysOnLanding(`${O}/about?lang=ru`, O)).toBe(false);
    expect(staysOnLanding(`${O}/about`, O, "/")).toBe(false);
  });

  it("wants a clean address and a clean history on /about as on the landing", () => {
    expect(isCleanLanding(`${O}/about?lang=ru`, O, ABOUT_PATH)).toBe(true);
    expect(isCleanLanding(`${O}/about#x`, O, ABOUT_PATH)).toBe(false);
    const studio = `${O}/studio?lang=ru&brand=${BRAND}`;
    expect(sessionHistoryIsClean(O, [{ url: `${O}/about?lang=ru`, sameDocument: true }], "navigate", 1, ABOUT_PATH)).toBe(true);
    expect(sessionHistoryIsClean(O, [{ url: studio, sameDocument: true }, { url: `${O}/about`, sameDocument: true }], "reload", 2, ABOUT_PATH)).toBe(false);
    expect(sessionHistoryIsClean(O, [{ url: `${O}/`, sameDocument: true }, { url: `${O}/about`, sameDocument: true }], "navigate", 2, ABOUT_PATH)).toBe(false);
    expect(sessionHistoryIsClean(O, [{ url: `${O}/`, sameDocument: false }, { url: `${O}/about`, sameDocument: true }], "navigate", 2, ABOUT_PATH)).toBe(true);
  });
});
