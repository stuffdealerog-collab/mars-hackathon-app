# Mercat creative playbook: how professionals make AI video that doesn't look like AI

Written 24 Nov 2026 for two jobs:
1. tomorrow's pitch film, which is planned in `docs/video/pitch-storyboard.md` and produced from `docs/video/higgsfield-runbook.md`;
2. the in-app **Videograf** and **Dizayner** employees. `src/lib/uslub/media/presets.ts` encodes the product-ad rules from §7 below.

It builds on `docs/video/artlist-rulebook.md` and does not repeat it. That file covers shot design, camera vocabulary, editing rhythm and the sound mix; references to it look like "rulebook §N". Every claim here comes from a source in §10. Anything not confirmed from an opened page is marked *(unverified)*.

---

## 0. The ten rules (print this)

1. **Lock the assets before writing any shot prompt.** That means the orb sheet, the phone plate, the character sheet and the locations. The hero object is this film's "truck" (§6.1): if it changes between shots, the film reads as AI.
2. **One shot = one subject, one action, one camera move.** No stacked moves and no "and then". [S16, S6]
3. **For image-to-video, prompt the motion only.** The start frame already fixes composition, light and style. [S16]
4. **Nothing readable is generated.** UI, Uzbek text, numbers and logos are all composited in the edit. No model lists Uzbek. [S8, S9, S11, S21]
5. **No AI faces in close-up.** Show hands, backs, silhouettes and macro detail, or a person filmed for real. [S13, S27]
6. **Draft cheap, finish few.** Draft at 480p or 720p, watch to the end (defects cluster at 5–8 s), change one variable per try, and drop the shot after about 10 misses. [S3, S4, S21]
7. **Keep 1.5–3 s of every generation.** Pros keep roughly 5–10% of what they generate. [S21, S22, S23; rulebook §4]
8. **One grade, one grain, one frame rate across every source,** AI footage and screen recordings alike. [S30, S33, S34]
9. **Use licensed or royalty-free music and a human-timed VO.** Never use the model's native audio under a VO-led film. [S21, S25]
10. **Real numbers only.** A pitch film is evidence. Any number without a source is cut or labelled "taxmin".

---

## 1. The pipeline and its gates

Each step has a gate. Do not start the next step until its gate passes.

| # | Step | Output | Gate | Tool |
|---|---|---|---|---|
| 1 | Logline and VO script, written by a person | ≤140 RU words, one line per beat | read aloud against a stopwatch: ≤ 75% of the runtime | doc |
| 2 | **Look bible** | one approved plate per world (human, AI) and a fixed style block | the plates sit side by side without fighting | Nano Banana Pro |
| 3 | **Asset lock** | character sheet, phone plate (green screen), orb sheet, location plates | every later shot can name its reference | GPT Image 2.6 / Nano Banana Pro / Seedream 5.0 Pro, **our Blender renders** |
| 4 | Storyboard and motion blocking | 8 key frames per world; a clay render for the hero camera move | the edit works as an animatic with stills and VO | Popcorn / Nano Banana; Blender (`docs/creative/3d`) |
| 5 | Shot prompts | one standalone prompt per shot, written ≤5 at a time | each prompt restates setting, subject and look (never "same as before") | Claude / runbook |
| 6 | Drafts | 3–4 tries per shot at 480p or 720p | a draft has 1.5–3 s with no defect | Seedance 2.5 |
| 7 | Selects | first, middle and last frame of every keeper checked against the asset sheet | the hero object is identical to the sheet | eyes |
| 8 | Finals | keepers re-rendered at 1080p; region edits for small defects | — | Seedance 2.5 |
| 9 | Edit | cut to music beats and VO; screen recordings in glass cards | runtime 75–90 s | CapCut / Resolve / Premiere |
| 10 | Finish | upscale, composite UI and text, one grade, grain, Uzbek subtitles | watched once at full screen, phone held at arm's length | Topaz (optional), editor |
| 11 | Sound | music, SFX layers, VO at −14 LUFS, true peak below −1 dBTP | music ends on a hit at the logo | editor |

