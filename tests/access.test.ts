import { describe, expect, it } from "vitest";
import {
  brandSourceFor,
  canAccessBrand,
  canReuseBrandRow,
  checkChatRights,
  checkPublishAccess,
  isReusableBrand,
} from "../src/lib/uslub/access";

const NOW = Date.parse("2026-11-24T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

describe("brand cache eligibility", () => {
  it("classifies the brand source", () => {
    expect(brandSourceFor({ channel: "safia" })).toBe("channel_only");
    expect(brandSourceFor({ channel: "safia", knowledge: "  " })).toBe("channel_only");
    expect(brandSourceFor({ channel: "safia", knowledge: "Narxlar: ..." })).toBe("custom");
    expect(brandSourceFor({ channel: "safia", samplePosts: ["my post"] })).toBe("custom");
    expect(brandSourceFor({ knowledge: "Biz tort sotamiz" })).toBe("custom");
  });

  it("reuses only fresh channel_only rows for channel_only requests", () => {
    const fresh = { source: "channel_only" as const, createdAt: hoursAgo(2) };
    expect(isReusableBrand(fresh, { channel: "safia" }, NOW)).toBe(true);
  });

  it("never reuses rows that contain owner-supplied text (cache poisoning)", () => {
    expect(isReusableBrand({ source: "custom", createdAt: hoursAgo(1) }, { channel: "safia" }, NOW)).toBe(false);
  });

  it("never serves the cache to a request that brings its own knowledge or samples", () => {
    const fresh = { source: "channel_only" as const, createdAt: hoursAgo(1) };
    expect(isReusableBrand(fresh, { channel: "safia", knowledge: "secret prices" }, NOW)).toBe(false);
    expect(isReusableBrand(fresh, { channel: "safia", samplePosts: ["x"] }, NOW)).toBe(false);
  });

  it("expires after 24 hours and rejects bad dates", () => {
    expect(isReusableBrand({ source: "channel_only", createdAt: hoursAgo(25) }, { channel: "safia" }, NOW)).toBe(false);
    expect(isReusableBrand({ source: "channel_only", createdAt: "garbage" }, { channel: "safia" }, NOW)).toBe(false);
  });
});

describe("brand read access", () => {
  it("channel_only brands are readable by id", () => {
    expect(canAccessBrand({ source: "channel_only", ownerTelegramId: 1 }, null)).toBe(true);
  });
  it("custom brands are scoped to their owner", () => {
    expect(canAccessBrand({ source: "custom", ownerTelegramId: 1 }, 1)).toBe(true);
    expect(canAccessBrand({ source: "custom", ownerTelegramId: 1 }, 2)).toBe(false);
    expect(canAccessBrand({ source: "custom", ownerTelegramId: 1 }, null)).toBe(false);
  });
  it("anonymous custom brands are readable by their unguessable id", () => {
    expect(canAccessBrand({ source: "custom", ownerTelegramId: null }, null)).toBe(true);
  });
});

describe("publish authorization", () => {
  const brand = { ownerTelegramId: 42, channel: "safiabakery" };

  it("requires a Telegram user (401)", () => {
    const d = checkPublishAccess({ userId: null, brand, chat: "@safiabakery" });
    expect(d).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects missing posts/brands (404)", () => {
    expect(checkPublishAccess({ userId: 42, brand: null, chat: "@x_chan" })).toMatchObject({ ok: false, status: 404 });
  });

  it("rejects unowned brands and other users' brands (403)", () => {
    expect(checkPublishAccess({ userId: 42, brand: { ownerTelegramId: null, channel: "safiabakery" }, chat: "@safiabakery" })).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(checkPublishAccess({ userId: 7, brand, chat: "@safiabakery" })).toMatchObject({ ok: false, status: 403 });
  });

  it("only allows the brand's own linked channel (case-insensitive)", () => {
    expect(checkPublishAccess({ userId: 42, brand, chat: "@SafiaBakery" })).toEqual({ ok: true, linkChannel: false });
    expect(checkPublishAccess({ userId: 42, brand, chat: "@someone_else" })).toMatchObject({ ok: false, status: 403 });
    expect(checkPublishAccess({ userId: 42, brand, chat: null })).toMatchObject({ ok: false, status: 403 });
  });

  it("links the channel on the first publish of a brand without one", () => {
    expect(checkPublishAccess({ userId: 42, brand: { ownerTelegramId: 42, channel: null }, chat: "@new_chan" })).toEqual({
      ok: true,
      linkChannel: true,
    });
  });

  it("requires the caller to administer the channel with post rights", () => {
    const bot = { status: "administrator", can_post_messages: true };
    expect(checkChatRights({ status: "creator" }, bot, "u")).toMatchObject({ ok: true });
    expect(checkChatRights({ status: "administrator", can_post_messages: true }, bot, "u")).toMatchObject({ ok: true });
    // privilege escalation: an admin without post rights must not publish through the bot
    expect(checkChatRights({ status: "administrator", can_post_messages: false }, bot, "u")).toMatchObject({ ok: false, status: 403 });
    expect(checkChatRights({ status: "administrator" }, bot, "u")).toMatchObject({ ok: false, status: 403 });
    expect(checkChatRights({ status: "member" }, bot, "u")).toMatchObject({ ok: false, status: 403 });
    expect(checkChatRights(null, bot, "u")).toMatchObject({ ok: false, status: 403 });
  });

  it("requires the bot to be able to post", () => {
    const owner = { status: "creator" };
    expect(checkChatRights(owner, { status: "administrator", can_post_messages: false }, "u")).toMatchObject({ ok: false, status: 403 });
    expect(checkChatRights(owner, { status: "member" }, "u")).toMatchObject({ ok: false, status: 403 });
    const noBot = checkChatRights(owner, null, "https://t.me/bot?startchannel&admin=post_messages");
    expect(noBot.ok).toBe(false);
    if (!noBot.ok) expect(noBot.error).toContain("startchannel");
  });
});

describe("canReuseBrandRow: a re-run of a channel returns only the caller's own row", () => {
  const row = (ownerTelegramId: number | null, channel = "tort_uyi", mode = "channel") => ({ ownerTelegramId, channel, mode });

  it("same channel, same caller", () => {
    expect(canReuseBrandRow(row(null), { channel: "@Tort_Uyi", ownerTelegramId: null })).toBe(true);
    expect(canReuseBrandRow(row(7), { channel: "tort_uyi", ownerTelegramId: 7 })).toBe(true);
  });

  it("never another user's row, never an unowned row for an owned caller", () => {
    expect(canReuseBrandRow(row(7), { channel: "tort_uyi", ownerTelegramId: 8 })).toBe(false);
    expect(canReuseBrandRow(row(7), { channel: "tort_uyi", ownerTelegramId: null })).toBe(false);
    expect(canReuseBrandRow(row(null), { channel: "tort_uyi", ownerTelegramId: 7 })).toBe(false);
  });

  it("a web brand claimed in the bot stays with the browser that holds its id", () => {
    expect(canReuseBrandRow(row(7), { channel: "tort_uyi", ownerTelegramId: null, claimed: true })).toBe(true);
  });

  it("another channel or a fresh-mode brand is never reused", () => {
    expect(canReuseBrandRow(row(null, "boshqa"), { channel: "tort_uyi", ownerTelegramId: null })).toBe(false);
    expect(canReuseBrandRow(row(null, "tort_uyi", "fresh"), { channel: "tort_uyi", ownerTelegramId: null })).toBe(false);
    expect(canReuseBrandRow({ ownerTelegramId: null, channel: null }, { channel: "tort_uyi", ownerTelegramId: null })).toBe(false);
  });
});
