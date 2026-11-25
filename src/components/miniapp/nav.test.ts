import { beforeEach, describe, expect, it } from "vitest";
import { canGoBack, useNav } from "./nav";

const nav = () => useNav.getState();

beforeEach(() => {
  useNav.setState({ stack: [], sheet: null, sheetLeaving: false, intro: null, introOnly: null, introFrom: "boot" });
});

describe("Back and the add-the-bot card", () => {
  it("opened over the channel sheet: Back closes the card, the sheet stays", () => {
    nav().openSheet({ name: "channel", postId: "p1" });
    nav().openIntro("admin", "over");
    expect(canGoBack(nav())).toBe(true);

    expect(nav().back()).toBe(true);
    expect(nav().intro).toBe(null);
    expect(nav().sheet).toEqual({ name: "channel", postId: "p1" });
    expect(nav().sheetLeaving).toBe(false);
    // The next Back closes the sheet, as before the card existed.
    expect(canGoBack(nav())).toBe(true);
  });

  it("at launch (the app's own decision): Back stays inside the card, as before", () => {
    nav().openIntro("admin");
    expect(nav().introFrom).toBe("boot");
    expect(canGoBack(nav())).toBe(false);
    expect(nav().back()).toBe(false);
    expect(nav().intro).toBe(0);
  });

  it("the whole intro: Back walks its steps and stops at the first", () => {
    nav().openIntro();
    nav().setIntroStep(2);
    expect(canGoBack(nav())).toBe(true);
    expect(nav().back()).toBe(true);
    expect(nav().intro).toBe(1);
    nav().back();
    expect(nav().intro).toBe(0);
    expect(canGoBack(nav())).toBe(false);
    expect(nav().back()).toBe(false);
  });

  it("a later launch-time open is not mistaken for one over a sheet", () => {
    nav().openIntro("admin", "over");
    nav().closeIntro();
    nav().openIntro("admin");
    expect(nav().introFrom).toBe("boot");
    expect(canGoBack(nav())).toBe(false);
  });
});
