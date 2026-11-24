---
name: Mercat
description: An AI marketing department drawn as a panel of lamps. Light means work, lime means the owner's hand.
colors:
  stage: "#000000"
  glass: "#0d0d10"
  glass-2: "#17171b"
  glass-3: "#222227"
  hair: "rgb(255 255 255 / 0.08)"
  hair-2: "rgb(255 255 255 / 0.14)"
  ink: "#f3f1ec"
  ink-2: "#a8a49c"
  ink-3: "#85817a"
  led: "#ffb547"
  led-off: "rgb(255 181 71 / 0.1)"
  lime: "#d7ff3a"
  lime-ink: "#0b0c02"
  ok: "#3be08a"
  bad: "#ff5a4e"
  light-stage: "#ffffff"
  light-glass: "#f3f2ef"
  light-glass-2: "#eae9e5"
  light-glass-3: "#dfddd8"
  light-ink: "#0d0d11"
  light-ink-2: "#57544e"
  light-ink-3: "#6e6a63"
  light-led: "#c26a00"
  light-focus: "#5a7000"
  lamp-brand: "#ffd6a0"
  lamp-analyst: "#ffb547"
  lamp-strategist: "#ff8a3d"
  lamp-copywriter: "#ff6152"
  lamp-editor: "#ff4580"
  lamp-translator: "#e04bc9"
  lamp-designer: "#9e62ff"
  lamp-video: "#6273ff"
  lamp-radar: "#2f9cff"
  lamp-publisher: "#25d0c2"
typography:
  display:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "64px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.035em"
  display-mobile:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.03em"
  headline-mobile:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 620
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  lamp-title:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 640
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  post:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.3
  button:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 620
    lineHeight: 1
    letterSpacing: "-0.01em"
rounded:
  mark: "7px"
  led-strip: "12px"
  lamp-sm: "18px"
  card: "20px"
  lamp: "22px"
  panel: "24px"
  lamp-lg: "28px"
  pill: "999px"
spacing:
  panel-gap: "10px"
  gutter-mobile: "16px"
  gutter-desktop: "32px"
  lamp-pad-top: "26px"
  lamp-pad-x: "14px"
  section-mobile: "64px"
  section-desktop: "96px"
  container: "1180px"
components:
  button-lime:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.lime-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "52px"
  button-quiet:
    backgroundColor: "{colors.glass-2}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "52px"
  button-quiet-hover:
    backgroundColor: "{colors.glass-3}"
  field:
    backgroundColor: "{colors.glass-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "4px 4px 4px 18px"
    height: "60px"
  lamp-tile:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.ink}"
    typography: "{typography.lamp-title}"
    rounded: "{rounded.lamp}"
    padding: "26px 14px 13px"
    height: "132px"
  lamp-tile-sm:
    backgroundColor: "{colors.glass}"
    rounded: "{rounded.lamp-sm}"
    height: "92px"
  namuna-chip:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "0 9px"
    height: "22px"
  tg-post:
    backgroundColor: "{colors.glass-2}"
    textColor: "{colors.ink}"
    typography: "{typography.post}"
    padding: "12px 14px 9px"
  segmented:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "3px"
  segmented-item-active:
    backgroundColor: "{colors.glass-3}"
    textColor: "{colors.ink}"
    height: "36px"
  switch-on:
    backgroundColor: "{colors.lime}"
    rounded: "{rounded.pill}"
    width: "52px"
    height: "32px"
---

# Design System: Mercat

## Overview

**Creative North Star: "Chiroqlar yonadi" (the lights come on)**

The marketing department is a panel of ten lamps on a true black stage. Each employee owns one lamp and one hue, and the hues run in pipeline order from warm white through amber, coral, rose, magenta, violet, indigo and blue to teal, so a fully lit panel reads as a single spectrum. A lamp glows only while its employee works or holds a result; dark glass means idle. Nothing glows for decoration.

Three other materials sit beside the lamps. An amber 5×7 dot-matrix LED, taken from the running-line signs above Tashkent shops, prints measured numbers and the channel's real facts. Lime is the owner's hand: it marks the one decision the owner makes on a screen. A dashed outline says "namuna": the figure is sample data, not the owner's channel. Everything else is quiet glass, hairlines and one sans family, Onest.

