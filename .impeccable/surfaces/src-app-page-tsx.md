---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/app/concept/page.tsx","src/app/studio/page.tsx","src/app/tg/page.tsx"]
---

# Surface brief: landing, concept board, Studio and Mini App

Scope: landing `/` (Persuade), `/concept` board (Read, internal), `/studio` (Operate), `/tg` Mini App (Operate). The main visitor is a small-business owner on a phone who arrives from Reels, a QR code or a Telegram link. Primary action: paste a Telegram channel link. Proof: the department reads their real channel, and anything else carries a "namuna" label. Constraints: dark stage on the landing and the signature moment. The Studio and `/tg` follow the phone or Telegram theme. Lighthouse 90+ on mobile, CLS 0, honour reduced motion.

Founder decisions (24 Nov):
- All four slop diagnoses confirmed: a literal Dribbble copy, uniform glow, template devices, and none of our own world.
- References are craft bar plus optional material.
- Chose "Chiroqlar yonadi".
- Signature animation: pick from 2–3 prototypes on the board.

## Direction contract

THESIS: The department is a panel of lamps. A tile glows only while that employee works or holds a result, and dark means idle. The owner's decisions are the only lime on screen. It refuses the category default where every card glows as decoration, and the SaaS feature-grid scaffold.

OWN-WORLD:
- Ground: true black stage.
- Ten employee lamps, one hue each, running along a warm-white → amber → coral → rose → magenta → violet → indigo → blue → teal spectrum in pipeline order. A fully lit panel reads as one spectrum.
- Idle tiles are dark glass with a filament hairline.
- An amber dot-matrix LED readout is used only for measured numbers. It descends from the running-line LED signs above Tashkent shops.
- Lime is reserved for owner actions.
- One sans (Onest). No mono costume, no eyebrows.

STORY: "Paste your channel link, the lights come on, ten employees read your channel and return your voice, numbers, a week of posts and the places your customers are. You only approve." The visitor believes it because the tiles show their own channel's numbers. Then they approve and publish.

FIRST VIEWPORT (phone 390×844):
- Top: a slim LED readout strip.
- Headline at about 40px with a one-line promise.
- Link field and the lime "Bo'limni yoqish" button above the fold, at about y 300.
- Below: a 2×5 panel of dark lamp tiles, with names, partly visible as the fold teaser.
- Desktop: the same column on the left and the full panel on the right.

FORM: Picked card "IMPECCABLE'S PICK" (my #1 grounded candidate, not the rolled one). seed:f5c82914f0d67804

Signature interaction: lamps warm up in sequence when a link is pasted, with a flicker on start, and the LED readout types the channel's real stats. Motion grammar:
- Lamps warm up (about 700 ms, expo-out, two micro-dips).
- Lamps cool down (about 1000 ms ease-in).
- Numbers settle with damped overshoot.
- The layout is drawn first and never moves.

Raises kept from the declined hand: an empty centre until work starts; weight shows state; keyline-first registration; one grid module; ballistic motion; state shown by stroke pattern, not hue alone.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved
- Which signature animation (A lamps in sequence / B prism split / C LED board) — founder picks on /concept.
- Board approval before rebuilding `/`, `/studio`, `/tg`.
