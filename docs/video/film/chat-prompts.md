# Промпты для Claude-чата с Higgsfield — «Слишком хороший» (v2: через 3D-черновики)

**Где запускать:** только **claude.ai** (или Cowork) с подключённым коннектором Higgsfield. Из Claude Code бесплатный безлимит не работает: Higgsfield отказывает, и каждая генерация списывает кредиты, которых всего 2.
**Срок безлимита:** 3-дневный триал. По данным прошлой сессии он заканчивается **27.11 в 02:27 по Ташкенту** (26.11, 21:27 UTC). Точный срок чат покажет на шаге 0.
**Кадры:** номера совпадают с `shot-list.md`.
- **CLAY-3.3** — 3D-черновик кадра 3.3 (видео 5 с); **CLAY-3.3s / CLAY-3.3e** — его первый и последний стоп-кадры.
- **3.3s / 3.3e** — фотореалистичные ключевые кадры (начало и конец); **V3.3** — видео.
- **A-…** — листы ассетов.

**Основа:** правила PR #3 (`docs/video/ad/claude-chat-prompt.md` в ветке `origin/claude/mercat-animatic`): денежные правила, запрещённые платные инструменты, проверка дублей самим чатом, итоговый список выбранных дублей для сборки.

## Почему через 3D-черновики

Модель видео сама придумывает камеру и плывёт — отсюда «нейрослоп» и половина статичных планов. Поэтому у каждого кадра есть серый 3D-черновик: Blender-сцена из простых блоков с точным движением камеры и таймингом. Черновики собраны и отрендерены в Claude Code скриптом `docs/video/film/previs/build_film_previs.py`; лежат в `docs/video/film/previs/out/`.

Дальше для каждого кадра:
1. стоп-кадры черновика → **GPT Image 2.6** перерисовывает их в фотореалистичные **начало и конец** кадра (композиция и ракурс — из черновика, вид — из листов ассетов и блоков LOOK);
2. Seedance 2.5 получает **черновик как @Video 1** (путь камеры и тайминг) плюс начало и конец как start/end-кадры.

Камера двигается в 26 кадрах из 27 — по тому пути, который мы задали, а не который придумала модель. Статичным остался только макро с пиалой (4.6): там неподвижность — часть шутки.

## Порядок

| Шаг | Что | Задач | Когда |
|---|---|---|---|
| 0 | Правила сессии + проверка безлимита | — | сразу |
| 1 | Твои фото + таблица 3D-черновиков | — | после фото (`filming-checklist.md`, §2) |
| 2 | Листы корабля и скафандра | 4 картинки | пока снимаешь подъезд |
| 3 | Ключевые кадры (начало и конец) из черновиков: P1 → P2 → P3 | ≈ 80 картинок | по мере выбора |
| 4 | Видео-черновики по черновикам, 3 дубля, 720p | ≈ 80 видео | по мере выбора кадров |
| 5 | Финалы выбранных дублей, 1080p или 4k | ≈ 20 видео | ночью или утром |
| 6 | Голоса PromptX (+ агентства, если не записали живых) | 8–26 аудио | в любой момент |
| 7 | Вертикаль 9:16 для Reels | 7 кадров | после основных |
| 8 | Замена фона у живых кадров, снятых дома: тест на одном дубле, потом остальные. В конце — наезд на глаза 1.4 из твоего кадра 1.3 | 2 фона + до 5 видео + 1.4 | как только снят первый дубль 1.2; 1.4 — после 1.3 |

Приоритеты (как в `shot-list.md`):
- **P1** — без них фильма нет: 1.4 (делается в шаге 8.4, потому что ему нужен твой кадр 1.3), 3.3, 4.3, 4.5, 5.2, 5.3, 5.4;
- **P2:** 2.1, 2.3, 2.5, 3.1, 3.2, 3.7, 3.9, 4.1, 4.7, 5.1, 5.6 (и 4.6 без черновика);
- **P3:** 2.2, 2.4, 2.6, 2.7, 3.4, 3.5, 4.2, 5.5.

Живьём основатель снимает только кадры с лицом и репликой. Всё без лица — бег, ноги, дверь, руки, кнопки — генерируем здесь, по его фото рук, обуви и настоящего подъезда.

Каждое сообщение ниже копируй **целиком**, как есть.

---

## Шаг 0. Правила сессии (вставить первым)

