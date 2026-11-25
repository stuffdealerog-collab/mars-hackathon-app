import { describe, expect, it } from "vitest";

// The Videographer's pure rules (src/lib/uslub/video-core.ts) and the bot's video wait (botflow/video-core.ts):
// the script's language, growth or sales, the channel's ending, no invented facts, the caption limit, the deep link
// and the limits a video must meet. No I/O.
import {
  captionPrompt,
  finishCaption,
  finishPlan,
  fitCaption,
  fmtDuration,
  isVideoIdea,
  isVideoPost,
  planSeconds,
  VIDEO_CAPTION_LIMIT,
  videoLang,
  videoMode,
  videoPrompt,
  videoSystem,
} from "../src/lib/uslub/video-core";
import {
  isNewRunText,
  MAX_VIDEO_BYTES,
  parseVideoPayload,
  VIDEO_APPROVE_RE,
  videoApproveData,
  videoProblem,
  videoStartPayload,
} from "../src/lib/uslub/botflow/video-core";
import type { PostEnding, VideoPlan } from "../src/lib/uslub/contract";

const ID = "2f0b5a4e-1c2d-4e3f-8a9b-0c1d2e3f4a5b";

describe("which posts are video posts", () => {
  it("a plan slot with format video, or an idea (a script and no slot)", () => {
    expect(isVideoPost({ slot: { day: "2026-12-01", time: "19:00", goal: "reach", hook: "", cta: "", format: "video" } })).toBe(true);
    expect(isVideoPost({ slot: { day: "2026-12-01", time: "19:00", goal: "reach", hook: "", cta: "", format: "photo" } })).toBe(false);
    expect(isVideoPost({})).toBe(false);
    expect(isVideoPost({ video: {} })).toBe(true);
    expect(isVideoIdea({ video: { plan: { hook: "", scenes: [], musicMood: "" } } })).toBe(true);
    expect(isVideoIdea({ slot: { day: "2026-12-01", time: "19:00", goal: "reach", hook: "", cta: "", format: "video" }, video: {} })).toBe(false);
  });
});

describe("the script's language follows the brand's posts, the screen language only as a fallback", () => {
  it("the brand's first language the post has text for", () => {
    expect(videoLang({ languages: ["ru", "uz_latn"], variants: { uz_latn: "Salom", ru: "Привет" }, uiLang: "uz" })).toBe("ru");
    expect(videoLang({ languages: ["ru", "uz_latn"], variants: { uz_latn: "Salom", ru: "" }, uiLang: "en" })).toBe("uz_latn");
  });
  it("Uzbek Cyrillic channels get Cyrillic (converted from Latin by code)", () => {
    expect(videoLang({ languages: ["uz_cyrl"], variants: { uz_latn: "Salom", uz_cyrl: "" }, uiLang: "uz" })).toBe("uz_cyrl");
  });
  it("a new idea: the brand's main language; no languages at all: the screen language", () => {
    expect(videoLang({ languages: ["en"], uiLang: "uz" })).toBe("en");
    expect(videoLang({ languages: [], uiLang: "ru" })).toBe("ru");
    expect(videoLang({ uiLang: "en" })).toBe("en");
    expect(videoLang({})).toBe("uz_latn");
  });
});

