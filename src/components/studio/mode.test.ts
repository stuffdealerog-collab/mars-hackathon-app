import { describe, expect, it } from "vitest";
import { defaultPro, safeTab } from "./mode";

describe("defaultPro", () => {
  it("opens in Simple when nothing was saved and the address says nothing", () => {
    expect(defaultPro({})).toBe(false);
    expect(defaultPro({ saved: null, forced: null })).toBe(false);
  });
  it("keeps the choice saved on this device", () => {
    expect(defaultPro({ saved: "1" })).toBe(true);
    expect(defaultPro({ saved: "0" })).toBe(false);
    expect(defaultPro({ saved: "yes" })).toBe(false);
  });
  it("?ui=pro|simple wins over the saved choice", () => {
    expect(defaultPro({ saved: "0", forced: true })).toBe(true);
    expect(defaultPro({ saved: "1", forced: false })).toBe(false);
  });
});

describe("safeTab", () => {
  it("keeps the sections that exist", () => {
    expect(safeTab("channel")).toBe("channel");
    expect(safeTab("posts")).toBe("posts");
    expect(safeTab("dept")).toBe("dept");
  });
  it("sends a stale «video» (the tab that was removed) and junk to Postlar", () => {
    expect(safeTab("video")).toBe("posts");
    expect(safeTab("")).toBe("posts");
    expect(safeTab(null)).toBe("posts");
    expect(safeTab(undefined)).toBe("posts");
  });
});