```
Ты — мой ассистент по производству питч-фильма «Слишком хороший» для продукта Mercat. Работаешь через инструменты Higgsfield.

ДЕНЕЖНЫЕ ПРАВИЛА (не обсуждаются)
1. Я прямо прошу тратить мои безлимитные генерации пробного периода: добавляй use_unlim: true в КАЖДЫЙ вызов generate_image / generate_video / generate_audio, в том числе в каждую задачу батча. Никогда не пропускай его и не ставь false. Платных кредитов около 2 — никогда их не трать, ничего не покупай, не меняй тариф и триал.
2. Прямо сейчас, до любых генераций: вызови models_explore (action: get) для gpt_image_2_6, seedance_2_5, text2speech_v2 и nano_banana_pro (запасная). Покажи мне: unlim.available, когда истекает безлимит и строки «Unlim configs» — для gpt_image_2_6 какие quality и resolution покрыты, для видео максимальное разрешение и длительность, есть ли 1080p и 4k, сколько задач можно запускать параллельно. Оставайся внутри этих конфигураций; если я прошу больше — бери максимум из разрешённого и скажи мне.
3. Перед первым батчем каждой модели вызови инструмент оценки стоимости (estimate_image_cost / estimate_video_cost / estimate_audio_cost) с теми же параметрами и use_unlim: true. Если результат не 0 кредитов или пришёл любой отказ (unlim_not_supported, unlim_trial_expired, unlim_config_not_covered или что угодно, что списывает кредиты) — СТОП, напиши мне. Никогда не повторяй вызов за кредиты.
4. mode video_edit у seedance_2_5 — только если оценка стоимости с use_unlim показывает 0 (она считается по длине исходного видео); иначе СТОП.
4а. ПЛАТНОЕ — НИКОГДА не вызывай: scene_builder_3d_generate_video, scene_builder_3d_generate_angles, аренду Blender Studio, Editing Room, upscale_video, upscale_image, reframe, пресеты (execute_preset, Marketing Studio, Cinema Studio), модели музыки и голоса вне безлимитных конфигураций.
5. Никакого читаемого текста в генерациях: ни букв, ни цифр, ни логотипов, ни эмблем, ни интерфейсов. Флаги и табличка на пульте — чистые. Логотипы я ставлю в монтаже.
6. Лицо героя бери только с моих фото FACE-1…FACE-6. Не улучшай, не омолаживай, не сглаживай кожу.
7. 3D-черновики CLAY-… задают только композицию, ракурс, путь камеры и тайминг. Их серый вид, простые блоки и цветовая кодировка (оранжевый манекен, белые блоки) никогда не должны попасть в результат.
8. Используй живые схемы инструментов. Если поле называется не так, как у меня, — следуй схеме и скажи, что изменилось. Не выдумывай параметры.
9. Видео-черновики: seedance_2_5, 720p, 5 секунд, generate_audio: false. Финалы — только по моей команде «ФИНАЛ <id> <дубль>».
10. После каждого батча: jobs_wait, затем ОДИН show_generation_by_ids. Сначала сам проверь каждый дубль: совпадают ли ракурс и движение с черновиком, корабль и скафандр — с листами; нет ли букв, лишних лиц, морфинга, серого клея. Потом дай таблицу: id кадра | дубль | job id | ссылка | твоя рекомендация и почему. Жди мой выбор и ничего не перегенерируй без команды. Не больше 3 перегенераций на кадр без моего согласия.
11. Ссылки Higgsfield живут 7 дней. По команде «СПИСОК» выдай одним сообщением JSON всех выбранных мной результатов, чтобы Claude Code собрал фильм локально:
    {"shots": {"V3.3": "<url>", ...}, "stills": {"A-SHIP": "<url>", "3.3s": "<url>", ...}, "audio": {"T-PROMPTX_1": "<url>", ...}, "jobs": {"V3.3": "<job id>", ...}}

ТЕКСТОВЫЕ БЛОКИ. Когда в промпте стоит {ИМЯ}, подставляй текст блока дословно.

{RESTYLE} = Use reference image 1 ONLY for layout, camera angle, lens and the positions of objects and people; keep them exactly. Restyle it into a photoreal cinematic frame. Nothing of its grey clay look may remain: no plain grey blocks, no colour coding; the orange mannequin is a real person, the off-white block ship is the spacecraft from the ship sheet.

{FACE} = the man from reference photos FACE-1 to FACE-6: keep his exact face, age, skin texture, hairline, facial hair and proportions; natural skin with visible pores, no beautifying, no smoothing

{WARDROBE} = [заполним на шаге 1 по фото BODY-1]

{SHIP} = a compact single-seat spacecraft about the size of a small car: blunt rounded nose, one round glass bubble canopy on top, short swept-back wings, four folding landing legs, one wide engine nozzle at the back, off-white ceramic heat-shield tiles with soot and scorch marks, a matte graphite underbelly, a band of blue-and-white ikat pattern painted around the tail fin

{SUIT} = a worn, practical off-white spacesuit with soft heavy fabric folds, a graphite chest unit with a few plain toggle switches, graphite cuffs and boots, a small square patch of blue-and-white ikat fabric on the left shoulder, and a rounded helmet with a fully reflective gold visor lowered so that no face is ever visible

{MARS_FLAG_COLOUR} = dark navy blue

{LOOK-NIGHT} = shot on 35mm motion-picture film with a Kodak Vision3 500T look, practical light only: dim sodium-vapour and warm tungsten work lights, deep shadows falling to black, natural muted colour, fine film grain, soft halation

{LOOK-DAWN} = first light in the mountains: a low warm sun just above the ridge, cold blue shadows, drifting mist, natural muted colour, aerial documentary realism, 35mm film grain

{LOOK-SPACE} = real orbital photography: one hard sun, a pure black sky without stars or nebulae, the thin blue line of the atmosphere, true natural colours, no lens flares

{LOOK-MARS} = Mars as a real expedition photograph: hazy butterscotch sky, soft diffuse light, ochre and rust soil with dark basalt rocks, fine dust hanging in the air, muted desaturated palette, long-lens compression, 35mm film grain

{NO-TEXT} = no text, no letters, no numbers, no logos, no insignia, no watermark, no readable interface

{AVOID} = avoid: glossy CGI sheen, neon gradients, teal-and-orange colour grade, plastic or airbrushed skin, oversaturated colours, lens-flare spam, slow-motion glamour, extra limbs or fingers, morphing, melting edges, cuts or scene changes, grey clay look, text, letters, logos, watermarks, readable interface

Ответь «Готов» и отчётом по пункту 2.
```

**Если чат говорит, что безлимит недоступен** (`unlim.available: false`): ничего не генерируй. Проверь, что это claude.ai, а не Claude Code, и что коннектор Higgsfield подключён к тому же аккаунту. Запасной путь — веб-приложение Higgsfield, промпты те же.

---

## Шаг 1. Твои фото и таблица 3D-черновиков

**24.11 фото уже загружены из Claude Code.** Готовое сообщение со всеми id — в [`chat-start.md`](chat-start.md), сообщение 2. Его и вставляй вместо блока ниже.

Прикрепи в чат файлы FACE-1…FACE-6, BODY-1…BODY-3, WARD-1, HAND-1, HAND-2, SHOES-1, STAIR-1…STAIR-4 (`filming-checklist.md`, §2) и вставь сообщение ниже. **Проще:** положи их в `footage/refs` — Claude Code загрузит их в Higgsfield сам и даст таблицу media_id; тогда в пункте 1) вместо «Прикрепил» вставь эту таблицу.

```
1) Прикрепил референсы. Загрузи каждый файл в Higgsfield (media_upload → media_confirm; если вложение недоступно инструменту — открой виджет media_upload_widget) и запомни под теми же именами: FACE-1…FACE-6, BODY-1…BODY-3, WARD-1, HAND-1, HAND-2, SHOES-1, STAIR-1…STAIR-4.
Потом опиши мою одежду по BODY-1 и WARD-1 одной фразой по-английски (цвет, ткань, крой, что под ней, брюки, обувь) — это блок {WARDROBE}. Покажи его мне, я подтвержу или поправлю.

2) 3D-черновики уже загружены в мой Higgsfield из Claude Code. Запомни их под именами из таблицы ниже: CLAY-<кадр> — видео черновика, CLAY-<кадр>s и CLAY-<кадр>e — его первый и последний кадр. Проверь одним вызовом, что медиа видны по этим media_id. Если какие-то не видны — скажи, я прикреплю файлы.
<сюда вставь таблицу из docs/video/film/previs/higgsfield-media.md>
```

Если таблицы ещё нет или чат не видит медиа: прикрепи нужные файлы из `docs/video/film/previs/out/` прямо в чат. На каждый кадр три файла: `S3-3_clay.mp4`, `S3-3_start.jpg`, `S3-3_end.jpg`. Начни с кадров P1.

---

## Шаг 2. Листы корабля и скафандра (батч из 4)

