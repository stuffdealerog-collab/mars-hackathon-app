/**
 * Studio data access. Every function calls the real /api/uslub/* route from
 * the contract and falls back to mock data when the route is missing (404),
 * failing (5xx) or unreachable — so the UI can switch to live data with no
 * changes. `source` tells the UI which one it got.
 */
import type {
  BrandProfile,
  Flow,
  NeuroHit,
  PostDraft,
  RadarLead,
  Script,
  VideoPlan,
} from "@/lib/uslub/contract";
import type { ChannelAudit, ContentPlan, Strategy } from "@/lib/uslub/contract";
import { MOCK_AUDIT, MOCK_PLAN, MOCK_STRATEGY } from "./brain-mocks";
import { MOCK_BRAND, MOCK_LEADS, MOCK_POSTS, MOCK_VIDEO, mockPlan } from "./mocks";

export type Source = "live" | "mock";
export type Result<T> = { data: T; source: Source; error?: string };

const BASE = "/api/uslub";

/** Force mock data (demo recordings): `?mock=1` in the URL. */
export function mockOnly(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("mock") === "1";
}

type TgWindow = Window & { Telegram?: { WebApp?: { initData?: string } } };
/** Telegram Mini App initData, when the Studio runs inside Telegram. */
export function tgInitData(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const d = (window as TgWindow).Telegram?.WebApp?.initData;
  return d ? d : undefined;
}

export const BOT_PUBLISH_URL = (postId: string) =>
  `https://t.me/hackathonproj1_bot?start=${encodeURIComponent(`publish_${postId}`.slice(0, 64))}`;

export async function call<T>(path: string, init: RequestInit | undefined, fallback: () => T, timeoutMs = 45000): Promise<Result<T>> {
  if (mockOnly()) {
    await new Promise((r) => setTimeout(r, 300));
    return { data: fallback(), source: "mock", error: "mock mode" };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const init_ = tgInitData();
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init_ ? { authorization: `tma ${init_}` } : {}),
        ...(init?.headers ?? {}),
      },
      signal: ctrl.signal,
    });
    if (res.status === 404 || res.status >= 500) {
      return { data: fallback(), source: "mock", error: `HTTP ${res.status}` };
    }
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || "error" in json) {
      return { data: fallback(), source: "mock", error: json?.error ?? `HTTP ${res.status}` };
    }
    return { data: json as T, source: "live" };
  } catch (err) {
    return { data: fallback(), source: "mock", error: err instanceof Error ? err.message : "network" };
  } finally {
    clearTimeout(timer);
  }
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export async function createBrand(input: { channel?: string; knowledge?: string; samplePosts?: string[] }) {
  const r = await call<{ brand: BrandProfile }>("/brand", post(input), () => ({
    // Never dress sample data in the real channel's name.
    brand: MOCK_BRAND,
  }), 40000);
  return { ...r, data: r.data.brand };
}

export async function getBrand(id: string) {
  const r = await call<{ brand: BrandProfile }>(`/brand?id=${encodeURIComponent(id)}`, { method: "GET" }, () => ({
    brand: MOCK_BRAND,
  }));
  return { ...r, data: r.data.brand };
}

export async function generatePosts(brandId: string, brief: string, count = 3) {
  const r = await call<{ posts: PostDraft[] }>("/posts", post({ brandId, brief, count: Math.min(count, 5) }), () => ({
    posts: MOCK_POSTS,
  }), 50000);
  return { ...r, data: r.data.posts };
}

export async function checkNeuro(text: string, script: Script) {
  return call<{ text: string; hits: NeuroHit[]; humanScore: number }>("/neuro", post({ text, script }), () => ({
    text,
    hits: [],
    humanScore: 90,
  }));
}

export async function findLeads(brandId: string, goal?: string) {
  const r = await call<{ leads: RadarLead[] }>("/radar", post({ brandId, goal }), () => ({ leads: MOCK_LEADS }), 70000);
  return { ...r, data: r.data.leads };
}

export async function planVideo(brandId: string, brief: string) {
  const r = await call<{ plan: VideoPlan }>("/video", post({ brandId, brief }), () => ({ plan: MOCK_VIDEO }));
  return { ...r, data: r.data.plan };
}

/**
 * Publishing needs Telegram auth. Inside the Mini App we send initData; on the
 * plain web the caller should deep-link to the bot (BOT_PUBLISH_URL) instead.
 */
export async function publishPost(postId: string, script: Script, chat: string) {
  const initData = tgInitData();
  if (!initData || mockOnly()) return { ok: false as const, needsTelegram: true as const, error: "Telegram orqali e'lon qiling" };
  try {
    const res = await fetch(`${BASE}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `tma ${initData}` },
      body: JSON.stringify({ postId, script, chat, initData }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string; addAdminUrl?: string };
    if (res.status === 401) return { ok: false as const, needsTelegram: true as const, error: json.error };
    return { ok: !!json.ok, url: json.url, error: json.error, addAdminUrl: json.addAdminUrl, needsTelegram: false as const };
  } catch {
    return { ok: false as const, needsTelegram: false as const, error: "Tarmoq xatosi" };
  }
}

export async function planFlow(brandId: string, task: string) {
  const r = await call<{ flow: Flow }>("/plan", post({ brandId, task }), () => ({ flow: mockPlan(task) }), 20000);
  return { ...r, data: r.data.flow };
}

export async function analyzeChannel(channel: string, competitors?: string[]) {
  const r = await call<{ audit: ChannelAudit }>("/analyze", post({ channel, competitors }), () => ({
    audit: MOCK_AUDIT,
  }));
  return { ...r, data: r.data.audit };
}

export async function buildStrategy(brandId: string, audit?: ChannelAudit, goal?: string) {
  return call<{ strategy: Strategy; plan: ContentPlan }>("/strategy", post({ brandId, audit, goal }), () => ({
    strategy: MOCK_STRATEGY,
    plan: MOCK_PLAN,
  }), 50000);
}