The layout is drawn first and never moves. State changes are carried by light, weight and stroke pattern: a lamp warms up with a filament flicker, cools down slowly, and its title goes from 450 to 640 weight when it lights. The world refuses the category default where every card glows, and the SaaS feature grid.

**Simplified on 2026-11-24 (owner's correction).** The lamp world stays; it must be simpler and obvious. One lamp panel on the landing (not two). Every screen says what is happening and what to do next. A lit lamp carries one short honest result ("60 post o‘qildi", "7 post rejada", "2/5 rasm"). Roles that do nothing yet (Videograf, Mijoz radar) stay dark with "tez orada". Spektr is the wow moment of the first run. The old "AI OS" screens (mesh-gradient GlowCards, glossy orbs, AI portraits, dot grids, neon pills) are gone; their content now lives in the lamp system. **Simple mode is the default**: the 3-step path with a ten-light strip; **Professional rejim** (a switch on the ready screen) shows the full panel and the strategy and plan details. Every screen speaks uz / ru / en.

**Key Characteristics:**
- True black stage (dark) or white stage (Telegram light theme), with glass tiles drawn by a 1px inset hairline instead of borders or shadows.
- Ten lamp hues, one per employee, in fixed pipeline order. Lime is never a lamp.
- Amber LED dot matrix for measured numbers only.
- One enabled lime action per screen.
- Pills for every control; generous 18 to 28px corners for tiles.
- Onest throughout, semibold display with tight negative tracking.
- Motion is ballistic and physical: 720ms warm-up with flicker, 1000ms ease-in cool-down, press scale 0.96, nothing reflows.

## Colors

A black stage lit only by work: ten spectral lamp hues, one amber for numbers, one lime for the owner, warm off-white ink.

### Primary
- **Owner Lime** (`lime`): the owner's hand. Primary buttons (Bo'limni yoqish, Tasdiqlash, Telegramda joylash), the "sizni kutmoqda" dot inside a lamp, the on state of a switch, text selection, caret and the focus ring. Text on lime is always Lime Ink (`lime-ink`). In the light theme the focus ring darkens to Deep Olive (`light-focus`) for contrast; lime fills stay the same.

### Secondary
- **Shop-Sign Amber** (`led`): lit dots of the LED readout and nothing else. Unlit dots are the same amber at 10% (`led-off`). In the light theme the LED prints in Burnt Amber (`light-led`).