```
Батч A — ассеты. Все картинки в этом фильме — модель gpt_image_2_6: aspect_ratio 16:9, quality — максимум, что покрывает безлимит (не оставляй low по умолчанию), resolution — максимум безлимита (2k или 4k), output_format png, use_unlim: true, по одному результату на задачу.

A-SHIP t1 и t2 — без референсов:
"Output: a design reference sheet for a film prop, 16:9, plain warm-grey studio background, soft even light. Three views of the same spacecraft side by side: side profile, three-quarter front view, top view. Subject: {SHIP}. Details: it looks hand-built in a workshop and well used — scuffs, rivets, soot around the nozzle, small dents; real materials, photographed like a physical model. Constraints: the design is identical in all three views; no labels, no callouts, no measurement lines; {NO-TEXT}."

A-SUIT t1 и t2 — image_references: BODY-1, BODY-2, BODY-3:
"Output: a costume reference sheet for a film, 16:9, plain warm-grey studio background, soft even light. Inputs: Images 1–3 = the man who wears the suit; use them only for his height and build. Subject: the same suit shown three times — front, back and side: {SUIT}. Details: realistic heavy fabric with folds, ochre dust on the knees and boots, photographed like a real film costume worn by a person. Constraints: his face must not appear anywhere; the suit is identical in all three views; no labels; {NO-TEXT}."
```

**Что выбирать.** Корабль — главный «герой-объект»: силуэт читается даже маленьким, три вида совпадают, надписей нет. У скафандра забрало полностью золотое, лица нет, на левом плече нашивка-икат.

---

## Шаг 3. Ключевые кадры из черновиков

Сначала вставь правило один раз:

```
Как делать ключевые кадры из черновиков. Модель gpt_image_2_6: aspect_ratio 16:9, quality — максимум, что покрывает безлимит (не low), resolution — максимум безлимита, output_format png, use_unlim: true.
Для каждого кадра <N> из списков ниже:

- <N>s (начало), 2 дубля. image_references = [CLAY-<N>s, затем референсы из строки «refs» по порядку]. Промпт:
"Output: one photoreal cinematic film still, 16:9.
Inputs: Image 1 = layout and camera reference (a grey clay previs). <затем каждый референс из «refs» с его ролью: ship sheet = the spacecraft design; costume sheet = the astronaut's suit; BODY photos = the man's build and clothes; FACE photos = the man's face; an approved frame = the look of this place>.
{RESTYLE}
Scene: <текст start>
Constraints: {NO-TEXT}"

- <N>e (конец), 1 дубль, только после того, как я выберу <N>s. image_references = [CLAY-<N>e, референсы из «refs», выбранный <N>s последним]. Промпт:
"Output: one photoreal cinematic film still, 16:9 — the last frame of the same shot.
Inputs: Image 1 = layout and camera reference (a grey clay previs) for this frame. <роли референсов из «refs»>. Last image = the approved first frame of this shot.
{RESTYLE}
Change only what the layout of Image 1 shows: <текст end>
Keep identical to the last image: the light, the colour grade, the materials, the clothes, the ship, the place.
Constraints: {NO-TEXT}"

Не больше 8 задач в одном generate_image_batch. Сначала все «s» списка, потом мой выбор, потом все «e».
Запасной вариант: если GPT Image 2.6 дважды подряд не держит ракурс черновика или лицо — сделай тот же промпт в nano_banana_pro (resolution 2k) и скажи мне.
```

### 3.1 — P1

```
Ключевые кадры P1.

3.3 | refs: A-SHIP
start: "A secret hangar carved into raw rock under the city, before dawn: rough rock walls, steel beams and hanging cables, a concrete floor with oil stains; a small spacecraft stands on a steel cradle under a heavy canvas tarp; a row of ten industrial pendant lamps with tungsten bulbs hangs from the ceiling, all switched off; at the far end the cave opens onto a wall of falling water that glows pale blue with daylight behind it, the only light. No people. {LOOK-NIGHT}."
end: "the ten pendant lamps are now switched on: warm tungsten light, round pools of light on the floor and on the tarp."

4.3 | refs: A-SHIP
start: "Dawn in the high mountains east of Tashkent: a tall, narrow waterfall falls from a dark grey cliff with patches of old snow; the low warm sun sits just above the ridge and backlights the spray; cold blue shadows, mist at the base, wet rocks, juniper shrubs. No aircraft. {LOOK-DAWN}."
end: "the same morning sky over a valley of snowy ridges; the spacecraft from the ship sheet, small, climbs away at the upper right; mist and spray still hang in the low sun."

4.5 | refs: A-SHIP
start: "Low over a turquoise mountain reservoir at sunrise: the spacecraft from the ship sheet flies fast two metres above the glassy water, seen from the side; snowy mountains behind. Sharp, no motion blur. {LOOK-DAWN}."
end: "the ship has gone out of frame; a long trail of spray settles back onto the water across the frame; snowy mountains behind."

5.2 | refs: A-SUIT, A-SHIP
start: "A wide rocky plain on Mars under a hazy butterscotch sky: in the right foreground a single flag on a thin metal pole with a horizontal top bar, plain {MARS_FLAG_COLOUR} fabric, hanging still; far in the background the small spacecraft from the ship sheet on four legs; the astronaut from the costume sheet walks in from the left with a rolled white flag on a pole under one arm and a round bundle in a patterned cloth in the other hand; dark rocks in the near foreground. {LOOK-MARS}."
end: "the astronaut has reached the flag in the right foreground."

5.3 | refs: A-SUIT
start: "Low angle against the hazy butterscotch Mars sky: two flags on thin metal poles with horizontal top bars stand side by side about a metre apart, one plain {MARS_FLAG_COLOUR}, one plain white, both blank fabric; the astronaut from the costume sheet stands beside the white one, gloved hands on its pole. {LOOK-MARS}."
end: "both poles are planted; the astronaut has let go and stepped back half a step."

5.4 | refs: A-SUIT
start: "A close-up on Mars: the gloved hands of the astronaut from the costume sheet hold a whole round Uzbek non bread — golden glossy crust, a thick rim, the flat centre stamped with small dots; ochre dust on the gloves; the plain soft behind. {LOOK-MARS}."
end: "the same gloved hands now hold the bread torn into two halves, a few crumbs in the air."
```

### 3.2 — P2

