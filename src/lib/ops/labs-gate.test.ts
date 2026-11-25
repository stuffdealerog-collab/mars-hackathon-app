import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lab routes (no screen, Mini App or bot calls them) answer 404 before any spend unless LABS_ROUTES
 * names them. The routes run for real; everything they would spend money on is a spy. The "@/" alias
 * is not configured for vitest, so aliased imports are mocked.
 */

const spend = vi.hoisted(() => ({
  spendClaude: vi.fn(async () => {}),
  findLeads: vi.fn(async () => ({ leads: [] })),
  planVideo: vi.fn(async () => ({ scenes: [] })),
  planFlow: vi.fn(async () => ({ id: "f", nodes: [], edges: [] })),
  cleanText: vi.fn(async () => ({ text: "" })),
  runAdCheck: vi.fn(async () => ({ verdict: "ok" })),
  learnFor: vi.fn(),
  scrapeChannelData: vi.fn(async () => ({ channel: "x", posts: [] })),
  buildBrand: vi.fn(),
  createJob: vi.fn(),
  refreshJob: vi.fn(),
  cancelJob: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/ops/labs", async () => await import("./labs"));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {} }));
vi.mock("@/lib/uslub/http", () => {
  class HttpError extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    HttpError,
    handle: (fn: (req: Request) => Promise<Response>) => fn,
    json: (body: unknown, status = 200) => Response.json(body, { status }),
    rateLimit: () => {},
    readJson: async (req: Request) => req.json(),
    telegramUserId: () => null,
    clientIp: () => "203.0.113.1",
    loadBrandFor: async (id: string) => ({ id, channel: "x", source: "custom", ownerTelegramId: null, dna: {} }),
    assertDraftAccess: async () => {},
    errorBody: () => ({ status: 500, body: { error: "x", code: "internal" } }),
  };
});
vi.mock("@/lib/uslub/budget", () => ({ spendClaude: spend.spendClaude }));
vi.mock("@/lib/uslub/radar", () => ({ findLeads: spend.findLeads }));
vi.mock("@/lib/uslub/video", () => ({ planVideo: spend.planVideo }));
vi.mock("@/lib/uslub/video-core", async () => await import("../uslub/video-core"));
vi.mock("@/lib/uslub/planner", () => ({ planFlow: spend.planFlow }));
vi.mock("@/lib/uslub/store", () => ({ saveFlow: async (f: unknown) => f, countPublished: async () => 0, publicBrand: (b: unknown) => b, savePosts: async () => {} }));
vi.mock("@/lib/uslub/brand", () => ({ buildBrand: spend.buildBrand }));
vi.mock("@/lib/uslub/copywriter", () => ({ generatePosts: async () => [] }));
vi.mock("@/lib/uslub/sensitivity", () => ({ classifySensitivity: () => ({}) }));
vi.mock("@/lib/uslub/editor", () => ({ cleanText: spend.cleanText }));
vi.mock("@/lib/uslub/neuro", () => ({ analyzeNeuro: () => ({ hits: [], humanScore: 100 }) }));
vi.mock("@/lib/uslub/brain/adcheck-run", () => ({ runAdCheck: spend.runAdCheck }));
vi.mock("@/lib/uslub/brain/route-utils", () => ({ toHttp: (e: unknown) => e }));
vi.mock("@/lib/uslub/brain/learn-run", () => ({ learnFor: spend.learnFor }));
vi.mock("@/lib/uslub/brain/scrape", () => ({ normalizeChannel: (c: string) => c, scrapeChannelData: spend.scrapeChannelData }));
vi.mock("@/lib/uslub/media/captions", () => ({ autoCues: () => [], normalizeCues: () => [], toAss: () => "", toSrt: () => "", toWebVtt: () => "" }));
vi.mock("@/lib/uslub/media/presets", () => ({ PRESET_IDS: ["paper-studio"] }));
vi.mock("@/lib/uslub/media/types", () => ({ publicJob: (j: unknown) => j }));
vi.mock("@/lib/uslub/media/jobs", () => ({ MediaError: class extends Error {} }));
vi.mock("@/lib/uslub/media/service", () => ({
  media: () => ({ jobs: { create: spend.createJob, refresh: spend.refreshJob, cancel: spend.cancelJob } }),
}));
vi.mock("@/lib/uslub/visual/service", () => ({ actorKey: () => "ip:0000000000000000" }));

const { labsGate, labsRouteEnabled, LABS_ROUTES } = await import("./labs");

const routes = {
  department: await import("../../app/api/uslub/department/route"),
  radar: await import("../../app/api/uslub/radar/route"),
  plan: await import("../../app/api/uslub/plan/route"),
  neuro: await import("../../app/api/uslub/neuro/route"),
  adcheck: await import("../../app/api/uslub/adcheck/route"),
  learn: await import("../../app/api/uslub/learn/route"),
  "media/captions": await import("../../app/api/uslub/media/captions/route"),
  "media/jobs": await import("../../app/api/uslub/media/jobs/route"),
  "media/jobs/cancel": await import("../../app/api/uslub/media/jobs/cancel/route"),
};

const bodies: Record<keyof typeof routes, unknown> = {
  department: { channel: "safiabakery" },
  radar: { brandId: "b1" },
  plan: { brandId: "b1", task: "Haftalik reja" },
  neuro: { text: "Matn", script: "uz_latn" },
  adcheck: { channel: "kanal_nomi" },
  learn: { channel: "kanal_nomi" },
  "media/captions": { lines: ["Salom"], seconds: 5 },
  "media/jobs": { kind: "image", brief: "Tort", aspect: "4:5" },
  "media/jobs/cancel": { id: "00000000-0000-4000-8000-000000000001" },
};

const post = (name: string, body: unknown) =>
  new Request(`https://mercat.test/api/uslub/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  for (const f of Object.values(spend)) f.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("LABS_ROUTES parsing", () => {
  it("/video is no lab route any more: the Video tab calls it", () => {
    expect(LABS_ROUTES as readonly string[]).not.toContain("video");
  });

  it("unset or empty: every lab route is off", () => {
    for (const r of LABS_ROUTES) {
      expect(labsRouteEnabled(r, undefined)).toBe(false);
      expect(labsRouteEnabled(r, " ")).toBe(false);
    }
  });

  it("'all' (or 1 / true / *) opens all; a list opens only its names, with or without the /api/uslub/ prefix", () => {
    for (const v of ["all", "1", "true", "*", "ALL"]) expect(labsRouteEnabled("radar", v)).toBe(true);
    expect(labsRouteEnabled("radar", "radar, neuro")).toBe(true);
    expect(labsRouteEnabled("neuro", "radar,neuro")).toBe(true);
    expect(labsRouteEnabled("department", "radar,neuro")).toBe(false);
    expect(labsRouteEnabled("media/jobs", "/api/uslub/media/jobs")).toBe(true);
    expect(labsRouteEnabled("media/captions", "media/jobs")).toBe(false);
  });

  it("the closed door is a plain 404 that is never cached", async () => {
    vi.stubEnv("LABS_ROUTES", "");
    const res = labsGate("radar")!;
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "Not found", code: "not_found" });
    vi.stubEnv("LABS_ROUTES", "radar");
    expect(labsGate("radar")).toBeNull();
  });
});

describe("every lab route is closed by default, before any spend", () => {
  it.each(Object.keys(routes) as (keyof typeof routes)[])("POST %s -> 404", async (name) => {
    vi.stubEnv("LABS_ROUTES", "");
    const res = await routes[name].POST(post(name, bodies[name]));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found", code: "not_found" });
    for (const f of Object.values(spend)) expect(f).not.toHaveBeenCalled();
  });

  it("GET media/jobs (polling a job) is closed too", async () => {
    vi.stubEnv("LABS_ROUTES", "");
    const res = await routes["media/jobs"].GET(new Request("https://mercat.test/api/uslub/media/jobs?id=x"));
    expect(res.status).toBe(404);
    expect(spend.refreshJob).not.toHaveBeenCalled();
  });

  it("named in LABS_ROUTES, a route works as before (radar spends its Claude unit and runs)", async () => {
    vi.stubEnv("LABS_ROUTES", "radar");
    const res = await routes.radar.POST(post("radar", bodies.radar));
    expect(res.status).toBe(200);
    expect(spend.spendClaude).toHaveBeenCalledOnce();
    expect(spend.findLeads).toHaveBeenCalledOnce();
    expect((await routes.neuro.POST(post("neuro", bodies.neuro))).status).toBe(404);
    expect(spend.cleanText).not.toHaveBeenCalled();
  });
});
