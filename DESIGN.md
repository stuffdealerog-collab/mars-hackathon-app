---
name: Mercat
description: Calm paper. Near-black ink, 1px lines, one quiet green for the one thing to press. Colour comes from the owner's own posts and pictures.
colors:
  paper: "#f7f5f0"
  card: "#ffffff"
  ink: "#1b1a17"
  ink-2: "#57534b"
  ink-3: "#85807a"
  line: "#e5e0d6"
  line-2: "#cdc6b8"
  tint: "#efebe3"
  accent: "#1f5c47"
  accent-hover: "#184a39"
  accent-ink: "#ffffff"
  ok: "#2b7350"
  bad: "#a3352b"
  bad-soft: "#f8ece9"
  dark-paper: "#181816"
  dark-card: "#22211e"
  dark-ink: "#efece6"
  dark-ink-2: "#b5b0a6"
  dark-ink-3: "#8a857c"
  dark-line: "#34322d"
  dark-line-2: "#4a4740"
  dark-tint: "#2b2a26"
  dark-accent: "#7fc4a6"
  dark-accent-ink: "#0f1f18"
typography:
  display:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "52px"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  display-mobile:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.02em"
  section:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  small:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  button:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.2
rounded:
  segment: "8px"
  control: "12px"
  card: "16px"
spacing:
  gutter-mobile: "16px"
  gutter-desktop: "24px"
  section-gap: "48px"
  column: "760px"
---

# Design System: Mercat

## Overview

Mercat is a tool a shop owner uses on a phone between customers. It should feel like a well-kept paper notebook, not a machine: warm paper background, near-black ink, thin 1px lines, generous space, and one quiet green used only on the single thing to press on a screen.

The colour on the page belongs to the owner: their post pictures, their photos. The interface itself stays neutral so those pictures carry the page.

Replaced on 2026-11-24: the "lamp world" (lit lamp panel, LED readouts, lime, glow, mesh gradients, dot-matrix numbers, orbs, AI portraits, mono-uppercase eyebrows, dot-grid backgrounds, the Spektr intro, the dark `.uslub-legacy` views). The owner judged it heavy, machine-made and too close to Higgsfield. None of it may come back.

Tokens live in `src/app/globals.css` (`:root`, and `[data-theme="dark"]` for the Telegram dark theme) and are exposed to Tailwind as `bg-paper`, `text-ink`, `text-ink-2`, `border-line`, `bg-accent`, etc.

## Colors

### Neutral (almost everything)

- **Paper `#f7f5f0`**: page background. Warm, not grey, not pure white.
- **Card `#ffffff`**: surfaces that hold the owner's content (post cards, findings, form fields).
- **Ink `#1b1a17`**: text and the active tab underline.
- **Ink-2 `#57534b`**: secondary text, labels, notes.
- **Ink-3 `#85807a`**: hints and examples under fields, waiting checklist steps.
- **Line `#e5e0d6`** and **Line-2 `#cdc6b8`**: 1px borders. Line-2 for controls (inputs, secondary buttons), Line for containers.
- **Tint `#efebe3`**: segmented-control track, picture placeholders.

### Accent (one per screen)

- **Accent `#1f5c47`** (deep green) with white text: the primary button only. One primary action per screen: "Boshlash", "Postlarni tayyorlash", "Qayta urinish", "Tasdiqlash"/"Kanalga joylash" on a post card.

### Status

- **Ok `#2b7350`**: done checks, "Tasdiqlandi".
- **Bad `#a3352b`** on **Bad-soft `#f8ece9`**: errors and the "Muammo" label of a finding.

### Telegram dark

Inside the Mini App the theme follows Telegram's `colorScheme`; `[data-theme="dark"]` swaps every token (paper `#181816`, ink `#efece6`, accent `#7fc4a6` with dark text). The Mini App paints Telegram's header and background with the same paper colour.

### Named Rules

- **One green.** The accent marks the one thing to press: one control per screen, or one per post card in the Postlar list (each card is its own decision). Never on icons, borders, charts, text links or decoration.
- **No decorative colour.** No gradients, glows, coloured shadows, coloured section backgrounds.
- **The owner's colour wins.** Post pictures and the owner's photos are shown full-bleed in their cards and are the only saturated colour on the page.

## Typography

One family: **Onest** (Google Fonts via `next/font`, Latin preloaded, Cyrillic on demand). It covers Uzbek Latin ‘ and Uzbek Cyrillic ў қ ғ ҳ.

### Hierarchy