```
Ключевые кадры P2.

2.1 | refs: STAIR-1, STAIR-2, STAIR-3
start: "First-person view running down the stairs of an old Soviet-era panel apartment block in Tashkent at night, looking down the flight: worn concrete steps, a thin metal handrail with vertical bars, scuffed grey-green painted walls, one dim bare bulb above; the place looks exactly like the stairwell in the STAIR photos. A slight handheld tilt. {LOOK-NIGHT}."
end: "the camera has turned on the landing; at the bottom of the next flight stands the heavy metal door from the STAIR-3 photo."

2.3 | refs: STAIR-3, BODY-2, BODY-3
start: "From behind his left shoulder on the bottom landing of the same stairwell: the man wearing {WARDROBE} grips the handle of the heavy metal door from the STAIR-3 photo; his face is turned away from the camera. {LOOK-NIGHT}."
end: "he has pulled the door open toward himself; warm amber light pours out of the opening across the landing and his shoulder; beyond the door only glowing haze."

3.2 | refs: HAND-1, WARD-1, выбранный 3.1s
start: "A close-up of an old industrial knife switch on the rock wall of the same dark hangar as the last reference: a steel plate and a red-handled lever pointing up; the man's right hand from HAND-1, with the jacket sleeve from WARD-1, grips the handle. Cold blue light from the water wall. {LOOK-NIGHT}."
end: "the lever has been yanked all the way down; his hand still holds it."

3.9 | refs: HAND-2, WARD-1, выбранный 3.7s
start: "The same control panel as the last reference, closer: the square red push button under its clear flip-up cover; the man's right thumb from HAND-2 comes in from the bottom of the frame. No markings anywhere. {LOOK-NIGHT}."
end: "the clear cover is flipped up and his thumb presses the red button down."

2.5 | refs: BODY-1, BODY-2
start: "Inside a deep circular concrete shaft under the city, looking down the open well from just above and behind a man wearing {WARDROBE} as he runs down an old steel spiral staircase with a thin handrail; the spiral falls away into warm light far below; his face is not visible; sodium work lights, damp walls, cables. {LOOK-NIGHT}."
end: "he is further down the spiral; the camera has followed him down."

3.1 | refs: A-SHIP, BODY-2, выбранный 3.3s
start: "The same dark rock hangar as the last reference: the spacecraft under its tarp, the ten pendant lamps switched off, the glowing wall of water at the far end. On the left, the man wearing {WARDROBE}, seen from behind, walks in. {LOOK-NIGHT}."
end: "he is halfway to the covered spacecraft."

3.7 | refs: —
start: "A close-up of a worn spacecraft control panel in the dark: a row of small round warm indicator lights, a few plain toggle switches, one square red push button under a flip-up clear plastic safety cover, and above the lights a small blank brushed-metal plate held by four screws; scratched graphite metal, no screens, the plate stays blank. Shallow depth of field. {LOOK-NIGHT}."
end: "the same panel seen from a little further right, the red button and its cover closer."

4.1 | refs: A-SHIP, выбранный 3.3e
start: "The same lit hangar as the last reference: the spacecraft from the ship sheet on its steel cradle, the canvas tarp in a heap on the floor beside it, warm pools of lamp light. {LOOK-NIGHT}."
end: "the spacecraft hovers above the cradle with its landing legs folded up; dust and fine mist swirl under it."

4.7 | refs: A-SHIP
start: "High in the stratosphere: the spacecraft from the ship sheet, seen from behind and above, climbs steeply; below, the curve of the Earth with the brown mountains and deserts of Central Asia under thin clouds; the sky above fades to black. {LOOK-SPACE}."
end: "the spacecraft is a small point against the black sky; the thin blue line of the atmosphere runs along the bottom of the frame."

5.1 | refs: A-SHIP
start: "On Mars: the spacecraft from the ship sheet descends through a hazy butterscotch sky toward a rocky ochre plain, landing legs extended. {LOOK-MARS}."
end: "the spacecraft has landed on its four legs; a low cloud of dust billows out around it."

5.6 | refs: A-SUIT, выбранный 5.3e
start: "A medium close-up of the astronaut from the costume sheet on Mars, head and shoulders, the helmet turned slightly away; the fully reflective gold visor shows a curved reflection of the ochre plain; dust on the suit; the two flags soft in the background. {LOOK-MARS}."
end: "the helmet now faces the camera; the visor reflects the plain and the two flags."
```

**4.6 — пиала (без черновика, статичный макро), gpt_image_2_6 с теми же настройками, 2 дубля:**
```
"Output: one photoreal cinematic film still, 16:9. Scene: an extreme close-up of a small porcelain piala filled with green tea, the cup decorated with the classic Uzbek pattern of blue cotton bolls on white, standing on a worn wooden tapchan covered with a faded red cloth; in the soft-focus background, snowy mountains at sunrise. The tea surface is perfectly still. 100mm macro look, very shallow depth of field. {LOOK-DAWN}. {NO-TEXT}."
```

### 3.3 — P3

```
Ключевые кадры P3.

2.2 | refs: STAIR-1, STAIR-2, SHOES-1, BODY-2
start: "Low angle from the floor of a landing in the same old apartment stairwell as the STAIR photos: the man's legs in {WARDROBE} run down the flight toward the camera; only legs and shoes are in frame, no face. {LOOK-NIGHT}."
end: "his legs and the shoes from SHOES-1 pass right by the lens, caught mid-stride; the next flight behind."

2.6 | refs: HAND-1, WARD-1, выбранный 2.5s
start: "A close-up of the man's right hand from HAND-1, with the jacket sleeve from WARD-1, resting on the cold steel handrail of the deep shaft staircase from the last reference; damp metal, warm sodium light, shallow depth of field. {LOOK-NIGHT}."
end: "the hand has slid further down the rail; the camera has moved along with it."

2.4 | refs: BODY-1
start: "Looking straight up a deep circular concrete shaft: an old steel spiral staircase with a thin handrail winds up toward a small doorway far above, where a man stands as a dark silhouette against the dim warm light of a stairwell; sodium work lights on damp walls, cables. {LOOK-NIGHT}."
end: "the camera has risen up the shaft; the silhouette has stepped onto the first stairs."

2.7 | refs: BODY-1, BODY-2, выбранный 2.5s
start: "At the bottom of the same shaft: the man wearing {WARDROBE} comes down the last steel steps close to the camera, his face turned away; warm light; a rough rock tunnel opens ahead. {LOOK-NIGHT}."
end: "the man, seen from behind, walks away into the rock tunnel; warm light behind him outlines his shoulders."

3.4 | refs: A-SHIP, BODY-2, выбранный 3.3e
start: "The same lit hangar: the man wearing {WARDROBE} stands beside the covered spacecraft gripping the edge of the canvas tarp, seen at a low angle from the front quarter. {LOOK-NIGHT}."
end: "the tarp lies on the floor and the whole spacecraft from the ship sheet is revealed; the man stands beside it."

3.5 | refs: FACE-1, FACE-2, FACE-3, FACE-5, FACE-6, A-SHIP
start: "A close-up from outside the spacecraft from the ship sheet: through its curved glass bubble canopy the man sits in the pilot seat wearing a black headset with a boom microphone and {WARDROBE}; he looks ahead past the camera, calm and focused; warm lamp light reflects in streaks on the glass. {FACE}. {LOOK-NIGHT}."
end: "the same, closer to the canopy."

4.2 | refs: A-SHIP, выбранный 3.3e
start: "From behind, close: the spacecraft from the ship sheet flies away from the camera down the same lit rock cave toward the wall of falling water glowing pale blue at the end; the pendant lamps pass overhead. Sharp, no motion blur. {LOOK-NIGHT}."
end: "the glowing wall of falling water fills the frame; the ship has just plunged through it."

5.5 | refs: выбранный 5.3e
start: "Ground level on Mars: at the foot of the two flag poles from the reference lie the two halves of a round non bread, one half at each pole, fine dust on the crust. {LOOK-MARS}."
end: "both flags, navy and white, stand against the hazy sky; the bread halves are small at their feet."
```

