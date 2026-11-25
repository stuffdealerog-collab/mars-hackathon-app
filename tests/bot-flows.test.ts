import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The bot's flows after a run, through bot.ts's real handlers on a grammY Bot with a fake Telegram API: the onboarding
// (brand voice, analysis, plan, posts, then the questions), the pending-state dispatcher (questions, photos, a video),
// owner-only buttons, and the customer link naming a verified business. The planner, the writer and the style learner
// are mocked; stores run in memory. Nothing reaches Telegram, Claude or the database.
const later = vi.hoisted(() => [] as (() => Promise<void>)[]);
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => void later.push(task) }));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false, getSql: () => { throw new Error("no db in tests"); }, pgErrorCode: () => undefined }));
const events = vi.hoisted(() => [] as { id: number | null; type: string; props: Record<string, unknown> }[]);
const trackMock = vi.hoisted(() => ({
  safeLogEvent: async (id: number | null, type: string, props: Record<string, unknown> = {}) => void events.push({ id, type, props }),
  track: async () => null,
  parseSource: () => null,
}));
vi.mock("@/lib/track", () => trackMock);
vi.mock("../src/lib/track", () => trackMock);
vi.mock("@/lib/i18n", async () => await import("../src/lib/i18n"));
const env = vi.hoisted(() => ({ TELEGRAM_BOT_TOKEN: "123456:TEST-bot-token-xxxxxxxxxxxxxxxxxxxxxxxx", ANTHROPIC_API_KEY: "test", BOT_USERNAME: "mercatai" }));
const envMock = vi.hoisted(() => ({ getEnv: () => env, getPublicUrl: () => "https://mercat.test" }));
vi.mock("@/lib/env", () => envMock);
vi.mock("../src/lib/env", () => envMock);
vi.mock("@/lib/telegram-auth", () => ({ authenticateRequest: () => null, validateInitData: () => ({ ok: false }) }));
vi.mock("../src/lib/uslub/publish", () => ({ publishPost: vi.fn(), addBotAsAdminLink: () => "https://t.me/mercatai?startchannel" }));
const buildBrand = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/uslub/brand", () => ({ buildBrand }));
const generatePosts = vi.hoisted(() => vi.fn(async (): Promise<unknown[]> => []));
vi.mock("../src/lib/uslub/copywriter", () => ({ generatePosts }));
const planner = vi.hoisted(() => ({ analyzeForBot: vi.fn(), planForBrand: vi.fn(), writePlanPosts: vi.fn() }));
vi.mock("../src/lib/uslub/botflow/plan", () => planner);
const visual = vi.hoisted(() => ({
  learnAndSaveVisual: vi.fn(),
  actorKey: (id: number | null) => `tg:${id}`,
  VisualLimitError: class VisualLimitError extends Error {},
}));
vi.mock("../src/lib/uslub/visual/service", () => visual);
const planByTag = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/uslub/brain/memory", async (importOriginal) => ({ ...(await importOriginal<object>()), planByTag }));

const { getBot } = await import("../src/lib/bot");
const { t } = await import("../src/lib/i18n");
const store = await import("../src/lib/uslub/store");
const { loadAnswers } = await import("../src/lib/uslub/brain/answers-store");
const { runQuestions } = await import("../src/lib/uslub/brain/questions");
const { getPending, resetPendingMemory, setPending } = await import("../src/lib/uslub/botflow/pending");
const { registerVideoHandler, waitForVideo } = await import("../src/lib/uslub/botflow/flows");
const { questionData, photosData, rebuildData } = await import("../src/lib/uslub/botflow/questions-core");
const { resetPlanOwnerCache } = await import("../src/lib/uslub/brain/plan-owner");
const { runOnboardingInTime } = await import("../src/lib/uslub/onboard");
import type { BrandDNA, ChannelAudit, ContentPlan, PostDraft } from "../src/lib/uslub/contract";

type Call = { method: string; payload: Record<string, unknown> };
const calls: Call[] = [];
const members = new Map<string, string>(); // "<chat>:<user>" -> status
/** A sendMessage whose text this returns true for fails as Telegram would (400). */
let failSend: ((text: string) => boolean) | null = null;

