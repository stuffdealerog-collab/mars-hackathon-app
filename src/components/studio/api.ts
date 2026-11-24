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
import { MOCK_BRAND, MOCK_LEADS, MOCK_POSTS, MOCK_VIDEO, mockPlan } from "./mocks";

export type Source = "live" | "mock";
export type Result<T> = { data: T; source: Source; error?: string };

const BASE = "/api/uslub";

async function call<T>(path: string, init: RequestInit | undefined, fallback: () => T, timeoutMs = 45000): Promise<Result<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
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
    brand: {
      ...MOCK_BRAND,
      channel: input.channel || MOCK_BRAND.channel,
      knowledge: input.knowledge || MOCK_BRAND.knowledge,
    },
  }));
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
    posts: MOCK_POSTS.slice(0, Math.min(count, MOCK_POSTS.length)),
  }));
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
  const r = await call<{ leads: RadarLead[] }>("/radar", post({ brandId, goal }), () => ({ leads: MOCK_LEADS }));
  return { ...r, data: r.data.leads };
}

export async function planVideo(brandId: string, brief: string) {
  const r = await call<{ plan: VideoPlan }>("/video", post({ brandId, brief }), () => ({ plan: MOCK_VIDEO }));
  return { ...r, data: r.data.plan };
}

export async function publishPost(postId: string, script: Script, chat: string) {
  return call<{ ok: boolean; url?: string; error?: string }>("/publish", post({ postId, script, chat }), () => ({
    ok: true,
    url: undefined,
  }));
}

export async function planFlow(brandId: string, task: string) {
  const r = await call<{ flow: Flow }>("/plan", post({ brandId, task }), () => ({ flow: mockPlan(task) }), 20000);
  return { ...r, data: r.data.flow };
}
