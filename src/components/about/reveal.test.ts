import { describe, expect, it } from "vitest";
import { COUNT_MS, countAt, countEase, countFrom, visibleShare } from "./reveal";

describe("the count-up", () => {
  it("starts at about two thirds of the figure, never at zero", () => {
    expect(countFrom(60)).toBe(39);
    expect(countFrom(20)).toBe(13);
    for (let n = 1; n < 2000; n += 7) expect(countFrom(n)).toBeGreaterThan(0);
  });

  it("ends exactly on the figure, never above it", () => {
    for (const to of [20, 60, 90, 1200]) {
      const from = countFrom(to);
      let prev = from;
      for (let ms = 0; ms <= COUNT_MS + 50; ms += 16) {
        const v = countAt(from, to, ms);
        expect(v).toBeGreaterThanOrEqual(prev);
        expect(v).toBeLessThanOrEqual(to);
        prev = v;
      }
      expect(countAt(from, to, COUNT_MS)).toBe(to);
    }
  });

  it("lands softly without a long tail: no number holds much longer than the average step", () => {
    for (const to of [40, 60, 90, 300]) {
      const from = countFrom(to);
      const frames = Array.from({ length: Math.ceil(COUNT_MS / 16.7) + 1 }, (_, i) => countAt(from, to, i * 16.7));
      let run = 1;
      let longest = 1;
      for (let i = 1; i < frames.length; i += 1) {
        run = frames[i] === frames[i - 1] ? run + 1 : 1;
        longest = Math.max(longest, run);
      }
      // The end's slope is 0.6 of the average: a number holds at most ~1.7 average steps (at 60 fps).
      const average = frames.length / (to - from + 1);
      expect(longest).toBeLessThanOrEqual(Math.max(2, Math.ceil(1.7 * average)));
    }
    expect(countEase(0)).toBe(0);
    expect(countEase(1)).toBe(1);
    expect(countEase(2)).toBe(1);
  });

  it("stays within a little over half a second", () => {
    expect(COUNT_MS).toBeGreaterThanOrEqual(450);
    expect(COUNT_MS).toBeLessThanOrEqual(600);
  });
});

describe("visibleShare", () => {
  it("counts a tall element as fully in view once it fills the window", () => {
    expect(visibleShare(800, 2000, 800)).toBe(1);
    expect(visibleShare(400, 2000, 800)).toBe(0.5);
    expect(visibleShare(100, 200, 800)).toBe(0.5);
    expect(visibleShare(0, 0, 800)).toBe(0);
  });
});