const bot = getBot();
bot.botInfo = { id: 1, is_bot: true, first_name: "Mercat", username: "mercatai" } as never;
bot.api.config.use(async (_prev, method, payload) => {
  const p = (payload ?? {}) as Record<string, unknown>;
  calls.push({ method, payload: p });
  if (method === "sendMessage" && failSend?.(String(p.text))) return { ok: false, error_code: 400, description: "Bad Request: chat not found" } as never;
  if (method === "sendMessage") return { ok: true, result: { message_id: calls.length, date: 0, chat: { id: p.chat_id, type: "private" }, text: p.text } } as never;
  if (method === "getFile") return { ok: true, result: { file_id: p.file_id, file_unique_id: `u${String(p.file_id)}`, file_size: 4, file_path: `photos/${String(p.file_id)}.jpg` } } as never;
  if (method === "getChatMember") {
    const status = members.get(`${String(p.chat_id)}:${String(p.user_id)}`);
    if (!status) return { ok: false, error_code: 400, description: "Bad Request: member not found" } as never;
    return { ok: true, result: { status, user: { id: p.user_id, is_bot: false, first_name: "x" } } } as never;
  }
  if (method.startsWith("getMy")) return { ok: true, result: method === "getMyCommands" ? [] : method === "getMyName" ? { name: "" } : method === "getMyDescription" ? { description: "" } : { short_description: "" } } as never;
  if (method === "getChatMenuButton") return { ok: true, result: { type: "default" } } as never;
  return { ok: true, result: true } as never;
});

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]);
const fetchMock = vi.fn(async () => new Response(JPEG, { status: 200, headers: { "content-length": String(JPEG.length) } }));
vi.stubGlobal("fetch", fetchMock);

/** Runs the work queued with after() (and anything it queues), as the platform would after the webhook answered. */
async function drain() {
  while (later.length) await Promise.all(later.splice(0).map((task) => task()));
}

let nextUser = 1000;
let updateId = 1;
const from = (id: number, language_code = "uz") => ({ id, is_bot: false, first_name: "Ali", language_code });
const chat = (id: number) => ({ id, type: "private" as const, first_name: "Ali" });
const textUpdate = (user: number, text: string, language_code = "uz") => ({
  update_id: updateId++,
  message: { message_id: updateId, date: 0, chat: chat(user), from: from(user, language_code), text, ...(text.startsWith("/") ? { entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0].length }] } : {}) },
});
const callback = (user: number, data: string, language_code = "uz") => ({
  update_id: updateId++,
  callback_query: { id: String(updateId), from: from(user, language_code), chat_instance: "ci", data, message: { message_id: 5, date: 0, chat: chat(user), text: "x" } },
});
const photoUpdate = (user: number, fileId: string, mediaGroup?: string) => ({
  update_id: updateId++,
  message: {
    message_id: updateId,
    date: 0,
    chat: chat(user),
    from: from(user),
    ...(mediaGroup ? { media_group_id: mediaGroup } : {}),
    photo: [
      { file_id: `${fileId}_s`, file_unique_id: `${fileId}_us`, width: 90, height: 68, file_size: 900 },
      { file_id: fileId, file_unique_id: `${fileId}_u`, width: 1280, height: 960, file_size: 90_000 },
    ],
  },
});
const send = async (update: object) => {
  await bot.handleUpdate(update as never);
  await drain();
};

const sent = () => calls.filter((c) => c.method === "sendMessage");
const texts = () => sent().map((c) => String(c.payload.text));
const lastText = () => texts().at(-1) ?? "";
type Kb = { inline_keyboard?: { text: string; callback_data?: string; url?: string; web_app?: { url: string } }[][] };
const buttonsOf = (c: Call | undefined) => ((c?.payload.reply_markup as Kb | undefined)?.inline_keyboard ?? []).flat();
const lastButtons = () => buttonsOf(sent().at(-1));
const toasts = () => calls.filter((c) => c.method === "answerCallbackQuery").map((c) => c.payload.text);

const dna = {
  name: "Tort uyi",
  oneLiner: "Toshkentdagi uy torti",
  audience: "onalar",
  tone: "iliq",
  address: "siz",
  emojiDensity: "low",
  products: ["Medovik", "Napoleon"],
  languages: ["uz_latn"],
} as unknown as BrandDNA;

async function newBrand(owner: number, extra: Partial<Parameters<typeof store.saveBrand>[0]> = {}) {
  return store.saveBrand({ channel: "tort_uyi", knowledge: "", samplePosts: ["Medovik tayyor!"], dna, mode: "channel", channelType: "business", ...extra }, owner, "channel_only");
}

const plan = (n = 3): ContentPlan => ({
  weekOf: "2026-11-30",
  rationale: "",
  items: Array.from({ length: n }, (_, i) => ({
    day: `2026-12-0${i + 1}`,
    time: "19:00",
    goal: "sale" as const,
    pillar: "Sotuv",
    format: "photo",
    hook: `Medovik ${i + 1}`,
    cta: "",
    brief: "b",
    metric: "",
    needsApproval: false,
    timeLabel: "Kanalingiz bo‘yicha eng yaxshi vaqt: du 19:00",
  })),
});

const audit: ChannelAudit = {
  channel: "@tort_uyi",
  subscribers: 2400,
  postsAnalyzed: 30,
  postsPerWeek: 3,
  avgViews: 600,
  reachRate: 0.25,
  bestHours: [19],
  bestWeekdays: [0],
  formatMix: {},
  topPosts: [],
  findings: [{ kind: "problem", text: "Narx postlarning faqat uchdan birida bor", evidence: "" }],
};

