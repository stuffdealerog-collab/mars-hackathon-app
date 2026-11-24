# Pitch film storyboard: "Bir havola" (82 s, 16:9)

**For:** MARS AI Hackathon final, 25 Nov 2026.
**Format:** Russian voice-over, burned-in Uzbek subtitles, cinematic AI shots plus real screen recordings of the product. No AI presenter.
**Rules:** `docs/creative/playbook.md`. **Prompts and generation steps:** `docs/video/higgsfield-runbook.md`.

## The idea in one line
A baker closes his shop at midnight with tomorrow's post still unwritten. One link later, ten AI employees have done a week of marketing, and every number on screen is real.

**Why a baker.** Bread, steam and a clay tandir are textures AI renders well, they read as Tashkent instantly, and they give warm light that contrasts with the dark "AI OS" world. The baker's face is never shown in close-up (playbook rule 5): we see his hands, his back and his phone.

**Two worlds, joined by match cuts.**
- **Human world:** warm tungsten and tandir glow, earthy palette, film grain.
- **AI world:** near-black void, glossy orbs, lime light lines, dot-matrix numerals. Made from our Blender renders in `public/media/3d`.
- **The bridge:** the phone screen. It is a green screen in every AI shot, and the real product is composited into it.

---

## Beat sheet

**VO** is Russian, about 109 words, filling 65% of the runtime. **SUB** is Uzbek (Latin), burned in.

Sources:
- **AI-H#** / **AI-A#**: a Higgsfield shot from the runbook (human world / AI world)
- **3D**: an existing Blender render in `public/media/3d`
- **SR#**: a screen recording the team makes (list below)
- **TYPE**: a text or number card built in the editor