### Tertiary
- **The Lamp Spectrum** (`lamp-brand` … `lamp-publisher`): one hue per employee in pipeline order: Brend xotirasi warm white, Analitik amber, Strateg orange, Kopirayter coral, Muharrir rose, Tarjimon magenta, Dizayner violet, Videograf indigo, Mijoz radar blue, SMM-menejer teal. Each lamp also carries a hot `core` (the filament and the glow's top) and a `deep` tone (where its light falls into the dark), defined in `src/components/lamp/lamps.ts`. Results on the two lightest lamps (Brend xotirasi, Analitik) print dark (#1c0f05); the rest print white.
- **Error Red** (`bad`): invalid field stroke, error filament, the wavy underline under a "neuro-word" the editor flagged.

### Neutral
- **Warm Room** (`stage`): on a computer screen (`.desk`) the stage is warm graphite `#171513`, and every surface is lighter than the room (glass `#1f1c19` → `#302c27`, the hub's glass too): light needs somewhere to land, and cards read as things, not holes. The LED well (`#0d0c0a`) is the darkest object; there is no pure black. Phones and the Mini App still use the black stage below.
- **True Black Stage** (phones and the Mini App, for now): the page ground in the dark world.
- **Dark Glass** (`glass`, `glass-2`, `glass-3`): three steps of near-black for idle tiles, raised surfaces (fields, posts, quiet buttons) and pressed or selected states.
- **Filament Hairline** (`hair`, `hair-2`): white at 7% and 13%, drawn as a 1px inset ring. This is the only border in the system.
- **Warm Ink** (`ink`, `ink-2`, `ink-3`): primary text, secondary text, placeholders and meta.
- **Light theme** (`light-stage`, `light-glass*`, `light-ink*`): white stage, warm paper glass, near-black ink. Used only where the host (Telegram) asks for light.

### Named Rules
**The Light Means Work Rule.** A lamp glows only while its employee works (`warming`) or holds a result (`on`, `you`). Idle is dark glass. Never light a tile, a card or a section for decoration, and never give a non-lamp surface a coloured glow. A lit lamp's light reaches the room only next to its own tile: on the wall above the panel for the top row, on the floor below for the bottom row. A standby ember in the filament means the employee is ready, not working; its light stays inside the filament slot.

**The No Halo Rule.** No black shadow, halo, plate or scrim at the text or the LED of a lit lamp. Contrast comes from where the text stands: under the bulb.

**The Owner's Hand Rule.** Lime marks owner actions only, with one enabled lime action per screen. Lime is never a lamp hue, never a chart colour, never decoration.

**The Measured Numbers Rule.** Amber LED dots print measured numbers and the channel's real facts only: never slogans, labels or invented figures. When there is nothing measured, the strip stays dark with its unlit grid showing.

**The Namuna Rule.** Any figure, post or result that is not from the owner's channel carries a dashed-outline "namuna" chip. The dashed stroke means sample and is used for nothing else.

## Typography

**Display Font:** Onest (with ui-sans-serif, system-ui)
**Body Font:** Onest
**Label/Mono Font:** none. Numbers use Onest with tabular figures, or the LED matrix.

**Character:** One calm, phone-legible family with full Uzbek Cyrillic (ў қ ғ ҳ). Hierarchy comes from size, weight and tight negative tracking at display sizes, never from a second face.

### Hierarchy
- **Display** (600, 40px mobile / 64px from 640px, line-height 1, -0.035em): the landing promise. Max 14ch, balanced.
- **Headline** (600, 32px / 44px, line-height 1.04, -0.03em): section heads. Max 16ch.
- **Title** (620, 21 to 22px, -0.02em): card and rule heads, the Studio's "Tasdiqlash" and "Bo'lim tayyor".
- **Lamp title** (640 lit, 450 idle, 15px, 13.5px on small lamps): the employee name. Weight carries state.
- **Body** (400, 16 to 17px, line-height 1.5): supporting copy, max 46ch. Posts set at 15px / 1.45 to match Telegram.
- **Label** (400 to 500, 12 to 13.5px): lamp job and state words, meta, chips, counters. Sentence case, no uppercase tracking.

### Named Rules
**The One Family Rule.** Onest only. No mono costume for numbers or code, no display serif, no system display face.

**The Weight Shows State Rule.** A lamp's title moves from 450 to 640 as the lamp lights. The layout does not change; only weight and light do.

**The No Eyebrows Rule.** No kickers, eyebrows or small uppercase labels above headings.

## Layout

A single 1180px container with 16px gutters on phones and 32px from 640px. The phone column is the design: the first viewport on a 390px phone stacks an LED strip, the 40px promise, the link field with its lime button at roughly y 300, then the top of the dark lamp panel as the fold teaser. From 1024px the hero column sits left and the full panel right (about 1 : 0.95).

The lamp panel is a 2-column grid with a 10px gap, ten lamps in pipeline order, two per row (five per row in the Studio from 640px). Sections are separated by 64px (mobile) or 96px (desktop) of vertical padding.

On phones the Studio is one column, max 760px, in three phases. The header holds the mark, a quiet "Pro" toggle and `uz · ru · en`.

1. **Start.** Ten dark lights, "Kanalingiz uchun bir haftalik postlar", one line, the link field with the lime "Boshlash", then "Kanalim hali bo‘sh" as a quiet secondary button that opens the description form (text, optional channel, up to 5 photos). Below, the 3 steps as three words and an icon each.
2. **Working.** A pill naming what is being read and an m:ss clock on the LED, "Bo‘lim ishlayapti", one line saying what is happening now, then the panel. Spektr plays once on the first run, from the pill. Lamps light only from real results.
3. **Ready.** The brand name, the ten-light strip with "N xodim ishladi" (tap it for the full panel; Pro shows the full panel), then the tabs Kanal, Postlar and Video. Kanal has the measured numbers on the LED, 3 findings, "Qanday yozasiz" in five lines and the week plan, where each row offers "Post tayyor" or "Postini yozish". Postlar has one "Post tili" switch, then each post as a Telegram bubble with its picture, "Eng yaxshi vaqt: day, time", Tahrirlash and Tasdiqlash, then Kanalga joylash. Video is a plain "in development" notice.

On desktop (1024px and wider) the Studio is the pro tool. A frosted-glass **hub** floats 12px in from the edge over the lamp stage. From the top it holds: the channel chip (letter, name, @channel, jonli / o‘qilmoqda / namuna; its menu has Yangi kanal, So‘nggi kanallar and Telegramda ochish), the sections Postlar · Kanal · Video, the Bo‘lim row with ten mini-lamps, the Asboblar tools for the post or channel in focus, and a pinned footer with Oddiy | Pro and the language. Drag it across the screen, or press its dock button, to move it to the other side; fold it to a 76px icon rail. Both choices are remembered. Each mini-lamp is a button with a tooltip ("Analitik · tayyor · 60 post o‘qildi") beside the glass. Behind every working lamp a spot of its own colour sits exactly under its mini-lamp, so the glass frosts real light; the first open of a session flashes the lamps once in pipeline order, and the SMM-menejer blinks twice whenever the owner approves or publishes. Above the canvas an LED sign prints the channel's measured numbers and runs under the glass to the window's edge. The canvas takes the width beside the hub (max 1280px): Postlar in Pro is queue · preview · inspector, Kanal in Pro is two columns. Desktop starts in Professional rejim.

**The Window Rule.** The hub's glass is never tinted by itself: it only shows the light of the lamps that work behind it, and the LED sign that runs under it. With nothing lit it stays dark and the material lives in its edge and sheen. The occlusion shadow belongs to the hub and to pop-overs (menus, tooltips, toasts) only.

**The Layout Never Moves Rule.** Every state a screen can reach is laid out before it is reached. Lamps, results, chips and counters have reserved space; switching state changes light, weight and opacity, never size or position (CLS 0).

## Elevation & Depth

Flat glass in the dark world. Depth comes from tone (stage → glass → glass-2 → glass-3), the 1px inset hairline, and emitted light. Lit lamps are the only things that throw light: a blurred spill of the lamp hue (opacity 0.42 dark, 0.30 light) beneath the tile, and an inner top highlight.

### Shadow Vocabulary
- **Hairline ring** (`box-shadow: inset 0 0 0 1px var(--hair)`): every tile, card, post, quiet button and segmented control.
- **Lamp spill** (`background: var(--hue); filter: blur(28px)`, inset 22% 8% -12% 8%): only under a working or finished lamp.
- **Lamp highlight** (`inset 0 1px 0 rgb(255 255 255 / 0.22)`): the glass lip of a lit lamp, only on top. On a computer there is no ring around the tile, so no grey frame circles a dark bottom (mini-lamps included).
- **Panel housing** (`#12110f`, radius 34, padding 12, `inset 0 1px 0 rgb(255 255 255 / .05), inset 0 0 0 1px rgb(255 255 255 / .035)`): the ten lamps as one recessed instrument on a computer (start, the run, Bo‘lim, the landing). No occlusion shadow.
- **Light-theme paper** (`0 1px 2px rgb(10 10 15 / 0.08), 0 8px 24px -12px rgb(10 10 15 / 0.18)`): Telegram posts and deck edges on the white stage only.

### Named Rules
**The Only Lamps Emit Rule.** Drop shadows and coloured glows belong to lit lamps (and the LED's own dot glow). Every other surface is flat with a hairline. The light on the wall and the floor around the housing, the spots under the hub's glass and a picture's light are the lamps' and the pictures' own light, not new sources.

## Shapes

Soft, generous and consistent. Every control is a pill (999px): buttons, the link field, chips, segmented controls, switches. Tiles round at 22px (lamp), 18px (small lamp), 28px (large lamp); cards at 20 to 24px. The LED strip is a tighter 12px. The Telegram post keeps Telegram's own bubble silhouette (20 20 20 6px), and the approval deck stacks two ghost edges of that bubble above the front post. Each lamp carries a 26×3px filament bar centred 11px from its top; the logo is the same lamp in miniature.

## Components

### Buttons
- **Shape:** pill (999px), 52px tall (50px when sitting inside the field), 22px side padding, 16px / 620.
- **Lime:** Owner Lime fill, Lime Ink text. The one owner decision on a screen.
- **Quiet:** glass-2 fill with hairline ring, ink text; hover steps to glass-3. Everything that is not the owner's decision, including icon-only edit buttons.
- **Hover / Press:** lime brightens 7% on hover; both scale to 0.96 on press over 120ms expo-out. Disabled: 45% opacity, no pointer.
- **Focus:** 2px lime outline at 3px offset (Deep Olive in light theme).

### Chips
- **Namuna:** 22px pill, 1px dashed ink-3 stroke, 12px / 500 ink-2 text, no fill. Sits next to whatever it qualifies. `?mock=1` runs the made-up bakery under a "Namuna…" banner with "Kanalimni tekshirish"; sample posts cannot be published.

### Cards / Containers
- **Corner Style:** 20 to 24px.
- **Background:** glass (dark) or light-glass, never tinted with a lamp hue.
- **Shadow Strategy:** hairline ring only (see Elevation & Depth).
- **Internal Padding:** 16 to 28px. The brand-voice card is five label/value lines on an 88px label column, no tag clouds.

### Inputs / Fields
- **Style:** 60px pill on glass-2, hairline-2 ring, 17px input text, leading link icon in ink-3, the lime submit nested inside the right end.
- **Focus:** the ring thickens to 1.5px lime.
- **Error:** the ring turns 1.5px Error Red with a 13px message beneath, in reserved space.

### Navigation
- **Header:** the Mark on the left; text links (14px / 500, ink-2 → ink on hover) and a quiet pill to Telegram on the right, all with 44px minimum targets.
- **Segmented control:** glass pill track with 3px padding; the active item is glass-3 with ink text, inactive ink-2. Never lime.
- **Switch:** 52×32 pill on glass-3; lime with a Lime Ink knob when on (an owner setting: Professional rejim).
- **Language:** a `uz · ru · en` segmented control in every header; the choice is remembered.
- **Tabs (Studio):** Kanal · Postlar · Video, a 2px ink underline on the active tab, sticky under the header.

### Lamp Tile (signature)
On a computer (`.desk`): tiles 160 px (104 on Start, where they never light), the words start at 52 px under the bulb, and the glow's radii are fixed in pixels (bulb `55% 45px`, light `120% 125px`), so a taller tile never stretches the hot zone under the text. Off: a hardware body and an ember of the lamp's colour in the filament (26×3 at 60%); a valid link arms the embers to hot filaments. In the sample the Dizayner says "namunada rasmsiz", not "tez orada".

One employee, one lamp. Dark glass, filament hairline, name at the bottom, result in the middle. States: `off` (dark, title 450 ink-2), `warming` (glass pulses 0.34 ↔ 0.70 every 2.4s, filament hot), `on` (full glow with flicker-in, result fades in 260ms later), `you` (lit, with a lime dot and "sizni kutmoqda": waiting for the owner), `error` (glow 16% desaturated, red filament). Results show the lamp's measured number in the LED matrix printed in the lamp's own ink, or a short phrase.

### LED Readout (signature)
A 5×7 dot-matrix in amber with a soft dot glow, unlit dots drawn as a 10% amber grid. The full-width strip sits on the stage colour with a 12px radius and hairline, stays dark until a real channel or number exists, and scrolls long text as a shop-sign running line (linear, about 0.55s per character, min 6s).

Lamp results come from real data only: Brend xotirasi «siz», tone · Analitik N post o‘qildi · Strateg N post rejada (n/m while planning) · Kopirayter N post yozildi · Muharrir robot iboralarsiz · Tarjimon N til · Dizayner n/m rasm · SMM-menejer "sizni kutmoqda" until a post is published. The ready screen shows the panel as a ten-light strip (`lamp--xs`, light only) with "7/8 xodim"; Professional rejim shows the full panel.

### Telegram Post
The owner's unit of work drawn close to Telegram's bubble: the picture full-bleed on top (while it is drawn, the slot is the Dizayner's lamp, warming), avatar and channel name tinted with the brand tone, 16px body, the time. Above it "Tavsiya: Dushanba, 07:30" (a suggestion, never a schedule) and "Tasdiqlandi" once approved; below it Tahrirlash (quiet) and Tasdiqlash (lime), then Kanalga joylash (lime) with one line about the bot.

### Motion
- **Lamp on:** 720ms, a flicker keyframe (0 → 0.75 → 0.18 → 0.9 → 0.5 → 1 by 46%), then steady. Spill fades in on expo-out.
- **Lamp off:** 1000ms ease-in (cubic-bezier(0.7, 0, 0.84, 0)). Cooling is slower than warming, like a real filament.
- **Tap 120ms, state 200ms, panel 360ms**, all expo-out (cubic-bezier(0.16, 1, 0.3, 1)).
- **Pipeline step:** each next lamp lights faster, 420ms down to 170ms.
- **Numbers** settle on a spring (stiffness 170, damping 18) with a slight overshoot; they never jump.
- **Spektr** (the signature moment, the first run of a page only): the LED sign with the owner's channel squeezes to a white-hot point (380ms), charges, drops onto the panel, splits into ten hue beams 22ms apart; each lamp flashes once as its beam lands (a power-on lamp test), then only working employees stay lit. About 1.9s, on WAAPI. Retries do not replay it.
- **Ready:** nothing moves except the "your turn" dot by Postlar in the hub (1 ↔ .45 over 4.8 s) and a Dizayner at work. The run's start (computer): Spektr, then every available lamp's light on the room flares for 0.9 s.
- **Reduced motion:** no flicker, no Spektr, no running line; lamps fade over 150ms and the state still reads.

## Do's and Don'ts

### Do:
- **Do** light a lamp only for `warming`, `on` or `you`, and leave every other tile dark glass with its filament hairline.
- **Do** keep the ten lamp hues in pipeline order (warm white → amber → orange → coral → rose → magenta → violet → indigo → blue → teal) so a full panel reads as one spectrum.
- **Do** give each screen exactly one enabled lime action, with Lime Ink (#0b0c02) text.
- **Do** print measured numbers in the amber LED matrix, and leave the strip dark with its unlit grid when nothing is measured yet.
- **Do** put a dashed "namuna" chip on every figure, post or result that is not from the owner's channel.
- **Do** draw edges as a 1px inset hairline (white at 7% / 13%) and round controls as pills.
- **Do** warm lamps up in 720ms with the flicker and cool them in 1000ms ease-in; press-scale controls to 0.96.
- **Do** reserve space for every state so nothing moves when a lamp lights (CLS 0), and honour `prefers-reduced-motion`.
- **Do** follow Telegram's theme inside `/tg`, using the light tokens on the white stage.

### Don't:
- **Don't** glow, tint or spill light on anything that is not a working or finished lamp.
- **Don't** use lime as a lamp hue, a chart colour, a link colour or decoration, and don't put two enabled lime actions on one screen.
- **Don't** use the LED amber for labels, slogans or invented numbers.
- **Don't** use a dashed outline for anything except "namuna" sample data.
- **Don't** add a second typeface, a monospace "tech" face, or kickers and eyebrows above headings.
- **Don't** resize, reflow or reorder the panel when state changes; change light and weight only.
- **Don't** add drop shadows to dark-theme surfaces; the light-theme paper shadow is for posts and deck edges only.
- **Don't** build feature grids of identical glowing cards.

## Known gaps

- `/studio` on the plain web is always dark; only `/tg` follows a light theme.
- The landing's example post has no picture yet; add one made by the picture pipeline once it runs on a real channel (with the owner's permission).
- Video is a notice only (needs API keys); Mijoz radar is dark ("tez orada").