**Проверка каждого кадра (30 секунд):**
- ракурс и положение объектов — как на стоп-кадре черновика;
- от серого клея ничего не осталось;
- корабль совпадает с листом;
- лица нет (кроме 3.5), нигде нет букв;
- руки — по пять пальцев;
- картинка не глянцевая и не «пластиковая».

---

## Шаг 4. Видео по черновикам (Seedance 2.5)

Сначала вставь правило один раз:

```
Как делать видео. Модель seedance_2_5, mode: omni_reference, aspect_ratio 16:9, duration 5, resolution 720p, generate_audio: false, use_unlim: true. Каждый кадр — 3 одинаковых задачи (t1, t2, t3) в одном generate_video_batch, не больше 8–12 задач в батче. Перед первым батчем — оценка стоимости, должно быть 0.
Для кадра <N>: video_references = [CLAY-<N>], start_image = выбранный <N>s, end_image = выбранный <N>e, image_references = референсы из строки «refs».
Промпт собирай так:
"@Video 1 = camera path, timing and blocking: follow it exactly; its grey clay look must never appear. The first and the last frame are given.
SCENE: <scene>.
ACTION: <action>.
CAMERA: exactly as in @Video 1. Continuous shot, no cuts.
LIGHT & GRADE: <look>.
PHYSICS: <physics>.
{AVOID}"
```

### 4.1 — P1

```
Видео P1.

V3.3 | refs: A-SHIP | look: {LOOK-NIGHT}
scene: the secret rock hangar, the spacecraft under its tarp, the glowing wall of water at the far end
action: 0–0.5s still; 0.5–4.5s the ten pendant lamps switch on one after another from the nearest to the farthest, each with a short tungsten flicker before it holds, each new pool of warm light landing on the floor; 4.5–5s all ten burn steadily
physics: the lamps hang still; the cave and the covered spacecraft are rigid and do not change

V4.3 | refs: A-SHIP | look: {LOOK-DAWN}
scene: the tall waterfall on the cliff at dawn
action: 0–2s the water falls calmly; 2–2.5s the water curtain bulges outward; 2.5–3.5s the spacecraft bursts out through the falling water from the hidden cave, spray exploding outward and glowing gold against the low sun; 3.5–5s it climbs away over the valley
physics: the water falls with real weight and breaks into drops and mist; the spacecraft is a rigid body and keeps its design

V4.5 | refs: A-SHIP | look: {LOOK-DAWN}
scene: low over the turquoise mountain reservoir at sunrise
action: 0–1.5s the spacecraft streaks forward just above the water alongside the camera; 1.5–2s a thin white cone of condensation snaps on around its body as it breaks the sound barrier; 2–3.5s it pulls ahead and out of frame to the right, tearing a long trail of spray off the water; 3.5–5s the spray falls back
physics: the vapour cone is thin and short-lived; the spray falls back as real water; the spacecraft is rigid and keeps its design

V5.2 | refs: A-SUIT, A-SHIP | look: {LOOK-MARS}
scene: the wide Mars plain with the navy flag in the right foreground and the spacecraft far behind
action: the astronaut walks slowly toward the flag with a heavy low-gravity gait, carrying the rolled flag and the bundle; fine dust lifts from each step and drifts
physics: the standing flag hangs still; the gold visor stays fully reflective, no face; the suit keeps its colours and the shoulder patch; the spacecraft in the background does not move

V5.3 | refs: A-SUIT | look: {LOOK-MARS}
scene: the two flags against the Mars sky, low angle
action: 0–2s the astronaut drives the white flag's pole into the soil with two short shoves, a puff of dust at its base; 2–5s he lets go and steps back; both flags stay still
physics: the poles are rigid and straight; the flags are blank fabric and barely move; the visor stays gold, no face

V5.4 | refs: A-SUIT | look: {LOOK-MARS}
scene: the close-up of the gloved hands holding the round non bread
action: 0–1s still; 1–2.5s the gloved hands slowly tear the bread in two; 2.5–5s crumbs and flakes of crust drift down slowly in the low gravity
physics: exactly two hands; the gloves keep their shape and colour; the bread tears like real bread with a soft white inside; crumbs fall slowly but always downward
```

### 4.2 — P2

```
Видео P2.

V2.1 | refs: STAIR-1 | look: {LOOK-NIGHT}
scene: the old apartment stairwell, first-person
action: running down the stairs with a natural handheld bob, turning on the landing toward the metal door below
physics: the stairs, walls and handrail are rigid; no warping of the bars

V2.3 | refs: STAIR-3, BODY-2 | look: {LOOK-NIGHT}
scene: the bottom landing and the heavy metal door
action: 0–1.5s he grips the handle; 1.5–3s he pulls the heavy door open toward himself; 3–5s warm light pours out across him and the landing
physics: the door is rigid and swings on its hinges; he never shows his face; clothes stay the same

V3.2 | refs: HAND-1 | look: {LOOK-NIGHT}
scene: the knife switch on the hangar wall
action: 0–2s still; 2–2.5s the hand yanks the lever down hard; 2.5–5s the plate shudders, a little dust falls
physics: the lever pivots on its hinge; exactly one hand with five fingers; the hand keeps its shape

V3.9 | refs: HAND-2 | look: {LOOK-NIGHT}
scene: the console close-up, the red button under its clear cover
action: 0–1.2s the thumb comes in; 1.2–1.8s it flips the clear cover up; 2.3–2.6s it presses the red button down, the button starts to glow
physics: one hand, five fingers; the panel does not move; no markings appear; the metal plate stays blank

V2.5 | refs: BODY-2 | look: {LOOK-NIGHT}
scene: the open well of the spiral staircase shaft, seen from above and behind the running man
action: he runs down the spiral stairs, circling downward toward the warm light below
physics: the staircase is rigid; he keeps the same clothes; his face is never visible

V3.1 | refs: A-SHIP, BODY-2 | look: {LOOK-NIGHT}
scene: the dark rock hangar with the covered spacecraft
action: the man walks forward into the cave, away from the camera, toward the covered ship
physics: the lamps stay off; the cave and the spacecraft are rigid; he never turns his face to the camera

V3.7 | refs: — | look: {LOOK-NIGHT}
scene: the console close-up
action: 0–2s the small indicator lights flicker once in sequence; 2–5s the red button begins to glow softly under its clear cover
physics: no hands; no screens appear; the metal plate stays blank; no markings appear

V4.1 | refs: A-SHIP | look: {LOOK-NIGHT}
scene: the lit hangar, the spacecraft on its cradle
action: 0–1.5s still; 1.5–3s the engine nozzle glows and dust and fine mist begin to swirl under the ship; 3–5s the spacecraft lifts off the cradle and folds its landing legs up; the lamps sway
physics: the spacecraft is rigid and keeps its design; the cradle stays on the floor

V4.7 | refs: A-SHIP | look: {LOOK-SPACE}
scene: the spacecraft high in the stratosphere above the curve of the Earth
action: the spacecraft climbs steeply away from the camera and shrinks to a bright point
physics: the spacecraft is rigid; no stars or nebulae appear

V5.1 | refs: A-SHIP | look: {LOOK-MARS}
scene: the spacecraft descending over the Mars plain
action: 0–4s it descends slowly and touches down on its four legs; 4–5s a low cloud of dust billows out sideways and drifts slowly
physics: the spacecraft is rigid and keeps its design; the dust moves slowly and heavily

V5.6 | refs: A-SUIT | look: {LOOK-MARS}
scene: the astronaut in medium close-up, two flags behind
action: the astronaut slowly turns the helmet toward the camera; the reflections slide across the gold visor
physics: the visor stays fully reflective gold and no face is ever visible; the suit keeps its colours and patch
```

