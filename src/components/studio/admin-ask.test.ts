import { describe, expect, it, vi } from "vitest";
import { askChannel, nextAsk, publishFailKind, retryAsk, retryOnReturn, settleRetry, type AdminAsk, type AskStore } from "./admin-ask";

const LINK = "https://t.me/mercatai?startchannel&admin=post_messages";

describe("publishFailKind", () => {
  it("a bot that is not an admin asks for the add-the-bot card", () => {
    expect(publishFailKind({ code: "bot_not_admin" })).toBe("admin");
    expect(publishFailKind({ code: "bot_not_admin", adminUrl: LINK })).toBe("admin");
  });
  it("an older server's reply with a link and no code is still the card", () => {
    expect(publishFailKind({ adminUrl: LINK })).toBe("admin");
  });
  it("a Telegram error that comes with the link is not about rights: no card", () => {
    expect(publishFailKind({ code: "telegram_unavailable", adminUrl: LINK })).toBe("bad");
    expect(publishFailKind({ code: "forbidden", adminUrl: LINK })).toBe("bad");
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

const open = { script: "uz_latn" as const, chat: "@shirin_tort", channel: { name: "@shirin_tort" } };
const card = (state: AdminAsk["state"], postId = "p1"): AdminAsk => ({ postId, ...open, state });

describe("nextAsk", () => {
  it("opens the card on a first bot_not_admin", () => {
    expect(nextAsk(null, "p1", open)).toEqual(card("ask"));
  });
  it("says «not yet» when its own retry came back the same way", () => {
    expect(nextAsk(card("checking"), "p1", open)).toEqual(card("notYet"));
  });
  it("opens fresh for another post", () => {
    expect(nextAsk(card("checking", "p2"), "p1", open)).toEqual(card("ask"));
  });
  it("closes this post's card when it went out or failed for another reason", () => {
    expect(nextAsk(card("checking"), "p1", null)).toBeNull();
    expect(nextAsk(card("ask"), "p1", null)).toBeNull();
  });
  it("leaves another post's card alone", () => {
    const other = card("ask", "p2");
    expect(nextAsk(other, "p1", null)).toBe(other);
    expect(nextAsk(null, "p1", null)).toBeNull();
  });
});

describe("settleRetry", () => {
  it("never leaves the card on «checking» after the retry settled", () => {
    expect(settleRetry(card("checking"), "p1")).toBeNull();
  });
  it("keeps what publish set", () => {
    const notYet = card("notYet");
    expect(settleRetry(notYet, "p1")).toBe(notYet);
    expect(settleRetry(null, "p1")).toBeNull();
    const other = card("checking", "p2");
    expect(settleRetry(other, "p1")).toBe(other);
  });
});

/** A store with a fake publish that does to the card what the real one does (nextAsk), or nothing (an early return). */
function fakeStore(start: AdminAsk | null, outcome: "admin" | "published" | "other" | "early" | "throws", busy = false) {
  let ask = start;
  const publish = vi.fn(async (postId: string) => {
    if (outcome === "throws") throw new Error("network");
    if (outcome === "early") return { ok: false as const };
    ask = nextAsk(ask, postId, outcome === "admin" ? open : null);
    return { ok: outcome === "published" };
  });
  const store: AskStore<{ ok: boolean }> = {
    ask: () => ask,
    setAsk: (a) => (ask = a),
    busy: () => busy,
    publish,
  };
  return { store, publish, now: () => ask };
}

describe("retryAsk", () => {
  it("publishes to the channel the first publish used (one the owner typed)", async () => {
    const typed: AdminAsk = { ...card("added"), chat: "@typed_here" };
    const s = fakeStore(typed, "admin");
    await retryAsk(s.store);
    expect(s.publish).toHaveBeenCalledWith("p1", "uz_latn", "@typed_here");
  });
  it("is «checking» while the publish is out", async () => {
    const s = fakeStore(card("added"), "published");
    let during: AdminAsk["state"] | undefined;
    s.publish.mockImplementationOnce(async () => {
      during = s.now()?.state;
      s.store.setAsk(null);
      return { ok: true };
    });
    await retryAsk(s.store);
    expect(during).toBe("checking");
  });
  it("closes the card when the post went out", async () => {
    const s = fakeStore(card("added"), "published");
    expect(await retryAsk(s.store)).toEqual({ ok: true });
    expect(s.now()).toBeNull();
  });
  it("says «not yet» when the bot is still not an admin", async () => {
    const s = fakeStore(card("added"), "admin");
    await retryAsk(s.store);
    expect(s.now()?.state).toBe("notYet");
  });
  it("closes the card when the publish failed for another reason", async () => {
    const s = fakeStore(card("notYet"), "other");
    await retryAsk(s.store);
    expect(s.now()).toBeNull();
  });
  it("closes the card when publish returned before the server (no channel, old key)", async () => {
    const s = fakeStore(card("added"), "early");
    await retryAsk(s.store);
    expect(s.now()).toBeNull();
  });
  it("closes the card when publish threw", async () => {
    const s = fakeStore(card("added"), "throws");
    await expect(retryAsk(s.store)).rejects.toThrow("network");
    expect(s.now()).toBeNull();
  });
  it("never runs twice at once, nor while the post is busy, nor with no card", async () => {
    const checking = fakeStore(card("checking"), "published");
    expect(await retryAsk(checking.store)).toBeNull();
    expect(checking.publish).not.toHaveBeenCalled();
    const busy = fakeStore(card("added"), "published", true);
    expect(await retryAsk(busy.store)).toBeNull();
    expect(busy.publish).not.toHaveBeenCalled();
    const none = fakeStore(null, "published");
    expect(await retryAsk(none.store)).toBeNull();
  });
});
