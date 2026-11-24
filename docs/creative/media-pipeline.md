# Media pipeline: Videograf (video) and Dizayner (image)

The flow is: product photo → brand-styled ad clip or still → captions as our own overlay → stored result. It runs behind a provider interface, so Higgsfield, fal.ai, or an offline demo can do the work.

- Code: `src/lib/uslub/media/**`
- Routes: `src/app/api/uslub/media/**`
- Tests: `src/lib/uslub/media/media.test.ts` (40 tests: lifecycle, quotas, owner checks, adapters with mocked `fetch`, captions, config), `post-image.test.ts`, `src/lib/uslub/visual/visual.test.ts`

## Post pictures in the channel's own style (sprint 2026-11-25)
Every post gets a picture that looks like it came from the business's own channel.

1. **Learn the style** — `POST /api/uslub/visual { brandId, ownerImages?, refresh? } -> { visual, cached }` (`src/lib/uslub/visual/**`).
   Up to 10 recent photos are read from `t.me/s/<channel>` (two pages, at most two per album, video covers as a fallback), plus up to 5 owner photos (data: URLs resized by the browser, or https).
   Claude Sonnet 5.5 (vision, structured output, low effort) marks which images are real representative photos (maps, menus, text posters and screenshots are dropped) and writes palette, light, composition, props, mood, avoid and one English style paragraph.
   The same call also writes the style for the owner in all three UI languages, `visual.ownerText.{uz,ru,en}` = `{ summary, light, composition, mood, avoid[] }` (`src/lib/uslub/visual/words.ts`, read it with `styleWords(visual, lang)`). `StyleRefs` (Pro) shows these rows: Uslub tavsifi, Yorug‘lik, Kompozitsiya, Kayfiyat, Rasmlarda bo‘lmaydi. Switching language needs no new analysis. The English paragraph and descriptors stay for the image model. A style saved before these words existed is learned again on its next `POST /visual`; until then the Pro card shows its English rows only in English.
   Up to 6 kept refs are copied to fal storage (`rest.fal.ai/storage/upload/initiate`, same `FAL_KEY`), because `telesco.pe` links can expire. Saved in `brands.visual`; reused for 12 h unless the owner adds photos or sends `refresh`.
   An empty channel ("fresh" brand) with no photos gets a style from the business description alone. About 15–30 s and ~$0.02–0.04 per analysis.
