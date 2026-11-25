import type { ChannelAudit } from "@/lib/uslub/contract";
import { describe, expect, it } from "vitest";
import { otherFindings, topFindings } from "./findings";

type F = ChannelAudit["findings"][number];
const f = (kind: F["kind"], text: string): F => ({ kind, text }) as F;

const audit = {
  findings: [f("strength", "s1"), f("opportunity", "o1"), f("problem", "p1"), f("strength", "s2"), f("problem", "p2"), f("opportunity", "o2")],
};

describe("topFindings", () => {
  it("orders problem, opportunity, strength and returns three", () => {
    expect(topFindings(audit).map((x) => x.text)).toEqual(["p1", "p2", "o1"]);
  });
  it("returns fewer when there are fewer", () => {
    expect(topFindings({ findings: [f("strength", "s")] }).map((x) => x.text)).toEqual(["s"]);
    expect(topFindings({ findings: [] })).toEqual([]);
  });
});

describe("otherFindings", () => {
  it("is exactly the findings the top three left out, in the audit's order", () => {
    expect(otherFindings(audit).map((x) => x.text)).toEqual(["s1", "s2", "o2"]);
  });
  it("is empty when the top three show everything", () => {
    expect(otherFindings({ findings: [f("problem", "p"), f("strength", "s")] })).toEqual([]);
  });
  it("tells apart two findings with the same text", () => {
    const same = { findings: [f("problem", "x"), f("problem", "x"), f("problem", "x"), f("problem", "x")] };
    expect(otherFindings(same)).toHaveLength(1);
  });
});
