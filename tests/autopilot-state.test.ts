import { describe, expect, it } from "vitest";
import { botAdminFrom, readAutopilot, readBotAdmin, switchAutopilot, TRIAL_DAYS, trialDaysLeft } from "../src/lib/autopilot/state";

const now = Date.parse("2026-11-25T10:00:00Z");
const DAY = 86_400_000;

describe("autopilot on/off and the 7-day trial", () => {
  it("never switched on: off, no trial", () => {
    expect(readAutopilot({})).toEqual({ on: false });
    expect(readAutopilot(null)).toEqual({ on: false });
    expect(readAutopilot({ on: "yes", since: 5 })).toEqual({ on: false });
  });

  it("the trial starts the first time it is turned on", () => {
    const on = switchAutopilot(readAutopilot({}), true, now);
    expect(on).toEqual({ on: true, since: "2026-11-25T10:00:00.000Z", trialEndsAt: "2026-12-02T10:00:00.000Z" });
    expect(TRIAL_DAYS).toBe(7);
    expect(trialDaysLeft(on, now)).toBe(7);
    expect(trialDaysLeft(on, now + 6.5 * DAY)).toBe(1);
    expect(trialDaysLeft(on, now + 8 * DAY)).toBe(0);
  });

  it("off and on again keeps the same trial dates", () => {
    const first = switchAutopilot({ on: false }, true, now);
    const off = switchAutopilot(first, false, now + DAY);
    expect(off).toEqual({ ...first, on: false });
    const again = switchAutopilot(off, true, now + 3 * DAY);
    expect(again.since).toBe(first.since);
    expect(again.trialEndsAt).toBe(first.trialEndsAt);
  });

  it("turning it on clears a pause (the owner is back)", () => {
    const paused = readAutopilot({ on: true, since: "2026-11-20T00:00:00.000Z", trialEndsAt: "2026-11-27T00:00:00.000Z", paused: "blocked" });
    expect(paused.paused).toBe("blocked");
    expect(switchAutopilot(paused, true, now).paused).toBeUndefined();
  });
});

describe("bot admin status", () => {
  it("from a chat member", () => {
    const at = new Date(now).toISOString();
    expect(botAdminFrom({ status: "administrator", can_post_messages: true, can_invite_users: true }, now)).toEqual({ status: "admin", canPost: true, canInvite: true, checkedAt: at });
    expect(botAdminFrom({ status: "administrator", can_post_messages: false, can_invite_users: true }, now)).toEqual({ status: "no_post_right", canPost: false, canInvite: true, checkedAt: at });
    expect(botAdminFrom({ status: "creator" }, now).status).toBe("admin");
    expect(botAdminFrom({ status: "left" }, now)).toEqual({ status: "not_admin", canPost: false, canInvite: false, checkedAt: at });
    expect(botAdminFrom(null, now).status).toBe("not_admin");
  });

  it("stored value read back; anything else is unknown", () => {
    expect(readBotAdmin({ botAdmin: { status: "admin", canPost: true, canInvite: false, checkedAt: "x" } })).toEqual({ status: "admin", canPost: true, canInvite: false, checkedAt: "x" });
    expect(readBotAdmin({})).toEqual({ status: "unknown", canPost: false, canInvite: false });
    expect(readBotAdmin({ botAdmin: { status: "boss" } })).toEqual({ status: "unknown", canPost: false, canInvite: false });
  });
});