const post = (brandId: string, i: number): PostDraft => ({
  id: crypto.randomUUID(),
  brandId,
  brief: "b",
  variants: { uz_latn: `Medovik ${i}: bugun tayyor.`, uz_cyrl: "", ru: "", en: "" },
  neuroHits: {},
  humanScore: 92,
  status: "draft",
  createdAt: new Date().toISOString(),
});

beforeEach(() => {
  calls.length = 0;
  events.length = 0;
  later.length = 0;
  members.clear();
  resetPendingMemory();
  resetPlanOwnerCache();
  registerVideoHandler(null);
  failSend = null;
  for (const f of [buildBrand, planner.analyzeForBot, planner.planForBrand, planner.writePlanPosts, visual.learnAndSaveVisual, planByTag, fetchMock, generatePosts]) f.mockClear();
});

afterEach(async () => {
  await drain();
});

/** Onboards a channel for `user` with the planner answering as given; returns the brand. */
async function onboard(user: number, opts: { goal?: "sale" | "grow"; questions?: ReturnType<typeof runQuestions>; reused?: boolean; brandExtra?: Parameters<typeof newBrand>[1] } = {}) {
  const brand = await newBrand(user, opts.brandExtra);
  buildBrand.mockResolvedValueOnce({ brand, cached: false, reused: opts.reused, channel: { totalMessages: 40 } });
  planner.analyzeForBot.mockResolvedValueOnce(audit);
  planner.planForBrand.mockResolvedValueOnce({
    mode: "channel",
    plan: plan(),
    questions: opts.questions ?? runQuestions({ lang: "uz", channelType: "business", products: ["Medovik", "Napoleon"] }),
    goal: opts.goal ?? "sale",
    channelType: "business",
  });
  planner.writePlanPosts.mockImplementationOnce(async (_b: unknown, items: unknown[]) => items.map((_, i) => post(brand.id, i + 1)));
  await send(textUpdate(user, "https://t.me/tort_uyi"));
  return brand;
}

