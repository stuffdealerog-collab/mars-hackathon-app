# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Mobile web first, 375 px wide inside Telegram's in-app browser, plus a Telegram Mini App at `/tg` that follows Telegram's light or dark theme. Desktop works but is not the first target.)

## Users

The owner of a small business in Uzbekistan with no marketer: a bakery, a clothing shop, a café, a beauty salon, a home kitchen. They run (or are about to start) a Telegram channel and post from a phone between customers, in short bursts, often in daylight.

On 25 Nov 2026 the first 2–3 real clients go through the product live, and the pitch film records the Studio screen.

Their job: "Get posts for my channel that sound like me and sell, without hiring anyone."

## Product Purpose

Mercat (formerly "Uslub AI"; code paths keep `uslub`) prepares a Telegram channel's posts for the owner. The path has three steps:

1. **Paste the channel link.** Or, if the channel is empty ("Kanalim hali bo‘sh"), describe the business in a few sentences and optionally add product photos.
2. **See what is ready.** The *Kanal* tab: three findings from the real channel numbers with what to fix, how the owner writes (about five plain lines), and the week's plan. The *Postlar* tab: posts written from the first plan slots, each with a picture in the channel's style, a uz/ru (and Cyrillic/en) text toggle, and editing.
3. **Approve, then publish.** "Tasdiqlash" saves the approval; "Kanalga joylash" opens the bot (web) or publishes directly (Mini App). Nothing is published without the owner.

The *Video* tab is a plain notice: video generation is in development and needs API keys.

Success: the owner understands the page in 5 seconds, pastes a link, recognises their own business in the findings and posts, approves one, and it appears in their channel.

## Positioning

"Kanalingizga postlarni Mercat yozadi. Siz faqat tasdiqlaysiz." A tool for a shop owner, not an AI showcase. One link instead of a form; output grounded in the owner's own channel and real numbers; Uzbek first.

## Operating Context

- Telegram is where Uzbek small business lives: channels, groups, bots, orders.
- The Studio (`/studio`) runs the whole path on one page. `?brand=<id>` reopens a brand and its posts (the bot links there). `?channel=` starts a run (the landing hands over the link). `?mode=fresh` opens the empty-channel form. `?mock=1` shows a labelled sample bakery.
- Publishing: inside the Mini App the UI sends `Authorization: tma <initData>`; on the web "Kanalga joylash" deep-links to `t.me/<bot>?start=publish_<postId>`. The bot must be an admin of the channel with the right to post.
- A full run takes 1–2 minutes (the weekly plan alone is ~45 s). The Studio shows an honest checklist with elapsed seconds, never a fake progress bar.

## Capabilities and Constraints

- The routes under `/api/uslub/*` are the contract (`src/lib/uslub/contract.ts`). Errors come back as `{ error, code }` with `error` already in the owner's language.
- **No silent sample data.** A failed call shows an owner-safe message with "Qayta urinish". Sample data exists only behind `?mock=1` and always sits under a "Namuna" banner.
- Price, shown as beta: 7 days free, then 149 000 so‘m a month. No billing exists yet.
- UI languages: Uzbek Latin first, Russian, English, switchable on every page (`uz · ru · en`).
- Pages: `/` landing, `/studio`, `/tg` Mini App, `/qr` (booth QR codes), `/stats` (counts only, no names, not indexed).

## Brand Commitments

- Name: Mercat.
- Copy must not sound machine-written: no AI clichés, no internal jargon ("Brend DNK", "neyro-so‘z", "inson bali", agent names). The owner reads shop words: kanal, post, narx, rasm, tasdiqlash.
- The look must not resemble an AI-tool template (no glow, gradients, orbs, portraits, dot-matrix numbers, neon). See DESIGN.md.

## Evidence on Hand

- Real quality runs on public channels: `docs/quality/*.md`.
- No customers, testimonials or revenue yet. Never invent them. The landing's example is a made-up bakery and says so.

## Product Principles

1. Show the owner's own business. Real channel, real posts, real numbers. Anything else is labelled "Namuna".
2. Every screen answers "what do I do next?" with one primary action.
3. Mercat prepares; the owner decides. Approval is never skipped or hidden.
4. Plain words. Interface copy follows the same no-cliché rule as the posts.
5. Phone first, Telegram native.

## Accessibility & Inclusion

Uzbek Latin uses ‘ (U+2018) in o‘/g‘ and ’ for the tutuq belgisi. Onest renders Latin, Cyrillic and Uzbek Cyrillic (ў қ ғ ҳ). Body text 16 px, targets at least 44 px, visible focus rings, readable in daylight, `prefers-reduced-motion` respected.
