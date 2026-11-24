# Reels / TikTok scripts: "Bir havola — butun marketing bo'limi"

Three 9:16 scripts, 18-22 s each. Each one is cut in Uzbek (Latin) and in Russian. The pictures stay the same and only the VO and captions change.

**Production rules (all three)**
- **Hook in 0-2 s**: the first frame already shows something happening. No logo intro.
- **Generated clips carry no text.** Video models garble Uzbek. We add all captions in CapCut (or in our own Videograf export): Inter/Manrope Bold, white with an Ink `#13151C` 60% pill, or Ink on Paper `#FAF7F2`.
- **Screen recordings** of the real Studio (the node canvas) are better than generated "UI". Record them at 1080×1920 in mobile view, or crop the desktop recording to a 9:16 area around the canvas.
- **Generated clips**: Higgsfield **Seedance 2.5** (`mode: omni_reference`, `start_image` = the still from the prompt, 9:16, 720p, audio off). Alternative: **Kling 3.0** image-to-video. One clip costs about 70 credits on the subscription (2 are left now) or about $0.07-0.11/s on the API. Top up before the shoot.
- For a consistent heroine, first generate **one still** (Soul 2 or GPT Image 2.6, 9:16) and use it as `start_image` for every clip with her.
- Music: light lo-fi with a dutor or rubab motif, 95-105 BPM, cuts on the beat. Royalty-free only.
- VO: a real person's voice, not robotic TTS. If we have to use TTS, use ElevenLabs Multilingual and then read it back to check stress in Uzbek.

---

## Script 1 · "60 soniya" (the main ad for the killer feature), ~20 s

**Idea:** a cafe and ceramics shop owner drops in her Telegram channel link, a stopwatch starts, and the whole department works while she drinks her tea.

| Time | Shot | On-screen text (UZ / RU) | VO UZ | VO RU |
|---|---|---|---|---|
| 0.0-2.0 | **HOOK.** Macro: her thumb pastes a `t.me/…` link into the phone and taps the button. A stopwatch starts in the corner: 00:00 | **Bitta havola. 60 soniya.** / **Одна ссылка. 60 секунд.** | Bitta havola tashlayman — qarang, nima bo'ladi. | Кидаю одну ссылку. Смотрите, что будет. |
| 2.0-6.0 | Screen rec: the canvas comes alive and the "Brend xotirasi" node fills in with tone, colours and audience | Brend DNK — tayyor / ДНК бренда — готово | Avval kanalimni o'qib chiqdi: qanday gapiraman, kimga sotaman. | Сначала прочитал мой канал: как я пишу и кому продаю. |
| 6.0-10.0 | Screen rec: the Kopirayter and Tarjimon nodes. Post cards flip through four scripts: Lotin, Кирилл, Русский, English | 7 kunlik post × 4 til / Посты на неделю × 4 языка | Keyin bir haftalik post yozdi. Lotinchada ham, kirillchada ham, ruscha, inglizcha ham. | Потом посты на неделю. Латиница, кириллица, русский, английский. |
| 10.0-14.0 | Screen rec: the "Mijoz radar" node shows a list of 10 places (Telegram groups, marketplace categories, hashtags, local chats) and they light up one by one | Mijozlaringiz qayerda — 10 joy / Где ваши клиенты — 10 мест | Mijozlarim qaysi guruhlarda o'tirishini ham topdi. O'nta joy. | Нашёл десять мест, где сидят мои клиенты. |
| 14.0-18.0 | Screen rec: the Videograf node with a Reels script card. Then a cut to a generated **clip B** (her product in motion) | Reels ssenariysi — bor / Сценарий для Reels — есть | Reels ssenariysi ham tayyor. Bir daqiqaga ham yetmadi. | И сценарий для рилса. Меньше минуты. |
| 18.0-20.0 | **Clip C**: she leans back and sips from a blue piala. Stopwatch: 00:58. End card on Paper with the logo | **Bir havola — butun marketing bo'limi** / **Одна ссылка — целый отдел маркетинга** | Siz choy ichasiz — bo'lim ishlaydi. | Вы пьёте чай — отдел работает. |

**Higgsfield prompts**

