import { describe, expect, it } from "vitest";
import { launchTarget } from "./launch";

const BRAND = "179b0025-d3ef-4674-af8c-f545b6f80158";
const POST = "d0f7a62c-9fda-4ef1-a9f2-c0ffee000001";

describe("launchTarget", () => {
  it("opens the brand from the desktop Studio's startapp=brand_<id>", () => {
    expect(launchTarget("", `brand_${BRAND}`)).toEqual({ brand: BRAND, post: null, channel: null });
  });

  it("reads tgWebAppStartParam when the client sets no start_param", () => {
    expect(launchTarget(`?tgWebAppStartParam=brand_${BRAND}`, undefined).brand).toBe(BRAND);
  });

  it("prefers the bot button's ?brand= and keeps ?post=", () => {
    expect(launchTarget(`?brand=${BRAND}&post=${POST}`, "brand_other-id-000")).toEqual({ brand: BRAND, post: POST, channel: null });
  });

  it("opens a post from startapp=post_<id>", () => {
    expect(launchTarget("", `post_${POST}`)).toEqual({ brand: null, post: POST, channel: null });
  });

  it("starts a channel from ?channel= or startapp=ch_<name>", () => {
    expect(launchTarget("?channel=t.me/lifesmileuz", null).channel).toBe("t.me/lifesmileuz");
    expect(launchTarget("", "ch_lifesmileuz").channel).toBe("lifesmileuz");
  });

  it("ignores ids that are not ids", () => {
    expect(launchTarget("?brand=../../etc", "brand_").brand).toBeNull();
    expect(launchTarget("", "brand_x").brand).toBeNull();
  });

  it("opens nothing for an ordinary launch", () => {
    expect(launchTarget("", "")).toEqual({ brand: null, post: null, channel: null });
  });
});