describe("a channel run in the bot: the Studio's analysis, plan and posts, then the questions", () => {
  it("sends the voice, the analysis, the plan, two plan posts, the app buttons, then the goal question pre-filled", async () => {
    const user = ++nextUser;
    const brand = await onboard(user);
    const all = texts();
    expect(all[0]).toContain("@tort_uyi"); // working…
    expect(all[1]).toContain("Tort uyi"); // brand voice
    expect(all[2]).toContain("@tort_uyi kanali tahlili");
    expect(all[2]).toContain("2 400 obunachi");
    expect(all[3]).toContain("Haftalik reja: 3 ta post");
    expect(all[3]).toContain("• du 19:00 — Medovik 1");
    expect(all[4]).toContain("Medovik 1: bugun tayyor.");
    expect(all[5]).toContain("Medovik 2: bugun tayyor.");
    expect(all[6]).toBe(t("uz", "bot.done"));
    expect(all[7]).toContain("Kanalning asosiy maqsadi nima?");
    expect(all[7]).toContain(t("uz", "bot.q_suggested", { label: "Ko‘proq buyurtma" }));
    expect(lastButtons().map((b) => b.callback_data)).toEqual([
      questionData("g", brand.id, "sale"),
      questionData("g", brand.id, "grow"),
      questionData("s", brand.id, "goal"),
    ]);
    // The plan's first two items were written (the same posts the Studio writes first), by this owner.
    expect(planner.writePlanPosts).toHaveBeenCalledWith(brand, plan().items.slice(0, 2), user, expect.any(Number));
    expect(events.find((e) => e.type === "bot_onboarded")?.props).toMatchObject({ brand_id: brand.id, analysis: true, plan_items: 3, posts: 2, goal: "sale" });
    expect((await getPending(user))?.kind).toBe("goal");
  });

  it("business: goal -> how customers order -> the contact -> 3 prices -> thanks -> up to 3 photos", async () => {
    const user = ++nextUser;
    const brand = await onboard(user);

    await send(callback(user, questionData("g", brand.id, "sale")));
    expect(toasts()).toContain(t("uz", "bot.q_saved"));
    expect(lastText()).toContain("Mijozlar qanday buyurtma beradi?");
    expect(lastButtons().map((b) => b.callback_data)).toContain(questionData("o", brand.id, "mercat_link"));
    expect((await loadAnswers(brand.id))?.goal).toBe("sale");
    expect((await store.getBrand(brand.id))?.goal).toBe("sale");
    // Answers make a public channel_only row the owner's own (private facts never sit on a cache row).
    expect((await store.getBrand(brand.id))?.source).toBe("custom");

    await send(callback(user, questionData("o", brand.id, "phone")));
    expect(lastText()).toBe(t("uz", "bot.q_contact_phone"));
    await send(textUpdate(user, "+998 90 123 45 67"));
    expect((await loadAnswers(brand.id))).toMatchObject({ orderHow: "phone", contact: "+998 90 123 45 67" });
    expect(lastText()).toContain("3 ta asosiy mahsulot");
    expect(lastText()).toContain("Medovik — "); // pre-filled from the brand's products

    await send(textUpdate(user, "narxi har xil"));
    expect(lastText()).toBe(t("uz", "bot.q_prices_bad"));
    await send(textUpdate(user, "Medovik — 180 000 so'm\nNapoleon 150000"));
    expect((await loadAnswers(brand.id))?.prices).toEqual([
      { name: "Medovik", price: "180 000 so'm" },
      { name: "Napoleon", price: "150000" },
    ]);
    const tail = texts().slice(-2);
    expect(tail[0]).toBe(t("uz", "bot.q_done"));
    expect(tail[1]).toBe(t("uz", "bot.photos_ask"));
    expect(lastButtons().map((b) => b.callback_data)).toEqual([photosData("s", brand.id)]);
    expect((await getPending(user))?.kind).toBe("photos");
    // Analytics: codes only, never what the owner typed.
    const answered = events.filter((e) => e.type === "bot_answer").map((e) => e.props.key);
    expect(answered).toEqual(["goal", "order", "contact", "prices"]);
    expect(JSON.stringify(events)).not.toContain("123 45 67");
    expect(events.find((e) => e.type === "goal_confirmed")?.props).toEqual({ brand_id: brand.id, goal: "sale", from: "bot_onboarding" });
  });

  it("a growth goal for a shop: the rebuild offer, then 'what is the channel about'; a typed word picks the goal", async () => {
    const user = ++nextUser;
    const brand = await onboard(user);
    await send(textUpdate(user, "obunachi"));
    const offer = sent().find((c) => String(c.payload.text).includes("qayta tuzaymi"));
    expect(offer).toBeDefined();
    expect(buttonsOf(offer).map((b) => b.callback_data)).toEqual([rebuildData(brand.id)]);
    expect(lastText()).toContain("Kanal nima haqida?");
    await send(textUpdate(user, "Uy tortlari, retseptlar va buyurtmalar; onalar o‘qiydi"));
    expect((await loadAnswers(brand.id))).toMatchObject({ goal: "grow", about: "Uy tortlari, retseptlar va buyurtmalar; onalar o‘qiydi" });
  });

  it("every question can be skipped; skipping all goes straight to the photos without a thank-you", async () => {
    const user = ++nextUser;
    const brand = await onboard(user);
    await send(callback(user, questionData("s", brand.id, "goal")));
    expect(lastText()).toContain("Mijozlar qanday buyurtma beradi?");
    await send(callback(user, questionData("s", brand.id, "order")));
    await send(callback(user, questionData("s", brand.id, "prices")));
    expect(lastText()).toBe(t("uz", "bot.photos_ask"));
    expect(texts()).not.toContain(t("uz", "bot.q_done"));
    expect(await loadAnswers(brand.id)).toBeNull();
    expect(events.filter((e) => e.type === "bot_answer_skipped").map((e) => e.props.key)).toEqual(["goal", "order", "prices"]);
    // "Later" ends the wait.
    await send(callback(user, photosData("s", brand.id)));
    expect(lastText()).toBe(t("uz", "bot.photos_skipped"));
    expect(await getPending(user)).toBeNull();
  });

  it("with 'how customers order' open, a bare @channel is a new run, never the brand's contact", async () => {
    const user = ++nextUser;
    const brand = await onboard(user);
    await send(callback(user, questionData("g", brand.id, "sale")));
    expect(await getPending(user)).toMatchObject({ kind: "fact", key: "order" });
    const other = await newBrand(user, { channel: "boshqa_kanal" });
    buildBrand.mockResolvedValueOnce({ brand: other, cached: false, channel: { totalMessages: 20 } });
    planner.analyzeForBot.mockResolvedValueOnce(null);
    planner.planForBrand.mockResolvedValueOnce(null);
    await send(textUpdate(user, "@boshqa_kanal"));
    expect(buildBrand).toHaveBeenLastCalledWith(expect.objectContaining({ channel: "boshqa_kanal" }));
    const answers = await loadAnswers(brand.id);
    expect(answers?.goal).toBe("sale");
    expect(answers?.contact).toBeUndefined();
    expect(answers?.orderHow).toBeUndefined();
  });

  it("on a blog the pre-filled 'more subscribers' is the first button, and a typed '1' picks it", async () => {
    const user = ++nextUser;
    const brand = await onboard(user, { goal: "grow", questions: runQuestions({ lang: "uz", channelType: "blog" }), brandExtra: { channelType: "blog" } });
    expect(lastButtons()[0].callback_data).toBe(questionData("g", brand.id, "grow"));
    await send(textUpdate(user, "1"));
    expect((await loadAnswers(brand.id))?.goal).toBe("grow");
    expect(texts().some((x) => x.includes("qayta tuzaymi"))).toBe(false);
    expect(lastText()).toContain("Kanal nima haqida?");
  });

  it("a website follow-up answered without a site gets a site example", async () => {
    const user = ++nextUser;
    const brand = await onboard(user);
    await send(callback(user, questionData("g", brand.id, "sale")));
    await send(callback(user, questionData("o", brand.id, "site")));
    expect(lastText()).toBe(t("uz", "bot.q_contact_site"));
    await send(textUpdate(user, "bilmayman"));
    expect(lastText()).toBe(t("uz", "bot.q_contact_bad_site"));
    await send(textUpdate(user, "tortuyi.uz"));
    expect(await loadAnswers(brand.id)).toMatchObject({ orderHow: "site", contact: "tortuyi.uz" });
  });

  it("a question that Telegram refuses to send stays silent: no '⚠️' after 'Done'", async () => {
    const user = ++nextUser;
    failSend = (text) => text.includes("Kanalning asosiy maqsadi nima?");
    await onboard(user);
    expect(texts().some((x) => x.startsWith("⚠️"))).toBe(false);
    expect(texts()).toContain(t("uz", "bot.done"));
  });

  it("a re-run of a channel the owner already has asks no photos", async () => {
    const user = ++nextUser;
    const brand = await onboard(user, { reused: true, questions: [] });
    expect(lastText()).toBe(t("uz", "bot.done"));
    expect(await getPending(user)).toBeNull();
    expect(brand.id).toBeTruthy();
  });

  it("the rebuild button re-runs the channel for its owner only", async () => {
    const user = ++nextUser;
    const brand = await onboard(user);
    await send(callback(user + 50_000, rebuildData(brand.id)));
    expect(toasts()).toContain(t("uz", "bot.not_your_brand"));
    expect(buildBrand).toHaveBeenCalledTimes(1);
    buildBrand.mockResolvedValueOnce({ brand, cached: true, reused: true, channel: { totalMessages: 40 } });
    planner.analyzeForBot.mockResolvedValueOnce(null);
    planner.planForBrand.mockResolvedValueOnce(null);
    await send(callback(user, rebuildData(brand.id)));
    expect(buildBrand).toHaveBeenCalledTimes(2);
    expect(buildBrand.mock.calls[1][0]).toMatchObject({ channel: "tort_uyi", ownerTelegramId: user });
    expect(events.find((e) => e.type === "post_regenerated")?.props).toEqual({ brand_id: brand.id, why: "another_version" });
  });

  it("a rebuild that cannot start (AI off) is not counted as a regenerated post", async () => {
    const user = ++nextUser;
    const brand = await onboard(user);
    const key = env.ANTHROPIC_API_KEY;
    env.ANTHROPIC_API_KEY = "";
    try {
      await send(callback(user, rebuildData(brand.id)));
    } finally {
      env.ANTHROPIC_API_KEY = key;
    }
    expect(lastText()).toBe(t("uz", "bot.ai_unavailable"));
    expect(buildBrand).toHaveBeenCalledTimes(1);
    expect(events.some((e) => e.type === "post_regenerated")).toBe(false);
  });
});

