import { describe, expect, it } from "vitest";
import {
  livePending,
  PENDING_KINDS,
  PENDING_TTL_MS,
  pendingKey,
  type Pending,
} from "../src/lib/uslub/botflow/pending-core";
import {
  branchOf,
  FLOW_CALLBACK_PREFIXES,
  matchOption,
  nextQuestion,
  parseContact,
  parsePrices,
  PHOTOS_RE,
  photosData,
  pickPhotoSize,
  QUESTION_RE,
  questionData,
  REBUILD_RE,
  rebuildData,
  renderQuestion,
  type FlowQuestion,
} from "../src/lib/uslub/botflow/questions-core";
import { analysisMessage, planMessage } from "../src/lib/uslub/botflow/messages";

const BRAND = "3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f";
const NOW = Date.parse("2026-11-25T10:00:00Z");

const goalQ: FlowQuestion = {
  key: "goal",
  text: "Kanalning asosiy maqsadi nima?",
  input: "choice",
  options: [
    { value: "sale", label: "Ko‘proq buyurtma" },
    { value: "grow", label: "Ko‘proq obunachi" },
  ],
  prefill: "grow",
  hint: "Reja, tahlil va haftalik hisobot shu maqsadga qarab tuziladi.",
};
const orderQ: FlowQuestion = {
  key: "order",
  text: "Mijozlar qanday buyurtma beradi?",
  input: "choice",
  options: [
    { value: "phone", label: "Telefon" },
    { value: "manager", label: "@menejerga yozib" },
    { value: "own_bot", label: "O‘z botimiz" },
    { value: "site", label: "Sayt" },
    { value: "mercat_link", label: "Mercat havolasi (har bir postdan kelganlarni sanaydi)" },
  ],
};
const pricesQ: FlowQuestion = { key: "prices", text: "3 ta asosiy mahsulot yoki xizmatingiz narxi qancha?", input: "prices", prefill: [{ name: "Medovik", price: "" }, { name: "Napoleon", price: "" }] };
const aboutQ: FlowQuestion = { key: "about", text: "Kanal nima haqida?", input: "text" };

describe("pending state (one per Telegram user, with expiry)", () => {
  it("has exactly the four kinds of the plan, each with its own expiry", () => {
    expect([...PENDING_KINDS].sort()).toEqual(["fact", "goal", "photos", "video"]);
    for (const k of PENDING_KINDS) expect(PENDING_TTL_MS[k]).toBeGreaterThan(10 * 60_000);
    expect(PENDING_TTL_MS.fact).toBeLessThan(PENDING_TTL_MS.photos);
  });

  it("is live until its kind's expiry, then gone", () => {
    const p: Pending = { kind: "fact", key: "prices", brandId: BRAND, at: NOW, flow: { queue: [pricesQ], skipped: [] } };
    expect(livePending(p, NOW + 60_000)).toEqual(p);
    expect(livePending(p, NOW + PENDING_TTL_MS.fact + 1)).toBeNull();
  });

  it("rejects anything that is not a well-formed pending state (old or foreign rows)", () => {
    expect(livePending(null, NOW)).toBeNull();
    expect(livePending({ kind: "fact", brandId: BRAND, at: NOW }, NOW)).toBeNull(); // no key, no flow
    expect(livePending({ kind: "photos", brandId: "not-a-uuid", at: NOW, fileIds: [] }, NOW)).toBeNull();
    expect(livePending({ kind: "dance", brandId: BRAND, at: NOW }, NOW)).toBeNull();
    expect(livePending({ kind: "video", brandId: BRAND, at: NOW }, NOW)).toBeNull(); // a video wait names its post
    expect(livePending({ kind: "photos", brandId: BRAND, at: NOW + 3_600_000, fileIds: [] }, NOW)).toBeNull(); // from the future
    expect(livePending({ kind: "photos", brandId: BRAND, at: NOW, fileIds: ["a", 3] }, NOW)).toBeNull();
  });

  it("keys the store by user (never collides with the plan view or audit cache keys)", () => {
    expect(pendingKey(7)).toBe("botpending:7");
    expect(pendingKey(7)).not.toBe(pendingKey(8));
  });
});

describe("callback data", () => {
  it("fits Telegram's 64 bytes and parses back", () => {
    for (const data of [questionData("o", BRAND, "mercat_link"), questionData("g", BRAND, "sale"), questionData("s", BRAND, "contact"), rebuildData(BRAND), photosData("d", BRAND)]) {
      expect(new TextEncoder().encode(data).length).toBeLessThanOrEqual(64);
    }
    expect(QUESTION_RE.exec(questionData("o", BRAND, "mercat_link"))?.slice(1)).toEqual(["o", BRAND, "mercat_link"]);
    expect(QUESTION_RE.exec(questionData("s", BRAND, "prices"))?.slice(1)).toEqual(["s", BRAND, "prices"]);
    expect(REBUILD_RE.exec(rebuildData(BRAND))?.[1]).toBe(BRAND);
    expect(PHOTOS_RE.exec(photosData("s", BRAND))?.slice(1)).toEqual(["s", BRAND]);
    expect(QUESTION_RE.test(rebuildData(BRAND))).toBe(false);
  });

  it("never collides with the prefixes other handlers own", () => {
    const taken = ["apr", "apg", "apw", "apa", "apo", "ord", "sold", "pb", "pv", "pub", "lead", "ob"];
    for (const p of FLOW_CALLBACK_PREFIXES) expect(taken).not.toContain(p);
    for (const data of [questionData("g", BRAND, "sale"), rebuildData(BRAND), photosData("d", BRAND)]) {
      expect(taken.some((p) => data.startsWith(`${p}:`))).toBe(false);
    }
  });
});

