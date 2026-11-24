import type { MediaProvider, PollResult, ProviderRef, SubmitRequest } from "../provider";
import type { MediaKind } from "../types";

/**
 * Offline demo provider (MEDIA_DEMO=1): no API, no cost. It "renders" for
 * `renderMs` and then returns a pre-rendered file from /public/media.
 * Results carry `demo: true` so the UI must label them "namuna / образец".
 * Use it for the stage fallback and for UI work; never present it as a live render.
 */
export function demoProvider(opts: {
  enabled: boolean;
  now?: () => number;
  renderMs?: number;
  videoUrl?: string;
  imageUrl?: string;
}): MediaProvider {
  const now = opts.now ?? Date.now;
  const renderMs = opts.renderMs ?? 8_000;
  const files: Record<MediaKind, { url: string; type: string }> = {
    video: { url: opts.videoUrl ?? "/media/3d/constellation-loop.mp4", type: "video/mp4" },
    image: { url: opts.imageUrl ?? "/media/3d/constellation-16x9.png", type: "image/png" },
  };
  return {
    id: "demo",
    label: "Demo (namuna)",
    acceptsDataUrls: true,
    isConfigured: () => opts.enabled,
    supports: () => true,
    model: (kind) => `demo-${kind}`,
    async submit(req: SubmitRequest): Promise<ProviderRef> {
      // request id encodes kind + start time, so polling needs no server memory
      return { requestId: `demo_${req.kind}_${now()}`, model: `demo-${req.kind}` };
    },
    async poll(ref: ProviderRef): Promise<PollResult> {
      const [, kind, started] = ref.requestId.split("_");
      const age = now() - Number(started);
      if (!Number.isFinite(age)) return { status: "failed", error: "bad demo request id" };
      if (age < renderMs / 4) return { status: "queued", queuePosition: 1 };
      if (age < renderMs) return { status: "running" };
      const f = files[(kind as MediaKind) === "image" ? "image" : "video"];
      return { status: "succeeded", outputUrl: f.url, contentType: f.type };
    },
    async cancel() {},
  };
}
