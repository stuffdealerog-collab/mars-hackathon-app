# One-paste prompt for claude.ai chat: the chat makes the WHOLE Mercat ad

**How to use it**
1. Open **claude.ai → a new chat** and make sure the **Higgsfield** connector is on. Trial Unlimited works in Claude chat; Higgsfield refuses it from Claude Code.
2. Copy everything inside the box below and send it as one message.
3. The chat works through the steps and stops at **4 checkpoints** for your picks:
   - the product,
   - the key frames,
   - the video takes,
   - the final cut.
4. At the end it gives you a link to the **finished MP4**: 41 s, 1920×1080, with titles, real Mercat UI and the end card.

What the chat uses:
- **Clay previs:** already rendered in Blender (`docs/video/ad/previs/`). If you want a shot changed, the chat rebuilds it in Higgsfield's **Scene Builder 3D**. Building and rendering a hosted scene costs nothing.
- **Real UI:** recorded with Playwright from `mercat-ai.vercel.app/studio?mock=1` (demo data, no API cost).
- **Assembly:** `docs/video/ad/assemble.py` in Higgsfield's sandbox. It's the same script that builds the animatic, tested end to end at 1080p.

The links in the prompt are pinned to commit `7eb6893`, so they won't change.

````text
You are the producer, director and editor of a finished 41-second ad for "Mercat", an AI marketing
department for small businesses in Uzbekistan. You have the Higgsfield tools. Make the WHOLE ad here:
references → key frames → video shots → real UI footage → music → final assembled MP4. Work step by step,
show me results, and stop at each CHECKPOINT for my picks.

=== MONEY RULES (non-negotiable) ===
- I explicitly ask you to spend my unlimited / free-trial generations: add use_unlim: true to EVERY
  generate_image / generate_video / generate_audio call, batch items included. Never omit it, never set it false.
- My paid credit balance is ~2. Never spend credits, never buy anything, never change plans or the trial.
- Free: generate_* with use_unlim inside the "Unlim configs"; Scene Builder 3D create/edit/render (hosted scene).
- PAID — NEVER call: scene_builder_3d_generate_video, scene_builder_3d_generate_angles, Blender Studio rental,
  Editing Room, upscale_video/upscale_image, reframe, music/voice models outside the unlimited configs, presets.
- sandbox_exec (needed for UI recording and assembly): first call `balance`, then run
  sandbox_exec {command:"ffmpeg -version | head -1"}, then `balance` again. If credits went down, STOP and ask me.
- First call models_explore action "get" for seedance_2_5, nano_banana_pro, gpt_image_2_6 and seed_audio and read
  the "Unlim configs" rows. Stay inside them (resolution, duration). If something I ask for is not covered, use the
  highest covered value and tell me. On any rejection (unlim_not_supported / unlim_trial_expired /
  unlim_config_not_covered / anything that would charge): STOP and tell me. Never retry on credits.

