# One-paste production prompt for claude.ai chat (Higgsfield connector)

**How to use it**
1. Open **claude.ai → a new chat**. Make sure the **Higgsfield** connector is on. Unlimited generations work there; they don't work from Claude Code.
2. Copy everything inside the box below and send it as one message.
3. The chat will stop and ask you to pick takes. When it finishes, it gives you a JSON list of links.
4. Paste that JSON into Claude Code. It downloads the shots into `docs/video/ad/shots/` and runs `build_animatic.py`. That builds the finished ad: titles, end card, timing.

Notes:
- The reference files are hosted in this public repo (`stuffdealerog-collab/mercat`) at a fixed commit, served through jsDelivr, so the links won't change.
- Nothing in this prompt spends credits. Every generation carries `use_unlim: true`, and the chat must stop if the trial doesn't cover a call.

````text
You are the producer and director of a 41-second ad for "Mercat", an AI marketing department for small
businesses in Uzbekistan. You have the Higgsfield tools. Produce all AI shots for the ad with my
Higgsfield free-trial UNLIMITED generations, then hand me the selects. Work step by step, show me results,
and wait for my picks where I say so.

=== MONEY RULES (non-negotiable) ===
- I explicitly ask you to spend my unlimited / free-trial generations: add use_unlim: true to EVERY
  generate_image / generate_video / generate_audio call (batch items too). Never omit it, never set it false.
- My paid credit balance is ~2. Never spend credits, never buy anything, never change plans or the trial.
- First call models_explore action "get" for seedance_2_5, nano_banana_pro and gpt_image_2_6 and read the
  "Unlim configs" rows. Stay inside them (resolution, duration). If a value I ask for is not covered, use the
  highest covered value and tell me — do not pay.
- On any rejection (unlim_not_supported / unlim_trial_expired / unlim_config_not_covered / anything that would
  charge), STOP and tell me. Never retry on credits.
- Do NOT use sandbox_exec, video-montage, Editing Room, upscalers or music models — those are billed. I assemble
  the ad myself.

=== THE AD (what we are making) ===
Night. A small-business owner sleeps badly in his Tashkent bedroom: why isn't his product selling? An agency
costs thousands. He finds Mercat on his phone — and a whole studio bursts OUT of the phone: two softboxes on
stands, a cinema camera on a tripod, a white pedestal with his product, and ten glossy glass orbs (Mercat's AI
employees). The studio works while he sleeps. Then everything flies back INTO the phone, and in the morning his
posts are ready in Telegram. Style: calm, premium, cinematic, Apple-like light; real, not cartoonish.
Text, logos, UI and the Telegram posts are added by me in the edit — the models never render text.

=== LOCKED RULES FOR EVERY IMAGE AND VIDEO ===
- Photoreal, cinematic, 16:9, subtle 35mm film grain, no text, no letters, no logos, no watermark, no UI.
- The owner (a man in his 40s, dark hair, grey t-shirt) is ALWAYS seen from behind or under the blanket,
  turned away from camera: his face is never visible.
- The phone is a plain black smartphone whose screen is a FLAT SOLID GREEN #00FF00 (I key it and put the real app in).
- The product is ONE handmade Rishtan ceramic piala: deep cobalt blue glaze, white eight-pointed star pattern.
- Ten glossy glass orbs, each with its own two-colour gradient (see the orbs reference), size of an orange.
- Objects are rigid: no melting, no morphing, no stretching, no extra objects, nothing passes through the bed.
- Keep the room identical across shots: same bed, grey bedding, wooden nightstand on the right, window on the left.

