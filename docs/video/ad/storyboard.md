# Mercat ad: "Studiya — telefoningizda" (≈41 s, 16:9; a 9:16 cut-down comes later)

**Idea (from the founder).** A business owner without a marketer sleeps badly: why isn't the product selling? An agency costs thousands. He finds Mercat, and a whole studio bursts out of his phone: lights, a camera, his product on a pedestal, and ten AI employees. The work happens while he sleeps. Then everything folds back into the phone, and in the morning the posts are ready in Telegram.

**Style reference:** the Lovio SaaS film the founder sent (53 s, by zelios). What we take from it:
- **Two worlds.** A calm, real, softly lit place (for us, the bedroom) and a deep blue/violet gradient void. Frosted-glass UI panels float in both.
- **The real interface is the hero.** It sits in device frames and glass cards and is never generated.
- **Kinetic type, one or two words at a time,** fading up with blur. No voice-over: music and type carry the film.
- **Pace.** Shots of 1–3 s with soft transitions (blur, mask, morph) and very few hard cuts.

What we add that Lovio doesn't have: **a story** (the sleeping owner) and **one hero VFX moment** (the studio bursting out of the phone and returning to it).

**Previs (Blender, grey-box):** `docs/video/ad/previs/A*.mp4`, with start/end frames `A*_start.jpg` / `A*_end.jpg`. Rebuild with `build_previs.py`.
**Animatic:** `docs/video/ad/animatic/mercat-ad-animatic.mp4`. Rebuild with `build_animatic.py`. Drop final shots into `docs/video/ad/shots/<id>.mp4` and re-run: the animatic becomes the rough cut.
**Generation steps and prompts:** `docs/video/ad/runbook.md`.

---

## Shot list

**UZ** is the big super; **RU** is the small line under it.

| # | Time | Shot | Source | UZ super / RU line | Sound |
|---|---|---|---|---|---|
| A1 | 0:00–0:04 | **Night, wide.** A bedroom lit only by the moon through the window. The owner is asleep, turned away (face never readable). His phone on the nightstand lights up. | AI · Seedance 2.5, start/end frames from previs A1 | **Nega sotilmayapti?** / Почему не покупают? | room tone, clock tick, a soft buzz |
| A2 | 0:04–0:07 | **Close:** the phone on the nightstand, its screen glowing. | AI (green screen) + SR comp | **Agentlik — $3 000 dan** (struck through in lime) → **Yoki — bir havola.** / Агентство — от $3 000 → Или — одна ссылка. | price "tick", then a breath |
| A3 | 0:07–0:09 | **Glass UI** over the dark room: the Mercat field, a `t.me/…` link pasted, Enter. | SR inside a frosted card (motion design) | *(UI is the text)* | click → **riser** |
| A4 | 0:09–0:14 | **HERO, the burst.** The phone flares lime. Two softboxes on stands, a cinema camera on a tripod, a pedestal with his product and ten glossy orbs fly out of the phone in arcs and **unfold into a studio around the bed**. The camera pulls back from the phone to a wide shot. | AI · Seedance 2.5 **@Clay Render = previs A4** + start/end frames | (end) **Butun studiya — telefoningizda.** / Целая студия — в вашем телефоне. | **the drop**, whooshes per object |
| A5 | 0:14–0:18 | **Studio ON.** The softboxes flare up, the camera orbits the product on the pedestal, and the orbs circle like a crew. | AI · @Clay Render = previs A5 | — | soft hum, shutter clicks |
| A6 | 0:18–0:28 | **The work**, Lovio style. Five glass cards of 2 s each over the blue gradient, each with an employee's orb and one kinetic word: **tahlil · reja · post · 4 til · video** (Analitik, Strateg, Kopirayter + Muharrir, Tarjimon, Videograf). The real UI plays inside each card. | SR3–SR7 + motion design | the words are the supers | beat-synced ticks |
| A7 | 0:28–0:32 | **Return.** The camera turns off, then everything flies back into the phone in reverse arcs, and the light snaps back into the screen. | AI · @Clay Render = previs A7 (or A4 reversed) | **Hammasi — bitta telefonda.** / Всё — в одном телефоне. | reverse whoosh → silence |
| A8 | 0:32–0:36 | **Morning.** Warm sun, the bedroom is a bedroom again, the phone lights up on the nightstand. The **published Telegram posts** are composited on its screen. | AI (green screen) + SR9 comp | **Ertalab — postlar tayyor.** / Утром — посты готовы. | birds, a notification ping |
| A9 | 0:36–0:41 | **End card.** The constellation loop dims. **Mercat** wordmark with a lime dot, the tagline, the bot QR, `mercat-ai.vercel.app`. | 3D + type | **Butun marketing boʻlimi — bir havolada.** / Целый отдел маркетинга — по одной ссылке. | final hit |

**The product on the pedestal:** a **handmade Rishtan ceramic piala** (blue eight-pointed star pattern) is the default. It is rigid and simple, so video models keep it intact, and it reads as Uzbek instantly. If the founder has a real customer's product with permission, use that instead.

## Rules for this film (from `docs/creative/playbook.md`)

1. **The hero VFX shot is two generations, not one.** A4a is the burst (gear leaves the phone). A4b is the assembly (gear lands and unfolds). Both use start and end frames plus the clay video. One continuous 5 s generation is where morphing happens.
2. **Every object is locked with a reference sheet:** softbox, cinema camera, pedestal + piala, orbs. Use the same sheet in A4, A5 and A7, and check the first, middle and last frames against it.
3. **The physics line goes into every prompt:** "rigid objects flying along arcs, no melting, no morphing, no stretching".
4. **No readable face.** The owner is seen from behind, in shadow, or under the blanket.
5. **Every phone screen is solid green** in the AI shots. The real UI and the real Telegram posts are composited in.
6. **No AI text.** The supers and the end card are the PNGs from `build_animatic.py` (in the final version, Inter replaces SF Pro).

## Open decisions (founder)

- **"$3 000 for an agency" needs a source** before it goes on screen. Examples: a price list from a Tashkent agency, or a quote from your interviews. If there is no source, use **"Agentlik — qimmat"** / «Агентство — дорого».
- **UZ + RU supers or UZ only?** The jury is mixed, so I set UZ big and RU small.
- **Music.** Ambient electronic at 100–110 BPM with a drop on A4. Royalty-free.

---

## Then: the video presentation (founder and teammates)
See `docs/video/presentation-plan.md`. The ad opens it, then the team speaks on camera. These are real people, not AI presenters.
