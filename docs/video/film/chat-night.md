# Ночной режим: чат генерирует сам, пока ты спишь

Чат в claude.ai может работать без тебя: сам генерирует, сам проверяет дубли и сам выбирает лучшие. Утром ты смотришь таблицу и меняешь выбор, где не согласен. Все дубли остаются в Higgsfield.

## Перед сном (10 минут)

1. Сообщения 1 и 2 из [`chat-start.md`](chat-start.md): правила и твои фото. Дождись «Готов» и проверь, что **безлимит доступен**. Без этого ночной режим не запускай.
2. **Разреши инструменты Higgsfield без подтверждения.** В настройках коннектора Higgsfield в claude.ai поставь для инструментов «Always allow». Иначе чат остановится на первом же запросе разрешения и простоит до утра.
3. Компьютер на зарядке, сон отключён, вкладка с чатом открыта.
4. Вставь **сообщение 3** — весь блок ниже. Он длинный: claude.ai может превратить его во вложение, это нормально.

## Утром

- Если чат остановился со строкой «ПРОДОЛЖИТЬ С: …» — напиши «продолжай».
- Посмотри итоговую таблицу. Не согласен с выбором — напиши, например: «4.3: бери t3».
- Сохрани СПИСОК (JSON) в `docs/video/film/footage/selected-<дата>.json` и скажи мне: скачаю всё и соберу в аниматик вместо черновиков.

**Чего ждать.** Сначала чат сделает самое важное (P1), потом остальное. Всё вряд ли успеет за один ответ: у ответа в claude.ai есть предел длины. Поэтому порядок такой, чтобы к утру точно были главные кадры.

## Сообщение 3 — ночной режим