describe("the run's last message says what the owner really got", () => {
  it("posts without a plan: no word about a whole plan", async () => {
    const user = ++nextUser;
    const brand = await newBrand(user);
    buildBrand.mockResolvedValueOnce({ brand, cached: false, channel: { totalMessages: 40 } });
    planner.analyzeForBot.mockResolvedValueOnce(null);
    planner.planForBrand.mockResolvedValueOnce(null);
    generatePosts.mockResolvedValueOnce([post(brand.id, 1), post(brand.id, 2)]);
    await send(textUpdate(user, "https://t.me/tort_uyi"));
    expect(texts()).toContain(t("uz", "bot.done_no_plan"));
    expect(texts()).not.toContain(t("uz", "bot.done"));
    expect(lastText()).toContain("Kanalning asosiy maqsadi nima?"); // the questions still follow
  });

  it("neither a plan nor a post: an error with a retry button, never 'Done', and no questions", async () => {
    const user = ++nextUser;
    const brand = await newBrand(user);
    buildBrand.mockResolvedValueOnce({ brand, cached: false, channel: { totalMessages: 40 } });
    planner.analyzeForBot.mockResolvedValueOnce(null);
    planner.planForBrand.mockResolvedValueOnce(null);
    await send(textUpdate(user, "https://t.me/tort_uyi"));
    expect(lastText()).toBe(`⚠️ ${t("uz", "bot.error")}\n\n${t("uz", "bot.or_describe")}`);
    expect(lastButtons().map((b) => b.callback_data)).toEqual(["ob:tort_uyi"]);
    for (const key of ["bot.done", "bot.done_no_plan", "bot.posts_later"] as const) expect(texts()).not.toContain(t("uz", key));
    expect(await getPending(user)).toBeNull();
    expect(events.find((e) => e.type === "bot_onboarded")?.props).toMatchObject({ brand_id: brand.id, posts: 0, plan_items: 0 });
  });

  it("a plan without posts sends the owner to the app's «Postini yozish»", async () => {
    const user = ++nextUser;
    const brand = await newBrand(user);
    buildBrand.mockResolvedValueOnce({ brand, cached: false, channel: { totalMessages: 40 } });
    planner.analyzeForBot.mockResolvedValueOnce(null);
    planner.planForBrand.mockResolvedValueOnce({ mode: "channel", plan: plan(), questions: [], goal: "sale", channelType: "business" });
    planner.writePlanPosts.mockResolvedValueOnce([]);
    await send(textUpdate(user, "https://t.me/tort_uyi"));
    expect(texts()).toContain(t("uz", "bot.posts_later"));
    expect(texts()).not.toContain(t("uz", "bot.done"));
  });
});