**V4.6 — пиала, без черновика:** start_image = выбранный 4.6, без end_image и video_references.
```
"SCENE: the piala of tea on the tapchan at sunrise. ACTION: 0–1.5s still; 1.5–3.5s the tea surface trembles in concentric rings; 3.5–5s a single drop jumps up and falls back. CAMERA: locked-off macro, perfectly still. Continuous shot. OPTICS: 100mm macro. LIGHT & GRADE: {LOOK-DAWN} PHYSICS: the cup does not move or change its pattern; the liquid behaves like real tea. {AVOID}"
```

### 4.3 — P3

```
Видео P3.

V2.2 | refs: SHOES-1, BODY-2 | look: {LOOK-NIGHT}
scene: the stairwell landing, camera low on the floor
action: his feet run down the flight and past the lens
physics: two legs, two shoes that match SHOES-1; no face; the stairs are rigid

V2.6 | refs: HAND-1 | look: {LOOK-NIGHT}
scene: his hand on the handrail of the shaft staircase
action: the hand slides down the cold rail
physics: five fingers; the hand keeps its shape; the rail is rigid

V2.4 | refs: BODY-1 | look: {LOOK-NIGHT}
scene: looking up the spiral staircase shaft toward the far doorway
action: the silhouette in the doorway steps onto the first stairs and starts down
physics: the staircase is rigid; the figure stays a dark silhouette

V2.7 | refs: BODY-2 | look: {LOOK-NIGHT}
scene: the foot of the shaft and the rock tunnel
action: he steps off the last stair and walks into the tunnel, away from the camera
physics: he never turns his face to the camera; the clothes stay the same

V3.4 | refs: A-SHIP, BODY-2 | look: {LOOK-NIGHT}
scene: the lit hangar, the man beside the covered spacecraft
action: 0–1s still; 1–3s he pulls the canvas tarp off the spacecraft in one strong pull; 3–5s the heavy canvas slides off and falls to the floor
physics: the canvas folds like heavy fabric; the spacecraft underneath is rigid and matches the ship sheet; he never shows his face

V3.5 | refs: FACE-1, FACE-2, FACE-3, A-SHIP | look: {LOOK-NIGHT}
scene: the pilot behind the canopy glass
action: minimal motion: he blinks and gives one small determined nod; the reflections slide slowly across the glass
physics: keep his exact face from the first frame; natural skin texture

V4.2 | refs: A-SHIP | look: {LOOK-NIGHT}
scene: behind the spacecraft flying down the lit cave
action: the spacecraft accelerates down the cave and plunges into the glowing wall of falling water at the far end
physics: the spacecraft is rigid; the lamps overhead stay in place; real water

V5.5 | refs: A-SUIT | look: {LOOK-MARS}
scene: the two bread halves at the foot of the two flag poles
action: a light gust lifts a little dust that settles slowly over the bread
physics: the bread and the poles do not move; the flags are blank fabric
```

⚠️ **3.5 — единственный сгенерированный кадр с лицом.** Если модель откажется работать с реальным лицом или лицо уплывёт — кадр вырезаем, монтаж от этого не страдает.

### Как выбирать дубли

- Досматривай до конца: дефекты обычно лезут на 3–5 секунде.
- Сравни движение камеры с черновиком: путь, скорость, где замедляется.
- Отмечай **чистые 1.5–3 с**, остальное не нужно.
- Если ни один из 3 дублей не годится — меняем **одну** переменную: формулировку ACTION, ключевой кадр начала или конца. Ещё 3 дубля.
- Если модель упорно игнорирует камеру черновика, убери end_image и оставь только start_image + @Video 1.
- Примерно после 8 промахов кадр меняем на запасной вариант:

| Кадр | Если не выходит |
|---|---|
| V3.3 лампы | Статика 3.3s и 3.3e, лампы зажигаем в монтаже масками по одной: 10 вспышек, и это даже точнее |
| V4.3 водопад | Без корабля: только вспучивание и взрыв воды, корабль улетает за кадр звуком; следом V4.5 показывает его над водой |
| V4.5 конус | Корабль просто проносится; конус и хлопок даём звуком + тряска кадра в монтаже |
| V5.2 / V5.3 флаги | Ключевой кадр с медленным цифровым наездом в монтаже |
| V5.4 лепёшка | Ключевой кадр 5.4e (лепёшка уже разломлена) с медленным наездом в монтаже; хруст — звуком |
| V3.2 / V3.9 / V2.6 руки | Взять самые чистые 0.5–0.7 с; если пальцы плывут — кадр убрать, а «клац» / «тук» оставить звуком на соседнем кадре (3.1 / 3.8) |
| V2.1 / V2.2 подъезд | Если не похоже на твой подъезд — добавить в refs ещё фото STAIR и перегенерировать начало; запасной вариант — склейка с 1.4 сразу на 2.3 |
| V1.4 глаза | Если лицо поплыло — цифровой наезд в монтаже на последние 2 с дубля 1.3 (4K даёт кроп примерно до 2.5×: не до одних глаз, но лицо 100% твоё); «Бежим» тот же |

---

## Шаг 5. Финалы

```
ФИНАЛ V4.3 t2
Перезапусти этот дубль тем же промптом, с теми же video_references, start/end-кадрами и референсами, в максимальном разрешении безлимита (1080p или 4k, если доступен), duration 5, generate_audio: false, use_unlim: true. Перед вызовом — оценка стоимости, должно быть 0.
```

Можно сразу списком: `ФИНАЛ V3.3 t1, V4.3 t2, V4.5 t3, …`. Учти, что финал — новая генерация: он может отличаться от черновика. Если финал хуже, оставляем черновик 720p и в монтаже поднимаем до 1080p с зерном.

---

## Шаг 6. Голоса (text2speech_v2)

