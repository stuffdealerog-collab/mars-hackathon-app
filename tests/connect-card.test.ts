import { describe, expect, it, vi } from "vitest";

// The card's pure parts: which rows it shows, how numbers print, and the words it uses. The '@/' alias is not
// resolved here, so the modules the card imports through it are mapped to their files.
vi.mock("@/components/ui/format", async () => await import("../src/components/ui/format"));
vi.mock("@/lib/connectors/types", async () => await import("../src/lib/connectors/types"));

const { cardRows, cardVisible, daysLeft, weekValue } = await import("../src/components/connections/model");
const { COPY, agoLabel } = await import("../src/components/connections/copy");
type ConnectionView = import("../src/lib/connectors/types").ConnectionView;

const conn = (over: Partial<ConnectionView>): ConnectionView => ({
  id: "c1",
  provider: "instagram",
  mode: "test",
  status: "active",
  account: { name: "Safia", handle: "safia.bakery" },
  accounts: [],
  selectedAccountId: "17841400000000001",
  connectedAt: "2026-11-20T00:00:00.000Z",
  lastSyncAt: "2026-11-25T03:00:00.000Z",
  expiresAt: null,
  week: [],
  error: null,
  ...over,
});

describe("Connections card rows", () => {
  it("is hidden when the API lists nothing", () => {
    expect(cardVisible(null)).toBe(false);
    expect(cardVisible({ connectors: [], connections: [] })).toBe(false);
    expect(cardRows({ connectors: [], connections: [] })).toEqual([]);
  });

  it("offers Connect for open platforms, in a fixed order, with the test badge", () => {
    const rows = cardRows({ connectors: [{ id: "youtube", mode: "test" }, { id: "instagram", mode: "live" }], connections: [] });
    expect(rows.map((r) => [r.provider, r.action, r.testMode])).toEqual([
      ["instagram", "connect", false],
      ["youtube", "connect", true],
    ]);
  });

  it("an expired, empty or under-permitted connection offers Connect again; a waiting one does not", () => {
    const rows = cardRows({
      connectors: [
        { id: "instagram", mode: "test" },
        { id: "google_ads", mode: "test" },
        { id: "meta_ads", mode: "test" },
      ],
      connections: [
        conn({ id: "a", status: "expired" }),
        conn({ id: "b", provider: "google_ads", status: "error", error: "access_pending" }),
        conn({ id: "c", provider: "meta_ads", status: "error", error: "scope_missing" }),
      ],
    });
    expect(rows.map((r) => [r.key, r.action])).toEqual([
      ["a", "reconnect"],
      ["c", "reconnect"],
      ["b", null],
    ]);
  });

  it("keeps an existing connection visible after its provider stopped being offered to this owner", () => {
    const rows = cardRows({ connectors: [], connections: [conn({ status: "expired" })] });
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBeNull();
  });
});

describe("numbers", () => {
  it("prints unknown as —, never 0; changes with a sign; money in the account's currency", () => {
    expect(weekValue({ metric: "views", value: null }, "uz")).toBe("—");
    expect(weekValue({ metric: "views", value: 12400 }, "uz")).toBe("12 400");
    expect(weekValue({ metric: "views", value: 12400 }, "en")).toBe("12,400");
    expect(weekValue({ metric: "followers", value: 38, delta: true }, "uz")).toBe("+38");
    expect(weekValue({ metric: "followers", value: -5, delta: true }, "uz")).toBe("−5");
    expect(weekValue({ metric: "followers", value: 0, delta: true }, "uz")).toBe("0");
    expect(weekValue({ metric: "spend", value: 12.31, currency: "USD" }, "ru")).toBe("12,31 USD");
  });

  it("warns about a coming reconnect only in the last 10 days", () => {
    const now = Date.parse("2026-11-25T00:00:00Z");
    expect(daysLeft(null, now)).toBeNull();
    expect(daysLeft("2026-12-01T00:00:00Z", now)).toBe(6);
    expect(daysLeft("2027-01-20T00:00:00Z", now)).toBeNull();
  });

  it("says how long ago the numbers were updated", () => {
    const now = Date.parse("2026-11-25T06:00:00Z");
    expect(agoLabel("2026-11-25T05:59:30Z", "uz", now)).toBe("hozirgina");
    expect(agoLabel("2026-11-25T05:20:00Z", "uz", now)).toBe("40 daqiqa oldin");
    expect(agoLabel("2026-11-25T03:00:00Z", "ru", now)).toBe("3 ч назад");
    expect(agoLabel("2026-11-22T06:00:00Z", "en", now)).toBe("3 days ago");
  });
});

describe("words", () => {
  it("never promises 'soon' and covers every error code in all three languages", () => {
    const all = JSON.stringify(COPY).toLowerCase();
    for (const word of ["tez orada", "скоро", "soon", "coming"]) expect(all).not.toContain(word);
    for (const lang of ["uz", "ru", "en"] as const) {
      expect(Object.keys(COPY[lang].errors).sort()).toEqual(Object.keys(COPY.uz.errors).sort());
      expect(Object.values(COPY[lang].errors).every((s) => s.trim().length > 0)).toBe(true);
    }
  });

  it("says plainly that Mercat only reads", () => {
    expect(COPY.uz.lead).toContain("faqat o‘qiydi");
    expect(COPY.ru.lead).toContain("только читает");
    expect(COPY.en.lead).toContain("only reads");
  });
});
