import { beforeEach, describe, expect, it, vi } from "vitest";

// A video post goes out as the owner's video (Telegram file_id, no copy) with its text as the caption; a caption over
// 1024 characters follows the video as its own message; a video sent as a file goes out as a file; a video post
// without a video never goes out; the video is part of what the owner approved (hash, expected file id); a send cut
// off by Telegram's 5xx may have reached the channel and is never resent on its own. Fake Telegram API and store.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ BOT_USERNAME: "test_bot" }) }));
vi.mock("@/lib/autopilot/repo", () => ({ recordPublication: vi.fn(async () => {}) }));
const tg = vi.hoisted(() => ({ calls: [] as { method: string; chat: string; file?: string; opts?: Record<string, unknown>; text?: string }[], fail: null as Error | null }));
vi.mock("@/lib/bot", () => ({
  getBot: () => ({
    api: {
      getMe: async () => ({ id: 999 }),
      getChatMember: async () => ({ status: "administrator", can_post_messages: true }),
      sendMessage: async (chat: string, text: string) => {
        tg.calls.push({ method: "sendMessage", chat, text });
        return { message_id: 50 + tg.calls.length };
      },
      sendVideo: async (chat: string, file: string, opts?: Record<string, unknown>) => {
        tg.calls.push({ method: "sendVideo", chat, file, opts });
        if (tg.fail) throw tg.fail;
        return { message_id: 42 };
      },
      sendDocument: async (chat: string, file: string, opts?: Record<string, unknown>) => {
        tg.calls.push({ method: "sendDocument", chat, file, opts });
        return { message_id: 43 };
      },
      sendPhoto: async () => {
        throw new Error("a video post never sends its picture");
      },
      deleteMessage: async () => true,
    },
  }),
}));
vi.mock("../src/lib/uslub/media/post-image-service", () => ({ publishImageUrl: async () => "https://v3.fal.media/p.png" }));
import type { PostDraft } from "../src/lib/uslub/contract";
const st = vi.hoisted(() => ({ post: null as unknown as PostDraft, markPublished: vi.fn(async () => {}) }));
const BRAND = { id: "22222222-2222-4222-8222-222222222222", ownerTelegramId: 7, channel: "nonvoy", source: "custom" };
vi.mock("../src/lib/uslub/store", () => ({
  getPost: async () => st.post,
  getBrand: async () => BRAND,
  markPublished: st.markPublished,
  linkBrandChannel: async () => {},
}));

const { GrammyError } = await import("grammy");
const { publishPost } = await import("../src/lib/uslub/publish");
const { planVideoMessages, changedSincePreview } = await import("../src/lib/uslub/media/telegram-post");
const { shownHash, shownPhoto, shownVideo } = await import("../src/lib/uslub/botpublish-core");
const { runPublishDue } = await import("../src/lib/autopilot/publish-due");
import type { QueueRow } from "../src/lib/autopilot/repo";

const base = (over: Partial<PostDraft> = {}): PostDraft => ({
  id: "11111111-1111-4111-8111-111111111111",
  brandId: BRAND.id,
  brief: "",
  variants: { uz_latn: "Ertalab issiq patir. 📞 +998 90 123 45 67", uz_cyrl: "", ru: "", en: "" },
  neuroHits: {},
  humanScore: 90,
  status: "approved",
  slot: { day: "2026-11-30", time: "12:40", goal: "reach", hook: "Patir", cta: "", format: "video" },
  image: { status: "ready", url: "https://v3.fal.media/p.png", refsUsed: 0 },
  createdAt: "2026-11-29T10:00:00Z",
  ...over,
});
const send = (extra: Record<string, unknown> = {}) => publishPost({ postId: st.post.id, script: "uz_latn", chat: "@nonvoy", userId: 7, ...extra });

beforeEach(() => {
  tg.calls.length = 0;
  tg.fail = null;
  st.markPublished.mockClear();
});

describe("planVideoMessages (pure)", () => {
  it("one video with the caption, or the video then the text past 1024 characters", () => {
    expect(planVideoMessages("Salom", { fileId: "F" })).toEqual([{ kind: "video", fileId: "F", as: "video", caption: "Salom" }]);
    const long = "x".repeat(1025);
    expect(planVideoMessages(long, { fileId: "F", as: "document" })).toEqual([
      { kind: "video", fileId: "F", as: "document" },
      { kind: "text", text: long },
    ]);
  });

  it("a different video than the one shown is a change", () => {
    expect(changedSincePreview({ text: "a", videoFileId: "F2" }, { expectedVideoFileId: "F1" })).toBe("video");
    expect(changedSincePreview({ text: "a", videoFileId: "F1" }, { expectedVideoFileId: "F1" })).toBeNull();
    expect(changedSincePreview({ text: "a", videoFileId: "F1" }, { expectedVideoFileId: null })).toBe("video");
    expect(changedSincePreview({ text: "a", videoFileId: "F1" }, {})).toBeNull();
  });
});

