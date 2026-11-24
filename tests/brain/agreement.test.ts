import { describe, expect, it } from "vitest";
import { parseCsv, weightedKappa } from "./eval/agreement";

describe("eval agreement math", () => {
  it("parses quoted CSV with commas, quotes and newlines", () => {
    expect(parseCsv('a,b\n"x, y","he said ""hi"""\n')).toEqual([
      ["a", "b"],
      ["x, y", 'he said "hi"'],
    ]);
  });
  it("weighted kappa: 1 for perfect agreement, ~0 for chance, negative for opposite", () => {
    expect(weightedKappa([1, 2, 3, 2], [1, 2, 3, 2])).toBe(1);
    expect(weightedKappa([1, 3, 1, 3], [3, 1, 3, 1])).toBeLessThan(0);
    expect(weightedKappa([1, 1, 2, 2], [1, 2, 1, 2])).toBeCloseTo(0, 5);
    expect(weightedKappa([2, 1, 2], [2, 2, 1], 2)).toBeLessThan(1);
    expect(weightedKappa([], [])).toBeNull();
  });
});
