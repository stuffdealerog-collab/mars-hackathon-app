# Mercat: Студия на ПК и Mini App — спецификация на ночь 24→25.11

Редакция 2 (24.11, 20:45). Это дельта к коду, который уже лежит на ветках, а не постройка с нуля. Цель на утро: 2–3 клиента работают с продуктом, а не с лендингом. На ПК (`/studio`, от 1024 px) это Студия с перемещаемым стеклянным хабом, по умолчанию Pro. На телефоне это Mini App (`/tg`) как нативное приложение Telegram, по умолчанию Oddiy, Pro включается в настройках.

## 0. Что изменилось против редакции 1

- База — `tmp/integration` (engine, images и studio-ux уже слиты), а не `1bb3224`.
- Хаб не строим заново, а дорабатываем `Hub.tsx`: плавающее стекло 292/76, ключ `mercat.hub`, перенос через motion drag. Сняты `StudioShell`, `.vitrina`, `mercat.layout`, инлайн-скрипт на `<html>` и три режима стекла.
- Ламповый мир возвращён на главный экран. Мини-лампы светят сквозь стекло хаба, над холстом стоит LED-вывеска канала, секции инспектора подписаны сотрудниками, лампа SMM-menejer отвечает на одобрение и публикацию.
- В хабе появилась группа «Asboblar» с действиями над постом и каналом.
- Картинки берём из PR #5 (`PostImage`, `StyleRefs`). Сняты `StyleCard`, раздел Uslub и секция «Rasm» с `retryImage`. Референсы видны и в Oddiy.
- ПК открывает бренды, созданные в Telegram, по подписанной ссылке `?k=` (engine). С `k` публикация идёт с ПК напрямую, без `k` — через бота, а статус перечитывается.
- Enter безопасен, у одобрения есть «Bekor qilish» на 4 с.
- Первый запуск открывает Kanal со сводкой. Очередь сгруппирована по статусу, время поста подписано как «tavsiya».
- Mini App: папку `miniapp/` принимаем как есть (3 вкладки, fullscreen, MainButton на Start, порядок запуска). Правим маршрут поста, картинки, perf и автоповтор.
- Явные границы P0 / P1 / P2 и время заморозки.

## 1. База кода

### 1.1 Ветки

| Ветка | Вершина | Что в ней |
|---|---|---|
| `tmp/integration` | `69cc818` | engine PR #6 (`e771fc4`: approve, publicBrand с `mode` и `visual`, бот публикует то, что видел владелец) + images PR #5 (`4e80857`: `/visual`, `/media/post-image`, `media/*`) + studio-ux (`d792821`). Слито без конфликтов. |
| `claude/sprint-studio-ux-9f7878` | `d792821` | Hub, ProDetails, фазы Studio. История переписана: старый `1bb3224` теперь `b352ffe`, Hub — `c0a28b5`, ProDetails — `e6d85b5`. |
| `claude/sprint-miniapp-0aefe7` | `1bb3224` + незакоммиченное | `src/components/miniapp/` (около 2900 строк), `src/app/tg/layout.tsx`, правка `src/app/tg/mini-app.tsx`. |

Первые 15 минут:
- **studio-ux:** `git merge tmp/integration` в свою ветку и push. С этого момента `src/components/media/**` принадлежит studio-ux: сессия images закончила работу.
- **miniapp:** закоммитить WIP, затем `git rebase --onto tmp/integration 1bb3224`. Файл `mini-app.tsx` после `1bb3224` выше по течению не менялся, конфликтов не ждём. Дальше после каждого push studio-ux делать `git merge` её вершины.

### 1.2 Что уже сделано и берётся как есть

| Где | Что есть | Решение |
|---|---|---|
| `studio/Hub.tsx` | `fixed`-хаб с отступом 12 от краёв, 292 / rail 76; `useHub` → `localStorage["mercat.hub"] = {side, collapsed}`; перенос: motion `drag="x"` (сторона по середине окна) и кнопка dock; сетка 5×2 мини-`LampTile`; свитч Pro; `LangSwitch`; `StageLight` | дорабатываем (§3.2, §3.3) |
| `globals.css`: `.hub`, `.hub-nav`, `.hub-icon` | тон .62, `blur(22px) saturate(150%)`, ободок, блик, тень | оставляем, добавляем fallback’и |
| `studio/pro/ProDetails.tsx` | `AuditFull`, `SufficiencyPanel`, `PlanRowDetails`, `PostDetails`, `LampDrawer` (lazy, уже подключены в `ChannelTab`, `PostCard`, `Department`) | встраиваем в инспектор, Kanal Pro и Bo‘lim |
| `studio/Studio.tsx` | фазы start → working → reopening → ready, `DesktopStudio`, `Working` со Spektr, `Ready`, `PostsTab` | дорабатываем |
| `studio/store.ts` | конвейер, `approve`, `publish`, `writeSlot`, `reopen`, `pro`, опрос картинок | расширяем (§6) |
| `media/PostImage.tsx`, `media/StyleRefs.tsx` | картинка поста с проявлением, «Boshqa variant», фото товара, pro-вид (промпт, референсы, модель); референсы стиля, загрузка фото владельца, простой и pro-вид | ставим везде вместо `PostPicture` (§3.6) |
| `components/miniapp/**` | `MiniApp`, `nav` (один стек, шит, тост), `native` (fullscreen, цвета, Back / Settings / Main / Secondary), `mock` (хром Telegram в браузере), экраны Start / Run / Channel / Posts / Post / Video, `Sheets` | принимаем (§4) |
| `studio/sample.ts` | образец «Tandir non» (`?mock=1`) | правила образца в §3.7 |

Ссылки для демо: `/studio?mock=1` (образец), `/studio?brand=<id>&k=<k>` (из бота), `/studio?ui=simple` (сразу Oddiy), `/tg?preview=dark&mock=1` (только dev).

## 2. Принципы

1. **Один продукт, две плотности** (Microsoft Simplified и Classic Ribbon, Coinbase Simple и Advanced). Режим — одно поле `useStudio.pro`. Переключение не сбрасывает прогон и пост в фокусе. Pro — это вид, а не тариф.
2. **Хаб — витрина отдела.** Liquid Glass работает потому, что под стеклом что-то есть. У нас под стеклом сцена, и на ней горят лампы работающих сотрудников. Стекло показывает этот свет, и это весь наш глассморфизм. Хаб плавает над сценой, сторону выбирает пользователь (как «Move Primary Side Bar Right» в VS Code).
3. **В Pro главное — очередь владельца** (раздел «Needs approval» в Sprout, превью «как в соцсети» в Planable). Но первым после прогона идёт момент «он знает мой канал»: сводка с настоящими цифрами.
4. **Честность важнее привычки.** Время у поста — «tavsiya», а не расписание: сам пост никуда не выходит. На LED только измеренное.
5. **Клавиатура ускоряет Pro и никогда не срабатывает случайно.** Одиночные клавиши живут только в очереди и превью, Enter не срабатывает на кнопках, одобрение можно отменить 4 с.
6. **Mini App ведёт себя как Telegram** (Wallet, правила Mini Apps): вкладки, стек, шиты, лаймовое действие на MainButton, BackButton, haptics, fullscreen на телефонах. Ничего, что тормозит средний Android.
7. **Pro на телефоне — это плотность, а не студия** (Robinhood Legend и мобильный Robinhood — разные продукты): те же 3 вкладки, больше деталей.

**Чем это не Linear и не Higgsfield.** Чёрный фон, стеклянный сайдбар и лаймовая кнопка — общая грамматика жанра. Наш продукт отличают четыре вещи, и все четыре в P0:
1. Свет за стеклом хаба даёт только работа отдела.
2. Над холстом стоит LED-вывеска с цифрами канала.
3. Каждую секцию инспектора подписывает сотрудник, который её сделал.
4. Отдел отвечает на руку владельца: лампа SMM-menejer мерцает на одобрении и публикации.

Из Linear не берём G-последовательности, `[`, лист клавиш и строки-пилюли без разделителей (P2 или никогда).

## 3. ПК-студия (`/studio`, от 1024 px)

