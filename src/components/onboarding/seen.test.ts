import { describe, expect, it } from "vitest";
import { decideIntro, forcedByUrl, INTRO_LOCAL_KEY, INTRO_VERSION, introSeen, localIntro, seenValue } from "./seen";

function memory(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("introSeen", () => {
  it("is false when nothing was stored", () => {
    expect(introSeen()).toBe(false);
    expect(introSeen(null, undefined, "")).toBe(false);
  });
  it("is true for this version or a later one, from any store", () => {
    expect(introSeen(String(INTRO_VERSION))).toBe(true);
    expect(introSeen(null, String(INTRO_VERSION + 1))).toBe(true);
  });
  it("ignores an older version and junk", () => {
    expect(introSeen(String(INTRO_VERSION - 1))).toBe(false);
    expect(introSeen("yes", "NaN")).toBe(false);
  });
});

describe("decideIntro", () => {
  const base = { seen: false, returning: false, withIntent: false };
  it("shows on an ordinary first open", () => {
    expect(decideIntro(base)).toEqual({ show: true, mark: false });
  });
  it("never shows twice", () => {
    expect(decideIntro({ ...base, seen: true })).toEqual({ show: false, mark: false });
  });
  it("skips a returning owner and remembers it", () => {
    expect(decideIntro({ ...base, returning: true })).toEqual({ show: false, mark: true });
  });
  it("waits when the app was opened with a channel or brand link", () => {
    expect(decideIntro({ ...base, withIntent: true })).toEqual({ show: false, mark: false });
  });
  it("seen wins over returning (nothing to write again)", () => {
    expect(decideIntro({ ...base, seen: true, returning: true })).toEqual({ show: false, mark: false });
  });
  it("force always shows and writes nothing up front", () => {
    expect(decideIntro({ seen: true, returning: true, withIntent: true, force: true })).toEqual({ show: true, mark: false });
  });
});

describe("localIntro", () => {
  it("reads and writes the versioned flag", () => {
    const s = memory();
    expect(localIntro.seen(s)).toBe(false);
    localIntro.mark(s);
    expect(s.m.get(INTRO_LOCAL_KEY)).toBe(seenValue());
    expect(localIntro.seen(s)).toBe(true);
  });
  it("never throws when storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(localIntro.seen(blocked)).toBe(false);
    expect(() => localIntro.mark(blocked)).not.toThrow();
    expect(localIntro.seen(null)).toBe(false);
  });
});

describe("forcedByUrl", () => {
  it("opens on ?intro=1 only", () => {
    expect(forcedByUrl("?intro=1")).toBe(true);
    expect(forcedByUrl("?preview=dark&intro=1")).toBe(true);
    expect(forcedByUrl("?intro=0")).toBe(false);
    expect(forcedByUrl("")).toBe(false);
  });
});