- Display (landing h1): 32 px mobile / 52 px desktop, 600, tight tracking.
- Title (Studio h1): 30 px mobile / 40 px desktop, 600.
- Section: 20–24 px, 600.
- Body: 16 px / 1.5. Post text: 16 px / 1.5, `white-space: pre-line`.
- Small: 14 px, for hints, notes and metadata.

### Named Rules

- **Sentence case everywhere.** No uppercase eyebrows, no mono labels, no letter-spaced captions.
- **Numbers are plain text.** Tabular figures (`.tnum`) for counts; no dot-matrix or display numerals. Uzbek and Russian use a space for thousands and a comma for decimals (`num()` in `src/components/ui/lang.ts`); "12 000" never breaks across lines (`keepNumbers()`).
- **Apostrophes:** ‘ in o‘/g‘, ’ for the tutuq belgisi. Never ASCII '.

## Layout

- Mobile first at 375 px: 16 px side gutters, one column, no horizontal scroll.
- Studio and Mini App: one centred column, max 760 px. Landing: max 1080 px, hero text max ~22ch.
- Vertical rhythm: 48 px between sections, 20–24 px between cards, 12–16 px inside cards.
- Tabs (Kanal · Postlar · Video) stick to the top of the Studio column with a 1px bottom line.

## Elevation & Depth

Flat. Depth comes from the 1px line and the white card on paper. No shadows except the 1px inset ring on controls and the selected segment.

## Shapes

- Controls (buttons, inputs): 12 px radius, 48–52 px tall.
- Cards: 16 px radius, 1px Line border.
- Segmented control: 10 px track, 8 px segments.
- Step numbers: 32 px circles with a 1px Line-2 border.

## Components

### Buttons

- `.btn` — primary, accent fill. One per screen.
- `.btn-2` — secondary, card fill with a 1px Line-2 ring.
- `.link` — text action, underlined in Line-2.
Disabled: 50% opacity. Full width on mobile when it is the screen's main action.

### Inputs

`.input` — 52 px, 16 px text (iOS does not zoom), 1px Line-2 ring, 1.5px ink ring on focus, Bad ring when invalid. Every field has a visible label above and a hint or error line below.

### Segmented control

`.seg` — language switch (`uz · ru · en`) and the post script switch (O‘z · Ўз · Ру · En).

### Progress checklist

A plain list while Mercat works: a 24 px circle per step — empty (waiting, ink-3 text), a slow spinner (working), a green check (done), a red cross (failed) — and one line of text with the real count ("Kanal o‘qildi · 60 post", "Haftalik reja tuzilmoqda · 3/7"). Elapsed seconds are shown; there is no progress bar.

### Post card

White card: header line (weekday, time · goal, and "Tasdiqlandi" when approved), the picture full-bleed (or a tint placeholder "Rasm chizilmoqda…"), the script switch, the text, then actions: "Tahrirlash" (secondary) + "Tasdiqlash" (primary); after approval "Kanalga joylash" (primary) with one line explaining the bot.

### Finding

White card: a small coloured word ("Muammo" in Bad, "Imkoniyat" in Ink-2, "Yaxshi tomoni" in Ok), the finding in 16 px, the evidence numbers in 14 px Ink-2.

### Sample banner

`?mock=1` only: a white card under the header, "Namuna: o‘ylab topilgan non do‘koni…" with a link to start with the owner's own channel.

### Motion

Almost none: 150 ms colour transitions on controls, a slow 2.4 s opacity "breathe" on waiting text and picture placeholders, a 1.6 s spinner in the checklist. All of it stops under `prefers-reduced-motion`.

## Do's and Don'ts

### Do

- Answer "what is this and what do I do" on the first screen: one field, an example, the empty-channel option, three steps.
- Show only real numbers from the owner's channel; label anything else "Namuna".
- Use shop words: kanal, post, narx, rasm, reja, tasdiqlash.
- Put the owner's pictures and posts at the centre of the page.
- Show errors as a plain sentence with "Qayta urinish".

### Don't

- No lamps, LEDs, glow, neon, lime, mesh or any gradients, orbs, 3D icons, AI portraits, dot-grid or noise backgrounds.
- No mono-uppercase eyebrows, no dot-matrix or oversized "hero numbers".
- No agent/employee theatre ("Kopirayter yozdi…", avatars, node graphs).
- No dashed "empty state" boxes, no decorative illustrations.
- No second accent-coloured control in the same screen or card.
- Never show sample data as if it were the owner's.