### 3.1 Каркас

```
1440 × 900 · хаб слева · Pro · Postlar

      ░░░░░░ LED-вывеска: фон и сетка точек от края окна, уходят под стекло ░░░░░░░░░
┌─ HUB 292 ─────┐   12 400       1 830        15%         60
│ (fixed, 12 от │   obunachi     ko‘rish      qamrov      post o‘qildi
│  краёв окна)  │ ┌ QUEUE 280 ────┐ ┌ PREVIEW ≤ 460 ─────────┐ ┌ INSPECTOR 316 ────┐
│               │ │ Sizni kutmoqda│ │ (T) Tandir non         │ │ ▮ Strateg · Reja  │
│   §3.2        │ │ ▸ Du 09:00 …  │ │ ┌ картинка 4:5 ──────┐ │ │ ▮ Tarjimon · Til  │
│               │ │   Se 19:00 …  │ │ │                    │ │ │ ▮ Muharrir        │
│               │ │ Tasdiqlangan  │ │ └────────────────────┘ │ │ ▮ Dizayner · Rasm │
│               │ │ Joylangan     │ │ ◐◐◐ Kanalingizdagi 6…  │ │ ▮ Kopirayter ·    │
│               │ │               │ │ текст · tavsiya 09:00  │ │   Topshiriq       │
│               │ │ O‘zi joylan-  │ │ [ Tasdiqlash ] [Tahrir]│ └───────────────────┘
│               │ │ maydi …       │ └────────────────────────┘
└───────────────┘ └───────────────┘
Хаб справа: та же сетка, отступ под хаб с другой стороны.
```

- **Хаб** остаётся `fixed` поверх сцены, как в `Hub.tsx`. Холст прокручивается вместе с документом.
- **`main`** растянут на всю ширину окна, с отступом под хаб `gutter = ширина хаба + 36` со стороны хаба; внутри — обёртка `max-w-[1240px] mx-auto`.
- **LED-вывеска** — первый ребёнок `main`. Отрицательным отступом на `gutter` она дотягивается до края окна: фон и сетка точек начинаются под стеклом.
- **Postlar Pro.** Сетка `280px | minmax(340px, 460px) | 316px`, gap 16. Очередь и инспектор — `position: sticky; top: 12px; max-height: calc(100dvh - 24px); overflow: auto`. Превью прокручивается с документом.
- **Узкий холст.** На холсте `@container`. Если холст уже 920 px (1024–1279 с полным хабом), инспектор встаёт под пузырём в колонке превью. Side-peek — P2.
- **Первый кадр.** `useDesktop()` переписать на `useSyncExternalStore`, серверный снимок — `null`. Пока `null`, рендерится `StudioSkeleton`, CSS-only: от 1024 px силуэт хаба (тот же `.hub`, 292, слева) на сцене, ниже 1024 — шапка колонки. Пустого кадра и прыжка «телефонная колонка → студия» больше нет. Если хаб сохранён справа, первый кадр покажет его слева: это P2 (инлайн-скрипт плюс `suppressHydrationWarning` на `<html>`).
- **Ниже 1024 px** `/studio` — нынешняя колонка `Studio` без изменений.

### 3.2 Хаб: доработка `Hub.tsx`

```
full · 292                          rail · 76
┌────────────────────────────────┐  ┌──────┐
│ ⠿  Mercat                ⇆  «  │  │ ⠿  ⇆ │
│ (T) Tandir non              ▾  │  │ (T)  │
│     @tandirnon · jonli         │  │ ▣ ●  │
│ ▣ Postlar                 ● 3  │  │ ▤    │
│ ▤ Kanal                        │  │ ▶    │
│ ▶ Video            tez orada   │  │ ▢ ▢  │
│ Bo‘lim · 8 xodim ishladi    ›  │  │ ▢ ▢  │
│ ▢  ▢  ▢  ▢  ▢                  │  │ ▢ ▢  │
│ ▢  ▢  ▢  ▢  ▢                  │  │ ▢ ▢  │
│ Asboblar · post 1/5            │  │ ▢ ▢  │
│ [↻ Boshqa rasm][▣ Mahsulot f.] │  │ ↻ ▣  │
│ [⧉ Nusxalash  ][⤓ Yuklab olish]│  │ ⧉ ⤓  │
│ ── футер прилеплен к низу ──── │  │      │
│ [ Oddiy | Pro ]    [uz|ru|en]  │  │ Pro  │
└────────────────────────────────┘  │ uz   │
                                    └──────┘
```

Хаб прокручивается внутри (`overflow: hidden auto` уже стоит), футер прилеплен к низу (`sticky bottom-0` на тоне стекла). Высота рассчитана на 1366×768: шапка 48 + канал 56 + навигация 3×44 + строка Bo‘lim 40 + лампы около 110 + Asboblar 20 + 2×40 + футер 96 ≈ 700 px.

1. **Шапка** без изменений: ⠿, `Logo`, dock ⇆, свернуть «.
2. **Чип канала** (новое, заменяет текстовый блок бренда). Аватар-буква, `dna.name`, `@channel` и слово статуса: `jonli` (ready, не образец), `o‘qilmoqda` (working, reopening), `namuna` (образец). В фазе `start` на этом месте строка «Kanal hali yo‘q» ink-3, место зарезервировано. Клик по чипу открывает меню (непрозрачный `glass-3`, `role="menu"`, стрелки, Esc, фокус возвращается на чип):
   - **Yangi kanal** → `newChannel()` (в образце — переход на `/studio` без `mock`).
   - **So‘nggi kanallar** — до 8 строк из `localStorage["mercat.recent"] = [{id, name, channel}]`, клик → `reopen(id)`, текущий отмечен ✓. Так SMM-специалист переключает клиентские каналы без нового API.
   - **Telegramda ochish** → `https://t.me/<channel>`.
3. **Навигация** — `hub-nav`, как сейчас: Postlar (число черновиков и лаймовая точка «sizni kutmoqda»; это единственный лайм в хабе, и он не кнопка), Kanal, Video с «tez orada». До `ready` строки `disabled`.
4. **Bo‘lim.** Строка-заголовок «Bo‘lim · {n} xodim ishladi» (`c.dept.staff`). В Pro это ссылка в раздел Bo‘lim (`tab: "dept"`), в Oddiy — просто подпись. Под ней та же сетка мини-ламп 5×2 (`LampTile size="xs"`).
   - Каждая мини-лампа — кнопка с `aria-label` «имя: состояние», цель не меньше 40 px в full и 28 px в rail.
   - Подсказка появляется при наведении (задержка 300 мс) и при фокусе (сразу). Она непрозрачная, `glass-3`, стоит со стороны холста: «Analitik — ishladi · 60 post o‘qildi» (имя, `c.lampState`, `lamps.result`).
   - Клик в Pro открывает `LampDrawer`. В Oddiy ведёт в раздел: brand, analyst, strategist → Kanal; copywriter, editor, translator, designer, publisher → Postlar; video → Video; radar — `aria-disabled`.
   - Правило «сворачивать Bo‘lim при высоте меньше 820» снято.
5. **Asboblar** — контекстная группа, всегда 4 кнопки сеткой 2×2: высота 40, иконка 18 и подпись 13.5, тон `hub-icon`, не лайм. Подпись группы называет контекст: «Asboblar · post 1/5» или «Asboblar · kanal». Набор — в §3.5.
6. **Футер:** сегмент `[Oddiy | Pro]` (стеклянный, никогда не лайм) и `LangSwitch`. Лаймовый свитч Pro из хаба убрать: лайм на экране один, и он у поста.

**Rail 76:** ⠿ и ⇆, аватар-буква канала, 3 иконки навигации с лаймовой точкой, мини-лампы 2×5, 4 инструмента иконками (подпись в подсказке), одна кнопка `Pro` / `Odd`, кнопка языка по кругу uz → ru → en. Подсказки при наведении и фокусе.

