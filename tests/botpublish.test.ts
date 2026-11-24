import { describe, expect, it } from "vitest";
import {
  callbackData,
  claimDecision,
  otherScripts,
  parseCallback,
  parsePublishPayload,
  pickScript,
  publishPayload,
  splitForPhoto,
} from "../src/lib/uslub/botpublish-core";

const ID = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const creator = { status: "creator" };
const adminCanPost = { status: "administrator", can_post_messages: true };
const adminNoPost = { status: "administrator", can_post_messages: false };
const member = { status: "member" };

describe("publish deep link", () => {
  it("parses publish_<postId> with an optional script, within Telegram's 64-char payload", () => {
    expect(parsePublishPayload(`publish_${ID}`)).toEqual({ postId: ID, script: undefined });
    expect(parsePublishPayload(`publish_${ID}_uz_cyrl`)).toEqual({ postId: ID, script: "uz_cyrl" });
    expect(parsePublishPayload(`publish_${ID.toUpperCase()}_ru`)?.postId).toBe(ID);
    expect(parsePublishPayload("publish_123")).toBeNull();
    expect(parsePublishPayload(`publish_${ID}_de`)).toBeNull();
    expect(parsePublishPayload(`src_booth1`)).toBeNull();
    expect(publishPayload(ID, "uz_cyrl").length).toBeLessThanOrEqual(64);
  });

  it("round-trips button callbacks within Telegram's 64-byte limit", () => {
    for (const s of ["uz_latn", "uz_cyrl", "ru", "en"] as const) {
      const data = callbackData("pb", ID, s);
      expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
      expect(parseCallback(data)).toEqual({ kind: "pb", postId: ID, script: s });
    }
    expect(parseCallback(`pub:${ID}`)).toBeNull();
    expect(parseCallback(`pb:${ID}:x`)).toBeNull();
  });
});

describe("which text the owner sees", () => {
  const variants = { uz_latn: "Salom", uz_cyrl: "Салом", ru: "Привет", en: "" };
  it("uses the chosen script, else the brand's language, never an empty one", () => {
    expect(pickScript(variants, "ru")).toBe("ru");
    expect(pickScript(variants, undefined, ["uz_cyrl"])).toBe("uz_cyrl");
    expect(pickScript(variants, "en", ["en"])).toBe("uz_latn");
    expect(otherScripts(variants, "ru")).toEqual(["uz_latn", "uz_cyrl"]);
  });

  it("puts a long post under the photo instead of in a cut caption", () => {
    expect(splitForPhoto("qisqa")).toEqual({ caption: "qisqa" });
    expect(splitForPhoto("x".repeat(1500))).toEqual({ rest: "x".repeat(1500) });
  });
});

describe("claiming an unowned web brand", () => {
  it("lets the channel's creator or a posting admin claim it, only when the bot can post", () => {
    expect(claimDecision({ ownerTelegramId: null, userId: 7, user: creator, bot: adminCanPost })).toEqual({ ok: true, claim: true });
    expect(claimDecision({ ownerTelegramId: null, userId: 7, user: adminCanPost, bot: adminCanPost })).toEqual({ ok: true, claim: true });
    expect(claimDecision({ ownerTelegramId: null, userId: 7, user: creator, bot: null })).toEqual({ ok: false, reason: "bot_not_admin" });
    expect(claimDecision({ ownerTelegramId: null, userId: 7, user: creator, bot: adminNoPost })).toEqual({ ok: false, reason: "bot_not_admin" });
  });

  it("never lets a non-admin (or an admin without post rights) claim", () => {
    expect(claimDecision({ ownerTelegramId: null, userId: 7, user: member, bot: adminCanPost })).toEqual({ ok: false, reason: "user_not_admin" });
    expect(claimDecision({ ownerTelegramId: null, userId: 7, user: null, bot: adminCanPost })).toEqual({ ok: false, reason: "user_not_admin" });
    expect(claimDecision({ ownerTelegramId: null, userId: 7, user: { status: "left" }, bot: adminCanPost })).toEqual({ ok: false, reason: "user_not_admin" });
    expect(claimDecision({ ownerTelegramId: null, userId: 7, user: adminNoPost, bot: adminCanPost })).toEqual({ ok: false, reason: "user_cannot_post" });
  });

  it("keeps an owned brand with its owner", () => {
    expect(claimDecision({ ownerTelegramId: 7, userId: 7, user: null, bot: null })).toEqual({ ok: true, claim: false });
    expect(claimDecision({ ownerTelegramId: 8, userId: 7, user: creator, bot: adminCanPost })).toEqual({ ok: false, reason: "not_owner" });
  });
});