=== STEP 1 — import references (media_import_url; type image or video) ===
Import each URL and keep a table name -> media_id. If an import fails, retry the same path from the
GitHub mirror: https://raw.githubusercontent.com/stuffdealerog-collab/mercat/2247420451f7f52c9efabb3c55398efbc26bca6b/<same path>
If that fails too, tell me; I can upload the file with media_upload_widget instead.
Base: https://cdn.jsdelivr.net/gh/stuffdealerog-collab/mercat@2247420451f7f52c9efabb3c55398efbc26bca6b/
  ORBS_LOOK   = https://cdn.jsdelivr.net/gh/stuffdealerog-collab/mercat@2247420451f7f52c9efabb3c55398efbc26bca6b/public/media/3d/constellation-16x9.png
  ORB_CORE    = https://cdn.jsdelivr.net/gh/stuffdealerog-collab/mercat@2247420451f7f52c9efabb3c55398efbc26bca6b/public/media/3d/orbs/orb-core.png
  CLAY_A1     = https://cdn.jsdelivr.net/gh/stuffdealerog-collab/mercat@2247420451f7f52c9efabb3c55398efbc26bca6b/docs/video/ad/previs/A1.mp4          (video)
  CLAY_A2     = https://cdn.jsdelivr.net/gh/stuffdealerog-collab/mercat@2247420451f7f52c9efabb3c55398efbc26bca6b/docs/video/ad/previs/A2.mp4          (video)
  CLAY_A4     = https://cdn.jsdelivr.net/gh/stuffdealerog-collab/mercat@2247420451f7f52c9efabb3c55398efbc26bca6b/docs/video/ad/previs/A4.mp4          (video)
  CLAY_A5     = https://cdn.jsdelivr.net/gh/stuffdealerog-collab/mercat@2247420451f7f52c9efabb3c55398efbc26bca6b/docs/video/ad/previs/A5.mp4          (video)
  CLAY_A7     = https://cdn.jsdelivr.net/gh/stuffdealerog-collab/mercat@2247420451f7f52c9efabb3c55398efbc26bca6b/docs/video/ad/previs/A7.mp4          (video)
  CLAY_A8     = https://cdn.jsdelivr.net/gh/stuffdealerog-collab/mercat@2247420451f7f52c9efabb3c55398efbc26bca6b/docs/video/ad/previs/A8.mp4          (video)
  L_A1s = https://cdn.jsdelivr.net/gh/stuffdealerog-collab/mercat@2247420451f7f52c9efabb3c55398efbc26bca6b/docs/video/ad/previs/A1_start.jpg   L_A1e = https://cdn.jsdelivr.net/gh/stuffdealerog-collab/mercat@2247420451f7f52c9efabb3c55398efbc26bca6b/docs/video/ad/previs/A1_end.jpg
  L_A2s = https://cdn.jsdelivr.net/gh/stuffdealerog-collab/mercat@2247420451f7f52c9efabb3c55398efbc26bca6b/docs/video/ad/previs/A2_start.jpg
  L_A4s = https://cdn.jsdelivr.net/gh/stuffdealerog-collab/mercat@2247420451f7f52c9efabb3c55398efbc26bca6b/docs/video/ad/previs/A4_start.jpg   L_A4m = https://cdn.jsdelivr.net/gh/stuffdealerog-collab/mercat@2247420451f7f52c9efabb3c55398efbc26bca6b/docs/video/ad/previs/A4_mid.jpg
  L_A4e = https://cdn.jsdelivr.net/gh/stuffdealerog-collab/mercat@2247420451f7f52c9efabb3c55398efbc26bca6b/docs/video/ad/previs/A4_end.jpg
  L_A5s = https://cdn.jsdelivr.net/gh/stuffdealerog-collab/mercat@2247420451f7f52c9efabb3c55398efbc26bca6b/docs/video/ad/previs/A5_start.jpg   L_A5e = https://cdn.jsdelivr.net/gh/stuffdealerog-collab/mercat@2247420451f7f52c9efabb3c55398efbc26bca6b/docs/video/ad/previs/A5_end.jpg
  L_A7m = https://cdn.jsdelivr.net/gh/stuffdealerog-collab/mercat@2247420451f7f52c9efabb3c55398efbc26bca6b/docs/video/ad/previs/A7_mid.jpg
  L_A8e = https://cdn.jsdelivr.net/gh/stuffdealerog-collab/mercat@2247420451f7f52c9efabb3c55398efbc26bca6b/docs/video/ad/previs/A8_end.jpg
The CLAY_* videos and L_* stills are grey-box Blender previs: they define layout, camera and timing ONLY.
Their grey look must never appear in the output.

=== STEP 2 — product sheet (gpt_image_2_6, 1 image, use_unlim) ===
P1: "Product reference sheet on a plain warm-grey studio background, 16:9: one handmade Rishtan ceramic piala
(Uzbek tea bowl), deep cobalt-blue glaze with a white eight-pointed star pattern, shown three times — front,
three-quarter, top-down. Soft even studio light, true colours, sharp. No text, no labels."
Show it to me and wait for OK (regenerate on my request).

=== STEP 3 — key frames (nano_banana_pro, 16:9, highest covered resolution, use_unlim; generate_image_batch) ===
Every key frame restyles a grey previs still into a photoreal frame. Use image_references in this order:
[the previs still, then the other refs listed]. Start every prompt with:
"Use reference image 1 ONLY for layout, camera angle and object positions; keep them exactly. Restyle it into a
photoreal cinematic frame." Then add the frame text below and end with the LOCKED RULES in one line.
NIGHT look = "a modern small bedroom in Tashkent at night, cool blue moonlight through the window on the left,
the only other light is the glow of the phone, deep soft shadows, muted palette, shot on a cinema camera".
  K_A1s (refs L_A1s): NIGHT look; the owner asleep under a grey blanket, turned away; phone dark on the nightstand.
  K_A1e (refs L_A1e, K_A1s): same frame; the phone screen glows solid green and lights the nightstand softly.
  K_A2s (refs L_A2s, K_A1e): close-up of the phone on the wooden nightstand, screen solid green, the bed edge out of focus.
  K_A4s (refs L_A4s, K_A2s): close on the phone on the nightstand; the green screen flares bright; thin lime light
        rays start to burst out of it.
Show K_A1s, K_A1e, K_A2s, K_A4s. Wait for my picks (regenerate any I reject, max 3 tries each).
  K_A4e (refs L_A4e, K_A1s, P1, ORBS_LOOK): wide shot of the same bedroom at night, now with a compact professional
        studio set up around the bed: two black softboxes on stands, a cinema camera on a tripod aimed at a white
        round pedestal holding the blue piala from image 3, ten glossy glass orbs (colours from image 4) floating
        in mid-air; the owner still asleep, turned away; studio lights still off, moonlight only.
