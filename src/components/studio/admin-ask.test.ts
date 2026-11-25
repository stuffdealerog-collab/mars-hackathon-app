import { describe, expect, it } from "vitest";
import { askChannel, publishFailKind, retryOnReturn } from "./admin-ask";

describe("publishFailKind", () => {
  it("a bot that is not an admin asks for the add-the-bot card", () => {
    expect(publishFailKind({ code: "bot_not_admin" })).toBe("admin");
    expect(publishFailKind({ code: "forbidden", adminUrl: "https://t.me/mercatai?startchannel&admin=post_messages" })).toBe("admin");
  });
  it("a blank left in the text is the owner's fact to add, not the card", () => {
    expect(publishFailKind({ code: "placeholder_left" })).toBe("blank");
    expect(publishFailKind({ code: "placeholder_left", adminUrl: "x" })).toBe("blank");
  });
  it("anything else is a plain error", () => {
    expect(publishFailKind({ code: "publish_in_progress" })).toBe("bad");
    expect(publishFailKind({})).toBe("bad");
  });
});

describe("askChannel", () => {
  it("names the owner's channel with its handle", () => {
    expect(askChannel({ name: "Shirin Tort", channel: "@shirin_tort" })).toEqual({ name: "Shirin Tort", handle: "@shirin_tort" });
  });
  it("uses the handle when there is no name, without repeating it", () => {
    expect(askChannel({ channel: "shirin_tort" })).toEqual({ name: "@shirin_tort" });
    expect(askChannel({ name: "", typed: "shirin_tort" })).toEqual({ name: "@shirin_tort" });
    expect(askChannel({ channel: "t.me/shirin_tort" })).toEqual({ name: "@shirin_tort" });
  });
  it("is nothing when the channel is unknown (the card says «your channel»)", () => {
    expect(askChannel({})).toBeNull();
    expect(askChannel({ name: "  ", channel: null })).toBeNull();
  });
  it("never invents the sample bakery", () => {
    expect(JSON.stringify(askChannel({ channel: "@x" }))).not.toMatch(/tandir/i);
  });
});

describe("retryOnReturn", () => {
  it("publishes again only once the link was opened", () => {
    expect(retryOnReturn("added")).toBe(true);
    expect(retryOnReturn("ask")).toBe(false);
    expect(retryOnReturn("checking")).toBe(false);
    expect(retryOnReturn("notYet")).toBe(false);
    expect(retryOnReturn(null)).toBe(false);
  });
});