| # | Time | Beat | Picture (source) | VO (RU) | SUB (UZ) | Sound |
|---|---|---|---|---|---|---|
| 1 | 0:00–0:03 | **Hook** | Dark bakery counter. A phone lights up face-up with a green screen; composite **SR1** (empty Telegram post field, cursor blinking). A dot-matrix clock reads **23:47**. **AI-H1** | Почти полночь. Пекарня закрыта. | Yarim tun. Novvoyxona yopiq. | fridge hum, one notification ping |
| 2 | 0:03–0:07 | Hook | Over-shoulder, flour-dusted hands, thumb hovering over the phone (green, **SR1**). He types, then deletes. **AI-H2** | А пост на завтра… так и не написан. | Ertangi post esa… hali yozilmagan. | room tone, soft keyboard ticks |
| 3 | 0:07–0:10 | Hook → problem | The last embers in the tandir. The card **"Marketolog yoʻq."** fades up. **AI-H3** + TYPE | *(silence)* | *(the card is the subtitle)* | ember crackle, low drone starts |
| 4 | 0:10–0:13 | **Problem** | Shops closing for the night: a fabric shop switches off its lights. **AI-H4** | Мы спросили предпринимателей прямо здесь, на хакатоне. | Shu yerda, xakatonda tadbirkorlardan soʻradik. | drone builds |
| 5 | 0:13–0:16 | Problem | Quote card over **AI-H4** (dimmed 40%) | «Хочу один сервис, который поймёт, как я думаю». | «Qanday fikrlashimni tushunadigan bitta servis kerak.» — marketing direktori | low pulse |
| 6 | 0:16–0:19 | Problem | Quote card over **AI-H5** (bazaar stall closing) | «Не могу сделать видео товара без нейро-мусора». | «Mahsulot videosini neyro-axlatsiz qilib boʻlmayapti.» — SMM mutaxassis | pulse |
| 7 | 0:19–0:22 | Problem | Quote card over **AI-H6** (café closing) | «Локальной статистики нет — всё про Россию или США». | «Mahalliy statistika yoʻq — hammasi Rossiya yoki AQSh haqida.» — marketolog | pulse |
| 8 | 0:22–0:24 | Problem | Quote card over **AI-H3** (embers out) | «Самое сложное — найти клиентов». | «Eng qiyini — mijoz topish.» — asoschilar | riser starts |
| 9 | 0:24–0:25 | **Turn** | Black. 0.5 s of **silence**. | — | — | silence |
| 10 | 0:25–0:27 | Turn | Macro: a real `t.me/…` link is pasted into Mercat and Enter is pressed, with a speed ramp (**SR2**) | А если отдать всё это… одной ссылке? | Bularning hammasini… bitta havolaga topshirsak-chi? | click, then **the drop** |
| 11 | 0:27–0:31 | Turn | The lime core ignites and the camera pushes into the constellation. **3D** `constellation-push-in.mp4`, or **AI-A1** if it beats it. Title: **Bir havola — butun marketing boʻlimi.** | *(music)* | *(the title is the subtitle)* | impact, shimmer |
| 12 | 0:31–0:36 | **Product** | Analitik orb (3D PNG) flies in → **SR3**: channel audit with real numbers (subscribers, reach, best hours). A dot-matrix timer **00:00** starts in the corner and runs through to beat 17. | Аналитик читает канал: охваты, лучшие часы, что работает. | Analitik kanalni oʻqiydi: qamrov, eng yaxshi soatlar, nima ishlaydi. | UI ticks on every number |
| 13 | 0:36–0:40 | Product | **SR4**: the Brand DNA card fills in, then the Strateg week plan | Стратег собирает план на неделю. | Strateg bir haftalik reja tuzadi. | ticks |
| 14 | 0:40–0:46 | Product | **SR5**: Kopirayter's post appears; Muharrir strikes clichés in red; the human score climbs | Копирайтер пишет, а редактор вычёркивает нейро-слова. | Kopirayter yozadi, Muharrir neyro-soʻzlarni oʻchiradi. | pencil scratch per strike |
| 15 | 0:46–0:50 | Product | **SR6**: one post flips Lotin → Кирилл → RU → EN | Переводчик — латиница, кириллица, русский, английский. | Tarjimon: lotin, kirill, rus, ingliz. | 4 soft flips |
| 16 | 0:50–0:56 | Product | **SR7**: Videograf turns a product photo into a clip with Uzbek captions as an overlay. Cut on the clip playing full-screen for 1.5 s. Use **AI-A2** (orb macro) as the transition in. | Видеограф делает ролик из фото товара. | Videograf mahsulot rasmidan rolik yasaydi. | whoosh into the clip |
| 17 | 0:56–1:02 | Product | **SR8**: Mijoz radar lists 10 places → the approval node → "Eʼlon qilish" → the post appears in the Telegram channel. The timer stops at the **real** elapsed time. | Радар находит, где ваши клиенты. Публикуется — только после вашего «да». | Mijoz radar mijozlaringiz qayerdaligini topadi. Eʼlon — faqat sizning «ha»ingizdan keyin. | confirm chime |
| 18 | 1:02–1:07 | **Proof** | Morning: the shutter rises, steam comes off fresh non, his hands set the phone down; composite **SR9** (the published post, real). **AI-H7** | Одна ссылка. Около минуты. Неделя маркетинга — готова. | Bir havola. Taxminan bir daqiqa. Bir haftalik marketing tayyor. | morning street ambience |
| 19 | 1:07–1:12 | Proof | Number cards in TYPE, all real: the **measured** run time; **4** scripts; **10** employees; the editor's before/after human score on a real post. Add live `/stats` sign-ups **only if real on the day**. | *(music)* | *(the cards are the text)* | hits on each number |
| 20 | 1:12–1:22 | **CTA** | **3D** `constellation-loop.mp4` settles → the logo lockup **Mercat** → the bot QR (Telegram bot "Mercat", `@mercatai`, `t.me/mercatai`) plus `mercat-ai.vercel.app` → "MARS AI Hackathon · Techstars Startup Week Tashkent". Hold for 4 s. | Mercat. Свой отдел маркетинга — для каждого малого бизнеса. | Mercat. Har bir kichik biznesga — oʻz marketing boʻlimi. | the music resolves on a final hit |

**Runtime:** 82 s. If anything has to be cut, cut beat 13 first (the Strateg segment), then beat 15.

**Quotes.** The quotes are translated from the English paraphrases in `docs/marketing/pitch.md`. They are not verbatim, so mark them "(по смыслу)" in small type or get the people's OK on the exact wording. Show roles only, no names, unless people agreed.