Higgsfield's own ad course uses the same order: product sheet, then hero character, then side cast, then locked locations, then props, then a shot list from a Claude skill, then scenes [S35]. Curious Refuge teaches the same canonical order [S34].

---

## 2. Prompt templates by model

### 2.1 Seedance 2.5 (all video)
Write the prompt in labelled sections; this is Higgsfield's own house format [S2]. Name every reference and give it one job [S1]. Use time ranges for anything that happens in sequence [S1].

```
@Image 1 = <what it locks: subject / look / location>. @Image 2 = <…>. [@Clay Render 1 = camera path, pacing, blocking.]
SCENE: <where, in one line>.
ACTION: 0–2s <…>; 2–5s <…>.            ← one action
CAMERA: <one move>, <speed>. Continuous shot, no cuts.
OPTICS: <lens>mm, <depth of field>.
LIGHT & GRADE: <key, rim, practicals>, <palette>, <grain>.
PHYSICS: rigid body, no morphing, no sliding, no melting.
NO-IP: no text, no letters, no logos, no readable UI.
```
- **Modes.** Use image-to-video (start frame) for most shots. Use reference-to-video (@Image/@Video/@Clay Render) when the camera path must be exact, as with the orb push-in. The clay pass for that shot is already rendered: `public/media/3d/clay-push-in.mp4` [S1].
- **Audio.** Turn `generate_audio` off. We add sound in post, and the model can sneak in music or subtitles [S1, S21].
- **Edits.** Use a region edit to fix one area and a camera-perspective edit to keep the action with a new move. Both are cheaper than regenerating [S1, S2].
- **Weak spots.** Complex physics and several subjects interacting [S1]. Avoid wheels, pouring liquids and crowds.

### 2.2 Nano Banana Pro (look bible, key frames, location plates)
- Formula with references: **[reference images] + [relationship] + [new scenario]**. Up to 14 references, each with a job [S8, S9].
- Write it as a sentence, not a tag list. Open with a strong verb, phrase things positively ("empty street", not "no cars"), set the aspect ratio as a number, and lock the seed once a frame works [S7, S9].
- For edits, say what changes and **"keep exactly the same: …"** [S9].

### 2.3 GPT Image 2.6 (product and character sheets, the phone plate)
- Define the output first (subject, use, composition, aspect). Then use labelled sections: Scene / Subject / Details / Constraints [S10].
- Number the inputs and give each a role. Edits read "change only X", followed by the preserve list (identity, geometry, layout, lighting, labels) [S10].
- For transparent cut-outs, use `background="transparent"` and **check the alpha channel**; a painted checkerboard is not transparency [S10].

### 2.4 Seedream 5.0 Pro (photoreal location and product alternates)
- Order: **format first**, then subject, composition, light, style. Stay under about 600 words [S11].
- Refer to each reference **by its content** ("the flour-dusted wooden counter"), not by its number. White-background packshots make the best product references [S11].
- End every edit with **"Keep the exact silhouette, camera angle, backdrop, lighting."** Anything you don't pin drifts [S11].

### 2.5 Voice: Text-to-Speech (ElevenLabs engine, Russian)
- Generate **one line per beat** so each line can be timed to the cut [S14, S15].
- ElevenLabs v3 delivery tags go in square brackets, e.g. `[calm, confident]` or `[warm]`. SSML `<break>` is NOT supported, so pace with "…", punctuation and CAPS for stress [S15].
- Make 2–3 takes per line, across 2 voices, and keep the best [S14]. No engine lists Uzbek, so the Uzbek line is a subtitle, not a voice.

### 2.6 Meta-prompting (how the runbook prompts were written)
A person writes the script. An LLM turns it into the shot list and **one standalone prompt per shot, five at a time** [S21, S22, S37]. A missed shot goes back to the LLM with what went wrong; nobody hand-hacks the prompt [S22].