**Перенос.** Оставляем motion `drag="x"` и dock-кнопку. Добавить линию 2 px `--hair-2` у целевого края, пока хаб перетащен за середину окна. `aria-label` dock-кнопки говорит, куда хаб переедет: «Hubni o‘ngga o‘tkazish» / «Hubni chapga o‘tkazish». Клавиатурный путь — dock-кнопка (WCAG 2.5.7). Под reduced motion drag выключен (уже так), остаётся кнопка. Ключ `mercat.hub` не меняем, миграция не нужна.

### 3.3 Стекло и свет

**Fallback’и для `.hub`** в `globals.css`. Селектор одиночный, режимов стекла сегодня нет, поэтому каскаду не с чем спорить. Если режимы вернутся в P2, их кладут в `@layer` ниже этих правил.

```css
@media (prefers-reduced-transparency: reduce){.hub{background:var(--glass);-webkit-backdrop-filter:none;backdrop-filter:none}}
@media (prefers-contrast: more){.hub{background:var(--stage);-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:inset 0 0 0 1.5px var(--ink-2)}}
@media (forced-colors: active){.hub{background:Canvas;border:1px solid CanvasText;-webkit-backdrop-filter:none;backdrop-filter:none}}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.hub{background:var(--glass)}}
```

**`StageLight`: свет из-за ламп.** Сейчас это 4 пятна с альфой `26` (≈ 0.15) вдоль края, под тоном .62 остаётся примерно 6% цвета, и хаб выглядит плоской тёмной карточкой. Что меняем:
- Хаб меряет прямоугольник сетки мини-ламп (`ResizeObserver` и `getBoundingClientRect`, заново при смене стороны и rail) и кладёт его в `useHub` (`deptRect`).
- Для каждой лампы в `warming`, `on` или `you` — пятно `radial-gradient(closest-side, <hue>, transparent)` 140×110 px ровно за её плиткой, альфа 0.40. У `warming` пульс 0.20 ↔ 0.40 за 2.4 с через `opacity`.
- Общий мазок вдоль хаба остаётся (до 4 горящих ламп), альфа 0.35 вместо 0.15.
- Без `filter: blur`: размывает само стекло. Появление 720 мс, угасание 1000 мс.
- Ни одна лампа не горит — пятен нет. Стекло тёмное, материал держат ободок и блик.

**LED-вывеска** (§3.4) начинается от края окна, её сетка и цифры уходят под стекло.

**Проверка ламп.** Это замена Spektr там, где он не играет, и первый кадр студии.
- При первом открытии `/studio` в сессии (`sessionStorage["mercat.check"]`) мини-лампы хаба и их пятна в `StageLight` вспыхивают по одной по конвейеру: шаг 70 мс, каждая 420 мс (opacity 0 → 1 → 0, scale .96 → 1), всего около 1.1 с. Только `transform` и `opacity`.
- Тот же класс `.lamp-check` ставится на `Panel` в `Working`, когда Spektr не играет из-за производительности (Mini App при `perf=low`).
- Под reduced motion проверка не играет.

**Рука владельца.** Успешные `approve` и `publish` увеличивают `useStudio.handTick`. Хаб на это ставит `data-blink` на мини-лампу SMM-menejer (`publisher`) и на её пятно: два бирюзовых мерцания за 900 мс. На посте при этом остаётся лаймовое кольцо, которое уже есть.

**DESIGN.md (studio-ux).** Добавить «The Window Rule»: стекло хаба само не окрашивается и показывает только свет работающих ламп за ним; тень окклюзии разрешена только хабу и всплывающим окнам. Абзац про хаб дополнить мини-лампами, вывеской под стеклом и мерцанием SMM.

### 3.4 Холст по разделам

**LED-вывеска канала** (`studio/ChannelSign.tsx`, новое) стоит над каждым разделом в фазе `ready`.
- Ячейки: подписчики (`audit.subscribers`), средние просмотры (`audit.avgViews`), охват (`reachRate` в процентах), прочитано постов (`audit.postsAnalyzed`). Цифры — `Led` с `dot={3}`, подпись под каждой — Onest 13, ink-3 (подписи на LED не пишем). Нет поля — нет ячейки.
- Нет `audit` (fresh-бренд): тёмная сетка и подпись «Kanal hali o‘lchanmagan». Идёт `analyzeChannel` после reopen: тёмная сетка и «o‘lchanmoqda…».
- `humanScore` на LED не выводим нигде: это оценка модели, а не измерение (Measured Numbers Rule). Везде только Onest `tnum`.

**Postlar · Pro**
- **Очередь** (`studio/Queue.tsx`): непрозрачная `card`, `role="listbox"`, roving tabindex.
  - Группы по статусу, а не по дням: «Sizni kutmoqda» (draft), «Tasdiqlangan» (approved), «Joylangan» (published). Внутри группы сортировка по слоту: день недели Du → Ya, затем время. Посты без слота идут в конец группы. Reopen берёт 12 новых постов, как сейчас.
  - Строка 56 px: миниатюра 44 (картинка `image.url` или тёмный слот Дизайнера), первая строка текста, «tavsiya: Du 09:00». У черновика лаймовая точка. Фокус — заливка `glass-3`.
  - Под группами одна строка ink-3: «O‘zi joylanmaydi — siz tasdiqlab joylaysiz.»
- **Превью** — нынешний `PostCard` с новым пропом `inspector`, который прячет `PostDetails` (они переезжают в инспектор). Внутри: шапка канала как в Telegram (имя; подписчики, только если есть `audit.subscribers`), `PostImage` (§3.6), строка референсов, текст, «tavsiya 09:00». Под пузырём одна лаймовая кнопка: `Tasdiqlash`, после одобрения `Telegramda joylash` (§3.8). Рядом тихая `Tahrirlash`. `postNote` выводится под кнопкой, как сейчас в `PostCard`. Регион превью — `data-post-scope`, `tabIndex=-1`.
- **Инспектор** (`studio/Inspector.tsx`): непрозрачная `card`. Каждую секцию подписывает сотрудник: филамент 3×14 его цвета (горит, если лампа `on`), имя и название секции. Секции собираются из кусков `PostDetails`, нового кода по минимуму.
  - **Strateg · Reja:** «tavsiya: Du 09:00», цель словом, hook, CTA из `slot`. Прогноз (`PlanRowDetails`) для этого слота, если есть `plan`.
  - **Tarjimon · Til:** сегмент UZ / ЎЗ / RU / EN → `setPostScript`. Если у поста есть локальная правка, под сегментом строка «Kirill matni tasdiqlanganda yangilanadi»: сервер пересобирает `uz_cyrl` только при approve. Флаги Muharrir для правленой письменности скрыты.
  - **Muharrir:** «Tabiiylik 92/100» Onest tnum и найденные «нейро»-фразы (`neuroHits` текущей письменности).
  - **Dizayner · Rasm:** статус картинки, строка референсов, pro-вид `PostImage` (промпт, модель).
  - **Kopirayter · Topshiriq:** `brief`.
- **Черновиков не осталось:** в превью строка «Hammasi tasdiqlandi — endi Telegramda joylang», фокус на первом одобренном.
- **Пустая очередь** (reopen без постов): «Hali post yo‘q. Kanal bo‘limida rejadagi kunni tanlab, «Postini yozish»ni bosing.» и кнопка «Kanalga o‘tish».

**Postlar · Oddiy** — нынешний `PostsTab` (карточки колонкой 640) с `ChannelSign` сверху и `PostImage` вместо `PostPicture`. Сегмент языка показывается, только если в `brand.dna.languages` 2 и больше языков (сейчас условие `available.length > 1` верно всегда, потому что `uz_cyrl` есть у каждого поста). Пост в фокусе для инструментов — карточка, видимая больше всех (`IntersectionObserver`).

**Kanal**
- **Сводка первого запуска** (`studio/FirstLook.tsx`), пока `justFinished`. Заголовок «Kanalingizni o‘qidik», 3 главные находки (первая фраза и цифры, как в `d792821`), лаймовая «Postlarni ko‘rish · {n}» → Postlar с фокусом на очереди. Сводка исчезает после перехода в Postlar.
- **Oddiy:** `ChannelTab` как есть, плюс `StyleRefs` в простом виде («Rasm uslubi»: до 6 миниатюр, точки палитры, «kanalingizdagi N ta rasm asosida», «Rasm qo‘shish») между находками и голосом.
- **Pro:** две колонки `1fr 1fr`.
  - Слева: находки, `AuditFull` (лучшие часы и дни, форматы, топ-посты, основания находок, похожие каналы), `SufficiencyPanel`.
  - Справа: план (7 строк, `PlanRowDetails` с прогнозом, «Postini yozish» → `writeSlot`), `StrategyDetails`, `StyleRefs` в pro-виде, голос. `Launch` — для fresh.