=== THE AD ===
Night. A small-business owner sleeps badly in his Tashkent bedroom: why isn't his product selling? An agency is
expensive. He finds Mercat on his phone — and a whole studio bursts OUT of the phone: two softboxes on stands, a
cinema camera on a tripod, a white pedestal with his product, and ten glossy glass orbs (Mercat's AI employees).
The studio works while he sleeps. Then everything flies back INTO the phone; in the morning his posts are ready.
Style: calm, premium, cinematic, Apple-like light, real not cartoonish (reference: a Lovio SaaS film — glass UI
panels, one-word kinetic type, soft transitions). Text, titles and UI are NOT generated: assemble.py adds them.

Timeline (assemble.py does this; you only supply the media):
 A1 0–4s night wide, phone lights up · A2 4–7s close on the phone · A3 7–9s glass card: real UI (link pasted) ·
 A4 9–14s HERO: studio bursts out of the phone (A4a + A4b) · A5 14–18s studio ON · A6 18–28s five glass cards with
 real UI · A7 28–32s everything flies back into the phone · A8 32–36s morning, posts panel floats in · A9 end card.

=== LOCKED RULES FOR EVERY IMAGE AND VIDEO ===
- Photoreal, cinematic, 16:9, subtle 35mm film grain. No text, letters, numbers, logos, watermark or UI anywhere.
- The owner (a man in his 40s, dark hair, grey t-shirt) is ALWAYS seen from behind or under the blanket, turned
  away: his face is never visible.
- The phone: a plain black smartphone; its screen is a soft lime-white glow, content NOT readable.
- The product: ONE handmade Rishtan ceramic piala — deep cobalt-blue glaze, white eight-pointed star pattern.
- Ten glossy glass orbs, each with its own two-colour gradient (see the orbs reference), the size of an orange.
- Rigid objects: no melting, no morphing, no stretching, no extra objects, nothing passes through the bed.
- The room stays identical: same bed, grey bedding, wooden nightstand on the right, window on the left.

=== STEP 1 — references (media_import_url; keep a table name → media_id) ===
BASE = https://cdn.jsdelivr.net/gh/stuffdealerog-collab/mercat@7eb6893d01cfd148c3a70eeeb22e53ea4d2ce673/
(If a CDN import fails, retry with https://raw.githubusercontent.com/stuffdealerog-collab/mercat/7eb6893d01cfd148c3a70eeeb22e53ea4d2ce673/<same path>.)
  ORBS_LOOK = BASE+public/media/3d/constellation-16x9.png
  CLAY_A1 = BASE+docs/video/ad/previs/A1.mp4   CLAY_A2 = …/A2.mp4   CLAY_A4 = …/A4.mp4
  CLAY_A5 = …/A5.mp4   CLAY_A7 = …/A7.mp4   CLAY_A8 = …/A8.mp4      (type video)
  L_A1s = BASE+docs/video/ad/previs/A1_start.jpg   L_A1e = …/A1_end.jpg   L_A2s = …/A2_start.jpg
  L_A4s = …/A4_start.jpg   L_A4m = …/A4_mid.jpg   L_A4e = …/A4_end.jpg
  L_A5s = …/A5_start.jpg   L_A5e = …/A5_end.jpg   L_A7m = …/A7_mid.jpg   L_A8e = …/A8_end.jpg
CLAY_* and L_* are grey-box Blender previs: layout, camera and timing ONLY — their grey look must never appear.
Optional, only if I ask to change a shot's blocking or camera: load get_preset_instructions {preset:"/3d-jutsu"},
create a Scene Builder 3D project, rebuild the shot with bpy (my original script, for reference:
BASE+docs/video/ad/build_previs.py), render the clay MP4/JPG through artifacts, fetch it with
scene_builder_3d_get_artifact, and media_import_url it. Never use the paid scene_builder generate tools.

=== STEP 2 — product sheet (gpt_image_2_6, use_unlim) ===
P1: "Product reference sheet on a plain warm-grey studio background, 16:9: one handmade Rishtan ceramic piala
(Uzbek tea bowl), deep cobalt-blue glaze with a white eight-pointed star pattern, shown three times — front,
three-quarter, top-down. Soft even studio light, true colours, sharp. No text, no labels."
CHECKPOINT 1: show P1, wait for my OK.

=== STEP 3 — key frames (nano_banana_pro, 16:9, highest covered resolution, use_unlim, generate_image_batch) ===
image_references order: [the previs still, then the listed refs]. Start every prompt with: "Use reference image 1
ONLY for layout, camera angle and object positions; keep them exactly. Restyle it into a photoreal cinematic
frame." Add the frame text, end with the LOCKED RULES in one line.
NIGHT = "a modern small bedroom in Tashkent at night, cool blue moonlight through the window on the left, the only
other light is the soft glow of the phone, deep soft shadows, muted palette, shot on a cinema camera".
 K_A1s (L_A1s): NIGHT; the owner asleep under a grey blanket, turned away; the phone dark on the nightstand.
 K_A1e (L_A1e, K_A1s): same frame; the phone screen glows softly lime-white and lights the nightstand.
 K_A2s (L_A2s, K_A1e): close-up of the glowing phone on the wooden nightstand, the bed edge out of focus.
 K_A4s (L_A4s, K_A2s): close on the phone; its glow flares bright and thin lime light rays burst out of it.
 K_A4e (L_A4e, K_A1s, P1, ORBS_LOOK): wide shot of the same bedroom at night with a compact professional studio set
   up around the bed: two black softboxes on stands, a cinema camera on a tripod aimed at a white round pedestal
   holding the blue piala (image 3), ten glossy glass orbs (colours from image 4) floating in mid-air; the owner
   still asleep, turned away; studio lights off, moonlight only.
CHECKPOINT 2a: show these five, wait for my picks (max 3 regenerations each).
Then, with the picked K_A4e as the studio consistency reference:
 K_A4m (L_A4m, K_A4e, P1, ORBS_LOOK): mid-burst: the same gear and orbs flying out of the phone along arcs, still
   small and growing, a lime light trail behind each; night.
 K_A5s (L_A5s, K_A4e, P1): studio ON: both softboxes lit, soft clean studio light fills the bedroom, the cinema
   camera in the left foreground, the piala on the pedestal in focus, orbs floating around it.
 K_A5e (L_A5e, K_A5s, P1): the same scene from the right side, studio lights on.
 K_A7m (L_A7m, K_A4e): the gear and orbs flying back towards the phone along arcs, shrinking; lights off.
 K_A8e (L_A8e, K_A1s): MORNING: the same bedroom, warm golden sunlight from the window, the gear is gone, the
   owner still in bed turned away, the phone on the nightstand glowing softly.
CHECKPOINT 2b: show them, wait for my picks.

=== STEP 4 — video shots (seedance_2_5, mode omni_reference, 16:9, highest covered resolution,
     generate_audio false, use_unlim, generate_video_batch ≤12 per batch, 2 takes per shot) ===
Roles: start_image, end_image, video_references (clay = camera path + timing only), image_references.
 A1  (start K_A1s, end K_A1e, video CLAY_A1, 4s): "SCENE: the night bedroom from the start frame. ACTION: 0–2s
     stillness, the man sleeps turned away; 2–4s the phone on the nightstand lights up. CAMERA: slow push-in like
     @Video 1. PHYSICS: the man barely moves; the phone is rigid; its glow stays soft, nothing readable on it."
 A2  (start K_A2s, video CLAY_A2, 4s): "The phone glows on the nightstand; the light breathes once. CAMERA: very
     slow push-in like @Video 1. Nothing readable on the screen."
 A4a (start K_A4s, end K_A4m, video CLAY_A4, images P1 + ORBS_LOOK, 4s): "ACTION: 0–1s the phone flares
     lime-bright; 1–4s two softboxes on stands, a cinema camera on a tripod, a white pedestal with the blue piala
     and ten glossy orbs fly OUT of the phone along smooth arcs, tiny at first and growing to full size. CAMERA:
     pull back from the phone like @Video 1. PHYSICS: each object is rigid and keeps its exact shape while flying;
     no melting, no morphing; the sleeping man does not move."
 A4b (start K_A4m, end K_A4e, video CLAY_A4, images P1 + ORBS_LOOK, 4s): "ACTION: the flying gear lands and
     unfolds into a compact studio around the bed: stands touch the floor, the camera settles on its tripod, the
     pedestal lands, orbs slow down and hover. CAMERA: keep pulling back to the wide shot like @Video 1. PHYSICS:
     rigid objects with real weight, no morphing."
 A5  (start K_A5s, end K_A5e, video CLAY_A5, image P1, 4s): "ACTION: the softboxes are on; the orbs orbit the
     piala slowly; the cinema camera stays aimed at the piala. CAMERA: smooth arc left to right like @Video 1.
     PHYSICS: rigid objects; the piala never changes."
 A7  (start K_A4e, end K_A4s, video CLAY_A7, image K_A7m, 4s): "ACTION: 0–1s the studio lights switch off;
     1–4s every object lifts and flies back INTO the phone along arcs, shrinking, the orbs last; the phone absorbs
     the light. CAMERA: push in to the phone like @Video 1. PHYSICS: rigid objects, no melting, no morphing."
 A8  (start K_A8e, video CLAY_A8, 4s): "MORNING. ACTION: warm sunlight; the man shifts slightly under the blanket,
     still facing away; the phone on the nightstand lights up softly. CAMERA: slow push-in like @Video 1."
If A4a/A4b fail after 3 takes each, try ONE A4 (start K_A4s, end K_A4e, CLAY_A4, 5s) with both actions as time ranges.
After each batch: jobs_wait, ONE show_generation_by_ids. Check every take yourself first (object count and
shapes match the key frames, no text, no face, no morphing) and recommend picks with reasons.
CHECKPOINT 3: wait for my picks. Keep each pick's result URL.

=== STEP 5 — real Mercat UI (sandbox_exec; after the cost probe) ===
cd ~ && mkdir -p ad && cd ad && curl -fsSLO BASE+docs/video/ad/record_ui.mjs && node record_ui.mjs
(if Playwright isn't importable: `NODE_PATH=$(npm root -g) node record_ui.mjs`, or `npm i playwright` in ~/ad and retry;
run in background if it may exceed 120 s and poll). It writes ui/run.webm, ui/frame_00..15.png (every 2.5 s),
ui/posts.png. Look at the frames (image_paths, ≤4 per call) and cut 2-second windows from run.webm into MP4s:
 ui/SR-A3.mp4 = the very start (link shown, flow starting) · ui/SR3..SR7.mp4 = five moments where nodes light up
 and results appear (default starts: 3, 6, 9, 12, 15 s). ffmpeg -ss <t> -t 2.2 -i ui/run.webm -an -c:v libx264
 -pix_fmt yuv420p ui/SR3.mp4 (etc). Make ui/posts.png a tight crop of the "Tasdiqlash qutisi" (approval inbox)
 column with the ready posts from the last frame (ImageMagick `convert ... -crop`). Show me 2 frames + posts.png.

=== STEP 6 — music (optional) ===
models_explore get seed_audio: if it can generate an instrumental music bed with use_unlim, make one 45 s track:
"modern ambient electronic, 105 BPM, calm piano + soft synth pads, a riser into 0:09 and a deep bass drop at
0:09, driving pulse 0:14–0:28, calm resolve, final soft hit at 0:36, no vocals". If not covered, skip music and tell me.

=== STEP 7 — assemble the final MP4 (sandbox_exec) ===
In ~/ad: curl -fsSLO BASE+docs/video/ad/assemble.py ; then write manifest.json:
{"shots": {"A1": "<url>", "A2": "<url>", "A4a": "<url>", "A4b": "<url>", "A5": "<url>", "A7": "<url>", "A8": "<url>"},
 "sr": {"SR-A3": "ui/SR-A3.mp4", "SR3": "ui/SR3.mp4", "SR4": "ui/SR4.mp4", "SR5": "ui/SR5.mp4", "SR6": "ui/SR6.mp4",
        "SR7": "ui/SR7.mp4", "POSTS": "ui/posts.png"},
 "music": "<music url, or omit>"}
(use "A4" instead of A4a/A4b if the single-shot fallback was used). Then call media_upload for an mp4 FIRST, and in
ONE background sandbox command run:
python3 assemble.py --final --manifest manifest.json --work work --out mercat-ad.mp4 && curl -f -X PUT -H 'Content-Type: video/mp4' --upload-file mercat-ad.mp4 '<upload_url>'
(assemble.py downloads the pinned assets and the Manrope font itself; it prints a JSON report). Poll until done,
then media_confirm. Inspect 4 frames of mercat-ad.mp4 (at 2, 12, 22, 38 s) and the report: every shot must say
"final" and every SR "recording". CHECKPOINT 4: show me the finished video and give me its download link plus the
picks table (shot → job id → url) so the edit can be re-done later.
If the sandbox fails, give me only this JSON so Claude Code can assemble it locally:
{"shots": {...}, "music": "...", "stills": {"K_A4e": "...", "K_A5s": "...", "P1": "..."}}
````