describe("questions in the chat", () => {
  it("the goal comes with the type's suggestion first and a skip button", () => {
    const r = renderQuestion(goalQ, BRAND, "uz", { fromChannel: true });
    expect(r.text).toContain("Kanalning asosiy maqsadi nima?");
    expect(r.text).toContain("Kanal postlariga qaraganda: Ko‘proq obunachi."); // the pre-filled answer is named
    // A brand built from a description has no posts to judge by: the suggestion is only the button order.
    const fresh = renderQuestion(goalQ, BRAND, "uz");
    expect(fresh.text).not.toContain("postlariga");
    expect(fresh.rows[0][0].data).toBe(questionData("g", BRAND, "grow"));
    const rows = r.rows.map((row) => row.map((b) => b.data));
    expect(rows[0][0]).toBe(questionData("g", BRAND, "grow")); // suggestion first
    expect(rows.flat()).toContain(questionData("g", BRAND, "sale"));
    expect(rows.at(-1)).toEqual([questionData("s", BRAND, "goal")]);
  });

  it("how customers order is one tap per option; prices and about are typed, with a skip button", () => {
    const order = renderQuestion(orderQ, BRAND, "ru");
    expect(order.rows.flat().map((b) => b.data)).toContain(questionData("o", BRAND, "mercat_link"));
    expect(order.rows.flat().every((b) => b.text.length > 0)).toBe(true);
    const prices = renderQuestion(pricesQ, BRAND, "uz");
    expect(prices.text).toContain("Medovik — ");
    expect(prices.rows).toEqual([[{ text: expect.any(String), data: questionData("s", BRAND, "prices") }]]);
    const about = renderQuestion(aboutQ, BRAND, "en");
    expect(about.rows.flat()).toHaveLength(1);
  });

  it("the next question skips what the owner skipped", () => {
    const flow = { queue: [goalQ, orderQ, pricesQ], skipped: ["goal" as const] };
    expect(nextQuestion(flow)?.key).toBe("order");
    expect(nextQuestion({ ...flow, skipped: ["goal", "order", "prices"] })).toBeNull();
  });

  it("knows which branch a queue is on (sales questions or growth)", () => {
    expect(branchOf([goalQ, orderQ, pricesQ])).toBe("sale");
    expect(branchOf([goalQ, aboutQ])).toBe("grow");
    expect(branchOf([goalQ])).toBeNull();
  });

  it("a typed word picks an option when it names exactly one", () => {
    expect(matchOption("obunachi", goalQ.options ?? [])).toBe("grow");
    expect(matchOption("Ko‘proq buyurtma!", goalQ.options ?? [])).toBe("sale");
    expect(matchOption("2", goalQ.options ?? [])).toBe("grow");
    expect(matchOption("ko‘proq", goalQ.options ?? [])).toBeNull(); // both
    expect(matchOption("salom", goalQ.options ?? [])).toBeNull();
    expect(matchOption("telefon", orderQ.options ?? [])).toBe("phone");
  });
});

describe("parsing the owner's answers", () => {
  it("prices: one per line, or separated by ; — names and prices as typed", () => {
    expect(parsePrices("Medovik — 180 000 so'm\nNapoleon 150000\nTiramisu: 95 000 сум")).toEqual([
      { name: "Medovik", price: "180 000 so'm" },
      { name: "Napoleon", price: "150000" },
      { name: "Tiramisu", price: "95 000 сум" },
    ]);
    expect(parsePrices("Konsultatsiya 200 ming; Kurs - 1 500 000 so‘m")).toEqual([
      { name: "Konsultatsiya", price: "200 ming" },
      { name: "Kurs", price: "1 500 000 so‘m" },
    ]);
    expect(parsePrices("Manicure 120,000 UZS, Pedicure 150,000 UZS")).toEqual([
      { name: "Manicure", price: "120,000 UZS" },
      { name: "Pedicure", price: "150,000 UZS" },
    ]);
  });

  it("prices: text without a number, or a number without a name, is not a price", () => {
    expect(parsePrices("narxlar har xil, keling gaplashamiz")).toEqual([]);
    expect(parsePrices("150000")).toEqual([]);
    expect(parsePrices("1\n2\n3\n4\n5\n6")).toEqual([]);
  });

  it("prices: at most five", () => {
    const text = Array.from({ length: 8 }, (_, i) => `Tort ${String.fromCharCode(65 + i)} ${100 + i} 000`).join("\n");
    expect(parsePrices(text)).toHaveLength(5);
  });

  it("contact: a phone, a @username, a t.me or wa.me link, or a site", () => {
    expect(parseContact("Bizga qo‘ng‘iroq qiling: +998 90 123 45 67")).toBe("+998 90 123 45 67");
    expect(parseContact("@safia_admin")).toBe("@safia_admin");
    expect(parseContact("t.me/safia_admin")).toBe("t.me/safia_admin");
    expect(parseContact("https://safia.uz/order")).toBe("https://safia.uz/order");
    expect(parseContact("safia.uz")).toBe("safia.uz");
    expect(parseContact("90 123 45 67")).toBe("90 123 45 67");
    expect(parseContact("bilmayman")).toBeNull();
    expect(parseContact("@mercatai", { bot: "mercatai" })).toBeNull(); // our bot is never their contact
  });
});