- **Reopen без плана.** Читать план с сервера нечем (GET нет). На месте плана «Haftalik reja bu qurilmada yo‘q» и кнопка «Rejani tuzish» → `rebuildPlan()`. Лампа Strateg тёмная до ответа: это честно.

**Bo‘lim** (только Pro, `tab: "dept"`): `Panel size="md" showJob` (лампы — кнопки, `LampDrawer` уже подключён), под ним «Ish jurnali»: шаги из `steps` со словом состояния и длительностью (`t0`, `t1`), и «Yangi kanal».

**Video:** заглушка `c.video` и тёмная лампа Videograf «tez orada», как есть.

**Pro → Oddiy.** Из Bo‘lim попадаем в Kanal. После смены плотности холст прокручивается к посту в фокусе: раскладки разные, позицию в пикселях не сохраняем.

### 3.5 Asboblar

| Контекст | Кнопки 2×2 |
|---|---|
| Postlar, пост в фокусе | **Boshqa rasm** — `PostImage.regenerate()`; выключена, если пост не `draft` или это образец. **Mahsulot fotosi** — `PostImage.pickPhoto()`, тоже только для draft. **Matnni nusxalash** — текущая письменность в буфер, тост «Nusxalandi». **Rasmni yuklab olish** — fetch → blob → `mercat-<день>.jpg`; при CORS-ошибке открыть картинку в новой вкладке; нет картинки — выключена. |
| Kanal, Bo‘lim, Video | **Yangi post** — `writeSlot` для первого слота плана без поста; нет плана — выключена с подсказкой «Avval haftalik reja kerak». **Rasm qo‘shish** — переход в Kanal и `StyleRefs.addPhotos()` в том же клике. **Haftani nusxalash** — план и тексты постов простым текстом. **Botni admin qilish** — `https://t.me/<bot>?startchannel&admin=post_messages`; нет канала — выключена. |
| `start`, `working` | 4 кнопки на месте и выключены, раскладка не прыгает |

- `PostImage` и `StyleRefs` получают `ref` через `useImperativeHandle`: `{ regenerate(), pickPhoto() }` и `{ addPhotos() }`. Превью и Kanal регистрируют их в `studio/desk.ts` (`useDesk`: `focusedPostId`, `imageHandle`, `refsHandle`, тосты).
- `pickPhoto` и `addPhotos` вызывают `input.click()` синхронно, в том же обработчике клика.
- «Tasdiqlash» и «Joylash» в хабе не появляются никогда.

### 3.6 Картинки

- `PostImage` из `@/components/media` ставим везде, где была `PostPicture`: превью Pro, карточки Oddiy (ПК и колонка меньше 1024), Mini App. `PostPicture.tsx` сегодня не удаляем: miniapp переходит в своём темпе.
- **Правки в `PostImage`** (studio-ux теперь владеет `media/**`):
  - `expected?: boolean`: пока картинка ожидается (шаг images в `wait` или `run`), вместо кнопки «Rasm yaratish» показывается тёмный слот-скелет.
  - Принимать изменения `initial` (status, url) после монтирования: store опрашивает картинки, и это должно доходить до компонента.
  - `locked?: boolean` прячет «Boshqa variant» и фото товара. Ставим `locked = post.status !== "draft" || sample`: перерисовка одобренного поста даёт 409 при публикации, потому что бот сверяет превью.
  - `authorization?: string` — готовый заголовок (`tma …` или `handoff …`), он главнее `initData`. То же в `StyleRefs`.
  - `ref` с `{ regenerate(), pickPhoto() }`.
- Использование: `<PostImage key={post.id} postId={post.id} initial={post.image} autoStart={false} expected={…} locked={…} pro={pro} lang={lang} authorization={authHeader()} onChange={(img) => setImage(post.id, img)} />`. Картинки запускает по-прежнему `store.pictures()` после `learnStyle`.
- **Строка референсов под картинкой** — в обоих режимах, когда картинка готова и `refsUsed > 0`. До 4 точек палитры из `brand.visual.palette` и текст:
  - fresh-бренд: «Siz yuborgan rasmlar asosida ({n} ta)»;
  - в `brand.visual.refs` есть `source: "owner"`: «Kanal va sizning rasmlaringiz asosida ({n} ta)»;
  - иначе: «Kanalingizdagi {n} ta rasm asosida».
- `store.learnStyle` при успехе записывает ответ в `brand.visual`. Сейчас ответ теряется, и `StyleRefs` пуст до reopen.

### 3.7 Состояния и края

- **start:** `Start` по центру, колонка 560. В хабе «Kanal hali yo‘q», навигация `disabled`, лампы тёмные (после проверки ламп), инструменты выключены.
- **working:** `Working` как есть. На ПК Spektr играет всегда, кроме reduced motion. Лампы хаба читают тот же `useLamps(gate)`. P1: как только пришёл `audit`, под панелью появляется блок 3 находок (тот же, что в `FirstLook`), чтобы 45–120 с стратегии прошли с моментом «он знает мой канал».
- **ready впервые после прогона:** `tab = "channel"` и `justFinished = true`, если `mode === "channel"` и `audit` уже есть; иначе `tab = "posts"`. Тоста «Bo‘lim tayyor» нет: картинки в этот момент ещё рисуются.
- **ready после reopen:** Postlar, или Kanal, если постов нет.
- **Ошибки в ready** (`problem` от `writeSlot` и `rebuildPlan`): полоса `role="alert"` над вывеской, текст и «Yopish». Ошибки поста (`postNote`) — под его кнопкой в превью и в карточке.
- **403 `brand_forbidden` при reopen** (бренд из бота открыт без `k`): Start с текстом «Bu kanal Telegramdagi hisobingizga tegishli. Uni bot orqali oching.» и кнопкой «Telegramda ochish» → `https://t.me/<bot>?startapp=brand_<id>`.
- **Образец `?mock=1`:**
  - «Yangi kanal» везде ведёт на `/studio` без `mock` (`newChannel()`), а не делает `reset()`. Иначе следующий прогон покажет пекарню под ссылкой клиента.
  - «Yangi post», «Boshqa rasm», «Mahsulot fotosi» и «Rejani tuzish» выключены с подсказкой «Namunada ishlamaydi».
  - Одобрение локальное (как сейчас), вместо публикации — текст `samplePublish`.
  - Картинок в образце нет: слот Дизайнера с подписью «Namunada rasm chizilmaydi». P1: lead кладёт 5 jpg в `public/sample/` (сделанных нашим конвейером на тестовом канале), `sample.ts` ставит `image: {status: "ready", url: "/sample/N.jpg", refsUsed: 6}`.
- **Несохранённые правки:** пока у черновика есть `edited[id]` и он не одобрен, `beforeunload` спрашивает подтверждение.
- **Публикация через бота:** `refreshPosts()` на `focus` и на `visibilitychange → visible`, не чаще раза в 10 с, только в `ready` и не в образце. Чип поста становится «joylandi», лампа SMM — `on`.

### 3.8 Одобрение, публикация, клавиатура

**Одобрение (ПК, оба режима)**
- Клик «Tasdiqlash» или Enter → `approve(id)` с задержкой 4 с. Пост сразу показан одобренным (лаймовое кольцо уже есть), тост «Tasdiqlandi · Bekor qilish» живёт 4 с, запрос уходит по истечении. «Bekor qilish» возвращает черновик, запроса не было.
- В Pro фокус переходит к следующему черновику сразу: отложенный пост можно вернуть из тоста. `aria-live="polite"`: «Tasdiqlandi. Keyingi: Du 09:00».
- Запрос упал → пост снова `draft`, в `postNote` причина, тост ошибки с кнопкой «Ko‘rish» переводит фокус на этот пост. Ошибка не теряется на невидимом посте.
- На `pagehide` отложенные одобрения уходят сразу (`fetch` с `keepalive`). `publish` сначала дожидается отложенного одобрения своего поста.

