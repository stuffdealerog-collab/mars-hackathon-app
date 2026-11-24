# Pitch: Mercat (working name), 7 slides

MARS AI Hackathon · Techstars Startup Week Tashkent. Target: **about 3 min of talk plus a 60 s live demo**. One idea per slide and few words on screen. The speaker carries the rest.
Visuals: `public/generated/hero.png` (slides 1-2), `public/generated/og.png` (slide 7), the 9 avatars `public/generated/agent-*.png` (slides 2 and 4). Palette: Paper `#FAF7F2` background, Ink text, Lapis/Turquoise accents, Saffron for numbers.

> Labels: **[fact]** = from our interviews or a cited source · **[assumption]** = our estimate, shown on the slide in small grey text "taxmin / оценка" · **[target]** = a goal, not a result.

---

## Slide 1: Problem. Marketing in a small business is one tired person

**On screen:** four short quote cards from this week's interviews **[fact]**. They are lightly paraphrased. Ask permission before showing names.

- **Marketing director (hackathon organiser):** "I want one service that learns how I think, so I can delegate the routine."
- **SMM specialist:** "I can't find an app that makes a product video without AI slop."
- **Marketer:** "We lack local market statistics. Everything is about Russia or the US."
- **Founders:** "The hardest part is finding clients."

**Say (15 s):** "In a small business, marketing is one person, usually the owner. They write the posts, translate them into Russian, chase a designer, shoot Reels, and still don't know where their customers are. ChatGPT helps for five minutes, but it writes 'sifat va ishonch kafolati' and forgets who you are."

## Slide 2: Solution. A marketing department of AI employees

**On screen:** a 3×3 avatar grid with role names and one line: **"Siz vazifa berasiz. Bo'lim bajaradi."** (You give the task. The department does it.)

Brend xotirasi · Strateg · Kopirayter · Muharrir · Tarjimon · Dizayner · Videograf · SMM-menejer · Mijoz radar

**Say (20 s):** three things are different:
1. **Brand memory.** It learns your voice from your own channel and never starts from zero. This answers the director's quote.
2. **Muharrir, the editor.** One employee whose only job is to delete "neyro-so'zlar" (AI clichés). This answers the SMM quote.
3. **Local by default.** Uzbek in Latin and Cyrillic, plus Russian and English, and a radar that searches **Uzbek** Telegram groups, marketplaces and hashtags. This answers the marketer and the founders.

## Slide 3: Live demo (60 s, the main moment)

**On screen:** we switch to the Studio (the ComfyUI-style node canvas).

Run-of-show (rehearse it with a stopwatch):
1. **0-5 s.** Paste a **real Telegram channel link** from a business in the room. Agree on it beforehand and keep a backup channel ready.
2. **5-20 s.** The **Brend xotirasi** node fills in with tone, audience, and three "we say / we never say" examples.
3. **20-35 s.** **Strateg** and **Kopirayter** produce a week of posts. **Tarjimon** flips one post through Lotin / Кирилл / RU / EN with one click.
4. **35-45 s.** **Muharrir** shows a diff with the clichés struck through in red. This gets a laugh and builds trust.
5. **45-55 s.** **Mijoz radar** lists 10 places where the customers are, with a reason for each one.
6. **55-60 s.** **Videograf** shows the Reels script and a pre-rendered 9:16 clip from a product photo. A live render takes 1-3 min, so say it honestly: "this one is still rendering, here's the one from this morning."

Fallback: a screen recording of the same flow, recorded tonight, in case the network fails.

## Slide 4: Killer feature. "Bir havola — butun marketing bo'limi"

**On screen:** big type: **1 link → 60 seconds →** Brand DNA · 7 days of posts × 4 scripts · 10 places where your customers are · a Reels script. Add a stopwatch showing "00:58".

**Say (15 s):** "Onboarding isn't a 20-field form. You paste a link and the whole department starts working on your business. It's also our growth loop: someone drops a link in our comments, we reply with the result, and they have seen the value before they sign up."

## Slide 5: Market and business model

**On screen:** the plan table and two or three numbers, each labelled.

| Plan | For | Price per month **[assumption]** | Includes |
|---|---|---|---|
| Start | owner, 1 brand | 149 000 so'm (~$12) | 1 brand, unlimited posts, 4 videos |
| Biznes | shop or small chain | 449 000 so'm (~$35) | 3 brands, 20 videos, auto-posting |
| Agentlik | SMM agencies and freelancers | 1 490 000 so'm (~$115) | 15 client brands, white-label reports |

- **Unit economics [assumption]:** a "Bir havola" run without video costs cents in LLM calls. A 10 s video costs about $0.70-1.10 at API prices (see `video-api.md`), so video is sold as a quota. Target gross margin is above 70%.
- **Market [assumption, verify before showing]:** small businesses in Uzbekistan sell mainly through Telegram and Instagram, and most have no marketer. Show a bottom-up formula, *businesses with an active Telegram channel × conversion × ARPU*. If we have no source for the first number, show the formula marked "taxmin" and don't make up a figure.
- **Why agencies:** one SMM specialist runs 5-15 clients. We could cut their routine work by 5-10× **[assumption]**, and agencies pay faster than SMBs.

## Slide 6: Traction plan for tomorrow (shown live on `/stats`)

**On screen:** a 24-hour plan with **[target]** numbers and a QR code to the bot.

1. **Tonight:** run "Bir havola" on **30 Telegram channels** of Tashkent businesses (cafes, clothing, beauty) and DM each owner their ready-made week of posts. Goal: 10 replies.
2. **Morning:** post the Reels from `reels-scripts.md` (UZ and RU cuts) with the CTA "drop your channel link in the comments". Goal: 20 links.
3. **At the venue:** a bot QR code with source tracking (`/qr?src=booth1`), so every scan is attributed.
4. **Design partners:** the organiser's marketing director from slide 1, plus 2 agencies on a free month in exchange for feedback.
5. **On stage:** open the public `/stats` page (signups, active today, users by source). These are real numbers, not a slide.

Success by the final **[target]**: **50 links processed, 15 sign-ups, 3 people who say "I'd pay for this".**

## Slide 7: The ask

**On screen:** `og.png` as the background, three asks, and contacts plus the bot QR.

1. **Pilots:** introductions to 10 small businesses and 2-3 SMM agencies. We run "Bir havola" for them for free.
2. **Local data:** partners with market statistics (marketplaces, payment providers, Telegram analytics), so the radar and the strategist use Uzbek numbers instead of guesses.
3. **Resources:** video-API credits (Higgsfield or fal) and a go-to-market mentor for the SMB segment.

**Closing line:**
- UZ: "Har bir kichik biznesga — o'z marketing bo'limi. Bir havola orqali."
- RU: «Каждому малому бизнесу — свой отдел маркетинга. По одной ссылке.»
- EN: "Every small business gets its own marketing department, from one link."

---

### Pre-stage checklist
- Show quotes without names unless people agreed. "The organiser's marketing director" is enough.
- Every number without a source is labelled "taxmin / оценка".
- Run the demo channel once in the morning so the result is warm.
- Keep a pre-rendered video and a full screen recording of the flow ready in case the Wi-Fi drops.
