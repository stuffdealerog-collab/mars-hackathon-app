# Higgsfield runbook: the pitch film's AI shots (for Claude chat or Cowork)

**Read first:**
- `docs/video/pitch-storyboard.md` (what we're making)
- `docs/creative/playbook.md` (why it's done this way)


## 0. Money rules (non-negotiable)

- The account holds **2 paid credits**. **Every generation must be free.** If anything would charge credits, stop.
- **Claude Code cannot use Unlimited.** Higgsfield's API rejects it from there. Run everything below from **claude.ai chat** or **Claude Cowork** with the Higgsfield connector, or by hand in the **Higgsfield web app**.
- **There is a conflict between sources.** Higgsfield's help center says MCP generations *always* cost credits and Unlimited is web-UI only. On 24 Nov the live API said Unlimited works in Claude chat and Cowork. So step 1 below checks cost before any batch.
  - If the check is not $0, use the **web app**: the prompts are identical.
  - Web-app mapping:
    - stills → Image, model *Nano Banana Pro* / *GPT Image* / *Seedream*
    - video → Video, *Seedance 2.5*, Image-to-Video or References
    - voice → Audio, *Text to Speech*

---

## 1. Paste block A: session rules (paste first in Claude chat)

```
You are my production assistant for a pitch film, using the Higgsfield tools.
HARD RULES
1. Every generation call uses use_unlim: true. Never call anything with use_unlim false, never use models or options
   that are not covered by the unlimited trial, never buy credits, never touch billing or the trial.
2. Before the FIRST batch of each model (image, video, audio), run the cost estimate tool with exactly the
   parameters you will use and use_unlim: true. If the estimate is not 0 credits, or the call is rejected, STOP and tell me.
3. Before generating, call models_explore get for nano_banana_pro, gpt_image_2_6, seedream_v5_pro, seedance_2_5,
   text2speech_v2 and tell me the "Unlim configs" limits (max resolution, max duration, parallel slots).
   Use the highest resolution the unlimited config allows; drafts at 720p.
4. Never generate readable text, logos, UI or faces in close-up. Phone screens are flat pure green #00FF00.
5. Use the live tool schemas. Field names below were seen on 24 Nov; if the live schema differs, follow the live
   schema and tell me what changed. Do not invent parameters.
6. After every batch: list each result as <shot id> <take> <job id> <url>, and wait for my picks.
```

---

## 2. Uploads

Attach these to the chat and upload them with `media_upload` / `media_confirm`, or use `media_import_url` once the app is deployed. The paths are in this repo. After the lead deploys, they are also at `https://mercat-ai.vercel.app/media/3d/…`.

| Ref | File | Used for |
|---|---|---|
| R1 | `public/media/3d/constellation-16x9.png` | AI-world look |
| R2 | `public/media/3d/orbs/orb-core.png` | the lime core orb, locked |
| R3 | `public/media/3d/clay-push-in.mp4` | **@Clay Render**: camera path and timing for AI-A1 |
| R4 | `public/media/3d/constellation-push-in.mp4` | fallback/reference: the same move, already rendered |

---

## 3. Fixed text blocks (pasted word for word into prompts)

**LOOK-H** (human world, night):
> cinematic 35mm film look, a single bare tungsten bulb and the orange glow of a clay tandir oven as the only light sources, deep shadows falling to near-black, muted earthy palette of flour white, clay orange and walnut brown, no neon, subtle film grain, gentle halation, natural textures, a small family bakery in Tashkent

**LOOK-H-MORNING:**
> cinematic 35mm film look, low golden morning sunlight streaming through a half-raised metal shutter, warm dust in the light beam, muted earthy palette of flour white, clay orange and walnut brown, subtle film grain, gentle halation, natural textures, a small family bakery in Tashkent

**LOOK-A** (AI world):
> near-black seamless void, glossy glass-like orbs with soft internal colour gradients, thin neon-lime #D7FF3A light lines, a faint dotted ring, single soft key light from top left, deep blacks, subtle film grain, calm and precise, premium product film

**CHARACTER** (never the face):
> a baker in his 40s seen only from behind or as hands, strong forearms dusted with flour, dark green quilted sleeveless vest over a white collarless cotton shirt with sleeves rolled to the elbow, a simple steel wristwatch on the left wrist

**PHONE:**
> a plain black smartphone with no logos, its screen a flat uniform pure green #00FF00 with no interface and no reflections

**NO-IP:**
> no text, no letters, no numbers, no logos, no watermark, no readable interface

---

## 4. Batch 1: asset lock and key frames (stills)

Model and settings:
- `nano_banana_pro`, 16:9, highest unlimited resolution, `use_unlim:true`, 1 result per item. Run as `generate_image_batch` so items go in parallel (Ultra allows 8).
- Alternate model for locations: `seedream_v5_pro`. Use `gpt_image_2_6` for K0 (it handles sheets and plates well).
- Generate 2 items per prompt where marked ×2 and pick one.

| Id | Prompt | Refs |
|---|---|---|
| K0 ×2 | `gpt_image_2_6`. *Output: a wardrobe and hands reference sheet on a plain warm-grey background, 16:9. Subject: CHARACTER. Details: three views (back view full body, side view from behind the shoulder, close-up of both hands dusted with flour holding nothing). The face is never visible: back of the head only. Constraints: no text, no labels, no logos, consistent clothing across all views.* | — |
| K1 ×2 | *A wide shot of a small family bakery at night, a worn walnut counter in the foreground with a tray of round Uzbek non bread, a clay tandir oven in the back wall still glowing, a single bare bulb overhead, no people. LOOK-H. NO-IP. 16:9.* (Also try one with `seedream_v5_pro`.) | — |
| K-H1 ×2 | *PHONE lies face-up on the worn walnut bakery counter at night; behind it, round non loaves on a tray in soft focus and the dying orange glow of the tandir far in the background. LOOK-H. NO-IP. 16:9, no people.* | K1 (location) |
| K-H2 ×2 | *An over-the-shoulder view from behind the baker's right shoulder, the back of his head out of focus at the left edge of the frame and no face visible: his flour-dusted hands hold PHONE at chest height, thumb resting just above the screen. The dark bakery behind him is lit by the bulb and the tandir glow. CHARACTER. LOOK-H. NO-IP. 16:9.* | K0 (character), K1 (location) |
| K-H3 | *A close-up into the opening of a traditional clay tandir oven at night, the last embers glowing deep orange on its floor, rough clay walls with white flour marks, darkness all around. LOOK-H. NO-IP. 16:9.* | — |
| K-H4 | *A small fabric shop in Tashkent at night, shelves of folded ikat atlas silk in deep colours, a shopkeeper seen only from behind reaching up to a light switch, half the ceiling lights already off. LOOK-H with cold fluorescent practicals. NO-IP. 16:9.* | — |
| K-H5 | *Dusk in a covered Tashkent bazaar: a spice vendor's hands, seen in close-up, pulling a canvas cover over pyramids of red paprika and yellow turmeric, an empty aisle behind. LOOK-H. NO-IP. 16:9.* | — |
| K-H6 | *An empty small café at closing time, wooden chairs upside down on the tables, one person seen from behind wiping the counter, warm pendant lights, a rain-streaked window with blurred street lights. LOOK-H. NO-IP. 16:9.* | — |
| K-H7 ×2 | *Early morning in the same family bakery: a tray of fresh round non bread with steam rising on the walnut counter, the baker's flour-dusted hands setting PHONE face-up next to the tray. CHARACTER (hands only). LOOK-H-MORNING. NO-IP. 16:9.* | K0, K1 |
| K-A2 | *An extreme close-up of the glossy lime glass orb from the reference image, floating in a near-black void, a thin neon-lime light line resting on its upper edge, soft reflections. Keep the exact colour gradient, gloss and round silhouette of the reference orb. LOOK-A. NO-IP. 16:9.* | R2 (orb) |

**Gate before Batch 2:**
- K0, K1, K-H2 and K-H7 agree on wardrobe, counter and light.
- Phone screens are flat green.
- There are zero letters anywhere.
- Reject anything with a visible face.

---

## 5. Batch 2: video drafts (Seedance 2.5)

Model and settings:
- `seedance_2_5`, image-to-video with the chosen key frame as `start_image` (the omni_reference mode accepts it).
- 5 s, 720p drafts, 16:9, `generate_audio:false`, `use_unlim:true`.
- **3 takes per shot.** Ultra runs 8 videos in parallel, so 9 shots × 3 = 27 jobs runs as 4 rounds.

Each prompt uses the sectioned format from the playbook (§2.1). The start frame already fixes the look, so the prompts describe **motion only**, plus the lock lines.

**AI-H1** (start: K-H1)
```
SCENE: the bakery counter at night from the start image.
ACTION: 0–1s everything still; 1–5s the bulb light flickers once, very softly; the phone screen stays flat green.
CAMERA: very slow push-in towards the phone, constant height. Continuous shot, no cuts.
OPTICS: 50mm, shallow depth of field.
PHYSICS: the phone is rigid, its screen stays a flat uniform pure green; bread does not move.
NO-IP: no text, no letters, no logos, no readable interface.
```

**AI-H2** (start: K-H2)
```
SCENE: over the baker's shoulder at night, as in the start image; his face never turns to camera.
ACTION: 0–2s his thumb hovers above the green screen; 2–4s it lowers, stops just above the screen; 4–5s it lifts away. Hesitation, minimal motion.
CAMERA: almost locked, very subtle handheld drift.
OPTICS: 50mm, shallow depth of field.
PHYSICS: five fingers on each hand, hands keep their shape, the phone is rigid, the screen stays flat pure green.
NO-IP: no text, no letters, no logos, no readable interface.
```

**AI-H3** (start: K-H3)
```
SCENE: inside the tandir opening at night.
ACTION: the embers pulse slowly and fade a little; one faint spark rises and disappears.
CAMERA: slow push-in. Continuous shot.
OPTICS: 35mm, deep focus on the embers.
PHYSICS: clay walls stay rigid; no flames appear.
NO-IP: no text, no logos.
```

**AI-H4** (start: K-H4)
```
SCENE: the fabric shop at night.
ACTION: 0–3s the remaining ceiling lights switch off one by one from front to back; 3–5s the shop sits in near-darkness with one light left.
CAMERA: locked-off wide, perfectly still.
PHYSICS: the shopkeeper barely moves and stays facing away; fabric does not move.
NO-IP: no text, no signage, no logos.
```

**AI-H5** (start: K-H5)
```
SCENE: the spice stall at dusk.
ACTION: the vendor's hands slowly pull the canvas cover from left to right over the spice pyramids.
CAMERA: slow lateral track left to right, matching the hands.
PHYSICS: spices keep their pyramid shapes, the canvas folds naturally, five fingers.
NO-IP: no text, no labels, no logos.
```

**AI-H6** (start: K-H6)
```
SCENE: the café at closing time.
ACTION: the person behind the counter wipes it in one slow pass from right to left; rain runs down the window.
CAMERA: locked-off medium-wide.
PHYSICS: chairs stay upside down and rigid; the person keeps facing away.
NO-IP: no text, no signage, no logos.
```

**AI-H7** (start: K-H7)
```
SCENE: the bakery in early morning light, as in the start image.
ACTION: 0–2s steam rises from the bread; 2–4s the hands set the phone down flat and withdraw out of frame; 4–5s only steam and light.
CAMERA: slow push-in towards the phone.
OPTICS: 50mm, shallow depth of field.
PHYSICS: five fingers, hands keep their shape, the phone is rigid, its screen stays flat pure green.
NO-IP: no text, no letters, no logos, no readable interface.
```

**AI-A1** (reference-to-video. Refs: R3 as the clay/video reference, R1 for the look, R2 for the core orb)
```
@Video 1 / @Clay Render 1 = camera path, timing and layout: follow it exactly.
@Image 1 = the look of the whole constellation. @Image 2 = the lime core orb: keep its exact colour and gloss.
SCENE: the orb constellation of @Image 1 in a near-black void: one lime core orb in the centre, ten glossy coloured orbs on a dotted ring, thin light lines from the core to every orb.
ACTION: 0–1s everything dim and still; 1–2s the lime core ignites brighter; 2–5s small light pulses travel from the core along each line to the orbs.
CAMERA: push-in towards the core exactly as in @Clay Render 1.
OPTICS: 46mm, shallow depth of field on the core at the end.
LIGHT & GRADE: LOOK-A.
PHYSICS: orbs are rigid glossy spheres; exactly 11 orbs; they keep their colours and sizes; nothing merges or morphs.
NO-IP: no text, no letters, no logos, no interface.
```
*Keep whichever of AI-A1 and the Blender render R4 is cleaner. R4 is exact. AI-A1 may add depth, but only if the orb count and colours hold.*

**AI-A2** (start: K-A2)
```
SCENE: the lime glass orb in the void, as in the start image.
ACTION: the thin lime light line travels once around the orb's edge, clockwise.
CAMERA: slow orbit to the right, about 15 degrees.
OPTICS: 85mm, shallow depth of field.
PHYSICS: the orb is a rigid perfect sphere; keep its exact gradient and gloss.
NO-IP: no text, no logos.
```

**Selects (per shot, about 30 s each):**
- Watch to the end.
- Mark the clean 1.5–3 s.
- Check first, middle and last frames against K0/K1/R2.
- If no take is clean after 3 tries, change one variable (camera, action or start frame) and run 3 more. After about 10 misses, redesign the shot or drop it.

**Finals:**
- Re-run each chosen take's prompt and start frame at the highest unlimited resolution (1080p if allowed).
- If a take has one small defect, ask Claude for Seedance's **region edit** on that area instead of regenerating.

---

## 6. Batch 3: voice-over (Text-to-Speech, Russian)

Model and settings:
- `generate_audio_batch` with `model:"text2speech_v2"`, `variant:"elevenlabs"`, `voice_type:"preset"`, `use_unlim:true`.
- One item per line. Run each line in **2 voices**, then pick one voice for the whole film.
- Voice ids seen on 24 Nov (preview them first):
  - Alexey `7c2133e5-68ab-511f-9aed-9a67664382b1`
  - Vlad `e5666b9c-99a2-4fac-8b4e-abee078b186d`
  - Elena `ca83ca7f-c186-493d-bd69-0d765fa861b2`
- Delivery: `[calm, confident]`, a warm conversational narrator, not an announcer. Pace with "…". SSML breaks are not supported.

| Line | Text |
|---|---|
| V01 | [calm, low] Почти полночь. Пекарня закрыта. |
| V02 | [calm] А пост на завтра… так и не написан. |
| V03 | [conversational] Мы спросили предпринимателей прямо здесь, на хакатоне. |
| V04 | [thoughtful] «Хочу один сервис, который поймёт, как я думаю». |
| V05 | [slightly tired] «Не могу сделать видео товара без нейро-мусора». |
| V06 | [matter-of-fact] «Локальной статистики нет — всё про Россию или США». |
| V07 | [honest] «Самое сложное — найти клиентов». |
| V08 | [curious, a little slower] А если отдать всё это… одной ссылке? |
| V09 | [confident] Аналитик читает канал: охваты, лучшие часы, что работает. |
| V10 | [confident] Стратег собирает план на неделю. |
| V11 | [light smile] Копирайтер пишет, а редактор вычёркивает нейро-слова. |
| V12 | [confident] Переводчик — латиница, кириллица, русский, английский. |
| V13 | [confident] Видеограф делает ролик из фото товара. |
| V14 | [warm] Радар находит, где ваши клиенты. Публикуется — только после вашего «да». |
| V15 | [warm, unhurried] Одна ссылка. Около минуты. Неделя маркетинга — готова. |
| V16 | [warm, final] Мерка́т. Свой отдел маркетинга — для каждого малого бизнеса. *(The brand name is written in Cyrillic so the TTS stresses it predictably. Change the stress if the founder says it differently. The on-screen and subtitle spelling stays "Mercat".)* |

**Check the stress in every take.** If the generated voice sounds synthetic in the cut, the founder reads the same lines into a phone in a quiet room (a closet works). A real voice beats a perfect fake.

---

## 7. Naming, logging and hand-off

- **File names:** `S<beat>_<shot>_t<take>_<res>.mp4`, for example `S01_AI-H1_t2_1080.mp4`, and `V08_alexey_t1.mp3` for voice lines.
- **Shot log:** prompt version, model, start frame id, seed (if shown), job id, and the chosen in/out seconds. Keep it in one sheet.
- **Hand-off:** give the editor the selects, the 3D files from `public/media/3d`, SR0–SR9 (storyboard) and the voice lines. Edit to the storyboard's picture rules.

## 8. If something goes wrong

| Symptom | Fix |
|---|---|
| The cost estimate is not 0, or it says unlimited is unavailable | Stop. Use the web app with the same prompts, or ask the founder. |
| Unlimited caps are below 1080p | Generate finals at the cap, finish at 1080p in the edit, and add grain. |
| The phone screen shows UI or letters | Regenerate with the PHONE block moved to the start of the prompt. Or key the screen out and fill it with SR anyway: we replace it in post regardless. |
| Hands melt or show 6 fingers | Shorten the action, lower the motion ("minimal motion"), or crop tighter in the edit. |
| AI-A1 changes the orb count or colours | Use the Blender render R4. That is what it's for. |
| The queue is slow at peak hours | Batches of 8 or fewer. Run the drafts tonight and the finals in the morning. |