Still (heroine), GPT Image 2.6 or Soul 2, 9:16:
```
Vertical 9:16 photo, realistic, a woman in her early 30s who owns a small ceramics and coffee shop in Tashkent, linen apron over a cream sweater, dark wavy hair with a blue patterned headscarf tied back, standing behind a wooden counter, warm morning window light, shelves with terracotta jugs and plates with blue eight-pointed star patterns, calm confident expression, shallow depth of field, no text, no logos
```

Clip A (0-2 s hook, used under the screen-rec overlay), Seedance 2.5, start_image = still, 3 s:
```
Close-up vertical shot: her hand holds a smartphone above the wooden counter, thumb pastes and taps once, the phone screen is a flat solid bright green for compositing, slight handheld movement, warm morning light, ceramic cups blurred in the background, realistic, no text
```
(Key out the green and put the real paste-the-link screen recording in its place.)

Clip B (product, 14-18 s), Seedance 2.5, start_image = a product photo (a piala with coffee or the shop's own product), 4 s:
```
Slow cinematic push-in on a handmade ceramic piala of coffee with blue eight-pointed star pattern on a wooden counter, thin steam rising, soft morning sunlight sweeping across, shallow depth of field, premium commercial look, product shape and pattern unchanged, no text, no watermark
```

Clip C (end, 18-20 s), Seedance 2.5, start_image = still, 3 s:
```
The same woman sits down on a stool behind the counter, takes a slow sip of tea from a blue patterned piala, looks into the camera and smiles slightly, relaxed, warm morning light, gentle push-in, realistic, no text
```

---

## Script 2 · "Neyro-so'zlar" (anti-AI-slop, the Muharrir), ~18 s

**Idea:** everyone has seen posts that a neural network obviously wrote. We show how our editor strikes out the clichés and the post starts to sound like the owner.

| Time | Shot | On-screen text (UZ / RU) | VO UZ | VO RU |
|---|---|---|---|---|
| 0.0-2.0 | **HOOK.** Full screen: a stock post with clichés. A red pencil strikes out the first phrase with a *scratch* sound | **Buni neyroset yozgani darrov bilinadi** / **Сразу видно: писала нейросеть** | "Sifat va ishonch kafolati." "Innovatsion yondashuv." Tanish-a? | «Уникальное предложение». «В современном мире». Знакомо? |
| 2.0-6.0 | **Clip A**: the Muharrir avatar (`agent-editor.png`) raises the red pencil and winks | Muharrir / Редактор | Bizda Muharrir bor. Bunaqa so'zni ko'rsa — o'chiradi. | У нас есть Редактор. Видит такие слова — вычёркивает. |
| 6.0-12.0 | Screen rec: a before/after split. Left: the cliché version. Right: the version in the owner's voice (see below), with the words appearing as if typed | Oldin → Keyin / Было → Стало | Endi post sizning ovozingizda. Xuddi o'zingiz yozgandek. | Теперь пост звучит как вы. Будто сами написали. |
| 12.0-16.0 | **Clip B**: a baker pulls bread from the tandoor, with steam. The "after" text sits on top as a caption | (the post text, see below) | Ertalab yettida tandirdan chiqqan non. To'qqizgacha kelsangiz — hali issiq. | Хлеб из тандыра в семь утра. Придёте до девяти — ещё горячий. |
| 16.0-18.0 | End card: Paper, logo, red pencil | **Neyro-so'zsiz marketing.** / **Маркетинг без нейрослов.** | Uslub AI. Neyro-so'zsiz. | Uslub AI. Без нейрослов. |

**"Before" text (on screen):**
- UZ: *"Sifat va ishonch kafolati! Innovatsion yondashuv bilan tayyorlangan mahsulotlarimiz sizni befarq qoldirmaydi. Eng yaxshi tanlov — biz bilan!"*
- RU: *"В современном мире важно выбирать лучшее! Наша уникальная продукция — это идеальное сочетание качества и традиций. Не упустите свой шанс!"*

**"After" text (owner's voice):**
- UZ: *"Ertalab 7 da tandirdan chiqdi. 9 gacha kelsangiz — hali issiq. Kunjutlisi tez tugaydi, oldindan yozib qo'ying."*
- RU: *"Достали из тандыра в 7 утра. Придёте до девяти — ещё горячий. С кунжутом разбирают первым, лучше напишите заранее."*

**Higgsfield prompts**

Clip A (avatar), Seedance 2.5 or Kling 3.0 image-to-video, start_image = `public/generated/agent-editor.png`, 1:1 to be letterboxed into 9:16 (or reframe to 9:16), 4 s:
```
The character raises his red pencil like a conductor's baton, makes one quick decisive strike through the air, then gives a small knowing wink to the camera, subtle head and shoulder motion, background stays static, keep the soft 3D animated style and colours exactly, no text
```

Clip B (tandoor), Seedance 2.5 text-to-video (or from a still), 9:16, 4 s:
```
Vertical 9:16, early morning in a small bakery courtyard in Samarkand, a baker in a white cap pulls round golden non bread with stamped patterns out of a clay tandoor oven using a long hook, steam rising into cold blue morning air mixed with warm fire glow, slow motion, documentary realism, shallow depth of field, no text, no logos
```

---

## Script 3 · "9 ta xodim" (meet the team), ~22 s

**Idea:** a provocative hook about "nine employees with no salary", then a fast run through all nine avatars, ending with the honest twist that their salary is one subscription.

| Time | Shot | On-screen text (UZ / RU) | VO UZ | VO RU |
|---|---|---|---|---|
| 0.0-2.0 | **HOOK.** **Clip A**: the owner looks into the camera with a sly smile, arms crossed | **9 ta xodim yolladim. Oylik bermayman.** / **Наняла 9 сотрудников. Зарплату не плачу.** | To'qqizta xodim yolladim. Hech biriga oylik bermayman. | Наняла девять сотрудников. Ни одному не плачу зарплату. |
| 2.0-14.0 | Fast cuts of the 9 avatars at about 1.3 s each, each with a micro-action (**clips B1-B9**). Lower third: role + what they do | (see the table below) | Biri kanalimni eslab qoladi. Biri reja tuzadi. Biri yozadi, biri tahrir qiladi, biri tarjima. Dizayner, videograf, SMM. Oxirgisi — mijozlarim qayerdaligini topadi. | Одна помнит мой канал. Один строит план. Пишет, редактирует, переводит. Дизайнер, видеограф, SMM. А последний ищет, где мои клиенты. |
| 14.0-19.0 | Screen rec: the link gets pasted and all 9 nodes on the canvas light up in a chain, with the avatars inside the nodes | Ishga tushirish — 1 havola / Запуск — 1 ссылка | Ishga tushirish uchun Telegram kanal havolasini berdim, xolos. | Чтобы запустить, я просто дала ссылку на Telegram-канал. |
| 19.0-22.0 | **Clip C**: the owner shrugs and smiles. End card | **Oyligi — bitta obuna. Uslub AI** / **Их зарплата — одна подписка. Uslub AI** | Ularning oyligi — bitta obuna. | Их зарплата — одна подписка. |

Lower thirds for the avatars:

| Avatar | UZ | RU |
|---|---|---|
| agent-brand | Brend xotirasi — kanalingizni eslab qoladi | Память бренда — помнит ваш стиль |
| agent-strategist | Strateg — haftalik reja | Стратег — план на неделю |
| agent-copywriter | Kopirayter — postlar | Копирайтер — посты |
| agent-editor | Muharrir — neyro-so'zlarni o'chiradi | Редактор — убирает нейрослова |
| agent-translator | Tarjimon — lotin, kirill, rus, ingliz | Переводчик — 4 языка и алфавита |
| agent-designer | Dizayner — bannerlar | Дизайнер — баннеры |
| agent-video | Videograf — Reels va TikTok | Видеограф — Reels и TikTok |
| agent-publisher | SMM-menejer — joylaydi | SMM-менеджер — публикует |
| agent-radar | Mijoz radar — mijozni topadi | Радар — находит клиентов |

**Higgsfield prompts**

Clip A / C (owner), Seedance 2.5, start_image = the heroine still from Script 1, 3 s each:
```
A: The woman stands behind her shop counter, arms crossed, looks straight into the camera with a sly half-smile and raises one eyebrow, slow push-in, warm morning light, realistic, no text
C: The same woman shrugs lightly and laughs, turning her head slightly toward the shelves, warm light, gentle handheld motion, realistic, no text
```

Clips B1-B9 (avatars), Seedance 2.5 or Kling 3.0 image-to-video, start_image = `public/generated/agent-<role>.png`, 3 s each (we use about 1.3 s of each). Shared prefix:
```
Keep the soft 3D animated style, character, colours and patterned background exactly; subtle natural motion only; background static; no text.
```
Per-role action (append to the prefix):
- brand: `She hugs the glowing notebook a little closer and nods warmly; a soft light pulses from the pages.`
- strategist: `He flips open the brass compass, glances at it, then looks up at the camera with a confident nod.`
- copywriter: `She taps the fountain pen against her cheek, gets an idea, eyes widen, quick smile.`
- editor: `He raises the red pencil and makes one quick strike through the air, then winks.`
- translator: `The two speech bubbles gently swap places beside her hand; she smiles and touches her earpiece.`
- designer: `He fans the colour swatches open with one flick and holds them toward the camera.`
- video: `She lifts the gimbal and points the phone at the camera; the small red recording light blinks.`
- publisher: `He taps the phone; the paper airplane lifts off and glides out of frame.`
- radar: `The radar rings sweep once and two dots light up; he looks up from the screen with a calm smile.`

---

## Posting notes
- Captions: UZ Latin for the main cut, RU as a separate video (not subtitles on top of the UZ cut). Cyrillic-Uzbek captions are optional for a third cut aimed at 35+.
- First line of the post: UZ "Kanalingiz havolasini izohga tashlang — 60 soniyada nima chiqishini ko'rsatamiz." / RU "Киньте ссылку на канал в комментарии — покажем, что выйдет за 60 секунд." This is also the traction mechanic for tomorrow (see pitch.md).
- Cover frame: the stopwatch at 00:58 with the canvas lit up.

---

## Run these from Claude chat (trial unlimited) — dark "AI OS" variant for Script 1

Higgsfield's 3-day Trial Unlimited covers **Seedance 2.0 / 2.5** (video) and GPT Image 2.6/2.5, Nano Banana 2/2.1/Pro, Soul 2, Seedream 5 Pro (images), but **only from Claude chat / Cowork / ChatGPT — Claude Code is refused** ("unlimited generations are not available" in Claude Code). So paste the requests below into a Claude chat with the Higgsfield connector, ask it to use `use_unlim: true`, then drop the MP4s into `public/generated/reels/` as `s1-<letter>.mp4`.

Settings for every clip: `model: seedance_2_5`, `aspect_ratio: 9:16`, `resolution: 720p`, `generate_audio: false`, duration 4-5 s, **no text in frame** (Uzbek captions are added later). Real-person clips A-C from Script 1 stay as written above; these add the dark UI-world shots.

- **s1-hook (orbs ignite, 0-2 s, use as the cut-in after the link paste)**, mode `t2v`, 4 s:
  `Vertical 9:16, pure black void with a faint dot-matrix grid, ten glossy glass orbs (amber, cobalt, violet, coral, lime, teal, magenta, red-orange, sky blue, green) ignite one after another from darkness, each blooming with a soft coloured glow, thin dotted light lines connect them into a constellation, a single neon-lime spark races along the lines, slow camera push-in, premium product-reveal look, no text, no letters, no UI labels`
- **s1-pulse (department working, 6-14 s background plate)**, mode `omni_reference`, `image_references`: `public/generated/hero-dark.png` (upload first), 5 s:
  `Keep this exact constellation of glossy orbs on black; light pulses travel along the dotted lines from the amber orb to all others, orbs gently breathe and glow brighter as each pulse arrives, subtle parallax drift, mesh-gradient haze of coral, magenta and cobalt shifting slowly in the background, no text`
- **s1-orb-close (any role close-up, 1-2 s inserts)**, mode `omni_reference`, `start_image`: `public/generated/orb-<role>.png`, 4 s:
  `The glossy orb slowly rotates, its internal colour gradient swirls like liquid glass, the specular highlight glides across the surface, the glow behind it pulses once, black background, no text`
- **s1-end (00:58 end card plate)**, mode `t2v`, 4 s:
  `Vertical 9:16, black background, ten small glossy coloured orbs settle into a calm ring formation and dim to a soft steady glow, one neon-lime light dot blinks in the centre, minimal, lots of empty space at the top third for an overlay title, no text`