describe("growth or sales", () => {
  it("the owner's goal wins, then a slot meant to engage or grow, then the channel type", () => {
    expect(videoMode({ channelType: "business", brandGoal: "grow" })).toBe("growth");
    expect(videoMode({ channelType: "blog", brandGoal: "sale" })).toBe("sales");
    expect(videoMode({ channelType: "business", slotGoal: "engage" })).toBe("growth");
    expect(videoMode({ channelType: "blog" })).toBe("growth");
    expect(videoMode({ channelType: "expert" })).toBe("growth");
    expect(videoMode({ channelType: "business" })).toBe("sales");
    expect(videoMode({})).toBe("sales");
  });

  it("a growth channel's prompt asks for reach and engagement and forbids a sales pitch; a business gets one call to action", () => {
    const growth = videoSystem("ru", "growth");
    expect(growth).toMatch(/No sales pitch, no prices/);
    expect(growth).toMatch(/Russian/);
    const sales = videoSystem("uz_latn", "sales");
    expect(sales).toMatch(/one clear call to action/);
    expect(sales).toMatch(/Uzbek in Latin script/);
    expect(sales).not.toMatch(/No sales pitch/);
    expect(videoSystem("en", "sales")).toMatch(/English/);
  });

  it("only brand facts; the prompt carries the channel's own ending and leaves the DNA's copy of it out", () => {
    const ending: PostEnding = { pattern: "contact", contact: "📞 +998 90 123 45 67", examples: ["Buyurtma: 📞 +998 90 123 45 67"] };
    const p = videoPrompt({ dna: { name: "Tandir", postEnding: ending }, knowledge: "Patir 12 000 so‘m", ending, hook: "Ertalabki patir", cta: "", brief: "Tong" });
    expect(p).toMatch(/HOW THE CHANNEL'S POSTS END/);
    expect(p).toMatch(/\+998 90 123 45 67/);
    expect(p).toMatch(/last scene's call to action ends the same way/);
    expect(p).not.toMatch(/"postEnding"/);
    expect(videoSystem("uz_latn", "sales")).toMatch(/Never invent a price/);
    const none = videoPrompt({ dna: {}, knowledge: "", ending: { pattern: "none", examples: ["Yoqimli ishtaha!"] }, brief: "" });
    expect(none).toMatch(/they just end/);
  });
});

describe("finishPlan: the model's script made safe", () => {
  const raw = {
    hook: "Soat 6:00. Tandir ochiladi.",
    scenes: [
      { seconds: 2.6, visual: "Tandir, yaqindan", voiceover: "Har kuni ertalab non chiqadi. Hozir 30% chegirma!", caption: "Issiq non har kuni ertalab tayyor bo‘ladi" },
      { seconds: 40, visual: "Peshtaxta", voiceover: "Katta patir 12 000 so‘m.", caption: "12 000 so‘m" },
      { seconds: 0, visual: "Eshik", voiceover: "Telefon: +998 91 111 22 33.", caption: "Kelin" },
      ...Array.from({ length: 5 }, (_, i) => ({ seconds: 3, visual: `x${i}`, voiceover: "", caption: "" })),
    ],
    musicMood: "Iliq tong",
  };
  const plan = finishPlan(raw, "uz_latn", "Patir 12 000 so‘m. Chilonzor.");

  it("at most 6 scenes of 1-10 s, on-screen text of a few words", () => {
    expect(plan.scenes).toHaveLength(6);
    expect(plan.scenes.map((s) => s.seconds).slice(0, 3)).toEqual([3, 10, 3]);
    expect(plan.scenes[0].caption.split(" ").length).toBeLessThanOrEqual(6);
    expect(plan.lang).toBe("uz_latn");
  });

  it("a discount or a phone the brand never gave is cut; a price it gave stays", () => {
    expect(plan.scenes[0].voiceover).toBe("Har kuni ertalab non chiqadi.");
    expect(plan.scenes[1].voiceover).toContain("12 000");
    expect(plan.scenes[2].voiceover).toBe("");
  });

  it("small counts are the script's own words; a clock time the brand never gave is not", () => {
    const p = finishPlan(
      { hook: "3 ta sabab. Soat 7:30 da ochamiz.", scenes: [{ seconds: 15, visual: "15 soniyada xamir", voiceover: "Ertalab 8:00 da tayyor.", caption: "" }], musicMood: "" },
      "uz_latn",
      "Ertalab 8:00 da ochiladi.",
    );
    expect(p.hook).toBe("3 ta sabab.");
    expect(p.scenes[0].visual).toBe("15 soniyada xamir");
    expect(p.scenes[0].voiceover).toBe("Ertalab 8:00 da tayyor.");
  });

  it("Uzbek Cyrillic is converted by code from the Latin script", () => {
    const cyr = finishPlan(raw, "uz_cyrl", "Patir 12 000 so‘m.");
    expect(cyr.hook).toMatch(/[А-Яа-яЎўҚқҒғҲҳ]/);
    expect(cyr.lang).toBe("uz_cyrl");
  });

  it("planSeconds adds the scenes up", () => {
    expect(planSeconds(plan)).toBe(3 + 10 + 3 + 9);
  });
});

describe("the caption: the channel's voice and ending, under Telegram's 1024 characters", () => {
  const plan: VideoPlan = { hook: "Tong", scenes: [{ seconds: 3, visual: "", voiceover: "Patir tayyor.", caption: "" }], musicMood: "" };
  const ending: PostEnding = { pattern: "contact", contact: "📞 +998 90 123 45 67", examples: ["📞 +998 90 123 45 67"] };
  const ctx = {
    facts: "Katta patir 12 000 so‘m. 📞 +998 90 123 45 67",
    products: ["patir"],
    ending,
    endingOptions: { channel: "tandirnon", bot: "mercatai" },
    fallback: { uz_latn: "Eski matn", ru: "Старый текст", en: "Old text" },
  };

  it("ends with the channel's own contact, drops a Mercat tracked link and an invented discount", () => {
    const out = finishCaption(
      {
        uz_latn: "Ertalab issiq patir. 20% chegirma faqat bugun!\n\nhttps://t.me/mercatai?start=src_abc123_2",
        ru: "Утром горячий патыр.",
        en: "Hot patir in the morning.",
      },
      ctx,
    );
    expect(out.uz_latn).toContain("+998 90 123 45 67");
    expect(out.uz_latn).not.toMatch(/chegirma/);
    expect(out.uz_latn).not.toMatch(/src_abc123/);
    expect(out.ru).toContain("+998 90 123 45 67");
    expect(out.uz_cyrl).toMatch(/[А-Яа-я]/);
    for (const s of ["uz_latn", "uz_cyrl", "ru", "en"] as const) expect(out[s].length).toBeLessThanOrEqual(VIDEO_CAPTION_LIMIT);
  });

  it("a version that comes back empty keeps the post's text", () => {
    const out = finishCaption({ uz_latn: "", ru: "Утром горячий патыр.", en: "Hot patir." }, { ...ctx, ending: undefined });
    expect(out.uz_latn).toBe("Eski matn");
  });

  it("a long caption loses body sentences, never the ending", () => {
    const body = Array.from({ length: 80 }, (_, i) => `Gap ${i} bu yerda turibdi.`).join(" ");
    const fitted = fitCaption(`${body}\n\n📞 +998 90 123 45 67`);
    expect(fitted.length).toBeLessThanOrEqual(VIDEO_CAPTION_LIMIT);
    expect(fitted.endsWith("📞 +998 90 123 45 67")).toBe(true);
    expect(fitCaption("short")).toBe("short");
  });

  it("the prompt has the post, the video and the ending", () => {
    const p = captionPrompt({ postText: "Patir tayyor", plan, knowledge: "", ending, products: ["patir"] });
    expect(p).toMatch(/THE POST/);
    expect(p).toMatch(/Patir tayyor\./);
    expect(p).toMatch(/HOW THE CHANNEL'S POSTS END/);
  });
});

describe("fmtDuration", () => {
  it("m:ss, empty when unknown", () => {
    expect(fmtDuration(23)).toBe("0:23");
    expect(fmtDuration(65.4)).toBe("1:05");
    expect(fmtDuration(undefined)).toBe("");
    expect(fmtDuration(-1)).toBe("");
  });
});

describe("the bot's video wait: link, buttons, limits", () => {
  it("video_<postId> round-trips and fits Telegram's 64 characters", () => {
    const p = videoStartPayload(ID.toUpperCase());
    expect(p.length).toBeLessThanOrEqual(64);
    expect(parseVideoPayload(p)).toBe(ID);
    expect(parseVideoPayload("video_x")).toBeNull();
    expect(parseVideoPayload(`publish_${ID}`)).toBeNull();
  });

  it("[Approve] carries the post and the hash of what was shown, within 64 bytes", () => {
    const d = videoApproveData(ID, "AbCdEfGhIjKlMnOp");
    expect(d.length).toBeLessThanOrEqual(64);
    expect(VIDEO_APPROVE_RE.exec(d)?.slice(1)).toEqual([ID, "AbCdEfGhIjKlMnOp"]);
  });

  it("length, size and file type", () => {
    expect(videoProblem({ fileId: "v", duration: 25, size: 10_000_000 })).toBeNull();
    expect(videoProblem({ fileId: "v", duration: 181 })).toBe("too_long");
    expect(videoProblem({ fileId: "v", duration: 1 })).toBe("too_short");
    expect(videoProblem({ fileId: "v", size: MAX_VIDEO_BYTES + 1 })).toBe("too_big");
    expect(videoProblem({ fileId: "v", as: "document", mime: "application/pdf" })).toBe("not_video");
    expect(videoProblem({ fileId: "v", as: "document", mime: "video/mp4" })).toBeNull();
    expect(videoProblem({ fileId: "" })).toBe("not_video");
  });

  it("a channel link or a description while waiting is a new run; a short word is not", () => {
    expect(isNewRunText("@tandirnon")).toBe(true);
    expect(isNewRunText("https://t.me/tandirnon")).toBe(true);
    expect(isNewRunText("Biz Chilonzorda tandir non va patir pishiramiz, har kuni ertalab")).toBe(true);
    expect(isNewRunText("hozir")).toBe(false);
  });
});
