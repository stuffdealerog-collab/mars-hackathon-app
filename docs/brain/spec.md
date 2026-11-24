# Mercat Brain v1: implementable spec

> Implementation map (v2): `src/lib/uslub/brain/` —
> `types.ts` (§0), `scrape.ts` (A1.1, detects "no public preview" redirects), `validity.ts` (competitor gate:
> squatted / empty / stale / tiny / no preview), `stats.ts` (§B), `rules.ts` (§C incl. live R.FUNNEL_LEAK and
> niche-benchmark relReach), `bench.ts` (niche benchmarks from text-free channel summaries, `bench-seed.json` =
> the frozen golden set), `forecast.ts` (expected views/starts per slot), `learn.ts` + `learn-run.ts` (A5 learn loop),
> `memory.ts` (Neon tables `brain_*`), `audit.ts` (A1 + D1), `skeleton.ts` (A3/A4 + hook-type and fact-focus
> assignment), `strategy.ts` (A2: D0 cached, D2 with web W#, D3 per parallel group, critic → repair → critic),
> `web.ts` (W#), `sufficiency.ts` (honest "not enough data" panel), `knowledge*.ts` + `kbstore.ts` (owner memory),
> `adcheck*.ts` (ad-placement check). Routes: `POST /api/uslub/analyze`, `POST /api/uslub/strategy` (NDJSON with
> `stream:true`), `POST /api/uslub/learn`, `POST|GET /api/uslub/knowledge`, `POST /api/uslub/adcheck`.
> Bot: plan-link leads (`src_<tag>_<slot>`), `Sotildi` button, `/natija`. Eval: `tests/brain/eval/`, results in
> `docs/brain/eval.md`.

**Core principle:** Code decides what is true, when to post, and why. The LLM decides only how to say it, and its output is checked. Any claim without a ledger id gets deleted. It is never softened instead.

---

## 0. Shared primitives (`lib/brain/`)

```ts
export const TZ_H = 5;                 // Asia/Tashkent, fixed UTC+5, no DST
export const MATURE_H = 72;            // only posts ≥72h old enter view stats
export const MIN_N = 3;                // min posts per bucket (hour/weekday/format/lang/length)
export const MIN_CHANNEL_N = 10;       // min mature posts for channel-level lift/trend/CV
export const WIN = 1.2, LOSE = 0.8;    // lift thresholds, used for every bucket
export const NEIGHBOURS = 10;

type LedgerEntry = {
  id: string;            // "S.reachRate" | "S.formatLift.video" | "F7" | "W2" | "P.kafe_uz/812" | "R.HIDDEN_PRICE"
  label: string; value: number | string;
  display: string;       // "6.2%" — the LLM must copy this exact text
  n?: number; window?: string;          // "n=28, 90d"
  source: "stats" | "kb" | "web" | "post" | "rule" | "owner";
  prior?: boolean;       // the threshold or benchmark is a rule of thumb, not data
  url?: string; quote?: string;
};
export const ID_RE = /\b(S\.[\w.\-]+|F\d+|W\d+|P\.\w+\/\d+|R\.[A-Z_]+)\b/g;
```

**Citation convention:** every LLM-written claim string ends with its ids in brackets, for example `"... [S.reachRate, R.LOW_REACH]"`. The UI turns the brackets into chips. Validators read the same ids.

**Models.** All calls use `output_config: {format: {type: "json_schema", schema}}`. Do not use forced `tool_choice`, because Sonnet 5.5 rejects it with a 400. Always check `stop_reason` before parsing.

| Call | Model | Effort |
|---|---|---|
| fact extraction | `claude-haiku-5-5` | low |
| findings writer | `claude-sonnet-5-5` | medium |
| web context | `claude-sonnet-5-5` + `{type:"web_search_20260209", name:"web_search", max_uses:3, user_location:{type:"approximate", city:"Tashkent", country:"UZ", timezone:"Asia/Tashkent"}}` | low; plain text, separate call |
| strategist | `claude-sonnet-5-5` | medium |
| planner and repair | `claude-sonnet-5-5` | medium |
| critic | `claude-haiku-5-5` | low |

- The web context call runs separately because citations do not mix with structured outputs.
- Sonnet calls go through the beta endpoint with `betas:["server-side-fallback-2026-07-01"], fallbacks:"default"`.
- Put the static system prompts and the lexicon first, with `cache_control`.

---

## A. Pipeline

### A1. `POST /api/brain/analyze`

Input: `{channel, competitors?: string[] (max 3), lang: "uz"|"ru"|"en", category}`.

The route streams NDJSON events `{stage, ...}`, which drive the UI trace animation.

1. **Scrape** the own channel and competitors in parallel.
   - Fetch `https://t.me/s/<ch>`, then `?before=<smallest id seen>`.
   - Stop at 60 posts, when the oldest post is more than 90 days old, or after 4 pages.
   - Timeout is 8 s per request. Results are cached in memory for 30 min.
   - **Header:** title from `.tgme_channel_info_header_title`; subscribers from the `.tgme_channel_info_counter` whose `.counter_type` matches `/subscriber|подписчик|obunachi/i` (parse `.counter_value`). If the counter is missing, subscribers is `undefined`. Never guess it.
   - **Posts:** each `.tgme_widget_message[data-post]`. Skip `.service_message`. Text is the innerText of `.tgme_widget_message_text`, keeping line breaks. Time is `time[datetime]` (UTC) plus 5 h. Views from `.tgme_widget_message_views` ("1.2K" = 1200, "3,4M" = 3400000, `approx=true` with a suffix).
   - Media type: `roundvideo`/`video_player` = video; `grouped_wrap` = album (one post); `photo_wrap` = photo; document/poll = other; else text. `.tgme_widget_message_forwarded_from` sets `isForward`. Collect every `a[href]`.
   - No messages and no header: error `NO_PUBLIC_PREVIEW`.
   - The preview never shows forward counts or past subscriber history. The system never claims to know either.
2. **`features(post)`**: regex-only feature extraction (§B).
3. **`stats(posts, subs, now)`**: ChannelStats for the own channel and each competitor.
4. **`rules(...)`**: `FiredRule[] = {id, kind, severity 1-3, trigger: "reachRate 6.2% < 10% (taxminiy, 1k–10k)", ids[], effects}`. Fully deterministic (§C).
5. **Ledger** = S-entries from stats ∪ P-entries (top 5 and bottom 5 posts by lift, plus competitor top posts) ∪ R-entries for fired rules.
6. **Findings LLM** (D1), validated with E.1 and E.4 plus an id-existence check. Invalid findings are dropped. A fired rule with no surviving finding gets the template `"{rule.name}: {trigger}"`.
7. **Assemble the ChannelAudit:** `postsAnalyzed` (all posts in window); `avgViews` = median of mature posts (never the mean); `reachRate` = median views / subs; `bestHours`/`bestWeekdays` only buckets with n ≥ 3 and lift ≥ 1.2, else `[]` (UI shows priors as "taxminiy"); `formatMix` shares; `topPosts` top 3 by lift (mature, non-ad) with a code-built `why` ("2.1× vs neighbours · video · 19–22 · price shown"); `findings.evidence` = cited entries joined ("S.reachRate=6.2% (n=28, 90d) · R.LOW_REACH"); `benchmark` one row per competitor, suspect-boosted channels listed but excluded from medians.

### A2. `POST /api/brain/strategy`

Input: `{audit, ledger, firedRules, kbText, goal, lang, category, brandName}`.

1. **Facts (D0, Haiku)** `[{id:"F1", type, text, quote}]`. Code keeps a fact only if its `quote` is an exact substring of `kbText` after whitespace normalisation. Types: product, price, address, district, landmark, hours, contact, delivery, payment, year, number, person, review, certificate, guarantee, offer, deadline, story.
2. **Missing-facts gate (code)** → `ownerQuestions[]` (max 5): no price facts → sale slots become trust slots + ask prices; no address or hours → ask; fewer than 2 proof facts → TRUST_GAP fires.
3. **Web context** (optional, 12 s budget, never blocks). Only results with a URL become `W#` entries.
4. **Code computes:** base pillar shares + rule ±10 pp; KPIs (A4); competitor claims (top 15 content trigrams with P-ids); voice fingerprint (§B).
5. **Strategist (D2)** produces the Strategy without KPIs; code injects KPIs and overwrites pillar shares.
6. **Plan:** code skeleton (A3), planner (D3) fills text, lint + critic (E), failed items regenerated once, code assembles the ContentPlan.
7. **Return** `{strategy, plan, ledger, firedRules, ownerQuestions, criticReport}`.

### A3. Plan skeleton (code only; the LLM never picks day, time, goal, format or approval)

- **Week:** `weekOf` is tomorrow in Tashkent time; the plan covers 7 days (demo: Wed 25 Nov – Tue 1 Dec, includes Black Friday 27 Nov).
- **N** (`ppw` = `S.postsPerWeek`): ppw < 7 → `clamp(round(ppw) + max(1, round(0.3·ppw)), 3, 7)` and `≤ max(3, ceil(1.5·ppw))`; ppw ≥ 7 → `min(round(ppw), 10)`; OVERPOSTING → `max(5, round(0.7·ppw))`; no history → 3.
- **Goal counts:** largest-remainder over pillar shares; ≥1 trust; ≤3 sale (≤2 with TRUST_GAP or OVERSELLING); sale only with a price or offer fact; INCONSISTENT → ≤1 sale, not in the first 2 slots.
- **Days:** slot i on day `round(i·7/N)`; sale on `bestWeekdays` (else Thu–Sat impulse, Sun/Mon education & clinics); never two sales on adjacent days; the slot before each sale is trust; reach early in the week.
- **Time** with `timeSource`: `data` (own best bucket, median minute of own top posts there or `:40`) → `competitor` (competitor-median best bucket) → `prior` (08:40, 12:40, 20:40; cafe sale 11:20 or 17:40; education/clinics Sun 20:40 or Mon 08:40). Never Fri 12:00–14:00 (move to 14:40). Never `:00`.
- **Format:** FORMAT_WINNER +2 slots of the winner; ≤2 videos; ≥1 real photo/video; no data → 50% photo/album, 25% video, 25% text.
- **Experiment:** exactly 1 item with `exp:<var>`, next untested of hour, format, hookType, length, language; hour concentration > 70% → hour.
- **Calendar (§F):** event ≤14 days that fits the category: with an offer fact, a sale post 2–4 days before + a reminder on the day (count toward the cap); otherwise one value/trust post, never the word "sale".
- **CTA link:** sale/trust get `https://t.me/<bot>?start=src_<yyww>_<n>` (≤64 chars, `[A-Za-z0-9_-]`); reach gets no link (forward/save CTA).
- **Metric** from median views `med`: reach `≥{round(1.2·med)} views at 72h (lift 1.2) [S.medianViews]`; trust `≥{med} views and ≥3 bot starts`; sale `≥{max(3, round(0.01·med))} bot starts (CTR 1%, taxminiy) and ≥1 order`; unknown `med` → `"baseline: week 1"`.
- **needsApproval** (union, the LLM can never unset it): sale slot or price/discount/promo/giveaway/deadline; video; brand has < 5 approved posts; mentions a competitor; health/education outcome claim or children; religious/holiday content; customer name/photo/review; a language never used on the channel; a fact not owner-approved; critic still flags after retry. Demo seed `approvedPosts = 12`.
- **Meta line** appended to `brief`: `— Dalil: S.hourLift.19-22 · F3 | Vaqt: data | Tasdiq: narx, video | exp:hour`

### A4. KPIs (code-built, ≤5, localized templates)

| KPI | Baseline | Target | How measured |
|---|---|---|---|
| Posts per week kept | S.postsPerWeek | N | daily t.me/s scrape |
| Median views at 72h | S.medianViews | +15% in 4 weeks (+20% if LOW_REACH) | t.me/s scrape at 72h |
| reachRate (skip if subscribers unknown) | S.reachRate | +2 pp in 4 weeks if below band, else hold | scrape |
| Bot starts per week | measured in week 1 | week-1 × 1.2 | `src_` tag counter |
| Sale CTR and orders per week | measured | 1% prior, then the channel's own p75 after 4 weeks | `src_` tags + owner's weekly one-tap answer |

Banned as KPIs: subscribers as the primary KPI, likes, "awareness".

### A5. Learn loop (v1 stores data now, uses it next week)

- Stored: `posts_published{src, tags{goal, pillar, format, hourBucket, weekday, hookType, lang, lengthBucket, exp}, postedAt, views24/72/7d}`, `starts{src, userId}`, `leads`, `orders` (one-tap "sotildi" or weekly 0 / 1–3 / 4–10 / 10+), `owner_edits{draft, final}`.
- Score per tag value `(Σlift + 3·1.0)/(n+3)`; CTR same with the channel mean CTR as prior.
- Status: hypothesis n < 3; supported n ≥ 3 and score ≥ 1.2; dropped n ≥ 3 and score < 0.8; rule = supported in 2 separate weeks (written to Brend xotirasi with evidence URLs).
- Next week: 70% supported tags, exactly 1 experiment, ≤2 variables change, pillar shares move ≤ ±10 pp, a "what changed and why" diff citing scores.
- Owner edits: a phrase deleted twice joins the banned lexicon; a fact added twice joins the KB; an autopilot post type with edit ratio > 30% returns to approval. Holiday weeks are flagged and excluded from baselines.

---

## B. Deterministic metrics

Normalise apostrophes first: `s.replace(/[ʻʼ’‘`´]/g,"'")`.

### Per-post features (regex only)

| Feature | Rule |
|---|---|
| `hasPrice` | `/\d[\d\s.,]*\s?(so'?m\|сўм\|сум\|sum\b\|uzs\|ming\b\|минг\|тыс\|k\b\|\$\|usd)/i` |
| `hiddenPrice` | `/narx(i\|ini)?\s*(lichka\|shaxsiy\|direkt\|dm)\|narxini bilish uchun\|цен[аыу]\s*(в\s*)?(лс\|личк\|директ)\|пишите в (лс\|директ)/i` |
| `buyVerb` | `/buyurtma\|band qiling\|yozing\|qo'ng'iroq\|ro'yxatdan\|bron\|sotib ol\|заказ\|пишите\|звоните\|запис\|брониру/i` |
| links | bot `/t\.me\/\w+bot\b\|\?start=/i`; phone `+998…`; map yandex/google/2gis; mention `/@\w{4,}/`; DM `t.me/<user>` |
| `hasCTA` | any link above, or `buyVerb` |
| `isPromo` | `chegirma\|aksiya\|skidka\|скидк\|акци\|bepul\|бесплатн\|sovg'a\|подар\|\d+\s?%\|1\s?\+\s?1\|nasiya\|muddatli to'lov\|рассрочк` |
| `isSale` | `hasPrice \|\| isPromo \|\| (buyVerb && (bot\|\|dm\|\|phone))` |
| `isAd` | `#reklama\|#реклама\|реклама\|reklama\|homiy\|#ad\|erid` — excluded from lift, counted in cadence |
| `hasHours` | `HH:MM–HH:MM\|ish vaqti\|режим работы` |
| `offerType` | discount / freeDelivery / installment / gift / trial |
| `lang` | uz-Cyrl (`[ўқғҳ]`) → ru (`[а-яё]`) → uz-Latn (`o'\|g'\|va\|uchun\|bilan\|siz\|bizda\|kerak\|bor`) → en; both scripts > 20% → mixed |
| others | emojiPer100, hashtags, firstLine, hookLen, lengthBucket (<300 / 300–800 / >800), questionHook, numberInHook, hourBucket (07–10, 10–13, 13–16, 16–19, 19–22, 22–01; 01–07 excluded), weekday (Tashkent) |

### Metrics

"Mature" = ≥72 h old. "Own" = not an ad, not forwarded.

| Metric | Formula | Edge case |
|---|---|---|
| `medianViews` | median views of the last 30 mature own posts | missing views excluded; needs ≥3 |
| `reachRate` | medianViews / subscribers | undefined if subscribers unknown (dependent rules skipped) |
| `lift_i` | views_i / median(10 nearest mature own posts by time, excl. i) | < 6 such posts → median of all |
| `postsPerWeek` | posts in last 28 days / 4 | channel < 28 days: posts / max(1, ageDays/7) |
| `maxGapDays` | longest gap in 90 days incl. last post → now | |
| `viewTrend` | median last 15 mature / median 15 before | needs ≥20; 20–29 split halves |
| `viewCV` | stdev / mean of last 20 mature own | needs ≥10 |
| bucket lifts | median lift in bucket | n < 3 → `null`, `insufficient (n=…)` |
| `hourConcentration` | share in busiest 3-h bucket | |
| `saleShare`, `promoShare`, `ctaRate`, `forwardShare` | shares in window | |
| `priceShareInSale` | hasPrice / isSale | undefined if < 3 sale posts |
| `hiddenPriceCount` | count | |
| `trustCoverage` (0–5) | map; phone; hours; address text; review post in last 30 days | |
| `emojiPer100`, `hashtagsPerPost`, `neuroDensity` | means over own posts; lexicon hits per 100 words | |
| `relReach` | our reachRate / median competitor reachRate | needs ≥2 non-suspect competitors |
| `CTR` | unique starts for the src tag / views at 72h | |

Thin data: < 10 mature posts → COLD_START (only cadence, medianViews, reachRate with `lowConfidence`). No posts → competitor medians + priors. ≥2 non-suspect competitors → competitor medians replace prior bands; relReach < 0.7 problem, > 1.3 strength.

### Prior thresholds (labelled "taxminiy me'yor")

reachRate low/high: <1k subs <15%/≥35%; 1k–10k <10%/≥25%; 10k–50k <7%/≥15%; >50k <4%/≥10%. Dead audience: below half the low bound with >1000 subs. Cadence: <2/week dormant, 3–7 healthy, >14 fatigue risk. viewCV < 0.12 suggests boosted views; > 1.5 one-off hits. Sale CTR <0.3% weak, 0.3–1.5% normal, >1.5% strong. Hook ≤90 chars (≤70 preferred). Telegram: 1024 caption, 4096 text. Spam look: >3 emoji/100 chars or >3 hashtags. Default times 08:40, 12:40, 20:40. K/M views ≈ ±5% (WIN 1.2 absorbs it).

### Voice fingerprint

From the owner's top-half posts by lift (top quartile ×2): `address`, `avgSentenceWords`, `emojiPer100`, `exclamPerSentence`, `medianChars`, `lineBreakDensity`, `primaryLang`, `apostropheStyle` (ʻ or '), `anchors[3]` (≤600 chars). Fewer than 5 own posts → KB style, "Siz", ≤1 emoji, no exclamation marks.

