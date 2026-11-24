# Mercat video: Higgsfield production plan (scouting only, nothing spent)


## Blocker: the free generations don't work from Claude Code

- I ran a cost check with `use_unlim:true` on `seedance_2_5`. Higgsfield rejected it with: *"You are using Higgsfield from Claude Code, where unlimited generations are not available. They are available in: Claude chat, Claude Cowork, ChatGPT."*
- Every generation call therefore has to be made from **claude.ai chat, Claude Cowork or ChatGPT**, connected to the same Higgsfield account. From Claude Code the same calls are billed in credits, and there are only 2.
- Account: plan `ultra`, **2 credits**. Trial is `mcp_ultra_unlim`, status `active`, `trial_ends_at` 2026-11-26T21:27:11Z. Trial credits: 0. In this session `unlim.available` is false.

## 1. What the trial covers

**Covered (`supports_unlim: true`):**
- **Image:** `nano_banana_pro`, `nano_banana_2`, `nano_banana_2_1`, `gpt_image_2`, `gpt_image_2_5`, `gpt_image_2_6`, `seedream_v5_pro`, `soul_2` / `soul_v2`
- **Video:** `seedance_2_5` and `seedance_2_0` only
- **Audio:** `text2speech_v2` (engines: elevenlabs, minimax, seed_speech, vibe_voice, cozy_voice) and `seed_audio`

**Limits:**
- Each free call makes exactly one result (`count` is capped to 1). Use `generate_*_batch` to run several at once.
- Ultra allows up to **8 videos and 8 images in parallel**.
- The exact resolution and duration caps were not visible here. They appear as "Unlim configs" rows in a `models_explore get` result, and only in a client where the trial works. Check them first.

**Billed in credits (do not use with 2 credits):**

| Tool | Cost seen |
|---|---|
| Seedance 2.5 t2v, 5 s, 720p | 35 cr |
| Seedance 2.5, 10 s, 1080p | 160 cr |
| `kling4_0`, 5 s, 720p | 12.5 cr |
| `seedance_2_0` in fast mode (same quote passed `mode` as a 2.0 setting) | 12.5 cr |
| `nano_banana_pro` 2K image | 2 cr |
| `elevenlabs_v4`, one short line | 0.46 cr |
| Editing Room generations | 3.5–34 cr per second |

Also billed: Veo 3.1, Cinema Studio, Kling (all versions), `intone`, `sync_so` lip-sync, ElevenLabs Music, upscalers, `reframe`, Marketing Studio video.

## 2. Best free models

**`seedance_2_5`: use for everything**
- Length 4–30 s; resolution 480p, 720p, 1080p or 4k.
- Aspect ratios: 16:9, 9:16, 21:9, 1:1, 4:3, 3:4, auto.
- Modes:
  - `t2v` for cinematic shots from text.
  - `omni_reference` for image-to-video. It takes `start_image`, `end_image`, up to 30 `image_references`, up to 10 `video_references` and up to 10 `audio_references`.
  - `video_edit` and `video_extension`.
- Set `generate_audio:false` for clean clips you will lay voice-over on.
- `draft:true` makes a 480p preview, but finishing a draft is billed, so skip it.
- Once the reference video arrives, upload it and pass it as `video_references` to match the look.

**`seedance_2_0`:** 4–15 s, `std` or `fast` mode. Backup only.

**Stills:**
- `nano_banana_pro` (up to 14 reference images, 4k) for the AI OS key frames: orbs, mesh-gradient cards, neon lime.
- `gpt_image_2_6` for title or number cards with readable text.

**Render time:** the tools don't report it. Plan on about 2–6 minutes per 5–8 s clip at 720p/1080p (my estimate, not measured).

**Screenshots:** don't animate UI screenshots with AI, because it warps text. Use real screen recordings for the product UI and AI for the cinematic shots.

## 3. Editing Room can't assemble the video