describe("a business description and a slow run", () => {
  it("a description gets the 2-week launch plan and its first posts, no channel analysis, and no rebuild offer", async () => {
    const user = ++nextUser;
    const brand = await newBrand(user, { channel: undefined, mode: "fresh", samplePosts: [], knowledge: "Uyda tort pishiraman, Chilonzorda yetkazib beraman." });
    buildBrand.mockResolvedValueOnce({ brand, cached: false });
    planner.analyzeForBot.mockResolvedValueOnce(null);
    planner.planForBrand.mockResolvedValueOnce({ mode: "fresh", plan: plan(), questions: runQuestions({ lang: "uz" }), goal: "sale" });
    planner.writePlanPosts.mockImplementationOnce(async (_b: unknown, items: unknown[]) => items.map((_, i) => post(brand.id, i + 1)));
    await send(textUpdate(user, "Uyda tort pishiraman, Chilonzorda yetkazib beraman. Buyurtma telefon orqali."));
    expect(buildBrand).toHaveBeenCalledWith(expect.objectContaining({ knowledge: expect.stringContaining("Uyda tort"), ownerTelegramId: user }));
    expect(texts().some((x) => x.includes("Ishga tushirish rejasi (2 hafta): 3 ta post"))).toBe(true);
    expect(texts().some((x) => x.includes("tahlili"))).toBe(false);
    expect(lastText()).toContain("Kanalning asosiy maqsadi nima?");
    await send(callback(user, questionData("g", brand.id, "grow")));
    expect(texts().some((x) => x.includes("qayta tuzaymi"))).toBe(false);
  });

  it("once the owner has the voice or the plan, a slow run only says the posts are coming (no retry button)", async () => {
    const user = ++nextUser;
    const brand = await newBrand(user);
    buildBrand.mockResolvedValueOnce({ brand, cached: false, channel: { totalMessages: 40 } });
    planner.analyzeForBot.mockResolvedValueOnce(null);
    let finishPlan: (v: null) => void = () => {};
    planner.planForBrand.mockReturnValueOnce(new Promise((r) => (finishPlan = r)));
    const out: { text: string; opts?: Record<string, unknown> }[] = [];
    const api = { sendMessage: async (_c: number, text: string, opts?: Record<string, unknown>) => void out.push({ text, opts }) } as never;
    const run = await runOnboardingInTime(api, user, user, { channel: "tort_uyi" }, "en", 30);
    expect(run.result).toBe("timeout");
    expect(out.map((m) => m.text)).toContain(t("en", "bot.too_slow_posts"));
    expect(out.find((m) => m.text === t("en", "bot.too_slow_posts"))?.opts).toBeUndefined();
    finishPlan(null);
    await run.settled;
  });
});