---

## C. Decision rules (run in code before any LLM call)

| Id | IF | Kind | Effects |
|---|---|---|---|
| R.COLD_START | mature < 10 or age < 28 d | problem (info) | priors/competitors for hour/format/lang; trust +10, sale −10; first 5 posts need approval; "ma'lumot yetarli emas" |
| R.SUSPECT_BOOSTED | viewCV < 0.12, n ≥ 10 | problem / benchmark note | don't raise frequency; never recommend buying views; competitor excluded from medians |
| R.LOW_REACH | reachRate < band low (or relReach < 0.7), subs > 1000 | problem | reach +10, sale −10; KPI reachRate + median views; no giveaways; +1 top-lift format slot |
| R.INCONSISTENT | ppw < 2 or maxGap > 10 | problem | N = 3–4; item 1 "we're here" trust post; ≤1 sale, not in slots 1–2 |
| R.OVERPOSTING | (ppw > 14 and viewTrend < 0.8) or (relReach < 0.7 and ppw > 1.5× competitor median) | problem | N = max(5, round(0.7·ppw)) |
| R.DECLINING | viewTrend < 0.8, n ≥ 20 | problem (hypothesis) | largest change last-15 vs previous-15 = "probable cause (hypothesis)" |
| R.NEVER_ASKS | saleShare < 15%, no LOW_REACH, KB has products and prices | opportunity | sale +10, trust −10; ≥2 sale slots with tracked links |
| R.OVERSELLING | (promoShare > 40% or saleShare > 50%) and sale lift < 0.8, n ≥ 3 | problem | sale −10, trust +10; ≤2 sale posts each after a trust post |
| R.HIDDEN_PRICE | (hiddenPrice ≥ 1 or priceShareInSale < 50%) and KB has prices | problem | every sale item carries the KB price; "narxi lichkada" banned |
| R.DEAD_ENDS | ctaRate < 50% | problem | every non-reach item gets exactly 1 tracked link |
| R.TRUST_GAP | trustCoverage ≤ 2 or < 2 proof facts | problem | trust +10, reach −10; ≥2 trust items; ≤2 sale; owner tasks |
| R.FORMAT_WINNER | formatLift ≥ 1.2, n ≥ 3 (loser ≤ 0.8) | strength / problem | +2 slots of winner; loser ≤1 slot |
| R.TIME_WINNER | hourLift ≥ 1.2, n ≥ 3; or concentration > 70% | strength / opportunity | sale slots in that bucket; else experiment an untested hour |
| R.LANGUAGE_WINNER | langLift a/b ≥ 1.25, n ≥ 3 each | strength | a primary; b only as a separate post |
| R.REPLICATE_WINNERS | feature in ≥3 of top-5 and ≤1 of bottom-5 | strength | feature required in 2 items |
| R.COMPETITOR_OUTPERFORMS | non-suspect competitor reachRate ≥ 1.5× ours | opportunity | 2 largest feature differences → experiment candidates; adapt format, never text |
| R.VALIDATED_OFFER | competitor used the same offerType ≥3× in 60 d | opportunity | test the mechanic; terms only from the owner (owner question) |
| R.CALENDAR | §F event ≤14 days, fits category | opportunity | offer fact: sale 2–4 days before + reminder; else value post; always approval |
| R.NOISE | emoji/100 > 3, hashtags > 3, forwards > 35% or neuroDensity > 1 | problem | lint caps ≤3 emoji, ≤2 hashtags |
| R.FUNNEL_LEAK | ≥1 tracked sale post with ≥500 views at 72h | problem | CTR < 0.3% offer; CTR ≥1% & 0 leads bot flow; leads ≥5 & 0 orders owner task. Inactive until tracking data exists |