- It is a per-shot AI editor, not a timeline editor. It does camera moves, angle changes, relighting, person or location swaps, brush edits, and cut, trim, `render_timeline` and `export_editing_room` (MP4).
- It has no text overlays, music or voice-over tracks.
- Every AI edit is billed at 3.5–34 cr per second. With 2 credits it is unusable.
- The `video-montage` workflow (ffmpeg in Higgsfield's sandbox: concat, music mix, burned captions) and `video-editing` (Higgsedit motion graphics) exist, but I didn't check what they cost. They are also slower than editing yourself.
- **Recommendation:** assemble locally in CapCut, DaVinci Resolve or Premiere, or with local ffmpeg.

## 4. Voice and music

**Voice-over (free):**
- Use `generate_audio_batch` with `model:"text2speech_v2"`, `variant:"elevenlabs"`, `voice_type:"preset"`, `use_unlim:true`, one sentence per item.
- Voice candidates with Russian names (listen to the previews first):
  - Alexey: `7c2133e5-68ab-511f-9aed-9a67664382b1`
  - Vlad: `e5666b9c-99a2-4fac-8b4e-abee078b186d`
  - Elena: `ca83ca7f-c186-493d-bd69-0d765fa861b2`
- Russian through the ElevenLabs engine should be fine. **Uzbek quality is untested**, so try one line first. Fallback: the founder records the Uzbek lines on his phone.
- `create_voice` can clone a voice from a sample. Use it with `text2speech_v2` and `voice_type:"element"`.

**Music:**
- `elevenlabs_music_v2` / `v2_5` is billed, so use royalty-free music from outside Higgsfield.

**Sound effects:**
- `search_sound_effects`, then `preview_sound_effect`, then `download_sound_effect` (Epidemic Sound library). I didn't check the cost.
- Free option: native audio from Seedance on one or two hero shots (`generate_audio:true`).

## 5. On-screen presenter

- `intone` produces a 1080p talking head with lip-sync from 1–2 face images plus 2–30 s of audio. It is billed, so not possible with 2 credits.
- Free fallback: `seedance_2_5` in `omni_reference` mode with a character image plus the voice-over clip as `audio_references`. Lip-sync quality is unknown, especially in Uzbek.
- **Recommendation:** no AI presenter. Use voice-over only, or film the founder for about 5 s.

## 6. Presets and workflows

| Workflow | Fit |
|---|---|
| `katana` | Remixes a reference video's look onto your product. The best match once the reference arrives, but it's slow and its cost is unchecked. Skip at this deadline. |
| `ugc-video` | Has a "website tour from real screenshots" format, but uses paid models. |
| `ads-studio` | Static ad images only. |
| `faceless-video` | Rules out product demos. |

I didn't open the Marketing Studio gallery (`get_presets`), because doing so opens a widget.

## 7. Pipeline to finish by 16:55 (all generation from claude.ai chat or Cowork)

**15:35–15:40 Check the free generations work**
- Run `models_explore {action:"get", model_id:"seedance_2_5"}` and confirm `unlim.available:true`. Note the "Unlim configs" caps.
- Run `estimate_video_cost` with `use_unlim:true` and confirm it isn't rejected.
- Upload the logo and 3–4 slide or brand frames with `media_upload`, then `media_confirm`.

**15:40–15:50 Key frames**
- `generate_image_batch` with 8 items: `model:"nano_banana_pro"`, `aspect_ratio:"16:9"`, `resolution:"2k"`, `use_unlim:true`, and the brand uploads as `medias:[{role:"image_references", value:<id>}]`.
- Shots:
  - S1: lime orb ignites in black space.
  - S2: Tashkent shop owner, overwhelmed, phone in hand.
  - S4: 10 glass AI-employee cards and orbs.
  - S6: posts appearing in UZ Latin, Cyrillic and RU.
  - S7: dot-matrix numbers. Use `gpt_image_2_6` for text-heavy cards.
  - S8: logo end card.

**15:50–16:15 Clips**
- `generate_video_batch` with 8 items: `model:"seedance_2_5"`, `mode:"omni_reference"`, start image from the key frame (`medias:[{role:"start_image", value:<image job id>}]`), `duration:5–8`, `resolution:"1080p"` (or 720p if the caps say so), `aspect_ratio:"16:9"`, `generate_audio:false`, `use_unlim:true`.
- Then `jobs_wait`. Allow one round of retries for the weakest shots.

**In parallel (15:50–16:10)**
- Screen-record the real "paste link → department works in ~60 s" flow at 1080p, to be sped up to about 20 s.
- Generate voice-over with `text2speech_v2` as in section 4.

**16:15–16:45 Edit locally**
- Target 60–75 s: hook, problem, the one-link moment, AI employees, real demo, outputs, numbers, CTA.
- Add music and SFX, plus titles in the neon-lime style.

**16:45–16:55 Export and submit**
- Export H.264 1080p, watch it through once, submit.

**Risks:**
- Generating from Claude Code bills credits. Never pass `use_unlim:false` and never generate here.
- The free caps may be below 1080p or limit duration.
- Uzbek text-to-speech quality is unknown.
- Render queues may be slow at peak times. Keep shots at 8 or fewer and use the parallel slots.
- AI-generated UI text gets garbled, so show the product UI only through real recordings.

