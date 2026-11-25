import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); } }));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {} }));
vi.mock("@/lib/i18n", async () => await import("../src/lib/i18n"));
vi.mock("@/lib/env", () => ({ getEnv: () => ({}), getPublicUrl: () => undefined }));
vi.mock("@/lib/telegram-auth", () => ({ authenticateRequest: () => null, validateInitData: () => ({ ok: false }) }));
vi.mock("../src/lib/uslub/publish", () => ({ publishPost: vi.fn(), addBotAsAdminLink: () => "https://t.me/test_bot?startchannel" }));

// A brand step that only finishes when the test says so (a slow Telegram or Claude).
let finishBrand: () => void = () => {};
vi.mock("../src/lib/uslub/brand", () => ({
  buildBrand: () =>
    new Promise((resolve) => {
      finishBrand = () =>
        resolve({ brand: { id: "b1", channel: "tort_uyi", knowledge: "", samplePosts: [], dna: { name: "Tort uyi", oneLiner: "", audience: "", tone: "", address: "siz", emojiDensity: "low", products: [], languages: ["uz_latn"] }, createdAt: "" } });
    }),
}));
vi.mock("../src/lib/uslub/copywriter", () => ({ generatePosts: async () => [] }));
// The planner is not what these tests are about: no analysis, no plan (the run falls back to plain posts).
vi.mock("../src/lib/uslub/botflow/plan", () => ({ analyzeForBot: async () => null, planForBrand: async () => null, writePlanPosts: async () => [] }));

const { runOnboardingInTime, RETRY_ONBOARD_RE } = await import("../src/lib/uslub/onboard");
const { t } = await import("../src/lib/i18n");

function fakeApi() {
  const sent: { text: string; opts?: Record<string, unknown> }[] = [];
  return { sent, api: { sendMessage: async (_c: number, text: string, opts?: Record<string, unknown>) => void sent.push({ text, opts }) } as never };
}

describe("a bot onboarding that takes too long", () => {
  it("answers the owner in time (ru, with a retry button) but keeps running until it really ends", async () => {
    const { api, sent } = fakeApi();
    const run = await runOnboardingInTime(api, 1, 7, { channel: "tort_uyi" }, "ru", 30);
    expect(run.result).toBe("timeout");
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toMatch(/получается долго/);
    const button = (sent[0].opts?.reply_markup as { inline_keyboard: { callback_data?: string }[][] }).inline_keyboard.flat()[0];
    expect(button.callback_data).toBe("ob:tort_uyi");
    expect(RETRY_ONBOARD_RE.exec(button.callback_data ?? "")?.[1]).toBe("tort_uyi");

    // The caller holds the spend gate until `settled`: it is still pending while the slow step runs.
    let settled = false;
    void run.settled.then(() => {
      settled = true;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(settled).toBe(false);

    finishBrand(); // the slow step finishes: the result is still delivered, then the run settles
    await run.settled;
    expect(settled).toBe(true);
    expect(sent.length).toBeGreaterThan(1);
    expect(sent.some((m) => /Tort uyi/.test(m.text))).toBe(true); // the brand voice arrived late
    // The plan failed and no post was written: never "Готово" for that, but an error and the retry button.
    expect(sent.some((m) => /Готово/.test(m.text))).toBe(false);
    const last = sent.at(-1);
    expect(last?.text).toBe(`⚠️ ${t("ru", "bot.error")}\n\n${t("ru", "bot.or_describe")}`);
    expect((last?.opts?.reply_markup as { inline_keyboard: { callback_data?: string }[][] }).inline_keyboard.flat()[0].callback_data).toBe("ob:tort_uyi");
  });

  it("asks to resend a business description (it can't fit in a button)", async () => {
    const { api, sent } = fakeApi();
    const run = await runOnboardingInTime(api, 1, 7, { knowledge: "Uyda tort pishiraman, Chilonzor." }, "uz", 30);
    expect(run.result).toBe("timeout");
    expect(sent[0].text).toMatch(/tavsifini yana bir marta yuboring/);
    expect(sent[0].opts).toBeUndefined();
    finishBrand();
    await run.settled;
  });
});