describe("publishPost with the owner's video", () => {
  it("sendVideo by file_id with the text as its caption; the picture is not sent", async () => {
    st.post = base({ video: { fileId: "BAACvid", as: "video", duration: 21 } });
    const r = await send();
    expect(r).toEqual({ ok: true, status: 200, url: "https://t.me/nonvoy/42" });
    expect(tg.calls).toEqual([{ method: "sendVideo", chat: "@nonvoy", file: "BAACvid", opts: { caption: st.post.variants.uz_latn, supports_streaming: true } }]);
    expect(st.markPublished).toHaveBeenCalledOnce();
  });

  it("a caption over 1024 characters: the video, then the full text", async () => {
    st.post = base({ variants: { uz_latn: "Patir. ".repeat(200), uz_cyrl: "", ru: "", en: "" }, video: { fileId: "BAACvid" } });
    const r = await send();
    expect(r.ok).toBe(true);
    expect(tg.calls.map((c) => c.method)).toEqual(["sendVideo", "sendMessage"]);
    expect(tg.calls[0].opts).toEqual({ supports_streaming: true });
  });

  it("a video the owner sent as a file goes out as a file", async () => {
    st.post = base({ video: { fileId: "BQACdoc", as: "document" } });
    expect((await send()).ok).toBe(true);
    expect(tg.calls.map((c) => c.method)).toEqual(["sendDocument"]);
  });

  it("a video slot without its video: refused before anything is sent (code video_missing)", async () => {
    st.post = base({ video: { plan: { hook: "x", scenes: [], musicMood: "" } } });
    const r = await send();
    expect(r).toMatchObject({ ok: false, status: 422, sent: false, error: "video_missing" });
    expect(tg.calls).toEqual([]);
    const { publishErrorCode } = await import("../src/lib/uslub/publish-errors");
    expect(publishErrorCode(r.status, r.error)).toBe("video_missing");
  });

  it("the video changed since the preview: 409, nothing sent", async () => {
    st.post = base({ video: { fileId: "NEW" } });
    const r = await send({ expectedText: st.post.variants.uz_latn, expectedImageUrl: null, expectedVideoFileId: "OLD" });
    expect(r).toMatchObject({ ok: false, status: 409, sent: false });
    expect(tg.calls).toEqual([]);
  });

  it("Telegram's 5xx while sending the video: may be in the channel, never marked safe to resend", async () => {
    st.post = base({ video: { fileId: "BAACvid" } });
    tg.fail = new GrammyError("Internal", { ok: false, error_code: 500, description: "Internal Server Error" }, "sendVideo", {});
    const r = await send();
    expect(r.ok).toBe(false);
    expect(r.sent).toBeUndefined();
    expect(st.markPublished).not.toHaveBeenCalled();
  });

  it("Telegram refused it (400): nothing reached the channel, safe to try again", async () => {
    st.post = base({ video: { fileId: "BAACvid" } });
    tg.fail = new GrammyError("Bad", { ok: false, error_code: 400, description: "Bad Request: wrong file identifier" }, "sendVideo", {});
    expect(await send()).toMatchObject({ ok: false, sent: false });
  });
});

describe("approval binds the video", () => {
  it("the hash covers the video's file id; a post without a video hashes as before", () => {
    const text = base({ image: undefined });
    const withVideo = base({ image: undefined, video: { fileId: "A" } });
    const otherVideo = base({ image: undefined, video: { fileId: "B" } });
    expect(shownHash(withVideo, "uz_latn")).not.toBe(shownHash(text, "uz_latn"));
    expect(shownHash(withVideo, "uz_latn")).not.toBe(shownHash(otherVideo, "uz_latn"));
    expect(shownHash(base({ image: undefined, video: { plan: { hook: "", scenes: [], musicMood: "" } } }), "uz_latn")).toBe(shownHash(text, "uz_latn"));
  });

  it("a post with a video shows (and sends) no picture", () => {
    expect(shownPhoto(base())).toBe("https://v3.fal.media/p.png");
    expect(shownPhoto(base({ video: { fileId: "A" } }))).toBeNull();
    expect(shownVideo(base({ video: { fileId: "A" } }))).toBe("A");
  });

  it("the queue sends a video post with exactly the approved video", async () => {
    st.post = base({ video: { fileId: "BAACvid" } });
    const row: QueueRow = {
      postId: st.post.id,
      brandId: BRAND.id,
      ownerTelegramId: 7,
      chat: "nonvoy",
      script: "uz_latn",
      dueAt: Date.parse("2026-11-30T07:40:00Z"),
      textHash: shownHash(st.post, "uz_latn"),
      status: "sending",
      attempts: 1,
      lastError: null,
      prev: "queued",
    };
    const seen: Record<string, unknown>[] = [];
    let claimed = false;
    await runPublishDue(
      {
        now: () => row.dueAt,
        markStaleSending: async () => [],
        expireOverdue: async () => [],
        claimDue: async () => (claimed ? null : ((claimed = true), row)),
        finish: async () => {},
        loadPost: async () => st.post,
        loadBrand: async () => BRAND,
        publish: async (a) => {
          seen.push(a);
          return publishPost(a);
        },
        notifyOwner: async () => {},
        alertTeam: async () => {},
      },
      { timeLeft: () => 60_000 },
    );
    expect(seen[0]).toMatchObject({ expectedVideoFileId: "BAACvid", expectedImageUrl: null });
    expect(tg.calls.map((c) => c.method)).toEqual(["sendVideo"]);
  });
});
