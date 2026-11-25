import { describe, expect, it } from "vitest";
import { shownScripts, splitScripts } from "./scripts";

describe("splitScripts", () => {
  it("puts English under «more» for a channel that writes Uzbek and Russian", () => {
    expect(splitScripts(["uz_latn", "uz_cyrl", "ru", "en"], ["uz_latn", "ru"])).toEqual({ main: ["uz_latn", "uz_cyrl", "ru"], more: ["en"] });
  });
  it("keeps English in the switch when the channel itself writes English", () => {
    expect(splitScripts(["uz_latn", "uz_cyrl", "ru", "en"], ["ru", "en"])).toEqual({ main: ["uz_latn", "uz_cyrl", "ru", "en"], more: [] });
  });
  it("keeps a stable order whatever order it is given", () => {
    expect(splitScripts(["en", "ru", "uz_cyrl", "uz_latn"], ["ru", "uz_latn"]).main).toEqual(["uz_latn", "uz_cyrl", "ru"]);
  });
  it("lists only the scripts that exist", () => {
    expect(splitScripts(["uz_latn", "uz_cyrl"], ["uz_latn"])).toEqual({ main: ["uz_latn", "uz_cyrl"], more: [] });
    expect(splitScripts([], [])).toEqual({ main: [], more: [] });
  });
  it("without channel languages English is a side option", () => {
    expect(splitScripts(["uz_latn", "en"])).toEqual({ main: ["uz_latn"], more: ["en"] });
  });
});

describe("shownScripts", () => {
  const split = { main: ["uz_latn" as const, "uz_cyrl" as const, "ru" as const], more: ["en" as const] };
  it("shows only the main ones until «more» is pressed", () => {
    expect(shownScripts(split, false)).toEqual(["uz_latn", "uz_cyrl", "ru"]);
    expect(shownScripts(split, true)).toEqual(["uz_latn", "uz_cyrl", "ru", "en"]);
  });
  it("keeps a side script in view while it is the one on screen", () => {
    expect(shownScripts(split, false, "en")).toEqual(["uz_latn", "uz_cyrl", "ru", "en"]);
    expect(shownScripts(split, false, "ru")).toEqual(["uz_latn", "uz_cyrl", "ru"]);
  });
});