describe("the pending-state dispatcher (read before a message counts as a new run)", () => {
  it("buttons are for the brand's owner only", async () => {
    const user = ++nextUser;
    const brand = await onboard(user);
    const stranger = user + 50_000;
    await send(callback(stranger, questionData("g", brand.id, "grow")));
    expect(toasts()).toContain(t("uz", "bot.not_your_brand"));
    expect(await loadAnswers(brand.id)).toBeNull();
    await send(callback(stranger, photosData("s", brand.id)));
    expect((await getPending(user))?.kind).toBe("goal");
  });

  it("a channel link while a question is open starts a new run (and the old question is dropped)", async () => {
    const user = ++nextUser;
    const brand = await onboard(user);
    await send(callback(user, questionData("g", brand.id, "grow"))); // -> "what is the channel about?"
    expect((await getPending(user))?.kind).toBe("fact");
    const other = await newBrand(user, { channel: "boshqa_kanal" });
    buildBrand.mockResolvedValueOnce({ brand: other, cached: false, channel: { totalMessages: 20 } });
    planner.analyzeForBot.mockResolvedValueOnce(null);
    planner.planForBrand.mockResolvedValueOnce(null);
    await send(textUpdate(user, "https://t.me/boshqa_kanal"));
    expect(buildBrand).toHaveBeenLastCalledWith(expect.objectContaining({ channel: "boshqa_kanal" }));
    expect(await loadAnswers(brand.id)).toMatchObject({ goal: "grow" });
    expect((await loadAnswers(brand.id))?.about).toBeUndefined();
  });

  it("an expired question is not answered: the text is read as usual", async () => {
    const user = ++nextUser;
    const brand = await newBrand(user);
    const q = runQuestions({ lang: "uz", channelType: "blog" }).find((x) => x.key === "about");
    await setPending(user, { kind: "fact", key: "about", brandId: brand.id, at: Date.now() - 3 * 3600_000, flow: { queue: q ? [q] : [], skipped: [] } });
    await send(textUpdate(user, "salom"));
    expect(lastText()).toBe(t("uz", "bot.onboard_prompt"));
    expect(await loadAnswers(brand.id)).toBeNull();
  });

  it("a stale goal button after the flow ended still saves the owner's goal and asks what that goal needs", async () => {
    const user = ++nextUser;
    const brand = await newBrand(user, { channelType: "blog" });
    await send(callback(user, questionData("g", brand.id, "grow")));
    expect((await loadAnswers(brand.id))?.goal).toBe("grow");
    expect(lastText()).toContain("Kanal nima haqida?");
  });

  it("a photo with nothing pending gets a hint, never a paid step", async () => {
    const user = ++nextUser;
    await send(photoUpdate(user, "lonely"));
    expect(lastText()).toBe(t("uz", "bot.photos_unexpected"));
    expect(visual.learnAndSaveVisual).not.toHaveBeenCalled();
  });

  it("an owner's photo with nothing pending points to the Studio's picture style, not to a first run", async () => {
    const user = ++nextUser;
    const brand = await onboard(user, { questions: [] });
    await send(callback(user, photosData("s", brand.id)));
    await send(photoUpdate(user, "late"));
    expect(lastText()).toBe(t("uz", "bot.photos_has_brand"));
    expect(visual.learnAndSaveVisual).not.toHaveBeenCalled();
  });

  it("a video wait goes to the media stream's handler (text and video), and nowhere else", async () => {
    const user = ++nextUser;
    const brand = await newBrand(user);
    const postId = crypto.randomUUID();
    const seen: string[] = [];
    registerVideoHandler(async (_api, _chat, _user, _locale, pending, input) => {
      seen.push(`${pending.postId === postId}:${input.type}`);
      return true;
    });
    await waitForVideo(user, brand.id, postId);
    await send(textUpdate(user, "keyinroq yuboraman"));
    await send({ update_id: updateId++, message: { message_id: 9, date: 0, chat: chat(user), from: from(user), video: { file_id: "v1", file_unique_id: "uv1", width: 720, height: 1280, duration: 9 } } });
    expect(seen).toEqual(["true:text", "true:video"]);
    expect(buildBrand).not.toHaveBeenCalled();
  });
});