describe("Telegram photo size for the style", () => {
  it("takes the largest size up to 1600 px and 5 MB", () => {
    const sizes = [
      { file_id: "s", width: 90, height: 67, file_size: 1_000 },
      { file_id: "m", width: 800, height: 600, file_size: 60_000 },
      { file_id: "l", width: 1280, height: 960, file_size: 180_000 },
      { file_id: "xl", width: 2560, height: 1920, file_size: 900_000 },
    ];
    expect(pickPhotoSize(sizes)?.file_id).toBe("l");
    expect(pickPhotoSize([{ file_id: "xl", width: 2560, height: 1920, file_size: 900_000 }])?.file_id).toBe("xl");
    expect(pickPhotoSize([{ file_id: "huge", width: 4000, height: 3000, file_size: 9_000_000 }])).toBeNull();
    expect(pickPhotoSize([])).toBeNull();
  });
});

describe("analysis and plan messages", () => {
  it("the analysis: numbers, then three findings, problems first, without internal ids", () => {
    const text = analysisMessage(
      {
        channel: "@tort_uyi",
        subscribers: 12_300,
        postsAnalyzed: 40,
        postsPerWeek: 4.5,
        avgViews: 1840,
        reachRate: 0.15,
        bestHours: [],
        bestWeekdays: [],
        formatMix: {},
        topPosts: [],
        findings: [
          { kind: "strength", text: "Rasmli postlar yaxshi ko‘riladi [S.photoLift]", evidence: "" },
          { kind: "problem", text: "Narx kam postda bor [R.NO_PRICE]", evidence: "" },
          { kind: "opportunity", text: "Kechki 19:00 da ko‘proq ko‘rishadi", evidence: "" },
          { kind: "problem", text: "Postlar orasida uzoq tanaffus", evidence: "" },
        ],
      },
      "uz",
    );
    expect(text).toContain("@tort_uyi");
    expect(text).toContain("12 300");
    expect(text).toContain("15%");
    expect(text).not.toMatch(/\[[SRF]\./);
    const bullets = text.split("\n").filter((l) => l.startsWith("• "));
    expect(bullets).toHaveLength(3);
    expect(bullets[0]).toContain("Narx");
    expect(bullets[1]).toContain("tanaffus");
  });

  it("the analysis in English uses English number grouping and says when nothing stood out", () => {
    const text = analysisMessage({ channel: "@blog", subscribers: 12_300, postsAnalyzed: 9, postsPerWeek: 2, bestHours: [], bestWeekdays: [], formatMix: {}, topPosts: [], findings: [] }, "en");
    expect(text).toContain("12,300");
    expect(text).toMatch(/Nothing stood out/);
  });

  it("the plan: one line per post with its time, at most 7, the time label once when all share it", () => {
    const items = Array.from({ length: 9 }, (_, i) => ({
      day: `2026-11-${String(26 + (i % 5)).padStart(2, "0")}`,
      time: "19:00",
      goal: "reach" as const,
      pillar: "x",
      format: "photo",
      hook: `Hook ${i + 1} [F3]`,
      cta: "",
      brief: "",
      metric: "",
      needsApproval: false,
      timeLabel: "Kanalingiz bo‘yicha eng yaxshi vaqt: pay 19:00",
    }));
    const text = planMessage({ weekOf: "2026-11-23", items, rationale: "" }, "uz", { launch: false });
    const lines = text.split("\n").filter((l) => l.startsWith("• "));
    expect(lines).toHaveLength(7);
    expect(lines[0]).toBe("• pay 19:00 — Hook 1");
    expect(text).toContain("Kanalingiz bo‘yicha eng yaxshi vaqt");
    expect(text.match(/eng yaxshi vaqt/g)).toHaveLength(1);
    expect(text).toContain("…va yana 2 ta — ilovada.");
    expect(text.startsWith("🗓 Haftalik reja: 9 ta post")).toBe(true);
  });
});
