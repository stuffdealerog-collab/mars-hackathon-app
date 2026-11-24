# Mercat video rulebook (from Artlist sources, for a 60–90 s AI + screen-recording pitch film)

How this was researched: I read the channel's RSS feed (channel id UCXNK0IHTX0BoktdtKjqIWoA) and the channel page HTML, and took the full descriptions and chapter lists of the most relevant recent videos. artlist.io/blog is behind a Cloudflare challenge (403/522), so I could not open the articles. The blog takeaways below come from search-result excerpts only. Everything else is standard practice from professional commercial work, adapted to Mercat.

---

## 1. Sources used

| # | Title | URL | Takeaway |
|---|---|---|---|
| 1 | I Made a Cinematic Coffee Ad With Seedance 2.5 | https://www.youtube.com/watch?v=-EnsQqXsqFk | A hybrid ad. Plan the commercial first and decide what to shoot for real and what to generate. Swap in the product with AI, generate the shots you could never film, and do an AI cleanup pass at the end. |
| 2 | Claude + Blender Fixed AI Video's Biggest Problem | https://www.youtube.com/watch?v=b5RI-tdtyE0 | Block the shot as grey boxes, render it in clay, and use that render as the video reference. The AI then follows your camera move and timing. Regenerate only the sections that fail. Music is "the missing piece". |
| 3 | Claude + Blender = Infinite Camera Angles | https://www.youtube.com/watch?v=ugMNzdfBktI | You can get extra angles from one take through reference-to-video, which gives an editor real coverage. |
| 4 | How I Make Motion Graphics with Claude + After Effects | https://www.youtube.com/watch?v=3AIZ4FT61aw | Tracked callouts on generated footage, a "liquid glass" panel, and kinetic type timed to an AI voice-over. "Visual references change everything." Sound design is built together with the motion graphics. |
| 5 | JOVIUM: Behind the Scenes | https://www.youtube.com/watch?v=ApDq-_vn7NM | Pipeline: script → mood board → stills and character sheets (Nano Banana / Seedream) → Seedance → Premiere / AE / Resolve. Consistency drifts (wardrobe, a red dress kept coming back). Static shots were held in place with a wireframe-storyboard reference. |
| 6 | Seedance 2.5 Just Killed the Green Screen | https://www.youtube.com/watch?v=xEBYsOhqtco | Give every reference one clear job in the prompt. Test in Draft Mode before rendering at 1080p. Use extracted frames to keep shots consistent. Make light, shadow and contact believable. |
| 7 | You're Paying 5x Too Much for Seedance 2.5 | https://www.youtube.com/watch?v=rSquB0OkKsk | Draft at 480p and render full resolution only for the shots you keep. |
| 8 | (blog) The director's new tool: Inside the making of Artlist's Veo 3 ad | https://artlist.io/blog/how-to-create-ads-veo-3/ | AI mixed with traditional filmmaking, by a small team in about 2 weeks. Audio is prompted explicitly ("wind rushing", "cinematic orchestral score", dialogue lines). |
| 9 | (blog) Master AI video movement: essential camera shots for your prompts | https://artlist.io/blog/camera-shots-ai/ | Direct the model like a cinematographer: name the shot size, angle and camera move (tracking, bird's-eye, first-person and so on). |
| 10 | (blog) How to use vibe prompting | https://artlist.io/blog/prompt-vibes/ | Describe the atmosphere (grade, motion quality, film texture, ambient sound), not only a list of objects. |
| 11 | (blog) Character consistency with AI video generators, plus the Seedance 2.0 guide | https://artlist.io/blog/consistent-character-ai/ , https://artlist.io/blog/new-seedance-2/ | Use the last frame of one take as the start frame of the next. Use start and end frames to control the transition between them. |
| 12 | (blog) 6 actionable tips for making AI videos with real emotion, and Sound design tips | https://artlist.io/blog/?p=69397 , https://artlist.io/blog/tips-that-will-take-your-sound-design-to-the-next-level/ | Know what you want to say before you open any tool, and decide whether the film should look like AI at all. Use sound effects to smooth transitions and hold the intensity. |

