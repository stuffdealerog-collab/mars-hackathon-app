import { describe, expect, it } from "vitest";
import { codeForStatus, errorText, pickApiLang } from "../src/lib/uslub/errors";
import { cleanBrief, slotBrief, slotSummary, toPlanSlot } from "../src/lib/uslub/slots";
import { estimateUsd, summarizeUsage, usageEntry } from "../src/lib/uslub/usage-cost";

describe("owner-safe errors", () => {
  it("picks the owner's language: body/query first, then Accept-Language, default uz", () => {
    expect(pickApiLang("ru")).toBe("ru");
    expect(pickApiLang(null, undefined, "en-US,en;q=0.9")).toBe("en");
    expect(pickApiLang(null, "de-DE,ru;q=0.8")).toBe("ru");
    expect(pickApiLang(null, "fr")).toBe("uz");
  });

  it("renders a plain sentence per code and language", () => {
    expect(errorText("channel_empty", "uz", { channel: "@kanal" })).toMatch(/^@kanal kanalida/);
    expect(errorText("channel_empty", "ru", { channel: "@kanal" })).toMatch(/Опишите ваш бизнес/);
    expect(errorText("rate_limited", "en", { seconds: 30 })).toBe("Too many requests. Try again in 30 s.");
    expect(errorText("ai_failed", "uz")).not.toMatch(/AI request failed|Error|stack/i);
    expect(codeForStatus(503)).toBe("ai_not_configured");
    expect(codeForStatus(418)).toBe("internal");
  });
});

describe("posts from plan slots", () => {
  const slot = {
    day: "2026-11-26",
    time: "19:40",
    goal: "sale" as const,
    hook: "Napoleon torti — 180 000 so‘m [F3]",
    cta: "Buyurtma: https://t.me/mercat_bot?start=src_ab12cd_3",
    brief: "Napoleon tortini sotamiz, narx F3 dan. [F3, S.ctaRate]\n— Dalil: S.ctaRate · F3 | Vaqt: data | Tasdiq: narx",
  };

  it("strips ledger ids and the strategist's meta line", () => {
    expect(cleanBrief(slot.brief)).toBe("Napoleon tortini sotamiz, narx F3 dan.");
    expect(slotSummary(slot)).toBe("Napoleon tortini sotamiz, narx F3 dan.");
  });

  it("hands the copywriter the plan's hook, CTA (link verbatim), goal and time", () => {
    const b = slotBrief(slot);
    expect(b).toContain("2026-11-26 at 19:40");
    expect(b).toContain("SALE post");
    expect(b).toContain('"Napoleon torti — 180 000 so‘m"');
    expect(b).toContain("https://t.me/mercat_bot?start=src_ab12cd_3");
    expect(b).not.toMatch(/Dalil|\[F3/);
  });

  it("stores the contract PlanSlot on the post", () => {
    expect(toPlanSlot(slot)).toEqual({ day: "2026-11-26", time: "19:40", goal: "sale", hook: "Napoleon torti — 180 000 so‘m", cta: slot.cta });
  });
});

describe("Claude usage accounting", () => {
  it("reads SDK usage defensively and prices it", () => {
    const e = usageEntry("claude-sonnet-5-5", { input_tokens: 10_000, output_tokens: 2_000, cache_read_input_tokens: 5_000, server_tool_use: { web_search_requests: 2 } }, 1234.4, "copywriter");
    expect(e).toEqual({ model: "claude-sonnet-5-5", purpose: "copywriter", input: 10_000, output: 2_000, cacheWrite: 0, cacheRead: 5_000, webSearches: 2, ms: 1234 });
    // 10k × $2 + 2k × $10 + 5k × $0.10 per MTok + 2 searches × $0.01
    expect(estimateUsd(e)).toBeCloseTo(0.02 + 0.02 + 0.0005 + 0.02, 6);
    expect(usageEntry("claude-haiku-5-5", null, 5).input).toBe(0);
  });

  it("summarizes a run per model and purpose", () => {
    const s = summarizeUsage("uslub/posts", [
      usageEntry("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 500 }, 10, "copywriter"),
      usageEntry("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 500 }, 30, "copywriter"),
      usageEntry("claude-haiku-5-5", { input_tokens: 2000, output_tokens: 100 }, 5, "critic"),
    ]);
    expect(s).toMatchObject({ route: "uslub/posts", calls: 3, input: 4000, output: 1100, slowestMs: 30 });
    expect(s.byModel["claude-sonnet-5-5"].calls).toBe(2);
    expect(s.byPurpose).toEqual({ copywriter: 2, critic: 1 });
    expect(s.usd).toBeGreaterThan(0);
  });
});
