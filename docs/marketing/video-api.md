# Video API: "product photo -> 10-15 s vertical ad"

Researched 2026-11-24, about 15:00 Tashkent time. All prices come from the providers' own pages or blog posts as indexed that day. Re-check them before quoting on stage. Lines marked **(unverified)** are things I could not confirm from an official page.

## TL;DR: what to wire tonight

1. **Build one provider-agnostic backend route** (`POST /api/video` submits, `GET /api/video/:id` polls). Keep the key server-side. Return a `request_id` right away and never block the 60-second "Bir havola" flow on video.
2. **Start with fal.ai + Kling 2.6 Pro image-to-video** (`fal-ai/kling-video/v2.6/pro/image-to-video`, about $0.07/s with audio off, so about $0.70 for 10 s). The model IDs, JS client, queue and webhooks are all documented, so it is the fastest thing to get working tonight. Use **Seedance 2.5 image-to-video** (`bytedance/seedance-2.5/image-to-video`) when you need a native 12-15 s clip.
3. **Add a Higgsfield Cloud API adapter as soon as the founder has a key plus a USD top-up.** It is cheaper (Seedance 2.5 at $0.0738/s, so about $1.11 for 15 s) and matches the tool we already use. The exact model paths have to be copied from the console or docs, because I could not confirm them. Either way, **pre-render the demo clip** and show it as a cached result on stage. Live generation takes minutes, not seconds.

> Do **not** count on the Higgsfield *subscription* (the MCP connector) for in-app video. One quote for Seedance 2.5, 10 s, 720p, 9:16 came back at **70 credits**. Marketing Studio at 15 s is **75 credits**. The account has **2 credits** left. The subscription and the developer API are separate wallets.

---

## Option A: Higgsfield Cloud API (official developer API)

| Item | Value |
|---|---|
| Console / keys | `cloud.higgsfield.ai` (the key is an ID + secret pair, shown once) |
| Base URL | `https://api.higgsfield.ai` |
| Auth | `Authorization: Key ${HF_API_KEY_ID}:${HF_API_KEY_SECRET}`. The legacy `hf-api-key` / `hf-secret` headers still work. **No Bearer token. Server-side only.** |
| Flow | `POST /<model-path>` returns `{status:"queued", request_id, status_url, cancel_url, expires_after:604800}`. Poll `status_url` or use a webhook. Statuses: `queued`, `in_progress`, `completed`, `failed`, `nsfw`, `canceled`. |
| Cancel / delete | `POST /requests/{id}/cancel` (only while queued). `DELETE /requests/{id}` |
| Retention | Outputs stay for at least 7 days. **Copy them to our own storage.** |
| Idempotency | Send an `Idempotency-Key` header on every submit |
| SDKs | Python: `pip install higgsfield-client` (env vars `HF_API_KEY`, `HF_API_SECRET`; `subscribe()`, `upload_file()`/`upload_image()`). There is also a Node/TS SDK. **(I did not confirm the npm package name)** |
| Billing | Pay-as-you-go in USD from a top-up balance. Failed, NSFW and timed-out requests are not charged. Some third-party posts mention a $5 minimum top-up **(unverified)** |
| Video price (per second of output) | Seedance 2.5 **$0.0738/s** · Kling 3.0 **$0.112/s** · PixVerse 6 $0.115/s · MiniMax H3 $0.13/s · LTX 2.5 Pro $0.17/s · Wan 3.0 $0.20/s · DoP **$0.125 per generation** |
| Example | Higgsfield's own example (Soul 2 still + 10 s of Kling 3.0) comes to under $1.30 in total |
| Model paths | The pattern looks like `bytedance/seedance-2.0/text-to-video`. The docs list `/docs/models/seedance-2-5/reference-to-video`. **I could not confirm the exact image-to-video path. Copy it from `docs.higgsfield.ai/docs/models.md` in the console.** |
| Latency | Not published. Plan for 1-4 min for 10 s at 720p **(estimate)** |

Pros: the cheapest Seedance pricing, one key for every model, and it matches the Higgsfield assets we already made.
Cons: it needs a separate USD balance, and the model paths and request fields have to be checked by hand. Some doc pages were blocked from my fetch tool.

## Option B: fal.ai (the best-documented fallback)

| Item | Value |
|---|---|
| Auth | `FAL_KEY` env var (server-side). The client is `@fal-ai/client` |
| Flow | `fal.queue.submit(modelId, { input, webhookUrl })` returns `request_id`. Then `fal.queue.status` / `fal.queue.result`. You can also use `fal.subscribe` for a blocking call |
| Image upload | `fal.storage.upload(file)` returns a URL to pass as `image_url` |
| Kling 2.6 Pro i2v | `fal-ai/kling-video/v2.6/pro/image-to-video`: **$0.07/s** with audio off, $0.14/s with audio on. Clips are 5 or 10 s |
| Kling 3.0 Pro | $0.112/s with audio off, $0.168/s with audio on |
| Seedance 2.x i2v | `bytedance/seedance-2.5/image-to-video`. Fal lists Seedance 2.0 at about $0.30/s at 720p, with a "Fast" tier at about $0.24/s. Use it for native 12-15 s clips |
| Veo 3.1 (Lite) i2v | `fal-ai/veo3.1/lite/image-to-video`. Full Veo 3.1 is about $0.20/s without audio and $0.40/s with audio |
| Hailuo 2.3 | Priced per clip: about $0.28 per 6 s at 768p (Standard) or about $0.49 at 1080p (Pro) |
| Latency | Usually 1-3 min for 5-10 s, with queue spikes **(estimate, not measured)** |