**Публикация с ПК**
- **Есть `k`** (§5.1). Кнопка «Telegramda joylash» двухшаговая: первый клик (или Enter) превращает её на 6 с в «Ha, @kanal kanaliga joylash» рядом с «Bekor», второй клик вызывает `publish(id, script)` напрямую, как в Mini App. Статус меняется сразу, лампа SMM мерцает.
- **Нет `k`.** Ссылка на бота `botPublishUrl(bot, id, script)` в новой вкладке, под ней `c.posts.webNote`. Статус догоняет `refreshPosts()`, когда владелец возвращается во вкладку.

**Клавиатура — только Pro и только в очереди и превью.** По WCAG 2.1.4 одиночные клавиши допустимы, когда работают лишь с фокусом в компоненте. Oddiy выключает их совсем.

| Клавиша | Действие | P |
|---|---|---|
| J / K, ↓ / ↑ | следующий / предыдущий пост | P0 |
| Enter | лаймовое действие поста в фокусе: одобрить; на одобренном — первый шаг публикации | P0 |
| E; Ctrl/⌘ Enter; Esc | правка; сохранить; отменить | P0 |
| 1–4 | UZ / ЎЗ / RU / EN | P0 |
| Ctrl/⌘ K | палитра | P1 |
| Ctrl/⌘ Z | отменить последнее одобрение, пока жив тост | P1 |

- Один `keydown` на `window` в `studio/useHotkeys.ts`. Сравниваем `e.code`, а не `e.key`: так клавиши работают и в русской, и в узбекской кириллической раскладке.
- Одиночные клавиши и Enter срабатывают, только если `document.activeElement` — `body`, опция очереди или сам регион превью. На `button`, `a`, `input`, `textarea`, `select`, `[contenteditable]` и `[role=menuitem]` не срабатывают: там работает их собственный Enter.
- Enter игнорируется при `e.repeat`, при `busy[id]` и пока у поста идёт отложенное одобрение.
- Подсказки — в `title` и `aria-keyshortcuts` кнопок («Tasdiqlash · Enter»). Строка «Enter tasdiqlash · E tahrir · J/K · 1–4» под превью появляется только после первого нажатия любой из клавиш (`localStorage["mercat.keys"]`).
- При входе в Postlar фокус ставится на опцию очереди в фокусе (`focus({preventScroll: true})`).

### 3.9 Палитра (P1)

- `studio/CommandPalette.tsx`, около 150 строк, без зависимостей. Ctrl/⌘ K открывает и закрывает (`preventDefault`, иначе Firefox уводит фокус в свой поиск).
- Вид: непрозрачный `glass-3` шириной 600 px, дым `rgb(0 0 0 / .5)` без blur.
- Доступность: `role="dialog" aria-modal="true"`, поле — `combobox` со `listbox` и `aria-activedescendant`, ловушка фокуса, возврат фокуса.
- Команды `{id, title, keywords, run, when?}`, `keywords` сразу на трёх языках (`"tasdiq одобрить approve"`): разделы, Tasdiqlash, Telegramda joylash, Yangi post, Boshqa rasm, Matnni nusxalash, Haftani nusxalash, Hubni o‘ngga/chapga, Ixcham/To‘liq, Oddiy/Pro, Til, Yangi kanal и каждая строка «So‘nggi kanallar».
- Поиск: нижний регистр, подпоследовательность; префикс выше начала слова, начало слова выше подпоследовательности. Поиск по постам — P2.

### 3.10 Движение

| Что | Длительность | Кривая |
|---|---|---|
| Нажатие (scale .96) | 120 мс | `--ease-out` (есть) |
| Перенос хаба | motion, 360 мс (есть) | `EASE_OUT` |
| Rail ↔ full | ширина в CSS, 300 мс (есть) | ease-out |
| Смена раздела | 220 мс, opacity и y 8 → 0 (есть) | `EASE_OUT` |
| Смена поста в превью | выход 160 мс, вход 240 мс (y 8 → 0) | `--ease-out` |
| Одобрение | лаймовое кольцо 900 мс (есть), мерцание SMM 900 мс | `--ease-out` |
| Свет за стеклом | зажигание 720 мс, угасание 1000 мс | `--ease-in` при угасании |
| Проверка ламп | шаг 70 мс, лампа 420 мс, всего около 1.1 с | `--ease-out` |
| Тост | вход 200 мс, выход 160 мс | `--ease-out` |
| Oddiy ↔ Pro | кроссфейд 200 мс | `--ease-out` |

Reduced motion: всё мгновенно, opacity не дольше 150 мс. Нет Spektr, проверки ламп, мерцания и drag.

## 4. Mini App (`/tg`) — дельта к `src/components/miniapp/`

### 4.1 Принимаем как есть

- Папка `miniapp/` (а не `mini/`): `MiniApp.tsx`, `nav.ts` (один стек, шит, тост), `Shell.tsx`, `native.ts`, `tg.ts`, `mock.ts` (рисует хром Telegram в браузере вместо `FallbackBottomBar`), экраны Start / Run / Channel / Posts / Post (пейджер свайпом) / Video, `Sheets`.
- 3 вкладки Kanal · Postlar · Video в обоих режимах. Pro переключается в шите настроек (`SettingsButton`), значение лежит в CloudStorage `pro`. Число вкладок не меняется, поэтому таб-бар не прыгает при чтении CloudStorage.
- Таб-бар непрозрачный, с горящим филаментом. Стеклянной капсулы и `backdrop-filter` в Mini App сегодня нет.
- Fullscreen на телефонах (Bot API ≥ 8.0, `isMobilePlatform`) с учётом `contentSafeAreaInset`. Это самый сильный сигнал «не сайт». Проверяем на реальном iOS и Android по чек-листу.
- MainButton на Start («Bo‘limni yoqish», нативно над клавиатурой), Main и Secondary в посте, BackButton, haptics.
- Порядок запуска: `?brand=` или `startapp brand_<id>` → CloudStorage `brand` → `?channel=` или `startapp ch_` → Start. Экран Launch держится, пока не прочитан CloudStorage, так что режим и бренд известны до первого кадра.

### 4.2 Правки P0

1. **Ребейз** на `tmp/integration` (§1.1).
2. **Маршрут поста по id:** `push({name: "post", id})`. Пейджер вычисляет стартовый индекс из id при монтировании; если пост пропал из списка — `back()`. `writeSlot` и `refreshPosts` меняют порядок, индекс устаревает.
3. **Картинка — `PostImage`** (§3.6) с `authorization: "tma " + initData`, `locked` для не-draft, `expected` и `pro`. Собственная перерисовка и опрос в `Sheets.tsx` (около строк 200–230) удаляются: «Boshqa variant» и фото товара живут внутри `PostImage`. Под картинкой строка референсов (§3.6) в обоих режимах.
4. **Kanal:** `StyleRefs` после находок (простой вид в Oddiy, pro-вид в Pro).
5. **Результаты действий.** `approve` и `publish` из store возвращают результат (§6). Вызывать `approve(id, 0)` без задержки: MainButton — осознанное нажатие.
   - Успех: `haptic.success` и тост.
   - Ошибка: `haptic.error` и `showPopup`. Текст обрезать до 240 символов с «…» (лимит 256), подпись кнопки — не длиннее 64. Полный текст — в заметке на экране. При `adminUrl` в попапе кнопка «Botni admin qilish».
   - До шага 0 studio-ux результат читается из `postNote` и статуса, как сейчас: Mini App его не ждёт.