**Uzbek subtitles.** They were written by a non-native writer, so **the founder must proofread every line.** Use the official `ʻ` in oʻ and gʻ: the editor font must have that glyph (Inter and Manrope do).

---

## Screen recordings (the team records these; they are the proof)

Settings:
- **Tool:** Screen Studio, or QuickTime plus manual zooms.
- **Resolution:** 2× (Retina), 60 fps, conformed to 24 fps in the edit.
- **Look:** dark mode, large clean cursor, slow deliberate clicks, notifications off.
- **Demo channel:** a real small-business channel whose owner agreed. Using a big brand's channel such as @safiabakery is a risk, because a chain is not "a small business without a marketer" and they haven't consented. **This is the founder's call.**

| # | What to record | Length raw → used |
|---|---|---|
| SR1 | A Telegram "new post" field with an empty draft and a blinking cursor, on the phone. Type "Ertaga…", then delete it. | 10 s → 4 s |
| SR2 | The Mercat input: paste the `t.me/<channel>` link, press Enter. Macro crop. | 5 s → 1.5 s |
| SR3 | The Analitik panel: subscribers, average views, reach rate, best hours, top posts | 15 s → 4 s |
| SR4 | The Brand DNA card, then the Strateg week plan | 20 s → 4 s |
| SR5 | The Kopirayter post, then the Muharrir diff with red strikes and the human score | 20 s → 6 s |
| SR6 | The Tarjimon toggle Lotin / Кирилл / RU / EN on one post | 10 s → 4 s |
| SR7 | The Videograf node: product photo → job → clip with the caption overlay (needs a real provider key, or the demo provider **labelled "namuna"**) | 30 s → 6 s |
| SR8 | Mijoz radar → the approval node → publish → the Telegram channel | 25 s → 6 s |
| SR9 | The published post in the Telegram app, scrolled once, on the phone | 6 s → 4 s |
| SR0 | **One uncut run of the whole flow with a visible stopwatch.** This is where the "≈ 1 minute" claim comes from. | full |

---

## Picture rules for the editor

- **Timeline:** 1920×1080, 24 fps, Rec.709. Grade the AI shots to match the screen recordings.
- **Screen recordings:** inside dark glass cards with a 1 px lime edge, a slight 3D tilt and a soft shadow. Mark one feature per shot with the lime outline.
- **Typography:** one sans family (Inter or Manrope). Dot-matrix only for numbers. Lime `#D7FF3A` only on the keyword. 3–6 words per card. 10% safe margins.
- **Grain:** the same grain and vignette over everything, applied last.
- **Audio:** music −14 LUFS integrated, true peak −1 dBTP. VO ducks the music by 8–12 dB.
- **Phone screens:** every AI shot with a phone has a pure-green screen. Track it, corner-pin the SR clip into it, and add a light screen reflection.

## Music

One track at 100–120 BPM, modern electronic or cinematic. It needs:
- a sparse intro (beats 1–8),
- a riser into **0:24**,
- 0.5 s of silence,
- the **drop on Enter at 0:25**,
- a driving middle (product),
- a lift at the proof,
- a final hit on the logo at 1:12.

Use royalty-free music only (YouTube Audio Library, Pixabay, Uppbeat, or Artlist if the team has a licence). Record which track was used and its licence.

## Open decisions (founder)

*Decided 24 Nov: no reference video. The look comes from our own look bible (runbook §3, LOOK-H / LOOK-A) and the Blender renders in `public/media/3d`. The edit rhythm comes from the music beats (rulebook §5).*

1. **The demo channel** for SR0–SR9: whose channel is it, and do we have their consent?
2. **The interview quotes:** show them as "(по смыслу)", or get the exact wording approved?
3. **How "Mercat" is pronounced** in the Russian VO: «Мерка́т» or «Ме́ркат»? TTS reads the Latin word unpredictably, so line V16 has to spell it the way you want it said.
4. **The VO voice:** a generated voice (runbook §6) or the founder's own Russian voice. A real voice is warmer and has zero AI risk.