---

## 3. Consistency toolkit

| Problem | Technique | Source |
|---|---|---|
| The hero object changes (orb, phone, card) | One master sheet; pass it as @Image in every shot; check first, middle and last frames against it | S29, S38 |
| A character drifts | Hide faces; same wardrobe words in every prompt; one model for the whole series; keep the seed fixed | S13 |
| The look drifts between shots | Fixed style block pasted word for word, or Cinema Studio selectors instead of prose | S6 |
| The camera path is wrong | A Blender clay render as @Clay Render: it carries the path and timing, the @Image carries the look | S1, S26 |
| A cut between two AI shots jumps | Use the last frame of A as the first frame of B | S3, S16 |
| An extension changes the scene | "Keep consistent: characters, scene, style, sound" | S1 |
| Old and new assets mix | One version (SKU) of each asset; drop references with an outdated UI | S39 |
| The team can't reproduce a good shot | Log prompt, seed, model, settings and the chosen take for every shot | S41 *(unverified)* |

---

## 4. Anti-slop: what gave the big AI ads away, and the rule each implies

| Seen in | What gave it away | Our rule |
|---|---|---|
| Coca-Cola 2025 | The truck's wheels changed about 10 times in a minute [S29]; motion "unnaturally flat"; photoreal mixed with cartoon [S28] | Lock the orb, phone and card sheets; one render style per world |
| Coca-Cola 2024 | Wheels slid instead of turning [S28] | No wheels, pours or crowds; a PHYSICS line in every prompt |
| Toys"R"Us | The boy's face changed between scenes [S27] | No AI faces in close-up |
| Veo ads | Uninvited subtitles and music [S21] | Audio off; check every frame for stray text |
| Everyone | Uncanny realism and no warmth [S32, S31] | A real person's story leads; AI shows the product world, not fake people |
| Generic AI reels | Floaty, perfectly smooth camera; no room tone | Human world: slight handheld drift and a small overshoot; room tone under every human shot |
| Start frames | Motion blur or a mid-action pose fights the prompted motion [S16] | Clean, static-looking start frames |

**Per-shot QC (30 seconds each):**
- the hero object matches its sheet;
- no letters anywhere;
- hands have five fingers and stay still;
- no melting edges;
- the light direction matches the look bible;
- the move has one direction;
- the usable 1.5–3 s are marked.

---

## 5. Edit, sound, finish

Most of this is in rulebook §5–6. What the research adds:
- **Order of work.** Music first (mark the beats), then VO, then picture to the beats. Build the ending backwards from the final hit.
- **Upscaling.** Everyone documented upscales with Topaz: 720p to 1080p, or 4K with Proteus [S21, S30, S34]. If Topaz isn't available, finish at 1080p and add grain to hide the difference.
- **Colour.** One Rec.709 timeline. Match the AI plates to the screen recordings, not the other way round [S33]. Dark-mode the product or frame it in a dark card. Never cut bright-white UI against the dark film.
- **Screen recordings.** Record at 2× resolution and make slow, deliberate clicks so auto-zoom doesn't lurch [S40]. Zoom in, hold 2–3 s, zoom out; camera moves of 1.5–3 s with eases. The real recording is also proof that the product exists.
- **Hybrid shots.** Generate the hand-and-phone shot with a **solid green screen**, track it, and corner-pin the real recording into it. Or film a real hand and phone and keep them real [S20, S1].
- **Music.** Licensed stock or royalty-free, not AI music [S21].

---

## 6. Ratios and budget

| Metric | Value | Source |
|---|---|---|
| Generations per kept clip | 3–4 (well-designed shot) up to 20–27 | S21, S22 |
| Abandon a shot after | ~10 misses: redesign it | S21 |
| Where defects appear | around 5–8 s | S3 |
| Seedance 2.5 credits per 10 s (if billed) | 480p 30, 720p 70, 1080p 160 | S2 |
| Our film | 9 AI shots × (3 drafts + 1 final) ≈ 36 generations | runbook |