Show K_A4e and wait for my pick. Then, using the picked K_A4e as the consistency reference for the studio:
  K_A4m (refs L_A4m, K_A4e, P1, ORBS_LOOK): mid-burst: the same gear and orbs flying out of the phone along
        arcs, still small and growing, a lime light trail behind each; night.
  K_A5s (refs L_A5s, K_A4e, P1): the studio ON: both softboxes lit, soft clean studio light fills the bedroom,
        the cinema camera in the left foreground, the piala on the pedestal in focus, orbs floating around it.
  K_A5e (refs L_A5e, K_A5s, P1): same scene from the right side, studio lights on.
  K_A7m (refs L_A7m, K_A4e): the gear and orbs flying back towards the phone along arcs, shrinking; lights off.
  K_A8e (refs L_A8e, K_A1s): MORNING: the same bedroom, warm golden sunlight from the window, the gear is gone,
        the owner still in bed turned away, the phone on the nightstand glowing solid green.
Show all; wait for my picks.

=== STEP 4 — videos (seedance_2_5, mode omni_reference, 16:9, duration 4 or 5, highest covered resolution,
     generate_audio false, use_unlim; generate_video_batch, max 12 per batch) ===
Media roles: start_image, end_image, video_references (the clay previs = camera path and timing only),
image_references (consistency). Prompt format (sections). Make 2 takes of each item.
  V_A1 (start K_A1s, end K_A1e, video_references CLAY_A1, 4 s):
   "SCENE: the night bedroom from the start frame. ACTION: 0–2s stillness, the man sleeps turned away;
    2–4s the phone on the nightstand lights up green. CAMERA: slow push-in exactly like @Video 1. PHYSICS: the man
    barely moves; the phone is rigid; its screen stays flat solid green. NO text, NO logos, NO UI."
  V_A2 (start K_A2s, video_references CLAY_A2, 4 s): "The phone glows on the nightstand; the light breathes softly
    once. CAMERA: very slow push-in like @Video 1. The screen stays flat solid green. No text."
  V_A4a (start K_A4s, end K_A4m, video_references CLAY_A4, image_references P1 + ORBS_LOOK, 4 s):
   "ACTION: 0–1s the phone's green screen flares lime-bright; 1–4s two softboxes on stands, a cinema camera on a
    tripod, a white pedestal with the blue piala and ten glossy orbs fly OUT of the phone along smooth arcs, tiny
    at first and growing to full size. CAMERA: pull back from the phone like @Video 1. PHYSICS: each object is
    rigid and keeps its exact shape while flying; no melting, no morphing; the sleeping man does not move."
  V_A4b (start K_A4m, end K_A4e, video_references CLAY_A4, image_references P1 + ORBS_LOOK, 4 s):
   "ACTION: the flying gear lands and unfolds into a compact studio around the bed: stands touch the floor,
    the camera settles on its tripod, the pedestal lands, orbs slow down and hover. CAMERA: continue pulling back
    to the wide shot like @Video 1. PHYSICS: rigid objects, real weight, no morphing."
  V_A5 (start K_A5s, end K_A5e, video_references CLAY_A5, image_references P1, 4 s):
   "ACTION: the softboxes are on; the orbs orbit the piala slowly; the cinema camera stays aimed at the piala.
    CAMERA: smooth arc from left to right like @Video 1. PHYSICS: rigid objects, the piala never changes."
  V_A7 (start K_A4e, end K_A4s, video_references CLAY_A7, image_references K_A7m, 4 s):
   "ACTION: 0–1s the studio lights switch off; 1–4s every object lifts and flies back INTO the phone along arcs,
    shrinking, the orbs last; the phone screen absorbs the light. CAMERA: push in to the phone like @Video 1.
    PHYSICS: rigid objects, no melting, no morphing."
  V_A8 (start K_A8e, video_references CLAY_A8, 4 s):
   "MORNING. ACTION: warm sunlight; the man shifts slightly under the blanket, still facing away; the phone on the
    nightstand lights up. CAMERA: slow push-in like @Video 1. The screen stays flat solid green. No text."
If V_A4a/V_A4b both fail after 3 takes each, try ONE single V_A4 (start K_A4s, end K_A4e, CLAY_A4, 5 s) with the
two action texts joined by time ranges.
After each batch: jobs_wait, then ONE show_generation_by_ids for the batch. Check every take yourself first:
object count and shapes match the key frames, no text appeared, no face is visible, the screen stayed green.
Tell me which takes you would keep and why. Wait for my picks.

=== STEP 5 — hand-off ===
When I've picked, reply with ONLY this JSON (direct download URLs of the picked results):
{"A1": "...", "A2": "...", "A4a": "...", "A4b": "...", "A5": "...", "A7": "...", "A8": "...",
 "stills": {"K_A4e": "...", "K_A5s": "...", "P1": "..."}}
I will paste it into Claude Code, which assembles the ad (supers, glass UI cards, end card, music) locally.
````