6. **Первый запуск.** Store ставит `tab: "channel"` и `justFinished`. На Kanal своими компонентами показать сводку (3 находки), MainButton «Postlarni ko‘rish · {n}» → вкладка Postlar. В остальное время на Kanal MainButton нет.
7. **perf.** В `THEME_SCRIPT` (`app/tg/layout.tsx`) добавить `window.__maPerf`:
   - Android с `HIGH` в UA → `high`;
   - Android с `LOW`, `AVERAGE` или без маркера → `low`;
   - `navigator.deviceMemory ≤ 2` → `low`;
   - iOS → `high`.
   Атрибут ставится на корень `.ma[data-perf]`, не на `<html>` (сервер его не рендерит). При `low`: Spektr не играет, вместо него проверка ламп (`.lamp-check`); `mask-image` на скролл-контейнерах выключен; push и pop — только opacity 120 мс.
8. **Возврат из фона** (`visibilitychange → visible`). В `working` с упавшим шагом `network` или `timeout` — один раз `retry()`: iOS усыпляет WebView и рвёт NDJSON-поток стратегии, а store продолжает с упавшего шага. В `ready` — `refreshPosts()`.
9. **CloudStorage `brand`** удаляется при любом провале `reopen` (не найден, 403) и при «Yangi kanal» (уже есть). Мёртвый id больше не открывается при каждом запуске.
10. **Подтверждение закрытия** (`enableClosingConfirmation`) включено и тогда, когда есть черновики с `edited[id]`.
11. **«Kompyuterda to‘liq studiya»** появляется в шите, только если есть `POST /api/uslub/handoff` (§5.1, P1). Без него пункта нет.

### 4.3 Pro на телефоне (P1, после P0)

В тех же 3 вкладках:
- Kanal: `Panel` вместо `Strip`, тап по лампе открывает шит сотрудника (можно встроить `LampDrawer` как есть); `StrategyDetails` (уже есть); `PlanRowDetails` с прогнозом слота; `AuditFull` и `SufficiencyPanel` — lazy из `ProDetails`.
- Пост: `PostDetails` и pro-вид `PostImage`.
- Хаба, инспектора и клавиатуры нет.

### 4.4 Бюджет

- Анимации только через `transform` и `opacity`. `backdrop-filter` в Mini App не используется.
- JS: смотреть `.next/diagnostics/route-bundle-stats.json` (Next 16.4 пишет туда несжатые байты, строки First Load в выводе `next build` больше нет). Бюджет: `/tg` прибавляет не больше 80 KB несжатого JS против `tmp/integration`. `ProDetails` и pro-вид — только lazy.
- 60 fps при прокрутке Postlar на 375×812 с 4× замедлением CPU, INP при смене вкладки меньше 200 мс.

## 5. Зависимости вне двух сессий

### 5.1 Engine: ПК открывает бренды из Telegram (P0, около 45 мин, сессия engine)

Проблема. Бренд, созданный в боте (`onboard.ts:87`, `ownerTelegramId: userId`) или в Mini App, принадлежит Telegram-пользователю. В браузере идентичности нет, поэтому `GET /posts` и `/posts/approve` отвечают 403 (`assertDraftAccess`), а публикация — 401. Кнопка бота «Studio» сейчас ведёт на ошибку.

Решение:
- **`src/lib/uslub/handoff.ts`.** `signHandoff(userId, days = 7)` → `"<userId>.<exp>.<sig>"`, где `sig = base64url(HMAC-SHA256(key, "<userId>.<exp>"))`, `key = HMAC-SHA256("mercat-handoff", TELEGRAM_BOT_TOKEN)`. Новой env-переменной нет. `verifyHandoff(k)` → `userId | null` (timing-safe сравнение, проверка срока).
- **`http.ts` `telegramUserId(req)`:** после `tma` принимать `Authorization: handoff <k>`. Больше ничего менять не нужно: доступ к бренду, черновикам и публикации уже считается от `userId`.
- **`onboard.ts:104`:** ссылка «Studio» → `${studioUrl()}?brand=<id>&k=<signHandoff(userId)>`. Так же — все остальные ссылки бота на `/studio`.
- **P1:** `POST /api/uslub/handoff {brandId}` (только с `tma`) → `{url}` для пункта Mini App «Kompyuterda to‘liq studiya».
- **Тесты:** подпись и проверка, просроченный токен, чужая подпись, `telegramUserId` с `handoff`.
- **Студия** (studio-ux, шаг 0): `configure()` переносит `?k=` в `localStorage["mercat.k"]` и убирает его из адресной строки; `api.ts headers()` без `initData` шлёт `authorization: handoff <k>`; `authHeader()` отдаёт тот же заголовок компонентам `media/*`.
- **Отсечка.** Если к 01:00 этого нет в ветке engine, lead убирает кнопку «Studio» из `onboard.ts`, а студия показывает экран 403 из §3.7. Тогда ПК работает только с каналами, вставленными в браузере.

### 5.2 Lead

- **Мёрж в `main`:** PR #6 (engine, вместе с handoff) → PR #5 (images) → studio-ux → miniapp. Порядок уже проверен в `tmp/integration`.
- **Env на проде:** `FAL_KEY`, `MEDIA_*` (`npm run env:push`). Без них шаг images станет `skip`, а картинки в стиле канала — главная фича утра.
- **BotFather:** Main Mini App (нужна для `startapp`), экран загрузки: иконка-лампа, фон `#000` / `#fff`.
- **Деплой** и прогон на реальном канале по §10 до 06:00.

## 6. Общие правки store и api (studio-ux, шаг 0)

Не больше 45 минут. После шага — push и хэш коммита в miniapp.

| Правка | Зачем |
|---|---|
| `Tab = "channel" \| "posts" \| "dept" \| "video"`; `setPro(false)` при `tab === "dept"` переводит в `"channel"` | один источник навигации, Pro → Oddiy без тупика |
| `configure({bot, approveDelayMs})` — единственное место, где читаются `?ui=pro\|simple` (перекрывает и сохраняет) и `?k=` (§5.1). Студия передаёт `approveDelayMs: 4000`, Mini App — ничего (0) | одно место чтения параметров, без `data-pro` |
| `approve(id, delayMs?)` → `Promise<{ok: true} \| {ok: false; message: string}>`; `pendingApprove`, `undoApprove(id)`, `flushApprovals()` | безопасный Enter, отмена, ошибка не теряется |
| `publish(id, script)` → `Promise<{ok: true; url?: string} \| {ok: false; message: string; adminUrl?: string; botUrl?: string}>`; перед запросом ждёт отложенное одобрение своего поста | haptics и попап в Mini App, двухшаговая публикация на ПК |
| `setImage(id, image)` (обёртка над `setPostImage` и `countImages`) | `PostImage.onChange` |
| `learnStyle` при успехе пишет `brand.visual` | `StyleRefs`, строка референсов |
| `refreshPosts()`: `listPosts` и слияние по id (статус, `publishedUrl`, `approvedAt`, `image`); локальные правки не трогает; посты, которых нет локально, добавляет | публикация через бота, другие устройства |
| `justFinished`: `true` при ready после прогона, `false` при reopen, reset и переходе в Postlar; `tab` после прогона по §3.7 | первый момент |
| `handTick` растёт при успешных `approve` и `publish` | мерцание SMM |
| `newChannel()`: в образце `location.assign(location.pathname)`, иначе `reset()` | образец |
| При появлении бренда (не в образце) — запись в `localStorage["mercat.recent"]` (до 8, новые сверху); `recentBrands()` | So‘nggi kanallar |
| `reopen` при `brand_forbidden` оставляет `problem.code`, Start показывает экран 403 | §3.7 |
| `api.ts`: `authHeader()`, handoff в `headers()` | §5.1 |
| `fromPlan`: `window.scrollTo` оставить (на ПК прокручивается документ); Mini App сам сбрасывает свои скроллы при смене фазы | — |

## 7. Oddiy и Pro