**Higgsfield billing conflict.** The help center says Unlimited applies **only in the web UI**, and MCP, CLI and Canvas always bill credits [S3]. On 24 Nov the live API said unlimited works from Claude chat, Cowork and ChatGPT, but not Claude Code (`docs/video/higgsfield-pipeline.md`). The runbook therefore makes a $0 cost check before every batch and has a web-UI fallback that uses the same prompts.

---

## 7. Product ads: the rules the in-app Videograf/Dizayner follows

These rules are implemented in `src/lib/uslub/media/presets.ts` and `captions.ts`:
1. **The product is locked.** Every prompt says the product keeps the same shape, proportions, colours, materials and label, with nothing redrawn and no text added [S11, S38].
2. **One subject, one action, one move.** Each preset carries exactly one camera move.
3. **A look bible per preset.** Each of the five presets (AI OS dark, warm bazaar, paper studio, evening city, macro detail) has a fixed lighting, lens and grade block that is pasted word for word.
4. **Captions are our overlay.** Cues are cleaned (Uzbek `oʻ gʻ`) and exported as WebVTT for the in-app player, SRT for editors, and ASS for ffmpeg burn-in. The model never renders letters.
5. **The negative list** covers text, logos, watermarks, warped or changed labels, morphing, extra hands, plastic skin, oversaturation, a CGI look and flicker.
6. **Results are copied out.** Provider URLs expire: Higgsfield keeps outputs for 7 days and fal's media follows the account's retention setting. The job lifecycle has an `archive` hook for our own storage (§ media-pipeline).
7. **Before publishing, the owner approves.** Same rule as posts: nothing goes out without the owner's "yes".

---

## 8. What I deliberately left out
- **AI presenter or lip-sync.** It sits in the uncanny zone, and Uzbek lip-sync is unproven. The founder already decided against it.
- **Pika.** Consumer-grade length and resolution limits [S42].
- **AI-generated UI "hero shots".** The UI must be real pixels [S21, S38].

---

## 9. Where things are
- Storyboard and VO: `docs/video/pitch-storyboard.md`
- Higgsfield runbook (paste into Claude chat): `docs/video/higgsfield-runbook.md`
- 3D assets and how to re-render them: `docs/creative/3d/README.md`
- In-app pipeline (API, env, providers): `docs/creative/media-pipeline.md`

---

## 10. Sources

Primary sources are preferred. "vendor" means a tool vendor's own claims.