Also on the channel, seen by title only and not opened: "Finally, a Realistic Guide to Seedance 2.5" (BycobCP0Y-E), "I Put Seedance 2.5 to the Ultimate Test (Every Prompt I Used)" (Z6YXZdS235M), "Before You Pay for Artlist or Higgsfield, Watch This" (O9p6dgYyi3E).

---

## 2. Story structure (target 75 s; maximum 90)

| Time | Beat | What is on screen | Rule |
|---|---|---|---|
| 0–3 s | **Hook** | Something moves in the very first frame. Example: macro of a Telegram link being pasted, and the screen bursts into 10 glowing orbs. Or the owner of a Tashkent shop at 23:00 staring at an empty post. One line of text: "Marketolog yo'q?" | No logo intro and no fade from black. A question or tension in under 3 s. |
| 3–12 s | **Problem** | 3–4 quick shots of the pain: the owner juggling the till and the phone, an empty channel, a generic "AI cliché" post, a big dot-matrix figure for the problem. | Show the pain in pictures, keep explaining to a minimum. |
| 12–18 s | **Turn** | "Bir havola — butun marketing bo'limi." The link is pasted and Enter is pressed. About 0.5 s of silence, then the hit. | This is the musical drop and the emotional pivot. |
| 18–50 s | **Product** | The department working in about 60 s. A dot-matrix timer runs 00:00 → 01:00. 4–5 of the employees get hero moments: analyst, strategist, copywriter, the editor removing clichés, the translator (UZ Latin / Cyrillic / RU / EN), designer, publisher. Real screen recordings sit inside glass cards and are cut in alternation with cinematic AI shots of the orbs. | One feature per shot. Show the result, not the menus. |
| 50–65 s | **Proof** | A wall of outputs (posts, visuals, four languages). Before/after from the editor. Real numbers only (time, cost compared with hiring a marketer, pilot users if they exist). | Never invent numbers. |
| 65–75 s | **Call to action** | Logo lockup, tagline, bot or site address, "MARS AI Hackathon". Hold it 3–4 s while the music resolves. | The last frame must be readable as a still. |

Voice-over budget: about 2.2–2.5 words per second, so 140–160 words at most for 75 s. Leave 20–25% of the runtime without voice-over (the hook, the drop, the CTA hold).

---

## 3. Shot design

**Two visual worlds, joined by match cuts:**
- **Human world.** A real Tashkent small business: bakery, clothing shop, café, market stall. Warm tungsten practicals, natural textures.
- **AI world.** A near-black void with luminous mesh gradients, glossy 3D orbs, dot-matrix numerals and a neon-lime accent.
- **Bridge.** Push into the phone or laptop screen, then cut to the full-screen UI or the orb world.