| | ПК · Oddiy | ПК · Pro (по умолчанию) | Телефон · Oddiy (по умолчанию) | Телефон · Pro |
|---|---|---|---|---|
| Навигация | хаб: Postlar, Kanal, Video | хаб: Postlar, Kanal, Video, Bo‘lim | таб-бар Kanal · Postlar · Video | так же |
| Отдел | мини-лампы в хабе, свет за стеклом | то же, раздел Bo‘lim, `LampDrawer` | `Strip` | `Panel`, шит сотрудника |
| Инструменты | Asboblar в хабе | Asboblar, палитра (P1) | кнопки в посте | так же |
| Postlar | карточки колонкой 640 | очередь · превью · инспектор | «Sizni kutmoqda» → пост | то же и детали поста |
| Пост | язык, если в `dna.languages` 2+ | 4 письменности, Muharrir, слот, прогноз | язык, если 2+ | 4 письменности, Muharrir |
| Картинка | `PostImage` и строка референсов | то же, промпт, модель, фото товара | `PostImage` и строка референсов | то же, pro-вид |
| Kanal | вывеска, находки, StyleRefs, голос, план | 2 колонки, AuditFull, Sufficiency, прогноз | находки, StyleRefs, план | то же, Panel, стратегия, прогноз |
| Клавиатура | нет | J/K, Enter, E, 1–4 в очереди и превью; Ctrl K (P1) | — | — |
| Лайм | кнопка у поста | кнопка у поста | MainButton | MainButton |
| Переключатель | футер хаба | футер хаба | шит настроек | шит настроек |

## 8. Новые строки интерфейса

Около 40 ключей. Общие — в `ui/copy.ts` (studio-ux), строки только Mini App — в `miniapp/copy.ts`. Тип `Copy` строгий: без всех трёх языков сборка не пройдёт. Числа вынесены в скобки там, где русское склонение иначе сломается.

| Ключ | uz | ru | en |
|---|---|---|---|
| `hub.noChannel` | Kanal hali yo‘q | Канала пока нет | No channel yet |
| `hub.live` / `hub.reading` / `hub.sample` | jonli / o‘qilmoqda / namuna | подключён / читаем / образец | live / reading / sample |
| `hub.recent` | So‘nggi kanallar | Недавние каналы | Recent channels |
| `hub.openTg` | Telegramda ochish | Открыть в Telegram | Open in Telegram |
| `hub.moveRight` / `hub.moveLeft` | Hubni o‘ngga o‘tkazish / Hubni chapga o‘tkazish | Перенести хаб вправо / влево | Move the hub right / left |
| `mode.simple` / `mode.pro` | Oddiy / Pro | Простой / Pro | Simple / Pro |
| `tools.title` | Asboblar | Инструменты | Tools |
| `tools.ctxPost` / `tools.ctxChannel` | post {i}/{n} / kanal | пост {i}/{n} / канал | post {i}/{n} / channel |
| `tools.otherImage` | Boshqa rasm | Другая картинка | Another picture |
| `tools.productPhoto` | Mahsulot fotosi | Фото товара | Product photo |
| `tools.copyText` | Matnni nusxalash | Копировать текст | Copy text |
| `tools.download` | Rasmni yuklab olish | Скачать картинку | Download picture |
| `tools.newPost` | Yangi post | Новый пост | New post |
| `tools.addPhotos` | Rasm qo‘shish | Добавить фото | Add photos |
| `tools.copyWeek` | Haftani nusxalash | Копировать неделю | Copy the week |
| `tools.botAdmin` | Botni admin qilish | Сделать бота админом | Make the bot an admin |
| `tools.copied` | Nusxalandi | Скопировано | Copied |
| `tools.needPlan` | Avval haftalik reja kerak | Сначала нужен план недели | Needs the week plan first |
| `tools.notInSample` | Namunada ishlamaydi | В образце не работает | Not in the sample |
| `queue.waiting` / `queue.approved` / `queue.published` | Sizni kutmoqda / Tasdiqlangan / Joylangan | Ждут вас / Одобрены / Опубликованы | Waiting for you / Approved / Published |
| `queue.suggest` | tavsiya: {when} | рекомендуем: {when} | suggested: {when} |
| `queue.notAuto` | O‘zi joylanmaydi — siz tasdiqlab joylaysiz. | Сам пост не выйдет: вы одобряете и публикуете. | Nothing goes out by itself: you approve, then publish. |
| `queue.empty` | Hali post yo‘q. Kanal bo‘limida rejadagi kunni tanlab, «Postini yozish»ni bosing. | Постов пока нет. В разделе «Канал» выберите день плана и нажмите «Написать пост». | No posts yet. In Channel, pick a day in the plan and press “Write the post”. |
| `queue.toChannel` | Kanalga o‘tish | Перейти в канал | Go to Channel |
| `queue.allDone` | Hammasi tasdiqlandi — endi Telegramda joylang | Всё одобрено. Теперь опубликуйте в Telegram | All approved. Now publish in Telegram |
| `approve.toast` / `approve.undo` | Tasdiqlandi / Bekor qilish | Одобрено / Отменить | Approved / Undo |
| `approve.failed` / `approve.show` | Tasdiqlanmadi: {why} / Ko‘rish | Не одобрено: {why} / Показать | Not approved: {why} / Show |
| `approve.next` | Tasdiqlandi. Keyingi: {when} | Одобрено. Следующий: {when} | Approved. Next: {when} |
| `publish.confirm` | Ha, {channel} kanaliga joylash | Да, опубликовать в {channel} | Yes, publish to {channel} |
| `insp.plan` / `insp.lang` / `insp.image` / `insp.brief` | Reja / Til / Rasm / Topshiriq | План / Язык / Картинка / Задание | Plan / Language / Picture / Brief |
| `insp.natural` | Tabiiylik {n}/100 | Естественность {n}/100 | Natural {n}/100 |
| `insp.cyrlStale` | Kirill matni tasdiqlanganda yangilanadi | Кириллица обновится при одобрении | The Cyrillic version updates on approval |
| `refs.channel` | Kanalingizdagi {n} ta rasm asosida | По фото вашего канала ({n}) | Based on your channel’s photos ({n}) |
| `refs.owner` | Siz yuborgan rasmlar asosida ({n} ta) | По вашим фото ({n}) | Based on your photos ({n}) |
| `refs.mixed` | Kanal va sizning rasmlaringiz asosida ({n} ta) | По фото канала и вашим ({n}) | Based on your channel’s and your photos ({n}) |
| `first.title` | Kanalingizni o‘qidik | Мы прочитали ваш канал | We read your channel |
| `first.cta` | Postlarni ko‘rish · {n} | Посмотреть посты · {n} | See the posts · {n} |
| `sign.notMeasured` / `sign.measuring` | Kanal hali o‘lchanmagan / o‘lchanmoqda… | Канал ещё не измерен / измеряем… | Nothing measured yet / measuring… |
| `reopen.noPlan` / `reopen.buildPlan` | Haftalik reja bu qurilmada yo‘q / Rejani tuzish | Плана недели на этом устройстве нет / Составить план | No week plan on this device / Build the plan |
| `access.forbidden` | Bu kanal Telegramdagi hisobingizga tegishli. Uni bot orqali oching. | Этот канал привязан к вашему аккаунту Telegram. Откройте его через бота. | This channel belongs to your Telegram account. Open it from the bot. |
| `sample.noImage` | Namunada rasm chizilmaydi | В образце картинки не рисуются | The sample has no pictures |
| `keys.hint` | Enter — tasdiqlash · E — tahrir · J/K — postlar · 1–4 — til | Enter — одобрить · E — править · J/K — посты · 1–4 — язык | Enter approve · E edit · J/K posts · 1–4 language |
| `dept.log` | Ish jurnali | Журнал работы | Work log |
| `problem.dismiss` | Yopish | Закрыть | Dismiss |

Подписи вывески берутся из уже существующих ключей (`c.channel.subscribers`, `c.channel.avgViews`, `c.channel.reach`, `c.pro.postsAnalyzed`), «Telegramda ochish» для экрана 403 — из `hub.openTg`.

## 9. Порядок, границы и владение

P0 — то, без чего утром нет демо. P1 — только после того, как P0 смёржен и проверен. P2 — не сегодня.

### studio-ux (ПК)