```
Голоса. Модель text2speech_v2, variant: elevenlabs, voice_type: preset, use_unlim: true. Сначала вызови list_voices и предложи мне 3 голоса, которые хорошо говорят по-русски (2 мужских, 1 женский), с превью. Из прошлой сессии известны: Alexey 7c2133e5-68ab-511f-9aed-9a67664382b1, Vlad e5666b9c-99a2-4fac-8b4e-abee078b186d, Elena ca83ca7f-c186-493d-bd69-0d765fa861b2 — проверь, что они живы.
Перед первым батчем — оценка стоимости, должно быть 0.

Батч T-PROMPTX: голос Elena (или другой женский, если Elena нет), по 2 дубля на строку:
1. [calm, precise] Бортовой PromptX. Куда летим?
2. [calm, slightly dry] Уточните промпт.
3. [calm, precise] Подтвердите запуск.
4. [calm, warm] Цель достигнута. Следующий промпт?

Батч T-AGENCY (голоса агентств в погоне — только если не записали живых друзей): каждую строку всеми тремя голосами:
1. [whispering, urgent] Он где-то здесь…
2. [whispering] Скиньте бриф…
3. [whispering, friendly] Давайте созвонимся…
4. [whispering] Нам нужен контент-план…
5. [whispering] Byudjet qancha?..
6. [whispering, hopeful] Охваты же падают…

Батч T-TAG (голос из-за двери в теге — тоже только если нет живого помощника): мужской голос, 2 дубля:
1. [polite, slightly out of breath] Здравствуйте… Мы из агентства. А можно сразу на всех наших клиентов?
```

Живые голоса друзей лучше TTS: агентства — люди, и шутка держится на живой интонации. TTS — запасной вариант. Реплики PromptX утверждены; если спонсор попросит другую формулировку — пришли, перепишу.

---

## Шаг 7. Вертикаль 9:16 для Reels

Для Reels вертикаль нужна у 7 кадров: **2.5, 3.3, 4.3, 4.5, 4.6, 5.3, 5.4**.
- **Если безлимит даёт 4k:** финалы делаем в 16:9 4k и вырезаем вертикаль 1215×2160 в монтаже. Этот шаг не нужен.
- **Если нет:** я отрендерю вертикальные 3D-черновики этих кадров, с камерой, выстроенной под 9:16, — скажи. Дальше те же шаги 3–4 с aspect_ratio 9:16; ключевой кадр 16:9 можно дать последним референсом для единого вида.

---

## Шаг 8. Замена фона у живых кадров, снятых дома

Живые кадры с лицом — 1.2 и 1.3 (подъезд), 3.6 и 3.8 (кабина), сцена 6 (белое) — ты снимаешь дома, а фон за тобой меняем. Крупные глаза 1.4 генерируем из твоего же кадра 1.3 (8.4).

**Сцена 6 снята 24.11 у белой простыни, вокруг видна комната** (кондиционер, тумбочка, цветок, кровать). Для белого пространства нужен фон BG-WHITE (ниже). Надёжнее путь B: вырезать тебя в монтаже и поставить на BG-WHITE — чёрная одежда на белом вырезается чисто.

**Риск:** у говорящих крупных планов Seedance может перерисовать лицо. Тогда пропадает сходство, а губы расходятся со звуком. Поэтому **сначала тест на одном дубле**, и только если лицо и губы целы — делаем остальные.

Запасной путь (B) надёжен всегда: вырезать тебя в монтаже и подложить сгенерированный фон. Для тёмных сцен с малой глубиной резкости он почти незаметен.

### 8.1 Фоны (GPT Image 2.6)

```
Фоны для живых кадров. gpt_image_2_6, aspect_ratio 16:9, quality и resolution — максимум безлимита, use_unlim: true, по 2 дубля.

BG-STAIR:
"Output: one photoreal film still, 16:9. Scene: what is behind a person taking a selfie in the stairwell of an old Soviet-era panel apartment block in Tashkent at night, seen from 30 cm in front of the lens: a corner by the garbage chute, peeling grey-green paint, the edge of a stair railing, a dim bare bulb on the floor above, deep shadow. Nobody in frame. Slightly out of focus, as behind a face close to the lens. {LOOK-NIGHT}. Constraints: {NO-TEXT}."

BG-WHITE:
"Output: one photoreal film still, 16:9. Scene: an empty seamless white photo studio: a white cyclorama wall that curves smoothly into a white floor with no visible corner, soft even daylight from large diffusers, a very faint soft shadow area on the floor in the centre where a person will stand. Nobody in frame. Slightly warm paper-white, not pure digital white; natural, not CGI. Constraints: {NO-TEXT}."

BG-CABIN:
"Output: one photoreal film still, 16:9. Scene: the cramped dark interior of the small hand-built spacecraft cockpit from the ship sheet, as seen behind the pilot's headrest: graphite panels, a few small warm indicator lights, the curved frame of the glass canopy, darkness beyond. Nobody in frame. Soft focus. {LOOK-NIGHT}. Constraints: {NO-TEXT}."
```

### 8.2 Тест на одном дубле (путь A)

Прикрепи в чат лучший дубль 1.2 (например, `S1_1.2_t03.mov`) или вставь его media_id из таблицы, которую даст Claude Code после загрузки из `footage/`, и вставь:

```
Тест замены фона. Загрузи прикреплённый файл (media_upload → media_confirm) как LIVE-1.2.
Модель seedance_2_5, mode: video_edit, video_references: [LIVE-1.2], image_references: [выбранный BG-STAIR], generate_audio: false, use_unlim: true.
Сначала оценка стоимости с теми же параметрами: video_edit считается по длине исходного видео. Если не 0 кредитов или отказ — СТОП, скажи мне.
Промпт:
"Change only the background behind the man: replace it with the stairwell from @Image 1 — dim, a bare bulb above, peeling paint, out of focus. Keep everything about the man exactly as in @Video 1: his face and identity, skin texture, expression, every lip and eye movement and its timing, his clothes, his hands, the phone-screen light on his face, the handheld camera movement. Do not re-render, smooth or beautify the face. No text, no logos."
Покажи результат и сравни с исходником: тот же ли человек, совпадают ли губы со словами, нет ли мерцания по краю волос и плеч.
```

**Как проверить:**
- Положи результат поверх исходника с **исходным звуком**.
- Лицо — ты, без «пластика».
- Губы попадают в слова от начала до конца.
- Волосы и плечи не дрожат по краю.
- Свет на лице такой же.

Всё сошлось — делай тем же сообщением 1.3 и, если нужно, 3.6 и 3.8 с фоном BG-CABIN.

**Если `video_edit` не бесплатен или портит лицо**, второй тест — тот же промпт в `mode: omni_reference` с `video_references: [LIVE-1.2]` и `image_references: [BG-STAIR]`. Модель перерисовывает больше, поэтому лицо проверяй особенно строго.

### 8.3 Запасной путь B — монтаж (лицо остаётся 100% живым)