**Pillar shares:** base by buying cycle — impulse 35/25/40 (cafe, fast food, flowers, delivery); considered 30/40/30 (shops, clothing, beauty, education centres, B2C); high-trust 25/50/25 (clinics, children's education, B2B). Apply each fired rule's delta in table order, clamp each to 15–55, renormalise to 100 with largest remainder. The UI shows every step.

---

## D. LLM prompts

System prompts are English; outputs in `{lang}`. The exact prompt texts (D-common grounding contract, D0 fact extractor, D1 findings writer, D2 strategist, D3 planner, the repair addendum and the Haiku critic) live verbatim in `src/lib/uslub/brain/llm.ts`, `audit.ts` and `strategy.ts`.

---

## E. Critic rubric (12 checks)

Code checks first (free, deterministic), then one Haiku call (effort low) for judgement items. Re-run later on the Kopirayter's full drafts with the 1024-char caption limit.

| # | Check | Runs in | Fails when |
|---|---|---|---|
| 1 | GROUNDED | code | a fact number (unit %, so'm, сум, $, ming, k, yil, год, or any value ≥ 11) does not match the display/value (±0.5%) of an id cited in the same string or `factIds`, or a cited id does not exist. Prices normalised (45 000 = 45k = 45 ming). HH:MM, dates and the link exempt. |
| 2 | PRICE | code | sale item lacks its KB price, price differs, or a hidden-price phrase |
| 3 | URGENCY | code | urgency phrase without an F deadline/capacity fact |
| 4 | ONE_CTA | code | sale/trust `{{LINK}}` count ≠ 1, reach has a link, or >1 action/contact |
| 5 | HOOK | code + Haiku | >90 chars, greeting, no specific, trigram Jaccard ≥ 0.6 with last 30 hooks, or nothing concrete |
| 6 | NEURO | code + Haiku | lexicon hit, paraphrased cliché, hype or calque |
| 7 | SWAP_TEST | Haiku | still true with a competitor's name |
| 8 | VOICE | code + Haiku | siz/sen mismatch, emoji > min(3, fp +50%), >2 hashtags, mixed-script word, wrong apostrophe, >1 language, off-brand manner |
| 9 | GOAL_FIT | Haiku | hook and CTA don't serve the slot goal |
| 10 | HONESTY_CATEGORY | Haiku + table | implied claim without F id; outcome guarantee for clinic/education; clinic Black Friday framing; alcohol; careless religious content; brief not producible with a phone this week |
| 11 | ORIGINALITY | code | trigram Jaccard ≥ 0.5 with any competitor post |
| 12 | PLAN_SHAPE | code | adjacency, missing trust-before-sale, goal mix off by >1, hookType >2, experiments ≠ 1, needsApproval mismatch — auto-fixed by code |

Retry: failing items regenerated once (repair call). Still failing GROUNDED/PRICE/URGENCY → claim removed, brief "Egasidan ma'lumot kerak: …", needsApproval true, owner question added. Other checks → kept with needsApproval and reason `critic:<check>`. A failed item never runs on autopilot.

---

## F. Local calendar, 24 Nov 2026 – 31 Jan 2027 (code constant, every item needs approval)

| Date | Event | Fits | Use |
|---|---|---|---|
| Fri 27 Nov | Black Friday ("Qora juma") | shops, e-commerce, beauty, cafe (combo); clinics excluded | sale only with an offer fact; else honest "our price all year" trust post; avoid Fri 12–14 |
| Mon 30 Nov | Cyber Monday | online shops | offer facts only |
| from Tue 1 Dec | New Year booking season | cafes/banquets, beauty, photo studios, education | booking posts tied to capacity facts |
| Tue 8 Dec | Constitution Day | all | hours notice only if confirmed; no greeting-only post |
| Sat 12 Dec | 12.12 sales | online shops | only if competitor posts show it |
| ~15–30 Dec | Korporativ season | cafes, shops (gift sets), beauty | offer facts only |
| ~20–28 Dec | Kids' New Year events | children's education, costumes, photo | value or offer |
| 22 Dec – ~30 Jan | Qish chillasi (folk) | cafe, clothing, clinics (tips), education | content hook only, never a sale pretext |
| ~25–31 Dec | Last delivery before New Year | shops, delivery | only with an owner-confirmed cutoff |
| ~28 Dec – ~11 Jan | School winter holidays | education, cafes | offer or value |
| Thu 31 Dec | New Year's Eve | cafes, beauty, shops | sale with offer facts |
| Fri 1 Jan 2027 | New Year | all | hours only; no standalone greeting if past holiday lift < 0.8 |
| early–mid Jan | "Yangi yil — yangi maqsad" | education, gyms, clinics | group start dates only from F |
| Thu 14 Jan | Vatan himoyachilari kuni | shops, barbers, cafes; clinics no sale framing | offer or value |
| mid–late Jan | University exam session | tutoring | value |
| 1–5, 15–20 monthly | Payday windows (prior) | high-ticket offers | timing only, never in copy |
| 25–31 Jan | Ramadan prep (1 Ramadan ≈ 8 Feb 2027) | cafes | iftar sets only if confirmed; religious content needs approval |
| Every Fri 12–14 | Juma | all | no posts |

---

## G. What the UI shows

Animated "brain trace" from the NDJSON stream (scrape counters → stats chips → 20 rule cards lit/dimmed/greyed `n=2` → findings sliding in, linked to rules). Finding cards with kind badge and evidence chips (S/P/F/W/R; prior chips dashed "taxminiy me'yor"; small n = "gipoteza"). Benchmark bars (suspect channels hatched, "excluded from the median"). Top posts strip. Strategy: positioning with highlighted differentiator + F chip, audience cards (UNKNOWN → Mijoz radar task), offer card (BLOCKED state), proof list, KPIs baseline → target. Goal mix: base bar, one animated ±10 pp step per fired rule, final split, planned counts. Plan: 7-day timeline with goal colour, time, `timeSource` chip, format icon, hook, CTA, metric, approval chip with reasons or "autopilot", `exp:` badge, critic status, fact chips. Rationale lines with chips. "Sizdan kerak" panel. Display rule: no number without its chip; empty states say `ma'lumot yetarli emas (n=…)`.

---

## Adversarial self-check: 5 ways this could still be "dumb AI marketing"

1. **Grounded but boring** — hooks must carry a specific; hook types rotate (≤2 per type); GOAL_FIT and HOOK critic checks; REPLICATE_WINNERS reuses proven structures; learn loop drops weak hook types. Residual: copy craft depends on the Kopirayter; owner edits feed the lexicon.
2. **False precision and vanity metrics** — mature posts only; lift vs neighbours; MIN_N 3 and WIN 1.2; prior/hypothesis labels; one experiment per week; k = 3 shrinkage; code-built KPIs (sales = starts and orders, subscriber KPIs banned); FUNNEL_LEAK picks offer vs bot vs owner.
3. **Generic strategy, same tone for everyone** — differentiator must cite F and not be a competitor trigram, else "weak differentiation" + owner question; swap test; product × situation audiences; `whereTheyAre` ledger-backed or UNKNOWN; cycle-specific pillar splits; voice fingerprint + anchors.
4. **Number laundering** — GROUNDED matches each number against the cited id; derived numbers forbidden; price normalisation; quote-verified facts; failure after retry deletes the claim and creates an owner question.
5. **Machine-made Uzbek and cultural misses** — one language per item, script-purity and apostrophe lint, calques on the lexicon, VOICE check, calendar fit/exclusions, Friday 12–14 block, religious/holiday approval, no greeting spam. Residual: native-speaker pass is v1.1.