| # | Source | URL |
|---|---|---|
| S1 | ByteDance Seed: Introducing Seedance 2.5 | https://seed.bytedance.com/blog/one-take-creation-flexible-referencing-introducing-seedance-2-5 |
| S2 | Higgsfield blog: Seedance 2.5 on Higgsfield | https://higgsfield.ai/blog/seedance-2-5-on-higgsfield-2026 |
| S3 | Higgsfield help: How do I use Seedance | https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-seedance |
| S4 | Higgsfield blog: Generating with Seedance 2.0 | https://higgsfield.ai/blog/generating-with-seedance-2-0 |
| S6 | Higgsfield blog: Cinema Studio 4.0 guide | https://higgsfield.ai/blog/cinema-studio-4-0-complete-guide |
| S7 | Higgsfield: Nano Banana Pro prompt guide | https://higgsfield.ai/nano-banana-pro-prompt-guide |
| S8 | Google: 7 tips for Nano Banana Pro | https://blog.google/products/gemini/prompting-tips-nano-banana-pro/ |
| S9 | Google Cloud: Ultimate Nano Banana prompting guide | https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana |
| S10 | OpenAI: Image prompting guide (GPT Image 2.6) | https://developers.openai.com/api/docs/guides/image-prompting?model=gpt-image-2.6 |
| S11 | Runware: Seedream 5.0 Pro prompting | https://runware.ai/docs/models/bytedance-seedream-5-0-pro/guides/prompting.md |
| S12 | Higgsfield help: Popcorn | https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-popcorn |
| S13 | Higgsfield: Why your AI character's face keeps changing | https://higgsfield.ai/es/blog/Why-Does-Your-AI-Characters-Face-Keep-Changing |
| S14 | Higgsfield: Text to speech | https://higgsfield.ai/text-to-speech |
| S15 | ElevenLabs: Eleven v3 prompting | https://elevenlabs.io/docs/best-practices/prompting/eleven-v3 |
| S16 | Runway Academy: prompt guide | https://academy.runwayml.com/prompt-guide |
| S20 | Luma: Ray3 Modify | https://lumalabs.ai/blog/news/ray3-modify |
| S21 | PJ Accetturo: Veo 3 gold rush (creator newsletter) | https://pjace.beehiiv.com/p/don-t-miss-the-veo-3-gold-rush |
| S22 | eWeek: Kalshi NBA Finals AI ad | https://www.eweek.com/news/ai-ad-kalshi-nba-finals/ |
| S23 | No Film School: Paul Trillo, "The Hardest Part" | https://nofilmschool.com/ai-music-video |
| S25 | Motionographer: Henry Daubrez, KITSUNE | https://motionographer.com/quickie/dept-henry-daubrez-kitsune |
| S26 | Google: Behind ANCESTRA | https://blog.google/technology/google-deepmind/ancestra-behind-the-scenes/ |
| S27 | ProVideo Coalition: Toys"R"Us Sora ad | https://www.provideocoalition.com/the-first-generative-ai-text-to-video-commercial-a-major-miss/ |
| S28 | Dataconomy: Coca-Cola 2025 AI ad | https://dataconomy.com/2025/11/04/coca-colas-new-ai-generated-christmas-ad-shows-why-generative-video-still-struggles-with-realism |
| S29 | Gamepressure: Coca-Cola truck wheels | https://www.gamepressure.com/newsroom/sometimes-four-wheels-sometimes-ten-people-on-the-internet-counte/zc897d |
| S30 | Topaz Labs: Secret Level × Coca-Cola | https://www.topazlabs.com/news/branded-content-reimagined-secret-level-and-coca-colas-ai-driven-holiday-classic |
| S31 | 80.lv: Coca-Cola backlash | https://80.lv/articles/coca-cola-gets-truckloads-of-backlash-over-its-ai-generated-christmas-ad |
| S32 | Adweek: Coca-Cola AI ad, praise to rage | https://www.adweek.com/creativity/how-coca-colas-ai-holiday-ad-went-from-praise-to-rage/ |
| S33 | No Film School: Dave Clark at Adobe MAX | https://nofilmschool.com/dave-clark-interview-adobe-max |
| S34 | Curious Refuge: How to create an AI film | https://curiousrefuge.com/blog/how-to-create-an-ai-film |
| S35 | Higgsfield Academy: 3-step realistic AI ad (course outline) | https://higgsfield.ai/academy/courses/ai-ad-3-step/the-finished-ad-and-the-3-step-system |
| S37 | Google: Meta-prompting Veo with Gemini | https://blog.google/products/gemini/meta-prompting-veo-gemini-tips/ |
| S38 | seedance.tv: Product shape consistency (vendor) | https://www.seedance.tv/blog/how-to-keep-product-shape-consistent-in-ai-video-ads |
| S39 | OpenArt: Seedance 2.5 for product ads (vendor) | https://openart.ai/blog/seedance-2-5-for-product-ads/ |
| S40 | Screen Studio docs | https://www.screen.studio/llms.txt |
| S41 | Maginative: Promise studio *(low-quality source)* | https://www.maginative.com/article/meet-promise-a-new-studio-reimagining-storytelling-with-generative-ai/ |
| S42 | Pika FAQ | https://pika.art/faq |

The full research notes (42 sources, per-model limits, case studies) are in the shared session notes, `media-research-pro-workflows.md`.