| Шаг | Время | Что |
|---|---|---|
| 0 | 20:45–21:30 | Слияние `tmp/integration`, §6, правки `PostImage` и `StyleRefs` (§3.6). Push, хэш — в miniapp. |
| 1 | 21:30–22:30 | Хаб: чип канала с меню и «So‘nggi kanallar», строка Bo‘lim, мини-лампы-кнопки с подсказками, сегмент Oddiy/Pro в футере, Asboblar-каркас, `StageLight` за лампами 0.40, проверка ламп, мерцание SMM, `StudioSkeleton`, fallback’и `.hub`. |
| 2 | 22:30–00:30 | Postlar Pro: `Queue`, превью на `PostCard`, `Inspector`, `ChannelSign`, `PostImage` везде, `useHotkeys` с безопасным Enter, отложенное одобрение с тостом, публикация (двухшаговая с `k`, через бота с `refreshPosts` без `k`). |
| 3 | 00:30–01:30 | Kanal: `FirstLook`, Oddiy со `StyleRefs`, Pro в две колонки, reopen без плана; Bo‘lim; ошибки в ready; правила образца; экран 403. |
| 4 | 01:30–02:15 | Asboblar: ручки `PostImage` и `StyleRefs`, копирование, скачивание, «Yangi post». |
| 5 | 02:15–02:45 | DESIGN.md, проверка §10 на 1440, 1366, 1280 и 1024, скриншоты start, working и ready. |
| — | 03:00 | P0 заморожен, PR. Дальше только P1 и фиксы. |

- **P1:** палитра (§3.9); находки в `Working`; Ctrl/⌘ Z; jpg для образца; ловушка фокуса в `LampDrawer`.
- **P2:** скрытый хаб с выездом от края, ПКМ-меню хаба, режимы стекла, G-последовательности, `[`, лист клавиш, side-peek, поиск постов в палитре, инлайн-скрипт стороны хаба, разделы Uslub и Sozlamalar, светлая тема `/studio`.

### miniapp (телефон)

| Шаг | Время | Что |
|---|---|---|
| 0 | 20:45–21:00 | Commit WIP, rebase на `tmp/integration`. |
| 1 | 21:00–21:45 | Маршрут по id, очистка CloudStorage `brand`, автоповтор из фона, подтверждение закрытия, perf. |
| 2 | 21:45–23:00 | `PostImage` в посте, строка референсов, `StyleRefs` в Kanal, удалить свою перерисовку в `Sheets.tsx`. |
| 3 | 23:00–00:00 | Результаты approve и publish (после шага 0 studio-ux), попап, первый запуск с MainButton. |
| 4 | 00:00–01:00 | Проверка §10 в браузере (`?preview=dark&mock=1`) и в Telegram на iOS и Android. |
| — | 01:30 | P0, PR. |

- **P1:** Pro на телефоне (§4.3), «Kompyuterda to‘liq studiya» (после `/api/uslub/handoff`), «Matnni nusxalash» в посте, мерцание SMM в `Strip` и `Panel`.

### Владение файлами

| Сессия | Файлы |
|---|---|
| studio-ux (ПК) | `src/components/**`, кроме `miniapp/**` (с этой ночи включая `media/**`); `src/app/**`, кроме `api/**` и `tg/**`; `src/app/globals.css`; `DESIGN.md`, `PRODUCT.md` |
| miniapp (телефон) | `src/app/tg/**`, `src/components/miniapp/**`, `src/types/telegram-webapp.d.ts` |
| engine | `src/lib/uslub/handoff.ts`, `src/lib/uslub/http.ts`, `src/lib/uslub/onboard.ts`, `src/app/api/uslub/handoff/**`, их тесты |
| lead | `package.json`, lock-файл, `contract.ts`, `env.ts`, `db/schema.sql`, `next.config.ts`, мёржи, env, BotFather, деплой |

- miniapp только читает `studio/*` (`store`, `api`, `Department`, `ProDetails`, `SpectrumIntro`, `PostPicture`), `lamp/*`, `ui/*` и `media/*`. Если нужна правка общего файла, miniapp пишет studio-ux через SendMessage и сам файл не трогает.
- Новых пакетов нет.

## 10. Чек-лист приёмки (lead, в браузере)

**ПК 1440×900 и 1366×768: `/studio?mock=1`, затем настоящий канал, затем ссылка из бота**

- [ ] Скриншоты start (во время проверки ламп), working (лампы горят) и ready: сквозь стекло хаба видны цвет ламп и размытие. В покое стекло тёмное, без пятен.
- [ ] Первый кадр — силуэт хаба на сцене, а не телефонная колонка и не пустота.
- [ ] Хаб перетаскивается вправо и обратно, dock-кнопка делает то же. После reload сторона и rail на месте.
- [ ] Наведение мышью и Tab по мини-лампе показывают «имя — состояние · результат». На 1366×768 хаб помещается, футер виден.
- [ ] После прогона открыт Kanal: 3 находки с настоящими цифрами и лаймовая «Postlarni ko‘rish · 5». Над разделом LED-вывеска с цифрами канала.
- [ ] Postlar Pro: группы «Sizni kutmoqda», «Tasdiqlangan», «Joylangan», подписи «tavsiya: …» и строка «O‘zi joylanmaydi…». Секции инспектора подписаны Strateg, Tarjimon, Muharrir, Dizayner и Kopirayter с филаментами их цвета.
- [ ] Картинка поста проявляется, под ней «Kanalingizdagi N ta rasm asosida», в Oddiy тоже. В Kanal видны референсы и палитра.
- [ ] Enter одобряет; «Bekor qilish» в тосте возвращает черновик без запроса. Enter при фокусе на кнопке языка или на «Tahrirlash» не одобряет. Зажатый Enter одобряет один пост. С выключенной сетью ошибка видна в тосте с «Ko‘rish».
- [ ] При одобрении мигают бирюзовая лампа SMM-menejer и её пятно за стеклом.
- [ ] J, K, 1–4 и E работают в русской раскладке; в Oddiy одиночные клавиши молчат.
- [ ] Asboblar: «Boshqa rasm» перерисовывает картинку (на одобренном посте выключена), «Matnni nusxalash» кладёт текст в буфер, «Rasmni yuklab olish» скачивает файл, «Yangi post» пишет пост для следующего слота, «Botni admin qilish» открывает бота.
- [ ] Меню чипа: «So‘nggi kanallar» переключает два канала без нового прогона.
- [ ] Ссылка «Studio» из бота (`?brand=&k=`) открывает бренд с постами, `k` пропадает из адресной строки. «Telegramda joylash» просит второе нажатие и публикует, статус «joylandi». Без `k` — бот в новой вкладке, после возврата во вкладку статус обновлён.
- [ ] `?mock=1`: «Yangi kanal» уводит на `/studio`, инструменты генерации выключены с подсказкой.
- [ ] В Windows выключены «Эффекты прозрачности» — хаб сплошной.
- [ ] CLS 0 при зажигании ламп и при одобрении. Все новые строки есть на uz, ru и en.

**Mini App 375×812: `/tg?preview=dark&mock=1` (dev), затем Telegram на iOS и на Android среднего класса**

- [ ] Fullscreen на телефоне, шапка Telegram не налезает на контент (iOS и Android).
- [ ] Запуск кнопкой бота (`?brand=`) сразу открывает бренд. Повторный запуск открывает последний бренд. Удалённый бренд не открывается снова и ведёт на Start.
- [ ] Первый прогон: Kanal с находками и MainButton «Postlarni ko‘rish · 5».
- [ ] Пост: свайп между постами, MainButton «Tasdiqlash» и Secondary «Tahrirlash»; затем «Kanalga joylash» с бликом, вибрация success, пост с картинкой в канале.
- [ ] Публикация без прав админа: попап с кнопкой «Botni admin qilish».
- [ ] На черновике есть «Boshqa variant», на одобренном посте её нет. Строка референсов под картинкой видна в Oddiy.
- [ ] Свернуть Telegram на 30 с во время прогона и вернуться: прогон продолжается сам.
- [ ] Android среднего класса: Spektr не играет, вместо него проверка ламп; прокрутка Postlar плавная.
- [ ] Светлая тема Telegram: белая сцена, без шва у нижних кнопок.
- [ ] На 360 px нет горизонтальной прокрутки, цели не меньше 44 px, поле ввода не зумится на iOS.