```
НОЧНОЙ РЕЖИМ. Я сплю до утра и не отвечаю. Правила из первого сообщения (деньги и use_unlim, оценка стоимости, запрещённые платные инструменты, никакого текста в кадре, лицо только с моих фото, клей черновиков не должен попасть в кадр) остаются в силе и важнее всего, что ниже.

Что меняется на эту ночь:
1. Не жди моего выбора. Везде, где в заданиях ниже сказано «жди мой выбор», «покажи мне» или «я подтвержу», решай сам по правилу 10 первого сообщения: ракурс и движение как в черновике, корабль и скафандр как на листах, лицо — моё, без букв, без лишних людей, без морфинга и серого клея. Выбранный дубль запиши, остальные не трогай: утром я могу поменять выбор.
2. Блок {WARDROBE} составь сам по BODY-1…BODY-4 и пользуйся им.
3. Деньги: если любая оценка стоимости не 0 или пришёл любой отказ по безлимиту (unlim_not_supported, unlim_trial_expired, unlim_config_not_covered и любой другой, после которого генерация стоила бы кредиты) — сразу прекрати всю работу. Не жди меня, не пробуй другие параметры, не генерируй за кредиты. Напиши отчёт и СПИСОК.
4. Порядок: шаг 2 → правило шага 3 и 3.1 → правило шага 4 и 4.1 → 3.2 → 4.2 → 3.3 → 4.3 → шаг 6 (голоса) → 8.1 (фоны). Пока ждёшь один батч, запускай следующий, насколько позволяет параллельность (до 8 видео и 8 картинок).
5. Переделки: если все дубли кадра плохие — одна переделка, где меняешь ровно одну вещь (раздел «Как выбирать дубли» ниже). Не вышло и после неё — пометь кадр «НУЖЕН ЧЕЛОВЕК» и иди дальше. Не больше 3 перегенераций на кадр.
6. Береги длину разговора: виджеты открывай только чтобы проверить дубли, в чат пиши коротко — одна строка на кадр.
7. Голоса: выбери сам. PromptX — Elena (или другой спокойный женский голос, если её нет). Агентства и голос в теге тоже сделай: это запасной вариант к живым голосам.
8. После каждого шага пиши строку журнала: «Готово: …; дальше: …».
9. Если упрёшься в лимит длины ответа — закончи сообщение журналом и строкой «ПРОДОЛЖИТЬ С: <шаг и кадр>». Моё сообщение «продолжай» значит продолжить ровно оттуда, по этим же правилам.
10. Финалы (шаг 5) ночью не делай: дубли выберу утром.

В конце: таблица «кадр | выбранный дубль | job id | почему | что не так у остальных», список «НУЖЕН ЧЕЛОВЕК» и СПИСОК — JSON по правилу 11 первого сообщения.

Задания ниже — из моего плана, дословно.

=== ШАГ 2. Листы корабля и скафандра ===
Батч A — ассеты. Все картинки в этом фильме — модель gpt_image_2_6: aspect_ratio 16:9, quality — максимум, что покрывает безлимит (не оставляй low по умолчанию), resolution — максимум безлимита (2k или 4k), output_format png, use_unlim: true, по одному результату на задачу.

A-SHIP t1 и t2 — без референсов:
"Output: a design reference sheet for a film prop, 16:9, plain warm-grey studio background, soft even light. Three views of the same spacecraft side by side: side profile, three-quarter front view, top view. Subject: {SHIP}. Details: it looks hand-built in a workshop and well used — scuffs, rivets, soot around the nozzle, small dents; real materials, photographed like a physical model. Constraints: the design is identical in all three views; no labels, no callouts, no measurement lines; {NO-TEXT}."

A-SUIT t1 и t2 — image_references: BODY-1, BODY-2, BODY-3:
"Output: a costume reference sheet for a film, 16:9, plain warm-grey studio background, soft even light. Inputs: Images 1–3 = the man who wears the suit; use them only for his height and build. Subject: the same suit shown three times — front, back and side: {SUIT}. Details: realistic heavy fabric with folds, ochre dust on the knees and boots, photographed like a real film costume worn by a person. Constraints: his face must not appear anywhere; the suit is identical in all three views; no labels; {NO-TEXT}."

=== ШАГ 3. Правило ключевых кадров ===
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

=== 3.1 — P1 ===
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

=== 3.2 — P2 ===
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

4.6 — пиала (без черновика, статичный макро), gpt_image_2_6 с теми же настройками, 2 дубля:
"Output: one photoreal cinematic film still, 16:9. Scene: an extreme close-up of a small porcelain piala filled with green tea, the cup decorated with the classic Uzbek pattern of blue cotton bolls on white, standing on a worn wooden tapchan covered with a faded red cloth; in the soft-focus background, snowy mountains at sunrise. The tea surface is perfectly still. 100mm macro look, very shallow depth of field. {LOOK-DAWN}. {NO-TEXT}."

=== 3.3 — P3 ===
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

=== ШАГ 4. Правило видео ===
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

=== 4.1 — P1 ===
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

=== 4.2 — P2 ===
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

V4.6 — пиала, без черновика: start_image = выбранный 4.6, без end_image и video_references.
"SCENE: the piala of tea on the tapchan at sunrise. ACTION: 0–1.5s still; 1.5–3.5s the tea surface trembles in concentric rings; 3.5–5s a single drop jumps up and falls back. CAMERA: locked-off macro, perfectly still. Continuous shot. OPTICS: 100mm macro. LIGHT & GRADE: {LOOK-DAWN} PHYSICS: the cup does not move or change its pattern; the liquid behaves like real tea. {AVOID}"

=== 4.3 — P3 ===
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

=== КАК ВЫБИРАТЬ ДУБЛИ ===
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

=== ШАГ 6. Голоса ===
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

=== ШАГ 8.1. Фоны ===
Фоны для живых кадров. gpt_image_2_6, aspect_ratio 16:9, quality и resolution — максимум безлимита, use_unlim: true, по 2 дубля.

BG-STAIR:
"Output: one photoreal film still, 16:9. Scene: what is behind a person taking a selfie in the stairwell of an old Soviet-era panel apartment block in Tashkent at night, seen from 30 cm in front of the lens: a corner by the garbage chute, peeling grey-green paint, the edge of a stair railing, a dim bare bulb on the floor above, deep shadow. Nobody in frame. Slightly out of focus, as behind a face close to the lens. {LOOK-NIGHT}. Constraints: {NO-TEXT}."

BG-WHITE:
"Output: one photoreal film still, 16:9. Scene: an empty seamless white photo studio: a white cyclorama wall that curves smoothly into a white floor with no visible corner, soft even daylight from large diffusers, a very faint soft shadow area on the floor in the centre where a person will stand. Nobody in frame. Slightly warm paper-white, not pure digital white; natural, not CGI. Constraints: {NO-TEXT}."

BG-CABIN:
"Output: one photoreal film still, 16:9. Scene: the cramped dark interior of the small hand-built spacecraft cockpit from the ship sheet, as seen behind the pilot's headrest: graphite panels, a few small warm indicator lights, the curved frame of the glass canopy, darkness beyond. Nobody in frame. Soft focus. {LOOK-NIGHT}. Constraints: {NO-TEXT}."
```