**Shot sizes:** extreme close-up / macro (finger pasting the link, orb surface), close-up (owner's face, phone), medium close-up, wide establishing shot (shop, street), top-down (desk with phone), low-angle hero (orb or logo), over-the-shoulder onto a screen, inserts.

**Camera moves and what they signal.** One move per shot, and every move should have a reason.
- Slow push-in (dolly in): importance, focus.
- Pull-out reveal: scale ("a whole department").
- Orbit or arc around an orb or product: premium.
- Lateral tracking: flow, a process.
- Crane or pedestal up: reveal.
- FPV fly-through into the UI: "entering the system".
- Whip pan: transition energy.
- Crash zoom: an accent. Use it once.
- Rack focus: shifting attention.
- Locked-off frame: use it under heavy text.

**Premium lens and light vocabulary for prompts:**
- Lens: "shot on 50mm / 85mm, anamorphic, shallow depth of field f/1.8, creamy bokeh, subtle lens breathing".
- Light: "low-key lighting, single soft key from camera left, strong rim light, light falloff into pure black, volumetric haze, neon-lime practical accents, glossy specular highlights".
- Texture and grade: "subtle 35mm film grain, gentle halation, filmic contrast, muted palette with neon-lime accent".
- Composition: three depth layers (foreground element, subject, background) and negative space for the text.

---

## 4. AI-video specifics

**Prompt formula** (one shot = one prompt = one action):
`[shot size + angle] of [subject] [single action], [camera move + speed], [lens/DOF], [lighting], [environment], [style suffix], [mood], [audio if the model generates sound]`. Then add negatives.

Example (AI world):
> Extreme close-up, low angle, of a glossy iridescent glass orb floating in a near-black void, slowly rotating as a thin neon-lime light line traces its edge; slow orbit right; 85mm, shallow depth of field; single soft key from left, rim light, volumetric haze; luminous mesh gradient glow in background; subtle film grain, filmic contrast; calm, precise, premium. No text, no logos, no warping, no flicker.

Example (human world):
> Medium close-up of a tired Uzbek bakery owner in his 40s at night behind the counter, looking at his phone, warm tungsten practical light, slow push-in; 50mm f/2; steam from fresh non bread in foreground; muted palette, subtle 35mm grain; quiet, late-night mood. No text on screen, natural skin texture.

**Consistency (the most important point):**
1. Build a look bible first: one approved still per world, made in Higgsfield with an image model such as Soul or Nano Banana. Copy the same style suffix and the same lighting block word for word into every prompt.
2. Make all keyframes as stills first, approve them, then animate with image-to-video (start frame, plus an end frame for controlled transitions such as orb → UI card).
3. Characters: one character sheet (front, 3/4, profile, same wardrobe) used as the reference for every shot. Repeat the wardrobe words in every prompt.
4. For continuous moves, use the last frame of take A as the start frame of take B.
5. Keep the seed fixed while iterating on a prompt. Give each reference one job ("image 1 = character, image 2 = location").
6. For exact camera paths, a grey-box Blender render can serve as the motion reference (source 2). A Blender MCP is available in this environment.

**Clip length:** generate 5 s (at most 8–10) and use the best 1.5–3 s. Quality degrades and morphing grows toward the end of a clip.

**Cost and speed:** draft at low resolution or in draft mode with 3–4 variations per shot in batches, then render finals only for the shots you keep.

**Picking a model per shot** (check the models_explore tool for what is actually available):
- A model with native audio (Veo-class) for atmospheric live-action.
- Kling-class for camera control and start/end frames.
- Seedance-class for reference-to-video and multi-shot consistency.
- Higgsfield camera-motion presets for signature moves (orbit, FPV, crash zoom).

**Avoiding the AI-slop look:**
- Never let the AI render text, logos or the product UI. It garbles letters, Uzbek especially. Put typography and the real UI in during the edit.
- Avoid lip-sync dialogue, close-ups of hands typing, crowds and complex physics.
- Prefer silhouettes, backs, macro details, hands holding a phone without fiddly finger movement, and abstract orbs.
- Negatives to use: "no text, no watermark, no extra fingers, no morphing, no warping, no flicker, no plastic skin, not oversaturated".

**Upscaling and finishing:** upscale only the clips you keep (Higgsfield upscale_video or Topaz). Conform everything to one frame rate (24 or 25 fps; screen recordings shot at 60 fps get conformed). Add the same grain and grade to every clip afterwards to glue them together. Deliver 16:9 at 1080p or 4K.

---

## 5. Editing

**Order of work:** music first (mark the beats), then voice-over, then cut picture to the beats.

**Shot lengths:**

| Section | Shot length |
|---|---|
| Hook | 0.5–1 s |
| Problem | 1–1.5 s |
| Cinematic shots in the product section | 1.5–2 s |
| Screen recordings | 2.5–4 s (they need reading time) |
| CTA hold | 3–4 s |

Pattern: fast-fast-slow. Put a breath just before the turn.

**Transition techniques:**
- Cut on motion: end shot A in the middle of its move and continue the same direction in shot B.
- Match cuts: circle to circle (orb ↔ coffee cup ↔ channel avatar), shop phone screen → full-screen UI, link text → orb burst.
- Speed ramps (100% → 20% → 100%, eased) on the link paste and the orb burst.
- Whip-pan transitions with a whoosh.
- J-cuts and L-cuts on voice-over and ambience.

**Screen recordings next to cinematic shots:**
- Record at 2× resolution (Retina or 4K) so you can punch in to 150–200% smoothly.
- Hide the cursor or use a large, clean one.
- Use realistic Uzbek demo data.
- Cut out waiting: show it as a sped-up 00:00 → 01:00 dot-matrix counter.
- Put the recordings in dark glass cards or device mockups with a soft shadow, a lime edge glow and a slight 3D tilt with parallax.
- Reveal one panel at a time with masks and a zoom plus lime outline highlight.
- Never cut raw bright-white UI against the dark film. Dark-mode the product or frame it inside the AI world.

**Typography:**
- One sans-serif family, plus dot-matrix for numbers. Lime only on the keyword.
- 3–6 words per card, each line on screen at least 1.5 s.
- 10% safe margins.
- Kinetic moves: fade-up with blur, tracking change, a quick mask reveal.
- Burn in captions. Uzbek voice-over with English subtitles suits the international Techstars jury.

**Color:** one grade across the whole film. Deep but not clipped blacks, neon-lime and cool accents, warm natural skin. The same grain and vignette everywhere.

---

## 6. Sound

**Music:** one track, a modern electronic and cinematic hybrid at about 100–120 BPM, with a clear build, a drop at the turn (12–18 s) and a resolving ending. Edit the music so the final hit lands on the logo; build the ending backwards from that hit. If stems are available, pull the drums down under dense voice-over.

**Sound-design layers:**
- A subtle whoosh on every transition.
- Risers into the turn and into the CTA.
- Impacts and sub-drops on title hits.
- UI clicks and ticks synced to each on-screen action.
- A soft digital shimmer or glitch for the "AI is working" moments.
- Generic notification pings, not branded app sounds.
- Room tone and ambience for the human world (shop, street, market).
- About 0.5 s of silence before the drop.

Sources: Higgsfield search_sound_effects / generate_audio, or the ElevenLabs connector.

**Voice-over:**
- A warm, confident, conversational native Uzbek voice (the founder or a generated voice) at 130–150 wpm.
- Record per beat and keep the breaths.
- Duck the music 8–12 dB under the voice-over.
- Mix to about −14 LUFS integrated, true peak below −1 dBTP.

---

## 7. Ten mistakes that make AI videos look amateur

1. **No look bible.** Every shot has a different style, light and palette, so the film never reads as one piece.
2. **AI-rendered text, logos or UI.** Garbled letters and a fake interface. Real UI and typography go in during the edit.
3. **Using the whole 5–10 s generation.** Morphing and drift appear at the end of the clip. Keep the best 1.5–3 s.
4. **Unmotivated or stacked camera moves.** Everything swirls and floats. Use one motivated move per shot and include some locked-off shots.
5. **The uncanny zone.** Plastic skin, dead eyes, lip-synced dialogue, hands typing, crowds. Hide faces, go macro, use the screen recordings.
6. **No glue.** Mixed frame rates and resolutions, raw bright screen recordings, no shared grain or grade.
7. **Too many words.** Wall-to-wall voice-over plus dense text, ignoring reading time. Aim for 160 words or fewer and 6 words or fewer per card.
8. **Music laid down without editing.** Cuts off the beat, no sound effects, a track that stops abruptly instead of ending on a hit.
9. **Weak open and close.** A logo intro or slow fade-in, and a CTA with no hold, no address and no clear next step.
10. **Features instead of outcome.** Invented numbers, a film over 90 s, and showing all 10 employees equally instead of 4–5 hero moments plus a montage.

---

## Production plan for today (about 95 min left)

| Time | Task |
|---|---|
| 15:30–15:50 | Script and voice-over text (≤160 words). Look-bible stills for both worlds. 8–10 keyframe stills. |
| 15:50–16:20 | Batch image-to-video, 3 variations each, draft first. At the same time, record the screen at 2× in dark mode with clean demo data. |
| 16:20–16:30 | Upscale the kept clips. Generate the voice-over. Pick the music and sound effects. |
| 16:30–16:50 | Edit to the beat, typography, glass cards, one grade and grain pass, sound mix. |
| 16:50–16:55 | Export 1080p H.264 at −14 LUFS and watch it once full-screen. |

Working files are in `/private/tmp/claude-501/-Users-latif--claude-spares-spare-r8grLk/0d098c34-26d0-45d8-a2ce-8d9851fad634/scratchpad/yt/` (channel HTML and RSS feed).
