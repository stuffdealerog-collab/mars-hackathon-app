import type { AgentRole } from "@/lib/uslub/contract";
import { describe, expect, it } from "vitest";
import { LAMP_ORDER, OWNER_LAMPS, withOutcomes, type LampState } from "./lamps";

const dark = () => Object.fromEntries(LAMP_ORDER.map((r) => [r, "off"])) as Record<AgentRole, LampState>;
type L = { state: Record<AgentRole, LampState>; words: Partial<Record<AgentRole, string>>; outcome?: Partial<Record<AgentRole, string>> };
const lampsOf = (state = dark(), words: L["words"] = {}): L => ({ state, words });

describe("OWNER_LAMPS", () => {
  it("is the eight employees that work for the owner today, in pipeline order", () => {
    expect(OWNER_LAMPS).toEqual(["brand", "analyst", "strategist", "copywriter", "editor", "translator", "designer", "publisher"]);
    expect(OWNER_LAMPS).toHaveLength(8);
  });
  it("never shows the lamps that have no screen yet", () => {
    expect(OWNER_LAMPS).not.toContain("video");
    expect(OWNER_LAMPS).not.toContain("radar");
  });
  it("keeps the order of the full list", () => {
    const at = OWNER_LAMPS.map((r) => LAMP_ORDER.indexOf(r));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
});

describe("withOutcomes", () => {
  it("changes nothing without measured results", () => {
    const lamps = lampsOf();
    expect(withOutcomes(lamps)).toBe(lamps);
    expect(withOutcomes(lamps, {})).toBe(lamps);
    expect(withOutcomes(lamps, { publisher: "  ", analyst: null })).toBe(lamps);
  });
  it("labels a lamp with its result and lights a dark one", () => {
    const out = withOutcomes(lampsOf(), { publisher: " 3 post chiqdi " });
    expect(out.outcome?.publisher).toBe("3 post chiqdi");
    expect(out.words.publisher).toBe("3 post chiqdi");
    expect(out.state.publisher).toBe("on");
    expect(out.state.analyst).toBe("off");
  });
  it("keeps a working or failed lamp's state (the light still means work)", () => {
    const state = { ...dark(), analyst: "warming" as LampState, designer: "error" as LampState };
    const out = withOutcomes(lampsOf(state, { analyst: "60 post o‘qildi" }), { analyst: "+120 medianaga", designer: "2 rasm" });
    expect(out.state.analyst).toBe("warming");
    expect(out.state.designer).toBe("error");
    expect(out.words.analyst).toBe("+120 medianaga");
  });
  it("does not change the lamps it was given", () => {
    const lamps = lampsOf();
    withOutcomes(lamps, { publisher: "1 ta post chiqdi" });
    expect(lamps.state.publisher).toBe("off");
    expect(lamps.words).toEqual({});
  });
});