1. Выбери в чате лучший BG-STAIR и BG-CABIN. Можно сделать из них 5-секундное видео Seedance (`omni_reference`, start_image = фон, движение «very slow handheld drift, nothing else moves»), чтобы фон чуть дышал.
2. В монтаже вырежи себя из домашнего дубля:
   - **CapCut** — «Удалить фон» / «Хромакей», если снимал на однотонном;
   - **DaVinci Resolve** — Magic Mask;
   - **Gargona** — я сделаю сам, скажи.
3. Подложи фон, размой на 2–3 px (лицо близко — фон не в фокусе), сведи цвет фона и лица одним грейдом, сверху — общее зерно.
4. В кабине (3.6, 3.8) замена фона может вообще не понадобиться: если за тобой темно, это и есть тёмная кабина. Достаточно отблесков приборов на лице и лёгкого мерцания.

### 8.4 Кадр 1.4 — наезд до глаз из твоего кадра 1.3

Крупные глаза не снимаем отдельно. Первым кадром генерации стоит **твой стоп-кадр из дубля 1.3**, Seedance только доводит камеру до глаз по черновику CLAY-1.4. Поэтому лицо в начале кадра — настоящее, а в конце в кадре одни глаза. Шёпот «Бежим» берём из конца того же дубля 1.3, синхрон губ не нужен: рта в конце не видно.

**FRAME-1.3** — скриншот из лучшего дубля 1.3, из паузы в 2 секунды перед «Бежим»: глаза открыты, смотришь в камеру, без смаза. Бери его **из 1.3 уже с заменённым фоном** (после 8.2 или 8.3). Если фон ещё не заменён — чат сделает это сам, первым шагом ниже. В монтаже 1.3 обрываем ровно на этом кадре, и 1.4 продолжает его без шва.

Прикрепи FRAME-1.3 (или вставь его media_id из таблицы Claude Code) и вставь:

```
Кадр 1.4 — наезд до глаз. Загрузи прикреплённый скриншот (media_upload → media_confirm) как FRAME-1.3. Это настоящий кадр из моего дубля.

Шаг 1 — только если за мной на FRAME-1.3 видна квартира, а не подъезд. gpt_image_2_6, image_references = [FRAME-1.3, выбранный BG-STAIR], aspect_ratio 16:9, quality и resolution — максимум безлимита, use_unlim: true, 2 дубля:
"Output: the same photo with only the background changed. Inputs: Image 1 = a real frame of the man; Image 2 = the stairwell background. Replace everything behind the man with the stairwell from Image 2, dim and out of focus. Keep the man exactly as in Image 1: face and identity, skin texture, every hair, expression, eye direction, the phone-screen light on his face, the framing. Do not re-render, smooth or beautify the face. Constraints: {NO-TEXT}"
Выбранный результат называй 1.4s. Если шаг 1 не нужен — 1.4s = FRAME-1.3.

Шаг 2 — 1.4e, конец кадра. gpt_image_2_6, image_references = [CLAY-1.4e, 1.4s, FACE-1, FACE-2], те же параметры, 2 дубля:
"Output: one photoreal cinematic film still, 16:9 — the last frame of a slow push-in. Inputs: Image 1 = layout and camera reference (a grey clay previs): an extreme close-up where only the eyes and brows fill the frame; Image 2 = the first frame of this shot; Images 3–4 = the same man's face. {RESTYLE} Scene: an extreme close-up of the eyes of the man from Image 2 — only his eyes, brows and the bridge of his nose; his eyes have just darted down and to the side, toward the stairs below; the cold light of the phone screen from below, a dim bulb above-behind, deep shadow. Keep his exact eyes, eye colour, brows, eyelids and skin texture from Images 2–4; real pores and fine lines, no retouch. Constraints: {NO-TEXT}"

Шаг 3 — V1.4. seedance_2_5, mode omni_reference, duration 5, resolution 720p, generate_audio: false, use_unlim: true, 3 задачи t1–t3. video_references = [CLAY-1.4], start_image = 1.4s, end_image = выбранный 1.4e, image_references = [FACE-1, FACE-2]. Сначала оценка стоимости, должно быть 0.
"@Video 1 = camera path, timing and blocking: follow it exactly; its grey clay look must never appear. The first and the last frame are given.
SCENE: a man hiding in a dark Soviet stairwell at night, filming himself with the front camera of his phone; the phone screen lights his face from below.
ACTION: 0–3.5s he holds perfectly still and stares into the lens, breathing shallowly, mouth closed; 3.5–4s he blinks once; 4–5s his eyes dart down and to the side, toward the stairs.
CAMERA: exactly as in @Video 1 — a slow, steady push-in from his selfie framing to an extreme close-up of his eyes. Continuous shot, no cuts.
LIGHT & GRADE: {LOOK-NIGHT}.
PHYSICS: his face is exactly the man from the first frame and from the face photos: identity, skin texture, eye colour and brows never change; no smoothing, no beauty filter; he does not speak, the lips stay still.
{AVOID}"
Покажи мне все три и сравни лицо с FRAME-1.3.
```

**Что выбирать:** лицо в первые 2 секунды — ты, без «пластика». Наезд ровный, без рывков. Глаза в конце резкие, моргание одно. Кадр берём **с самого первого кадра** (он совпадает с концом 1.3), а 5 секунд ускоряем в монтаже до 4 (1.25×): на экране он идёт с 0:17 до 0:21. На медленном наезде ускорение не видно. Не выходит — запасной вариант в таблице шага 4, строка V1.4.

## Как итерировать

**Прямо в Claude-чате:**
```
V4.3 t1–t3 не подходят: корабль выходит не из водопада, а сверху. Поменяй одну переменную — в ACTION уточни, что корабль появляется из-за водяной стены в её нижней трети. Ещё 3 дубля.
```

**Со мной** (сессия Claude Code в `D:\mercat`): пришли id кадра и номер дубля, ссылку или 3 скриншота (первый, средний, последний кадр) и что не так:
- **(a)** уплыло лицо или костюм;
- **(b)** корабль поменял форму или цвет;
- **(c)** камера не повторяет черновик, лишнее движение, склейки внутри кадра;
- **(d)** «хиггсфилдовый» вид: глянец, неон, пластиковая кожа или остатки серого клея;
- **(e)** артефакты: пальцы, вода, буквы.

Я верну исправленное сообщение. Если нужно поменять сам путь камеры — поправлю 3D-черновик в Blender и перерендерю: это минута.

**Имена файлов при скачивании:** `S4_V4.3_t2_720.mp4`, `S4_V4.3_t2_1080.mp4`, `T-PROMPTX_1.mp3`.

**Почему без «хиггсфилд-лука»:**
- в промптах нет слов вроде «cinematic, epic, ultra-detailed, 8k, masterpiece»;
- нет пресетов Cinema Studio и Marketing Studio;
- вместо этого — конкретная плёнка, практический свет и камера, которую мы сами поставили в Blender;
- блок {AVOID} стоит в каждом видео.
