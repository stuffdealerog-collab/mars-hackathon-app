import type { ChannelAudit, ContentPlan } from "@/lib/uslub/contract";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { keepAudit, keepPlan, keptAudit, keptPlan } from "./keep";

// The tests run in node: a minimal localStorage stands in for the browser's.
const store = new Map<string, string>();
const fake = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = fake;
});
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

const audit = { channel: "@namuna", postsAnalyzed: 60 } as unknown as ChannelAudit;
const plan = { items: [{ day: "mon" }] } as unknown as ContentPlan;

describe("kept audit", () => {
  it("comes back for the same brand while it is younger than 12 h", () => {
    keepAudit("b1", audit);
    expect(keptAudit("b1")).toEqual(audit);
    expect(keptAudit("b2")).toBeNull();
  });

  it("is measured again after 12 h", () => {
    keepAudit("b1", audit);
    expect(keptAudit("b1", Date.now() + 12 * 60 * 60 * 1000 + 1)).toBeNull();
  });

  it("never throws when storage is broken or holds rubbish", () => {
    store.set("mercat.audit.b1", "{not json");
    expect(keptAudit("b1")).toBeNull();
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(() => keepAudit("b1", audit)).not.toThrow();
    expect(keptAudit("b1")).toBeNull();
  });
});

describe("kept plan", () => {
  it("keeps the latest plan with its strategy per brand", () => {
    keepPlan("b1", { plan, strategy: null, launch: null, sufficiency: null });
    expect(keptPlan("b1")?.plan).toEqual(plan);
    expect(keptPlan("b2")).toBeNull();
  });

  it("ignores a stored value without plan items", () => {
    store.set("mercat.plan.b1", JSON.stringify({ plan: { items: "nope" } }));
    expect(keptPlan("b1")).toBeNull();
  });
});