Note: my fetch tool could not resolve `fal.ai` over DNS (that is probably the tool's sandbox). Run `curl -sI https://queue.fal.run` from the backend host once before relying on it.

## Other options (not for tonight)
- **Runway (Gen-4 Turbo / Aleph)**: a good API, but it costs more per second and has its own credit system.
- **Luma (Ray)**: a good API with an image-to-video "keyframes" option. Pricing per second is similar or higher.
- **Kling's official API (klingai.com)**: needs a separate account and verification. Too slow to set up tonight.

---

## Recipe: product photo -> 10-15 s 9:16 ad

1. **Clean the photo**: remove the background or place the product on a clean surface (optional: one image-model call, about $0.003-0.03).
2. **Generate motion**: image-to-video, 9:16, 720p, 10 s (Kling) or 12-15 s (Seedance), **audio off** (we add our own music and VO).
   Prompt template (English works best, even for Uzbek brands):
   `Slow cinematic push-in on the product on a warm paper-white surface, soft morning window light, subtle steam/sparkle where natural, gentle parallax, shallow depth of field, premium commercial look, product shape and label unchanged, no text, no watermark.`
   Negative: `text, letters, captions, watermark, distorted label, extra hands, warped product`.
3. **Render text ourselves.** Video models garble Uzbek Latin and Cyrillic, so put the headline, price and CTA on top as an overlay in the app (CSS/Canvas preview, then ffmpeg `drawtext` or Remotion for export). This is also our "no AI slop" point.
4. **Add an end card** (2-3 s): logo, price, "Telegram: @kanal". A 10 s AI clip plus a 3-5 s rendered end card makes a 13-15 s ad, so a single 10 s generation is enough.
5. **Store** the MP4 in our own storage, because the provider deletes outputs after about 7 days.

Cost per ad: about **$0.70-1.15** of video model time, plus pennies for LLM and image calls. A **"Bir havola" run without video costs only cents**, so meter video separately in the plans (for example, 4 clips/month on Start and 20 on Biznes).

## Minimal server sketch (Next.js route, provider switch)

```ts
// src/app/api/video/route.ts  (sketch only, the backend owner decides where it lives)
import { fal } from "@fal-ai/client";
fal.config({ credentials: process.env.FAL_KEY });

export async function POST(req: Request) {
  const { imageUrl, prompt, seconds = 10 } = await req.json();
  if (process.env.VIDEO_PROVIDER === "higgsfield") {
    const r = await fetch(`https://api.higgsfield.ai/${process.env.HF_VIDEO_MODEL_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${process.env.HF_API_KEY_ID}:${process.env.HF_API_KEY_SECRET}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      // field names: copy from the model page in the console (unverified)
      body: JSON.stringify({ prompt, image_url: imageUrl, duration: seconds, aspect_ratio: "9:16" }),
    });
    return Response.json(await r.json()); // { request_id, status_url, ... }
  }
  const { request_id } = await fal.queue.submit("fal-ai/kling-video/v2.6/pro/image-to-video", {
    input: { prompt, image_url: imageUrl, duration: String(seconds) as "5" | "10",
             negative_prompt: "text, letters, watermark, distorted label" },
    webhookUrl: process.env.VIDEO_WEBHOOK_URL, // optional
  });
  return Response.json({ request_id });
}
```

Polling: `GET /api/video/:id` calls `fal.queue.status(model, { requestId, logs: false })` and, once it reports `COMPLETED`, `fal.queue.result(...)`, which returns `data.video.url`. For Higgsfield, `GET status_url` with the same `Authorization` header and read the output URL once `completed`.

Demo safety: keep a pre-rendered `public/generated/demo-ad.mp4` (not generated yet because the subscription has 2 credits). The Videograf node should show "tayyorlanmoqda… ~2 daq" and then swap in the cached file if the live job has not finished by the time the pitch needs it.

## Sources
- [Higgsfield: Generate AI videos with the Higgsfield API](https://higgsfield.ai/blog/generate-ai-videos-higgsfield-api)
- [Higgsfield API landing page](https://higgsfield.ai/higgsfield-api)
- [Higgsfield docs: Authentication](https://docs.higgsfield.ai/docs/authentication.md)
- [Higgsfield docs: Requests and lifecycle](https://docs.higgsfield.ai/docs/concepts/requests.md)
- [Higgsfield docs: FAQ](https://docs.higgsfield.ai/docs/help/faq.md)
- [Higgsfield docs: API reference overview](https://docs.higgsfield.ai/docs/api-reference/overview.md)
- [higgsfield-client (PyPI)](https://pypi.org/project/higgsfield-client/) · [GitHub](https://github.com/higgsfield-ai/higgsfield-client)
- [fal: Kling 2.6 Pro image-to-video](https://fal.ai/models/fal-ai/kling-video/v2.6/pro/image-to-video)
- [fal: Seedance 2.5 image-to-video](https://fal.ai/models/bytedance/seedance-2.5/image-to-video)
- [fal: Veo 3.1 Lite image-to-video](https://fal.ai/models/fal-ai/veo3.1/lite/image-to-video)
- [fal: Best image-to-video APIs 2026](https://fal.ai/learn/tools/best-image-to-video-apis-2026)
- [invideo: AI video model pricing (Aug 2026)](https://invideo.io/blog/ai-video-model-pricing)
