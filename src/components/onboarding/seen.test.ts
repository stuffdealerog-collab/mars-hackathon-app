import { describe, expect, it } from "vitest";
import { decideIntro, forcedByUrl, forcedIntro, INTRO_LOCAL_KEY, INTRO_VERSION, introSeen, localIntro, seenValue, seenVersion } from "./seen";

function memory(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("seenVersion / introSeen", () => {
  it("is 0 / false when nothing was stored", () => {
    expect(seenVersion()).toBe(0);
    expect(seenVersion(null, undefined, "")).toBe(0);
    expect(introSeen()).toBe(false);
  });
  it("takes the newest version any store remembers", () => {
    expect(seenVersion("1", null, "2")).toBe(2);
    expect(introSeen(String(INTRO_VERSION))).toBe(true);
    expect(introSeen(null, String(INTRO_VERSION + 1))).toBe(true);
  });
  it("an older version and junk are not this version", () => {
    expect(introSeen(String(INTRO_VERSION - 1))).toBe(false);
    expect(introSeen("yes", "NaN")).toBe(false);
    expect(seenVersion("yes", "NaN", "-3")).toBe(0);
  });
  it("version 2 is the intro with the add-the-bot card", () => {
    expect(INTRO_VERSION).toBe(2);
  });
});

describe("decideIntro", () => {
  const base = { seen: 0, returning: false, withIntent: false };
  it("shows the whole intro on an ordinary first open", () => {
    expect(decideIntro(base)).toEqual({ show: true });
  });
  it("never shows this version twice", () => {
    expect(decideIntro({ ...base, seen: INTRO_VERSION })).toEqual({ show: false });
    expect(decideIntro({ ...base, seen: INTRO_VERSION, returning: true })).toEqual({ show: false });
  });
  it("someone who saw the old intro gets only the add-the-bot card", () => {
    expect(decideIntro({ ...base, seen: 1 })).toEqual({ show: true, only: "admin" });
  });
  it("a returning owner gets only the add-the-bot card", () => {
    expect(decideIntro({ ...base, returning: true })).toEqual({ show: true, only: "admin" });
  });
  it("waits when the app was opened with a channel or brand link", () => {
    expect(decideIntro({ ...base, withIntent: true })).toEqual({ show: false });
    expect(decideIntro({ ...base, seen: 1, withIntent: true })).toEqual({ show: false });
  });
  it("force always shows: the whole intro, or the card alone", () => {
    expect(decideIntro({ seen: INTRO_VERSION, returning: true, withIntent: true, force: "all" })).toEqual({ show: true });
    expect(decideIntro({ ...base, force: "admin" })).toEqual({ show: true, only: "admin" });
  });
});

describe("localIntro", () => {
  it("reads and writes the versioned flag", () => {
    const s = memory();
    expect(localIntro.seen(s)).toBe(false);
    expect(localIntro.version(s)).toBe(0);
    localIntro.mark(s);
    expect(s.m.get(INTRO_LOCAL_KEY)).toBe(seenValue());
    expect(localIntro.seen(s)).toBe(true);
    expect(localIntro.version(s)).toBe(INTRO_VERSION);
  });
  it("an old flag is remembered as its version, not as seen", () => {
    const s = memory({ [INTRO_LOCAL_KEY]: "1" });
    expect(localIntro.version(s)).toBe(1);
    expect(localIntro.seen(s)).toBe(false);
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
    expect(localIntro.version(blocked)).toBe(0);
    expect(() => localIntro.mark(blocked)).not.toThrow();
    expect(localIntro.seen(null)).toBe(false);
  });
});

describe("forcedIntro", () => {
  it("opens the whole intro on ?intro=1 and the card alone on ?intro=admin", () => {
    expect(forcedIntro("?intro=1")).toBe("all");
    expect(forcedIntro("?preview=dark&intro=1")).toBe("all");
    expect(forcedIntro("?intro=admin")).toBe("admin");
    expect(forcedIntro("?intro=0")).toBe(null);
    expect(forcedIntro("")).toBe(null);
  });
  it("forcedByUrl stays a yes/no", () => {
    expect(forcedByUrl("?intro=1")).toBe(true);
    expect(forcedByUrl("?intro=admin")).toBe(true);
    expect(forcedByUrl("?intro=0")).toBe(false);
  });
});
