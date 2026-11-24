# Mercat Brain: evaluation on real Uzbek channels

Run on 24 Nov 2026 (Tashkent). Everything below can be reproduced from the repo; commands are at the end.

## What is measured, and why this is not a wrapper test

Founder's answers (24 Nov) set the target:

- **First paying customer:** a business owner with no marketer, one Telegram channel of 1k–20k subscribers.
- **Output they act on:** the weekly plan plus one experiment.
- **Measured outcomes:** bot starts through tracked links, views at 72 h, and orders the owner confirms.

So the eval asks three questions:

1. **Is the plan correct by construction?** Deterministic checks on 82 real channels cover plan shape, honest cold start, cited ids that exist, and forecast sanity. No LLM is involved.
2. **Is the copy good enough to publish?** An independent judge (`claude-opus-5-5`, not the generator's model) scores every plan item on a 1–3 rubric. The founder labels a sample to calibrate the judge.
3. **Does it beat Brain v1?** The same channels, the same knowledge base and the same judge are run against `main @ fbf9bb7`.

## Golden set

`tests/brain/eval/golden.json` lists 82 public channels of Uzbek small and mid-size businesses in 10 niches, verified on 24 Nov 2026. Each has a t.me/s preview, ≥ 500 subscribers and a post within 60 days. 250 candidates were rejected. The rejects include squatted handles such as `@lesailes_uz` (1 subscriber, titled "Hamkorlik uchun", formerly "Sotiladi", not Les Ailes) and `@olx_uz`, plus `@bonapetit_uz`, which has no public preview.

| niche | channels |
|---|---|
| electronics | 14 |
| clothing | 12 |
| education | 11 |
| beauty | 8 |
| flowers | 7 |
| furniture | 7 |
| cafe | 6 |
| fast food | 6 |
| online shops | 6 |
| clinics | 5 |

Fixtures in `tests/brain/eval/fixtures/` freeze each channel at capture time (post text trimmed to 500 characters), so evals don't drift with the live channels.

## 1. Deterministic regression eval (every test run, no network, no LLM)

`tests/brain/golden.test.ts` builds a plan skeleton for each of the 82 channels and checks these invariants:

- every id a fired rule cites exists in the ledger;
- cold-start channels get no hour, format or language "winners";
- at least 1 trust post, at most 3 sale posts, a trust post before every sale and no two sales on adjacent days;
- exactly 1 experiment;
- no `:00` times and nothing on Friday 12:00–14:00;
- reach posts carry no link, and sale and trust posts carry `src_<plan>_<slot>`;
- no forecast without data, and `low ≤ mid ≤ high`;
- at most 2 hooks of one type.

**Result: 82/82 pass.** The first run caught a real v1 bug. `R.OVERPOSTING` had no upper cap, so `@tarelkabistro_uz` (about 40 posts a week) got a 28-post "weekly plan". Plans are now capped at 10.

### What the data says about Uzbek SMB channels

Medians across channels in the same niche. Channels with flat, likely boosted views (`viewCV < 0.12`, 10 of 82) and channels with fewer than 10 mature posts are excluded.

| niche | channels (clean) | median reach (p25–p75) | posts/week | best hour (median lift, n channels) | sale-post share | CTA share |
|---|---|---|---|---|---|---|
| beauty | 8 (5) | 59.4% (51%–65.4%) | 2.5 | 07-10 (1.08×, n=3) | 9% | 35% |
| cafes and bakeries | 6 (clean < 5) | not enough data | – | – | – | – |
| clinics | 5 (5) | 49.6% (40.4%–67.4%) | 3.5 | 19-22 (1.12×, n=3) | 8% | 61% |
| clothing | 12 (7) | 62% (41.2%–75.5%) | 2 | 16-19 (1.05×, n=7) | 49% | 32% |
| online shops | 6 (clean < 5) | not enough data | – | – | – | – |
| education centres | 11 (8) | 32.3% (17.4%–45.1%) | 5.9 | 13-16 (1.03×, n=7) | 12% | 66% |
| electronics | 14 (9) | 23.1% (18.9%–25.1%) | 8.3 | 19-22 (1.02×, n=4) | 49% | 78% |
| fast food and delivery | 6 (6) | 62.7% (40.6%–102.4%) | 2.9 | 19-22 (1.06×, n=4) | 36% | 48% |
| flowers and gifts | 7 (clean < 5) | not enough data | – | – | – | – |
| furniture and home | 7 (5) | 66.8% (21%–75.5%) | 3 | 13-16 (1.03×, n=3) | 15% | 14% |

Two findings changed the Brain:

- **Posting time barely matters in this data.** No niche has an hour bucket with a median lift ≥ 1.1× across channels. The best is clinics 19–22 at 1.12×. Only 2 of 82 channels have their own hour winner (n ≥ 3, lift ≥ 1.2). The Brain therefore never presents a "best time" it can't support: 80/82 channels get "no bucket beats 1.2× — rule-of-thumb time plus one timing experiment". A typical AI-marketing tool would print a confident best time here.
- **Uzbek channels have much higher reach than the Russian rules of thumb assume.** Niche median views per subscriber run from 23% to 67%, and fast food p75 is 102%. The "ERR > 50% means boosted" line from Russian ad-buyer articles flagged 32 of these 82 ordinary channels as "caution". With niche bands it flags 14, and "suspect" drops from 3 to 2.

  | ERR line | ok | caution | suspect | insufficient |
  |---|---|---|---|---|
  | fixed 10–50% line | 35 | 32 | 3 | 12 |
  | niche-calibrated | 53 | 14 | 2 | 13 |

|---|---|---|---|---|---|---|
| rule | fired | not fired | insufficient | inactive |
|---|---|---|---|---|
| R.TRUST_GAP | 64 | 18 | 0 | 0 |
| R.HIDDEN_PRICE | 40 | 42 | 0 | 0 |
| R.DEAD_ENDS | 34 | 48 | 0 | 0 |
| R.REPLICATE_WINNERS | 34 | 31 | 17 | 0 |
| R.INCONSISTENT | 27 | 55 | 0 | 0 |
| R.LOW_REACH | 25 | 51 | 6 | 0 |
| R.DECLINING | 25 | 31 | 26 | 0 |
| R.COLD_START | 17 | 65 | 0 | 0 |
| R.NOISE | 13 | 69 | 0 | 0 |
| R.SUSPECT_BOOSTED | 10 | 55 | 17 | 0 |
| R.OVERPOSTING | 4 | 78 | 0 | 0 |
| R.FORMAT_WINNER | 4 | 61 | 17 | 0 |
| R.LANGUAGE_WINNER | 4 | 41 | 37 | 0 |
| R.TIME_WINNER | 3 | 62 | 17 | 0 |
| R.NEVER_ASKS | 0 | 82 | 0 | 0 |
| R.OVERSELLING | 0 | 82 | 0 | 0 |
| R.COMPETITOR_OUTPERFORMS | 0 | 0 | 82 | 0 |
| R.VALIDATED_OFFER | 0 | 0 | 82 | 0 |
| R.CALENDAR | 0 | 82 | 0 | 0 |
| R.FUNNEL_LEAK | 0 | 0 | 0 | 82 |

`R.COMPETITOR_OUTPERFORMS` and `R.VALIDATED_OFFER` need competitors, which this run did not pass. `R.FUNNEL_LEAK` stays `inactive` until tracked plan posts exist. `R.TRUST_GAP` fires for 78% of channels: most channels never show a map, opening hours or a recent review. That is true, but the rule barely tells channels apart (see limits below).

## 2. LLM eval: plan quality on 8 channels (Brain v2 vs v1)

One small or mid-size channel per niche:

- `@safiabakery` (cafe)
- `@banafa_uz` (beauty)
- `@phlebolife` (clinic)
- `@foggi_uz` (kids' clothing)
- `@ieltscenteruz` (education)
- `@imanshopuzb` (electronics, installments)
- `@floral_aesthetic_uz` (flowers)
- `@MebelSmart_uz` (furniture)

The knowledge base is the channel's own last 12 public posts, which is the "just paste a link" case. Output language is Uzbek Latin. The web context is off, so the comparison with v1 is fair.

**Judge:** `claude-opus-5-5`, pointwise scores 1–3, and a different criterion order for every item to control position bias. Rubric:

| criterion | 1 | 3 |
|---|---|---|
| SPECIFIC | the hook could fit any business | a concrete fact that matters for the goal |
| GROUNDED | states a fact, number, offer or promise not in the facts | every claim supported |
| NATURAL | sounds machine-made or translated | reads like the owner wrote it |
| ACTIONABLE | the owner can't tell what to shoot, or the CTA is missing or doubled | a clear phone-shootable brief and exactly one CTA |
| GOAL_FIT | hook and CTA don't serve reach, trust or sale | fully serve the goal |

The judge also answers `machine_made` (would a native reader suspect AI?).

| | v1 (main) | v2.0 | v2.2 | **v2.3 (this PR)** |
|---|---|---|---|---|
| prompt version | v1@fbf9bb7 | a99397d137 | bc69e9be9d | bc69e9be9d |
| plan items | 64 | 61 | 61 | 61 |
| items judged | 64 | 57 | 52 | 61 |
| judge SPECIFIC (1–3) | 2.64 | 2.61 | 2.48 | 2.56 |
| judge GROUNDED (1–3) | 2.52 | 2.47 | 2.56 | 2.52 |
| judge NATURAL (1–3) | 2.19 | 2.05 | 2.02 | 2.26 |
| judge ACTIONABLE (1–3) | 2.23 | 2.37 | 2.38 | 2.41 |
| judge GOAL_FIT (1–3) | 2.27 | 2.3 | 2.19 | 2.3 |
| items with any score of 1 | 28% | 40% | 35% | 21% |
| items scored 3 on every criterion | 3% | 7% | 6% | 8% |
| judge: "sounds machine-made" | 55% | 67% | 62% | 54% |
| items blocked by GROUNDED/PRICE/URGENCY after repair | 11 | 1 | 2 | 1 |
| items sent to the owner (critic still failing) | 21 | 12 | 13 | 9 |
| neuro-lexicon hits in hooks/CTAs | 0 | 0 | 0 | 0 |
| pipeline time, median / max (s) | 46 / 55 | 33 / 37 | 29 / 46 | 29 / 37 |

v2.1 (prompt e178a99d74, reverted) is not in the table: NATURAL 2.03, ACTIONABLE 2.43, "sounds machine-made" 74%. See the reverted change below. v2.0 judged 57/61 items (one judge request failed on an emoji cut in half, since fixed). v2.2 judged 52/61 (the judge returned 1 of 10 items for one channel). v1 ran live minutes after the fixtures were captured, with the same knowledge base and the same judge.

**What this says, without spin:**

- **Copy quality is about the same as v1.** v2.3 is slightly ahead on NATURAL (2.26 vs 2.19), ACTIONABLE (2.41 vs 2.23) and "any score of 1" (21% vs 28%). But v2.2 and v2.3 use **the same prompts** and differ by 0.24 on NATURAL. Run-to-run noise is about ±0.2, so none of the copy deltas is significant on 8 channels. About half of all hooks still read as machine-made to the judge, in v1 and in v2. This is the open problem, and the founder's labels decide whether the judge is even right about it.
- **Where v2 clearly wins:**
  - Only 9 of 61 items go back to the owner, against 21 of 64 in v1. One reason: the GROUNDED check glued price lists like "450.000, 600.000" into one number, flagged correct items as invented, and pushed them to owner input (fixed and tested).
  - The plan is ready in a median 29 s instead of 46 s, and the worst case is 37 s instead of 55 s. v1 ran close to the 60 s route limit.
  - The first slot cards stream in at about 10 s (skeleton) and the first written posts at about 20 s.
- **What did not work and was reverted:** v2.1 forced one hook type per slot and gave the model English "CTA angles". The judge marked 74% of hooks machine-made, for example "Bugun omborda bormi va aniq narxi qancha ekanini so'rang". Code now narrows the allowed hook types (only types the facts support, never types the learn loop dropped), and the model picks the wording. That is the spec's own principle: code decides what is true and when; the model decides how to say it.
- **Fixes that came from reading the judge's worst phrases** (not from tuning to its score):
  - ledger ids like "[F3, F21]" leaked into hooks; they are now stripped in code;
  - the example CTA was copied into almost every post;
  - an old master-class post was presented as a current Black Friday offer; posts in the knowledge base now carry their date, and dated events older than 14 days stay history.

## 3. Human calibration (founder, tonight)

`docs/brain/eval-labels.csv` holds every v2 plan item from the run above without the judge's scores. The founder fills SPECIFIC … GOAL_FIT (1–3), MACHINE_MADE (y/n) and a comment for 20–30 rows. Then run:

```bash
pnpm exec vitest run --config tests/brain/eval/vitest.config.mts agreement
```

This writes `docs/brain/eval-agreement.json`, which gives, per criterion, the number of labelled rows, exact agreement and quadratic-weighted Cohen's kappa between the judge and the founder. Until that file exists, the judge is **not calibrated against a human** and its numbers are only a relative signal (v1 vs v2, run vs run). Rule of thumb for this repo: trust a criterion's judge scores for regression gating only once its kappa reaches 0.4 or more.

## 4. Regression gate on every prompt change

`strategy.ts` exports `PROMPT_VERSION`, a hash of D2, D3, the repair prompt, the critic and the grounding contract. Every LLM eval run records it.

- `docs/brain/eval-baseline.json` is the current baseline.
- A new run on the same channel set fails if any judge criterion drops by more than 0.15 or if residual GROUNDED/PRICE/URGENCY failures increase.
- `EVAL_UPDATE_BASELINE=1` accepts a new baseline on purpose.

## Limits (honest)

- The judge is an LLM. Until the founder's labels arrive, "NATURAL" in particular is an informed guess, not a native-speaker verdict.
- 8 channels × about 8 items is a small sample. A 0.1 difference in a mean is noise.
- The knowledge base in the eval is public posts only. Real owners add prices, an address and reviews (the `/api/uslub/knowledge` route), which should raise SPECIFIC and GROUNDED.
- The learn loop and `R.FUNNEL_LEAK` are unit-tested but have **no real outcome data yet**. The first measurable results arrive 72 h after the first plan posts with tracked links go out.
- Benchmarks rest on 82 channels captured once. Cafes, online shops and flowers have fewer than 5 clean channels, so they fall back to "all niches", and the UI says so. Every live analysis adds rows to `brain_channel_stats`.
- `R.TRUST_GAP` fires for 78% of channels. It is accurate, but it should become relative to the niche (the trust coverage of the niche's p50) instead of a fixed 2/5.

## Commands

```bash
# deterministic eval (part of the normal test run)
pnpm exec vitest run tests/brain

# re-capture the golden set (network, about 4 min) and the benchmark seed
CAPTURE=1 pnpm exec vitest run --config tests/brain/eval/vitest.config.mts capture

# golden-set tables (no network)
REPORT=1 pnpm exec vitest run --config tests/brain/eval/vitest.config.mts report

# LLM eval (Anthropic API, about 6 min, ~$2): plans + judge + label sheet + regression gate
BRAIN_EVAL=1 EVAL_CHANNELS=safiabakery,banafa_uz,phlebolife,foggi_uz,ieltscenteruz,imanshopuzb,floral_aesthetic_uz,MebelSmart_uz \
  pnpm exec vitest run --config tests/brain/eval/vitest.config.mts llm

# judge vs founder labels
pnpm exec vitest run --config tests/brain/eval/vitest.config.mts agreement
```
