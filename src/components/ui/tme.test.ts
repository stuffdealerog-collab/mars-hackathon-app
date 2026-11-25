import { describe, expect, it } from "vitest";
import { addBotToChannelUrl, BOT_CHANNEL_RIGHTS } from "./tme";

describe("addBotToChannelUrl", () => {
  it("is Telegram's startchannel link with «Post messages» and «Invite users» pre-selected", () => {
    expect(addBotToChannelUrl("mercatai")).toBe("https://t.me/mercatai?startchannel&admin=post_messages+invite_users");
    expect(BOT_CHANNEL_RIGHTS).toEqual(["post_messages", "invite_users"]);
  });
  it("takes the username with or without the @", () => {
    expect(addBotToChannelUrl("@some_bot")).toBe("https://t.me/some_bot?startchannel&admin=post_messages+invite_users");
    expect(addBotToChannelUrl("  some_bot ")).toBe("https://t.me/some_bot?startchannel&admin=post_messages+invite_users");
  });
  it("joins several rights with + and never sends a channel link without one", () => {
    expect(addBotToChannelUrl("b", ["post_messages", "edit_messages", "post_messages"])).toBe("https://t.me/b?startchannel&admin=post_messages+edit_messages");
    expect(addBotToChannelUrl("b", [])).toBe("https://t.me/b?startchannel&admin=post_messages+invite_users");
  });
  it("is a plain t.me link, so the Mini App opens it inside Telegram", () => {
    expect(addBotToChannelUrl("mercatai")).toMatch(/^https:\/\/t\.me\//);
  });
});
