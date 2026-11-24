# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Mobile web first, plus a Telegram Mini App at `/tg` that runs inside Telegram's in-app browser and follows Telegram's theme.)

## Users

The primary user is the owner of a small business in Uzbekistan who has no marketer: a clothing shop, a bakery, a café, a beauty salon or a home kitchen. They run a Telegram channel and post from their phone between customers. They write in Uzbek (Latin) first, often in Russian too, and sometimes they need Cyrillic Uzbek or English. They live in Telegram all day.

Tomorrow (25 Nov 2026) the main visitor to the landing page is this owner on a phone. They arrive from a Reels/Shorts video, the QR code at the venue booth, or a Telegram link. The jury sees the same mobile experience.

Their job: "Get marketing done for my business without hiring anyone, and without it sounding like a robot wrote it."

## Product Purpose

Uslub AI is an AI marketing department. The owner pastes one Telegram channel link. Ten AI employees read the channel and return the following in about 60 seconds:

- Brand DNA: tone, siz/sen, emoji density, post length, CTA style.
- A real channel audit with numbers.
- A strategy and a week of posts in four scripts (UZ Latin, UZ Cyrillic, RU, EN), cleaned of AI clichés.
- A Reels script.
- About ten places where the business's customers are.

The owner only approves. Approved posts are published to their channel through the Telegram bot.

Success means the owner understands the offer in 5 seconds, pastes a link, sees their own business reflected back accurately, approves a post, publishes it, and comes back the next day.

## Positioning

"Bir havola — butun marketing bo'limi" (one link, a whole marketing department). Onboarding is a single link, not a 20-field form. The output is grounded in the owner's own channel and real numbers. Local by default: four scripts, the Uzbek market, Uzbek Telegram groups. A dedicated editor (Muharrir) removes "neyro-so'zlar" (AI clichés) so the copy sounds human.

## Operating Context

- Telegram is the operating system of Uzbek small business. Channels, groups and bots are where customers, posts and orders live.
- Owners decide on a phone, often in daylight inside a shop, in short bursts.
- The web Studio (`/studio`) shows the department at work. Its first screen is the "Topshiriq bering" delegate box plus the approval inbox. The node canvas ("Bo'limingiz qanday ishlaydi") is a second layer.
- Publishing:
  - Inside the Mini App, the UI sends `Authorization: tma <initData>`.
  - On the plain web, it deep-links to the bot.
- Publishing rules: routine posts may run on autopilot (beta; UI only today). Promos, prices, video and the first posts always need approval.

## Capabilities and Constraints

- Ten employees, each with one job:
  - Brend xotirasi
  - Analitik
  - Strateg
  - Kopirayter
  - Muharrir
  - Tarjimon
  - Dizayner
  - Videograf
  - SMM-menejer
  - Mijoz radar
- The routes under `/api/uslub/*` are the contract (`src/lib/uslub/contract.ts`). When a route is missing, the UI falls back to mock data. That fallback must be visibly labelled "namuna" (sample).
- Price hypothesis: 7 days free, then 149 000 so'm per month. It is a hypothesis, not a validated price.
- UI languages: Uzbek Latin first, then Russian and English.
- Performance:
  - Lighthouse at least 90 on mobile for the landing page.
  - No layout shift.
  - Respect `prefers-reduced-motion`.
- Dark stage for the landing page and the signature animation. The Studio and Mini App follow the phone or Telegram theme, light or dark.

## Brand Commitments

- Name: Uslub AI (working name).
- Copy must not sound machine-written. No "neuro-words" or AI clichés. The Muharrir filter is part of the brand promise, so the product's own copy must pass it too.
- The founder's references set the craft bar and may lend their material:
  - "AI OS" by Slava Komilov: luminous mesh-gradient widget cards on black, dot-matrix numerals, stacked card decks, a radial orb menu, a neon-lime pill.
  - A breathing-test app.
  - A smart-home app with glowing tiles.

  They are not a look to copy. The founder judged a literal copy of them "neuro-slop".

## Evidence on Hand

- Real quality runs on public channels: `docs/quality/safiabakery.md`, `korzinkauz.md`, `uzum_market.md`.
- Interview quotes in `docs/marketing/pitch.md`. Ask permission before showing names.
- Reels scripts in `docs/marketing/reels-scripts.md`.
- Generated agent avatars and orbs in `public/generated/`.
- No customers, testimonials or revenue yet. Never invent them. Traction numbers come only from the live `/stats` page.

## Product Principles

1. Show the owner's own business, not a demo of AI. Real channel, real posts, real numbers. Anything else is labelled "namuna".
2. Every screen answers "what do I do next?" with one obvious action.
3. The department works; the owner decides. Approval is the owner's only required job, and it is never hidden.
4. Human-sounding copy is the product. Interface copy follows the same rule.
5. Phone first, Telegram native.

## Accessibility & Inclusion

Uzbek Latin text uses o‘/g‘ (U+2018) and the apostrophe. Fonts must render these, Cyrillic, and Uzbek Cyrillic letters (ў қ ғ ҳ). Readable in daylight on a phone. Respect reduced motion.
