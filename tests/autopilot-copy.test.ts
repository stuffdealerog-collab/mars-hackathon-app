import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const invites = vi.hoisted(() => ({ existing: null as string | null, saved: [] as unknown[] }));
vi.mock("../src/lib/autopilot/repo", () => ({
  findInviteLink: async () => invites.existing,
  saveInviteLink: async (r: unknown) => void invites.saved.push(r),
  markNotified: async () => {},
  pauseAutopilot: async () => {},
  userLanguage: async () => "ru",
}));
vi.mock("../src/lib/track", () => ({ safeLogEvent: async () => {} }));

const { COPY, fmtDelta, fmtNum, skipReason, whenLabel } = await import("../src/lib/autopilot/copy");
const { queueMessage } = await import("../src/lib/autopilot/notify");
const { ensureInviteLink } = await import("../src/lib/autopilot/invites");
const { detectNeuro } = await import("../src/lib/uslub/neuro");
const { GrammyError } = await import("grammy");

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("autopilot wording", () => {
  it("every text exists in uz, ru and en with the same placeholders", () => {
    for (const [key, t] of Object.entries(COPY)) {
      expect(vars(t.ru), key).toEqual(vars(t.uz));
      expect(vars(t.en), key).toEqual(vars(t.uz));
    }
  });

  it("has no machine-sounding words", () => {
    for (const [key, t] of Object.entries(COPY)) {
      expect(detectNeuro(t.uz, "uz_latn"), `${key} uz`).toEqual([]);
      expect(detectNeuro(t.ru, "ru"), `${key} ru`).toEqual([]);
      expect(detectNeuro(t.en, "en"), `${key} en`).toEqual([]);
    }
  });

  it("times on the Tashkent clock, numbers and changes", () => {
    const at = Date.parse("2026-12-01T07:40:00Z");
    expect(whenLabel(at, "uz")).toBe("1-dekabr, 12:40");
    expect(whenLabel(at, "ru")).toBe("1 декабря, 12:40");
    expect(whenLabel(at, "en")).toBe("1 December, 12:40");
    expect(fmtNum(1240, "uz")).toBe("1 240");
    expect(fmtNum(1240, "en")).toBe("1,240");
    expect(fmtNum(-12, "ru")).toBe("-12");
    expect(fmtDelta(540, 480)).toBe("+13%");
    expect(fmtDelta(400, 500)).toBe("-20%");
    expect(skipReason("uz", "blank", { tokens: ["[narx]"] })).toBe("to‘ldirilmagan joy: «[narx]»");
  });

  it("'post is out' carries the link as a button; a missing admin right carries the add-the-bot link", () => {
    const row = { chat: "nonvoy", dueAt: Date.parse("2026-12-01T07:40:00Z") };
    const out = queueMessage("uz", row, { kind: "post_out", url: "https://t.me/nonvoy/42" }, "https://t.me/b?startchannel&admin=post_messages+invite_users");
    expect(out.text).toBe("✅ Post @nonvoy kanalida chiqdi (1-dekabr, 12:40).");
    expect(out.keyboard?.inline_keyboard.flat()[0]).toMatchObject({ url: "https://t.me/nonvoy/42" });
    const blocked = queueMessage("ru", row, { kind: "bot_not_admin" }, "https://t.me/b?startchannel&admin=post_messages+invite_users");
    expect(blocked.text).toContain("@nonvoy");
    expect(blocked.keyboard?.inline_keyboard.flat()[0]).toMatchObject({ url: "https://t.me/b?startchannel&admin=post_messages+invite_users" });
    expect(queueMessage("en", row, { kind: "blank", tokens: ["[price]"] }, "").text).toContain("«[price]»");
  });
});

describe("invite links per source", () => {
  const brand = { id: "b1", channel: "nonvoy" };

  it("makes one link per source, named after it, and reuses it", async () => {
    invites.existing = null;
    invites.saved.length = 0;
    const createChatInviteLink = vi.fn(async (_chat: string, o: { name?: string }) => ({ invite_link: "https://t.me/+QrLink", name: o.name }));
    const r = await ensureInviteLink({ createChatInviteLink } as never, brand, "QR");
    expect(r).toEqual({ ok: true, link: "https://t.me/+QrLink", created: true });
    expect(createChatInviteLink).toHaveBeenCalledWith("@nonvoy", { name: "mercat:qr" });
    expect(invites.saved).toEqual([{ link: "https://t.me/+QrLink", brandId: "b1", channel: "nonvoy", name: "mercat:qr", source: "qr" }]);
    invites.existing = "https://t.me/+QrLink";
    expect(await ensureInviteLink({ createChatInviteLink } as never, brand, "qr")).toEqual({ ok: true, link: "https://t.me/+QrLink", created: false });
    expect(createChatInviteLink).toHaveBeenCalledTimes(1);
  });

  it("refuses a malformed source and reports a bot without the invite right", async () => {
    invites.existing = null;
    expect(await ensureInviteLink({ createChatInviteLink: vi.fn() } as never, brand, "bad source!")).toEqual({ ok: false, reason: "bad_source" });
    const refuse = vi.fn(async () => {
      throw new GrammyError("Bad Request: not enough rights", { ok: false, error_code: 400, description: "Bad Request: not enough rights to manage chat invite link" }, "createChatInviteLink", {});
    });
    expect(await ensureInviteLink({ createChatInviteLink: refuse } as never, brand, "instagram")).toEqual({ ok: false, reason: "bot_cannot_invite" });
  });
});