describe("photos become the designer's style references", () => {
  it("three photos (an album) are learned once, through the Studio's style path, with Telegram's file read by code", async () => {
    const user = ++nextUser;
    const brand = await onboard(user, { questions: [] });
    expect(lastText()).toBe(t("uz", "bot.photos_ask"));
    visual.learnAndSaveVisual.mockResolvedValueOnce({
      visual: { refs: [{ url: "https://v3.fal.media/a.jpg", source: "owner" }], ownerText: { uz: { summary: "Yorug‘ oshxona, yog‘och stol", light: "", composition: "", mood: "", avoid: [] } } },
      cached: false,
    });
    await Promise.all(["a", "b", "c"].map((id) => bot.handleUpdate(photoUpdate(user, id, "album1") as never)));
    await drain();
    // A 4th photo of the same album, after the first three were taken: no reply of its own.
    const before = sent().length;
    await send(photoUpdate(user, "d", "album1"));
    expect(visual.learnAndSaveVisual).toHaveBeenCalledTimes(1);
    const [learnedBrand, opts] = visual.learnAndSaveVisual.mock.calls[0] as [{ id: string }, { ownerImages: string[]; actor: string }];
    expect(learnedBrand.id).toBe(brand.id);
    expect(opts.actor).toBe(`tg:${user}`);
    expect(opts.ownerImages).toHaveLength(3);
    expect(opts.ownerImages.every((u) => u.startsWith("data:image/jpeg;base64,"))).toBe(true);
    // The largest size up to 1600 px was read; the URL with the token never left this test's fetch mock.
    expect(calls.filter((c) => c.method === "getFile").map((c) => c.payload.file_id).sort()).toEqual(["a", "b", "c"]);
    expect(sent().length).toBe(before);
    expect(lastText()).toBe(t("uz", "bot.photos_learned", { summary: "Yorug‘ oshxona, yog‘och stol" }));
    expect(events.find((e) => e.type === "visual_learned")?.props).toMatchObject({ brand_id: brand.id, owner_refs: 1, from: "bot" });
    expect(await getPending(user)).toBeNull();
  });

  it("one photo, then Done: learned with that one; Done without a photo asks for one", async () => {
    const user = ++nextUser;
    const brand = await onboard(user, { questions: [] });
    await send(callback(user, photosData("d", brand.id)));
    expect(toasts()).toContain(t("uz", "bot.photos_need_one"));
    visual.learnAndSaveVisual.mockResolvedValueOnce({ visual: { refs: [] }, cached: false });
    await send(photoUpdate(user, "solo"));
    expect(lastText()).toBe(t("uz", "bot.photos_got", { n: 1 }));
    expect(lastButtons().map((b) => b.callback_data)).toEqual([photosData("d", brand.id), photosData("s", brand.id)]);
    await send(callback(user, photosData("d", brand.id)));
    expect(visual.learnAndSaveVisual).toHaveBeenCalledTimes(1);
    expect(lastText()).toBe(t("uz", "bot.photos_learned_plain"));
  });

  it("a 3rd photo and a Done tap at the same moment, or two quick Done taps, learn the style once", async () => {
    const user = ++nextUser;
    const brand = await onboard(user, { questions: [] });
    visual.learnAndSaveVisual.mockResolvedValueOnce({ visual: { refs: [] }, cached: false });
    await send(photoUpdate(user, "p1"));
    await send(photoUpdate(user, "p2"));
    await Promise.all([bot.handleUpdate(photoUpdate(user, "p3") as never), bot.handleUpdate(callback(user, photosData("d", brand.id)) as never)]);
    await drain();
    expect(visual.learnAndSaveVisual).toHaveBeenCalledTimes(1);
    expect(await getPending(user)).toBeNull();

    const other = ++nextUser;
    const otherBrand = await onboard(other, { questions: [] });
    visual.learnAndSaveVisual.mockResolvedValueOnce({ visual: { refs: [] }, cached: false });
    await send(photoUpdate(other, "q1"));
    await Promise.all([1, 2].map(() => bot.handleUpdate(callback(other, photosData("d", otherBrand.id)) as never)));
    await drain();
    expect(visual.learnAndSaveVisual).toHaveBeenCalledTimes(2);
  });

  it("the style limit is said plainly", async () => {
    const user = ++nextUser;
    const brand = await onboard(user, { questions: [] });
    await send(photoUpdate(user, "one"));
    visual.learnAndSaveVisual.mockRejectedValueOnce(new visual.VisualLimitError("limit"));
    await send(callback(user, photosData("d", brand.id)));
    expect(lastText()).toBe(t("uz", "bot.photos_limit"));
  });
});

describe("a customer from a plan post's link", () => {
  const planFor = (owner: number | null) => ({ id: "p1", tag: "abc123", weekOf: "2026-11-30", items: [], ownerTelegramId: owner, channel: "tort_uyi", brandChannel: "tort_uyi", brandName: "Tort uyi" });

  it("names the business only when the plan's owner is an admin of its channel", async () => {
    const owner = ++nextUser;
    const customer = ++nextUser;
    planByTag.mockResolvedValue(planFor(owner));
    members.set(`@tort_uyi:${owner}`, "administrator");
    await send(textUpdate(customer, "/start src_abc123_2", "ru"));
    expect(lastText()).toBe(t("ru", "bot.link_ask_named", { name: "Tort uyi", channel: "tort_uyi" }));
    expect(lastButtons()[0].callback_data).toBe("lead:abc123:2");
  });

  it("keeps the anonymous wording when the owner is not an admin, and says the link is inactive without an owner", async () => {
    const owner = ++nextUser;
    const customer = ++nextUser;
    planByTag.mockResolvedValue(planFor(owner));
    members.set(`@tort_uyi:${owner}`, "member");
    await send(textUpdate(customer, "/start src_abc123_1"));
    expect(lastText()).toBe(t("uz", "bot.link_ask"));
    planByTag.mockResolvedValue(planFor(null));
    await send(textUpdate(customer, "/start src_abc123_1"));
    expect(lastText()).toBe(t("uz", "bot.link_inactive"));
  });
});
