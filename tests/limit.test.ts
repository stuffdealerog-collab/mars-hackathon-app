import { describe, expect, it } from "vitest";
import { createOnboardGate, InFlight, RateLimiter } from "../src/lib/uslub/limit";

describe("RateLimiter", () => {
  it("allows `limit` hits per window per key, then reports the wait", () => {
    const rl = new RateLimiter(2, 60_000);
    expect(rl.take("a", 0)).toEqual({ ok: true });
    expect(rl.take("a", 1000)).toEqual({ ok: true });
    const third = rl.take("a", 2000);
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.retryAfterMs).toBe(58_000);
    expect(rl.take("b", 2000)).toEqual({ ok: true }); // other keys unaffected
    expect(rl.take("a", 60_001)).toEqual({ ok: true }); // window slid
  });
});

describe("InFlight", () => {
  it("allows one job per key", () => {
    const f = new InFlight();
    expect(f.tryStart("u1")).toBe(true);
    expect(f.tryStart("u1")).toBe(false);
    f.end("u1");
    expect(f.tryStart("u1")).toBe(true);
  });
});

describe("bot onboarding gate", () => {
  it("blocks a second onboarding while one is running", () => {
    const gate = createOnboardGate(5);
    expect(gate.enter(1, 0)).toEqual({ ok: true });
    expect(gate.enter(1, 10)).toEqual({ ok: false, reason: "busy" });
    expect(gate.enter(2, 10)).toEqual({ ok: true }); // another user
    gate.leave(1);
    expect(gate.enter(1, 20)).toEqual({ ok: true });
  });

  it("allows at most 5 onboardings per hour per user", () => {
    const gate = createOnboardGate(5);
    for (let i = 0; i < 5; i++) {
      expect(gate.enter(7, i * 1000)).toEqual({ ok: true });
      gate.leave(7);
    }
    const sixth = gate.enter(7, 6000);
    expect(sixth).toMatchObject({ ok: false, reason: "limit" });
    // a limited attempt does not leave the user stuck "in flight"
    expect(gate.enter(7, 3_600_001)).toEqual({ ok: true });
  });
});