2. **Make the picture** — `POST /api/uslub/media/post-image { postId, regenerate?, photo? } -> { image }`, `GET …?postId=` every ~4 s.
   A cheap Haiku call turns the post (Uzbek/Russian) into an English subject line (subject only: the channel's style decides the setting).
   The prompt = subject + style paragraph + light/framing/palette + "no text, letters, logos; don't invent a brand mark" + avoid list + 4:5 frame.
   Images sent: the owner's product photo first (if given: "keep this product exactly as it is"), then owner refs, then channel refs.
   With no image at all the text-to-image twin of the model runs. Saved in `posts.image`; "another variant" reuses the subject line; max 6 pictures per post.
   If the brand has no style yet, the route learns it first (one analysis per brand at a time per instance).
3. **Publish** — `publish.ts`: a ready picture goes out as ONE photo message with the text as caption when the text is ≤ 1024 characters; longer text goes as the photo, then the full text right under it (never cut). If Telegram cannot fetch the image by URL we upload the file; if the second message fails the first is deleted.
   It sends exactly `posts.image.url`: the newest finished picture, which stays set while another version renders or after it fails. The Studio shows that same url, so it never publishes a version the owner has not seen. The bot's preview should call `refreshPostImage(postId)` first, then show `image.url`.

**Guards (cheap checks before anything paid):**
- **Writes:** need the brand owner's Telegram identity once a brand has an owner. Adding owner photos turns a shared `channel_only` brand `custom`.
- **POST `/post-image` order:** access → fal configured (else 503) → existing/rendering picture returned as is → per-post cap (6) → daily media quota pre-check → only then the photo upload, the style analysis and the AI subject line.
- **Guests:** anonymous callers share one pool, and each IP gets only part of it (`MEDIA_IMAGE_ANON_ACTOR_DAILY_LIMIT`, videos `MEDIA_ANON_ACTOR_DAILY_LIMIT`). The job stores a hashed IP (`actorKey` = `ip:<16 hex>`, never the raw address, never sent to clients) and the cap is checked in the same atomic insert as the others. Over it: 429 `guest_limit` ("sign in through the Telegram bot").
- **POST `/media/jobs` with a `brandId`:** the same draft rule as the post pictures (`assertDraftAccess`): a brand owned by another Telegram user gets 403 before anything is billed.
- **Style analyses:** a DB slot (`events` type `visual_analysis`) is written before each Claude call; the first N rows win.
  - Caps: `MEDIA_VISUAL_DAILY_LIMIT` 60 app-wide, `MEDIA_VISUAL_BRAND_DAILY_LIMIT` 8 per brand, `MEDIA_VISUAL_ACTOR_DAILY_LIMIT` 12 per Telegram user or hashed IP.
  - Parallel first loads run ONE analysis; the others give their slot back and wait for it.
- **Owner links:** downloaded only from Telegram's and fal's CDNs (uploads come as data: URLs), so there is no SSRF surface.
- **Errors:** `{ error, code }` in `lang` (uz | ru | en; body or `?lang=`, default uz). Codes:
  - input and access: `bad_input`, `bad_image`, `too_large`, `not_found`, `forbidden`, `login_required`;
  - limits: `rate_limited`, `daily_limit`, `guest_limit`, `post_limit`, `style_limit`;
  - failures: `not_configured`, `storage_failed`, `ai_failed`, `generation_failed`, `internal`.

**Model choice (tested 24 Nov on @Safiabakery and @lifesmileuz, same prompt and refs):** `fal-ai/nano-banana-2/edit` ($0.08 per 1K image, up to 14 refs, ~10–15 s) over `bytedance/seedream/v5.5/edit` ($0.03 + $0.012 per ref = $0.066–0.10 with 3–6 refs, ~30–35 s).
Both look photographic. Nano Banana 2 gave more natural phone-photo texture and, once the subject line stopped describing the setting, picked up the channel's own table setups and props; it kept an owner's product (a patterned platter) exactly. It is also 2–3x faster, which matters while the owner watches. Seedream stays available through `FAL_IMAGE_MODEL`.

## Status at a glance
| Piece | State |
|---|---|
| Job lifecycle (submit → throttled poll → result / fail / timeout / cancel) | done, unit-tested |
| Higgsfield Cloud API adapter (Seedance 2.5 i2v, GPT Image Flare; presigned upload for phone photos) | done, tested with mocked HTTP. **Not run against the live API** (no key) |
| fal.ai adapter (Kling 2.6 / v3 / v4, Seedance 2.x, Nano Banana Pro, Seedream) | same |
| Offline demo provider (`MEDIA_DEMO=1`), results labelled `demo: true` | done |
| Spend protection: per-user, anonymous-pool and app-wide daily caps, checked atomically | done |
| Captions: Uzbek clean-up, auto-timing, WebVTT / SRT / ASS | done |
| Copy results to our own storage | **hook only** (`archive`), needs a storage decision (see below) |
| Studio UI for the Videograf/Dizayner nodes | **not built**: owned by the UI agent, contract below |

## Setup (founder / lead)
Add keys to `.env.local` locally and to Vercel env vars. Never commit them, and never paste them into chat.

| Variable | Meaning |
|---|---|
| `HIGGSFIELD_API_KEY` | `<key id>:<key secret>` from **cloud.higgsfield.ai**. This is the developer API, paid in USD from its own balance. It is **not** the subscription or trial credits. `HF_API_KEY` + `HF_API_SECRET` also work. |
| `FAL_KEY` | fal.ai key (needs submit, read and cancel scopes) |
| `MEDIA_PROVIDERS` | preference order, default `higgsfield,fal` |
| `HIGGSFIELD_VIDEO_MODEL` / `HIGGSFIELD_IMAGE_MODEL` | override endpoints (defaults: `bytedance/seedance-2.5/image-to-video`, `marketing-studio/image/flare`) |
| `FAL_VIDEO_MODEL` / `FAL_IMAGE_MODEL` | defaults: `fal-ai/kling-video/v2.6/pro/image-to-video` (cheapest at about $0.07/s with audio off), `fal-ai/nano-banana-2/edit` (post pictures; its text-to-image twin `fal-ai/nano-banana-2` runs when there is no input image) |
| `MEDIA_DAILY_LIMIT` | app-wide jobs per rolling 24 h (default 30) |
| `MEDIA_USER_DAILY_LIMIT` | per verified Telegram user (default 5) |
| `MEDIA_ANON_DAILY_LIMIT` | one shared pool for every anonymous web caller (default 5). **0 means a Telegram login is required.** |
| `MEDIA_ANON_ACTOR_DAILY_LIMIT` | videos per anonymous caller (hashed IP) inside that pool (default 2) |
| `MEDIA_DEMO` | `1` turns on the offline demo provider, which returns the pre-rendered `/media/3d/…` files labelled as a sample |
| `MEDIA_IMAGE_DAILY_LIMIT` | post pictures per rolling 24 h, whole app: the spend ceiling (default 150 ≈ $12) |
| `MEDIA_IMAGE_ANON_DAILY_LIMIT` | pictures shared by all anonymous web callers (default 100). **0 means a Telegram login is required** (401 `login_required`). |
| `MEDIA_IMAGE_ANON_ACTOR_DAILY_LIMIT` | pictures per anonymous caller (hashed IP) inside the guests' pool (default 30: four 7-post runs, or two with a few "another version"). Office and mobile-carrier NAT put many people on one IP, so keep it well above one run. |
| `MEDIA_IMAGE_USER_DAILY_LIMIT` | pictures per verified Telegram user (default 60) |
| `MEDIA_IMAGE_BRAND_DAILY_LIMIT` | pictures per brand (default 24 = 7 posts with ~2 more versions each), so one brand cannot drain the shared pool |
| `MEDIA_VISUAL_DAILY_LIMIT` / `_BRAND_` / `_ACTOR_` | style analyses (Claude vision) app-wide / per brand / per caller (defaults 60 / 8 / 12) |

Pictures and videos count in separate pools (`MEDIA_DAILY_LIMIT`, `MEDIA_USER_DAILY_LIMIT` and `MEDIA_ANON_DAILY_LIMIT` are for videos). Jobs the provider refused at submit (nothing billed) do not count.

Malformed values are ignored, and only the variable's **name** is logged.

**Cost guide** (provider list prices on 24 Nov; re-check before quoting):
- Higgsfield Seedance 2.5: about $0.1177/s (Higgsfield's API page, 24 Nov; the older $0.0738/s figure was not corroborated)
- Post picture: fal Nano Banana 2 edit $0.08 (1K), plus ~$0.03 per style analysis (Claude), ~$0.0005 per subject line (Haiku)
- fal Kling 2.6 Pro: about $0.07/s with audio off
- So a 5–10 s ad costs about $0.35–1.10. Failed and NSFW jobs are not billed on Higgsfield.

## API
Every route uses the shared `handle()` and returns `{ error }` with a 4xx/5xx status on failure. Keys never leave the server.

```
GET  /api/uslub/media
  -> { configured, demo, loginRequired, limits:{daily,perUser,anonymous},
       providers:[{id,label,configured,models:{video,image}}], presets:[…], message? }
     The node shows `message` ("Videograf hali ulanmagan…") when configured=false.

POST /api/uslub/media/jobs
  { kind:"video"|"image", imageUrl:"https://…"|"data:image/jpeg;base64,…" (≤ ~2 MB),
    productName?, brief?, presetId?, aspect?:"9:16"|"16:9"|"1:1"|"4:5", seconds?:3–12,
    captions?:[{start,end,text}], brandId?, provider?, initData? }
  -> 201 { job }   status "queued"
  -> 502 { job }   the provider refused at submit (job.status "failed", job.error explains)
  -> 503 not configured · 401 login required (anon pool = 0) · 429 a daily cap · 400 bad photo

GET  /api/uslub/media/jobs?id=<uuid>   -> { job }   poll every 3–5 s; the server calls the provider at most every 4 s
POST /api/uslub/media/jobs/cancel {id, initData?} -> { job }   (owner-only for Telegram users' jobs)
POST /api/uslub/media/captions { lines|cues, seconds, lang?, aspect?, format?:"json"|"vtt"|"srt"|"ass" }
  -> { cues } or a caption file (text/vtt, SRT, ASS for ffmpeg burn-in)
```

`job` (public view) fields:
- `id`, `kind`, `status` (`queued|running|succeeded|failed|canceled`)
- `provider`, `model`, `presetId`, `aspect`, `seconds`
- `prompt`, `negativePrompt`, `imageRef`, `captions`
- `result?{url,contentType,expiresAt,demo}`, `error?`, `polls`, `createdAt`, `updatedAt`

Provider polling URLs and the owner key are never returned.

### Styling presets
`ai-os-dark`, `warm-bazaar`, `paper-studio`, `evening-street`, `macro-detail`. Each has UZ/RU/EN names, a "best for" line and two swatch colours (from `GET /api/uslub/media`). Each preset is one look-bible block plus exactly one camera move. Every prompt locks the product ("same shape, proportions, colours, materials and label") and forbids text. See `presets.ts` and playbook §7.

### Captions are an overlay, never model pixels
Video models garble letters, and Uzbek `oʻ`/`gʻ` worst of all. The UI should:
- draw `job.captions` over the `<video>` (CSS, Mercat style: white bold on an ink pill, lower third), or
- request `format:"vtt"` and attach it as a `<track>`.

For a downloadable MP4 with burned-in captions, use the ASS export with `ffmpeg -i clip.mp4 -vf "subtitles=captions.ass" out.mp4`. That runs as a worker or locally, not on Vercel functions.

## How the UI agent can wire the nodes (proposal, not built)
1. On Studio load: `GET /api/uslub/media`. If `configured:false` and `demo:false`, show the node as "ulanmagan", with the message and no button.
2. Videograf node: product photo (upload → data URL, or the brand's photo URL) + preset chips + aspect → `POST /jobs`. Show `tayyorlanmoqda… ~1–3 daq` with a dot-matrix timer.
3. Poll `GET /jobs?id=` every 4 s until a terminal status. Then play `result.url` with the caption overlay. If `result.demo`, show a **"namuna / образец"** badge.
4. Errors: show `error` as is. It is already in Uzbek and Russian, and keys are redacted.
5. Approval node before anything is published (same rule as posts).

## Proposed for the lead (not changed by this branch)
1. **contract.ts**: re-export the media types, or move them in: `MediaKind`, `MediaJobStatus`, `StylePresetId`, `CaptionCue`, `MediaJobInput`, `MediaResult`, `PublicMediaJob` from `src/lib/uslub/media/types.ts`. Then add the routes above to the API comment block.
2. **db/schema.sql** (the engine agent's file). The repo creates this table lazily on the first "relation does not exist", but it belongs in the schema:
   ```sql
   CREATE TABLE IF NOT EXISTS media_jobs (
     id uuid PRIMARY KEY,
     brand_id text,
     kind text NOT NULL,
     status text NOT NULL,
     provider text NOT NULL,
     owner_key text NOT NULL DEFAULT 'anon',
     data jsonb NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS media_jobs_created_idx ON media_jobs (created_at DESC);
   CREATE INDEX IF NOT EXISTS media_jobs_owner_created_idx ON media_jobs (owner_key, created_at DESC);
   ```
3. **.env.example**: add the variables in the table above, with empty values.
4. **Result storage.** Provider URLs expire: Higgsfield keeps outputs 7 days, and fal follows its media-expiry settings. Recommended: Vercel Blob (`@vercel/blob`, needs `pnpm add` by the lead). Wire it through `MediaJobs({ archive })`, which takes the provider URL and returns `{url}` in our Blob. Until then, results live on provider URLs.
5. **`docs/marketing/video-api.md`** (Assets agent) has stale facts:
   - fal Kling's image field is `start_image_url`, not `image_url`;
   - Higgsfield Seedance 2.5 takes no `aspect_ratio`, and the frame follows the photo;
   - DoP is gone from the Higgsfield API catalog;
   - Nano Banana and Seedream are not on the Higgsfield API, only on fal.

   Verified notes with sources are in the shared session notes, `media-api-verified.md`.

## Security notes
- Keys are read only in `service.ts` from `process.env`. Provider errors pass through `redactSecrets` before being stored or shown.
- Paid generation is capped per Telegram user, for the anonymous pool, and app-wide. Check and insert happen in one Postgres transaction behind `pg_advisory_xact_lock`, so parallel requests cannot overshoot.
- Photo URLs must be public `https`. Private and local hosts are rejected (providers fetch them, not us). Data URLs are limited to PNG/JPEG/WebP, about 2 MB.
- Job access:
  - A job created by a verified Telegram user can be polled or cancelled only by that user. They are identified by `Authorization: tma <initData>`, which `src/components/studio/api.ts` already sends. Anyone else gets a 404.
  - An anonymous job's random UUID is its capability, and it is returned only to the caller who created it.
- We only follow provider polling URLs on the provider's own host (`queue.fal.run`, `api.higgsfield.ai`).
- Per-IP rate limits: create 4/min, poll 120/min, captions 30/min.

## Known gaps (honest)
- **Neither provider has been called live.** No API key exists yet, and the Higgsfield *developer* balance is separate from the subscription. The first real job will show any field mismatch. Errors come back as readable `job.error`.
- **Higgsfield `marketing-studio/image/flare` is GPT Image 2.5**, not Nano Banana or Seedream, which are absent from the Higgsfield API. Use fal for those.
- **Seedance on Higgsfield ignores the aspect ratio:** the clip follows the photo's shape. For a guaranteed 9:16 from a landscape photo, crop the photo first, or use `kling-video/v2.6` (it has `aspect_ratio`).
- **No webhook.** We poll, which suits Vercel. Webhooks (Standard Webhooks signatures) can come later.
