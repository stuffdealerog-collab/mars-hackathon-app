# Uslub Brain sample: @safiabakery (Safia Cafe & Bakery | Channel)

Generated 2026-11-24 by POST /api/uslub/analyze and POST /api/uslub/strategy (lang=uz, category="cafe bakery", competitor @lesailes_uz).
Knowledge base for the strategy = text of this channel's own public posts (no owner input), so prices/address/hours are intentionally missing and the system asks for them instead of inventing them.

**For the native-speaker review:** mark anything that sounds machine-made, any wrong apostrophe/siz form, and any claim that is not supported by the cited ids.

## 1. Audit

| metric | value |
|---|---|
| subscribers | 8850 |
| postsAnalyzed | 60 |
| postsPerWeek | 4.3 |
| avgViews (median, 72h+) | 4635 |
| reachRate | 52.4% |
| bestHours | [] |
| bestWeekdays | [] |
| formatMix | text 30%, photo 68%, album 0%, video 2%, other 0% |

### Rules (code-decided)

| rule | status | trigger |
|---|---|---|
| R.COLD_START | not_fired | mature posts 59 < 10, age 77d |
| R.SUSPECT_BOOSTED | not_fired | viewCV 0.13 < 0.12 (taxminiy) |
| R.LOW_REACH | not_fired | reachRate 52.4% ≥ 10% (taxminiy, 1k–10k) |
| R.INCONSISTENT | not_fired | postsPerWeek 4.3 · maxGap 5.3d (taxminiy: <2/hafta yoki >10 kun) |
| R.OVERPOSTING | not_fired | postsPerWeek 4.3 · viewTrend 0.96 |
| R.DECLINING | not_fired | viewTrend 0.96 < 0.8 |
| R.NEVER_ASKS | not_fired | saleShare 68.3% < 15% |
| R.OVERSELLING | not_fired | promoShare 66.7% · saleShare 68.3% · sale lift 1.02 (n=40) |
| R.HIDDEN_PRICE | fired | hiddenPrice 0 · priceShareInSale 12.2% |
| R.DEAD_ENDS | fired | ctaRate 5% < 50% |
| R.TRUST_GAP | fired | trustCoverage 2/5 |
| R.FORMAT_WINNER | not_fired | no format with n≥3 and lift ≥1.2 |
| R.TIME_WINNER | not_fired | hourConcentration 35% in 10-13 |
| R.LANGUAGE_WINNER | not_fired | need 2 languages with n≥3 |
| R.REPLICATE_WINNERS | fired | len:>800 in ≥3 of top-5, ≤1 of bottom-5 |
| R.COMPETITOR_OUTPERFORMS | not_fired | no competitor ≥1.5× our reachRate |
| R.VALIDATED_OFFER | not_fired | no repeated competitor offer |
| R.CALENDAR | fired | Black Friday in 3d · New Year booking season in 7d · Constitution Day in 14d |
| R.NOISE | not_fired | emoji/100 1.2 · hashtags 0.1 · forwards 0% · neuro 0/100w |
| R.FUNNEL_LEAK | inactive | needs tracked sale posts (src_ links) with ≥500 views at 72h |

### Findings (LLM-written, validated against the ledger)

- **problem** — Sotuv postlarining faqat 12% da narx ko'rsatilgan (taxminiy me'yor emas, sizning kanalingiz raqami), 'narxi lichkada' postlari esa 0 ta, ya'ni muammo yashirishda emas, narxni yozmaslikda; masalan, narx ko'rsatilgan P.Safiabakery/1644 qo'shni postlardan 1.7× ko'p ko'rilgan. Shu hafta har bir sotuv postiga bazadagi narxni yozamiz va 'narxi lichkada' iborasini ishlatmaymiz. [S.priceShareInSale, S.hiddenPriceCount, P.Safiabakery/1644, R.HIDDEN_PRICE]
  - evidence: `P.Safiabakery/1644=1.7× · S.priceShareInSale=12% · S.hiddenPriceCount=0 · R.HIDDEN_PRICE`
- **problem** — Harakatga chaqiruvi bor postlar atigi 5%, ya'ni odam postni o'qib, nima qilishni bilmay qoladi. Shu hafta reach'dan boshqa har bir postga bitta kuzatiladigan havola qo'shamiz, sotuv postlarida esa chaqiruvni dastlabki 3 qatorga qo'yamiz. [S.ctaRate, R.DEAD_ENDS]
  - evidence: `S.ctaRate=5% (n=60, 90d) · R.DEAD_ENDS`
- **problem** — Ishonch belgilari 2/5 — manzil, xarita, ish vaqti va haqiqiy jamoa yoki jarayon suratlari yetarli emas, shu bilan birga sotuv postlari ulushi 68%. Shu hafta kamida 2 ta ishonch posti chiqaramiz (manzil+xarita+ish vaqti; haqiqiy jamoa/jarayon surati yoki dumaloq video), sotuv postlarini 2 tagacha cheklaymiz, sizdan esa 3 ta haqiqiy sharh olib, postni qadab qo'yamiz. [S.trustCoverage, S.saleShare, R.TRUST_GAP]
  - evidence: `S.trustCoverage=2/5 · S.saleShare=68% (n=60, 90d) · R.TRUST_GAP`
- **opportunity** — Yaqinlashayotgan sanalar: Qora juma (2026-11-27), Yangi yil bronlari mavsumi (2026-12-01) va Konstitutsiya kuni (2026-12-08). Shu sanalar uchun 'aksiya' so'zisiz bitta foyda yoki ishonch posti tayyorlaymiz, u sizning tasdig'ingizdan keyin chiqadi. [S.calendar.blackfriday, S.calendar.ny-booking, S.calendar.constitution, R.CALENDAR]
  - evidence: `S.calendar.blackfriday · S.calendar.ny-booking · S.calendar.constitution · R.CALENDAR`
- **strength** — Eng yaxshi postlarning uchtasi (P.Safiabakery/1645 — 2.0×, P.Safiabakery/1644 — 1.7×, P.Safiabakery/1643 — 1.5× qo'shnilarga nisbatan) 800 belgidan uzun, shuning uchun uzun matnni saqlab qolamiz. Shu hafta 2 ta postni 800 belgidan uzun qilib yozamiz. [P.Safiabakery/1645, P.Safiabakery/1644, P.Safiabakery/1643, R.REPLICATE_WINNERS]
  - evidence: `P.Safiabakery/1645=2.0× · P.Safiabakery/1644=1.7× · P.Safiabakery/1643=1.5× · R.REPLICATE_WINNERS`

### Top posts

- https://t.me/Safiabakery/1645 — 10800 views — 2.0× vs neighbours · photo · 10–13 · promo
- https://t.me/Safiabakery/1644 — 8940 views — 1.7× vs neighbours · photo · 10–13 · price shown · promo
- https://t.me/Safiabakery/1643 — 8220 views — 1.5× vs neighbours · photo · 13–16 · promo

### Benchmark

```json
[
 {
  "channel": "@lesailes_uz",
  "subscribers": 1,
  "postsPerWeek": 0
 }
]
```

## 2. Strategy

**Positioning:** For Safia Novza filialiga kelib, shirinlikni shu zahoti tanlamoqchi bo'lganlar uchun, Safia Cafe & Bakery — yangi ruletlar va tortlar chiqadigan qandolat kafesi bo'lib, yangi Oreo Chizkeyk tortiga ilovada ikki karra keshbek beradi, unlike raqobatchilar (raqobatchi da'volari ledgerda yo'q, shuning uchun taqqoslash uchun aniq muqobil topilmadi). [F4, F5, F8, R.TRUST_GAP]

**Offer:** BLOCKED — price needed [R.TRUST_GAP]

**Audiences:**
- Novzadagi shirinlik xaridori — Yo'lda yoki filial yaqinida shirin pishiriq yoki tort tanlab, shu kuni olib ketmoqchi.
  - pains: -
  - triggers: Yangi mahsulot chiqishi: Oreo Chizkeyk torti [F4] / Ilovada ikki karra keshbek [F5]
  - where: Safia Novza filialimizda [F8] / Shu kanal, obunachilar 8850 [S.subscribers]
- Tort va rulet buyurtmachisi — Bayram yoki stol uchun tort yoki rulet tanlab, oldindan buyurtma bermoqchi.
  - pains: -
  - triggers: Qora juma (2026-11-27) [S.calendar.blackfriday] / Yangi yil bronlari mavsumi (2026-12-01) [S.calendar.ny-booking] / Konstitutsiya kuni (2026-12-08) [S.calendar.constitution]
  - where: Shu kanal, obunachilar 8850 [S.subscribers]

**Proof points:** Jarayon/mahsulot faktlari: Choko-Karamel — yengil qatlamali xamir, qora shokolad va cho‘ziluvchan karamel [F2] / Choko-Funduqli — shokolad, mayin funduqli pasta va shokoladli gurme [F3]

**Pillars (shares fixed by code):**
- reach 25% — Yangi ruletlar: Blek Forest va Qorag'at: Ruletlarni kesib ko'rsatadigan uzun post (800 belgidan uzun postlar yaxshi ishlagan) [F6, F7, R.REPLICATE_WINNERS] / Oreo Chizkeyk tortining yangilik sifatida chiqishi haqida qisqa e'lon [F4]
- trust 35% — Novza filialida pishiriq qanday tayyorlanadi: Choko-Karamel qatlamlari va karameli haqida jarayon posti, manzil bilan [F2, F8, R.TRUST_GAP] / Choko-Funduqli tarkibi haqida post, filialda ko'rish mumkinligi bilan [F3, F8, R.TRUST_GAP]
- sale 40% — Oreo Chizkeyk va keshbek: Oreo Chizkeyk torti posti, birinchi 3 qatorda bot havolasi [F4, F5, R.DEAD_ENDS] / Qora Shahzoda tortiga buyurtma posti, narx egasidan olingach [F1, R.CALENDAR]

Pillar math: base {"reach":35,"trust":25,"sale":40} → R.TRUST_GAP {"trust":10,"reach":-10} → final {"reach":25,"trust":35,"sale":40}

**KPIs (code-built):**
- Haftasiga postlar (reja bajarilishi): 4.3 → 5 (har kuni t.me/s orqali hisoblanadi)
- 72 soatdagi median ko'rishlar (+15% / 4 hafta): 4635 → 5330 (har kuni t.me/s orqali hisoblanadi)
- Qamrov (ko'rishlar / obunachilar), %: 52.4 → 52.4 (har kuni t.me/s orqali hisoblanadi)
- Botga yozganlar / hafta: week 1 → 98 (src_ teglari hisoblagichi (botda))
- Sotuv postidan botga o'tish (CTR), % — taxminiy 1%: week 1 → 1 (src_ teglari + egasining haftalik javobi (buyurtmalar))

**Risks:**
- Narx faktlari yo'q, sotuv postlarida narx ko'rsatilgan ulushi 12% [S.priceShareInSale, R.TRUST_GAP]
- Weak differentiation — ask the owner what they do that competitors don't [R.TRUST_GAP]
- Harakatga chaqiruvli postlar 5%, mijoz botga o'tmay qolishi mumkin [S.ctaRate, R.DEAD_ENDS]
- Ishonch belgilari 2/5, mijoz fikrlari va raqamlar yo'q [S.trustCoverage, R.TRUST_GAP]
- Raqobatchi ma'lumotlari yetarli emas, taqqoslash qiyin [S.comp.lesailes_uz.subscribers]

## 3. Facts extracted from the KB (quote-verified)

- F1 (product): «Qora Shahzoda»
- F2 (product): «Choko-Karamel — yengil qatlamali xamir, qora shokolad va cho‘ziluvchan karamel»
- F3 (product): «Choko-Funduqli — shokolad, mayin funduqli pasta va shokoladli gurme»
- F4 (product): «Yangilik — Oreo Chizkeyk torti 🤎»
- F5 (offer): «Yangilikni ilovamizda ikki karra keshbek»
- F6 (product): «Safianing yangi ruletlarini kutib oling — Blek Forest va Qorag'at»
- F7 (product): «Safianing yangi ruletlarini kutib oling — Blek Forest va Qorag'at»
- F8 (address): «Safia Novza filialimizda»

## 4. Weekly plan (weekOf 2026-11-25)

### 2026-11-25 08:40 · reach · text · time:prior · approval: til · critic: fixed
- **Hook:** Qora Shahzoda — tort tanlay olmaganlar uchun savol
- **CTA:** Do'stingizga yuboring — birga qaysi tortni tanlashni hal qilasiz
- **Brief:** Burchak: oilaviy davra uchun tort tanlay olmayotgan odam. Fakt: [F1]. Safia filialida vitrinadagi Qora Shahzoda tortini kesilgan holda, yorug' joyda telefonda suratga oling. Reach posti, havola yo'q.  
  — Dalil: F1 | Vaqt: taxminiy | Tasdiq: til
- **Metric:** ≥5562 views at 72h (lift 1.2) [S.medianViews]

### 2026-11-26 20:40 · trust · photo · time:prior · exp:hour · approval: til · critic: fixed
- **Hook:** Safia Novza filialimizda Oreo Chizkeyk torti bor
- **CTA:** Botga yozing — filial manzili va mahsulotlar: https://t.me/hackathonproj1_bot?start=src_2648_2
- **Brief:** Burchak: mijoz qayerga borishni va vitrinada nima borligini bilmaydi, shuning uchun manzil va tortni ko'rsatamiz. Faktlar: [F8, F4]. Novza filiali kirish eshigi va vitrinasini, Oreo Chizkeyk tortini real suratga oling; ish vaqti va xarita egasidan olinadi. Mijoz suratlari bo'lsa, needs customer consent.  
  — Dalil: F8 · F4 | Vaqt: taxminiy | Tasdiq: til | exp:hour
- **Metric:** ≥4635 views and ≥3 bot starts [S.medianViews]

### 2026-11-28 11:20 · sale · photo · time:prior · approval: narx, bayram, til · critic: fixed
- **Hook:** Oreo Chizkeyk torti — yangilik, ilovada keshbek bor
- **CTA:** Ilovani oching va keshbek bilan buyurtma bering: https://t.me/hackathonproj1_bot?start=src_2648_3
- **Brief:** Burchak: Qora jumada chegirma qidirayotgan mijoz. Faktlar: [F4, F5]. Keshbek shartlarini egasidan aniqlab postga yozing. Oreo Chizkeyk tortini butun va kesilgan holda, filial peshtaxtasida suratga oling. Narx ledgerda yo'q, egasidan olib qo'shing; muddat haqida fakt yo'q, shoshirmaymiz.  
  — Dalil: S.calendar.blackfriday · F4 · F5 | Vaqt: taxminiy | Tasdiq: narx, bayram, til
- **Metric:** ≥46 bot starts (CTR 1%, taxminiy) and ≥1 order [S.medianViews]

### 2026-11-29 08:40 · trust · photo · time:prior · approval: til · critic: fixed
- **Hook:** Choko-Karamel va Choko-Funduqli — ikkita yangi qatlamali pishiriq
- **CTA:** Botga yozing — qaysi biri bor ekanini so'rang: https://t.me/hackathonproj1_bot?start=src_2648_4
- **Brief:** Burchak: qarsildoq shokoladli narsa istagan, ikkalasi orasida tanlay olmagan mijoz. Faktlar: [F2, F3]. Ikkala pishiriqni yonma-yon, bittasini sindirib ichidagi nachinkani ko'rsatib suratga oling. Post uzun bo'lsin, ikkala ta'mni batafsil tasvirlab.  
  — Dalil: F2 · F3 | Vaqt: taxminiy | Tasdiq: til
- **Metric:** ≥4635 views and ≥3 bot starts [S.medianViews]

### 2026-12-01 11:20 · sale · photo · time:prior · approval: narx, til · critic: fixed
- **Hook:** Blek Forest va Qorag'at — Safianing yangi ruletlari
- **CTA:** Botga yozing — ruletlar va narxlarni bilib oling: https://t.me/hackathonproj1_bot?start=src_2648_5
- **Brief:** Burchak: choyga yengil shirinlik izlayotgan mijoz. Faktlar: [F6, F7]. Ikkala rulet kesimini filialdagi stolda, yaqin planda suratga oling. Narx ledgerda yo'q, egasidan olib hook yoki matnga qo'shing. Post uzun bo'lsin.  
  — Dalil: F6 · F7 | Vaqt: taxminiy | Tasdiq: narx, til
- **Metric:** ≥46 bot starts (CTR 1%, taxminiy) and ≥1 order [S.medianViews]

**Rationale:**

- R.DEAD_ENDS: ctaRate 5% → sale va trust postlarda bittadan {{LINK}} qo'ydim, reach postda havola yo'q [R.DEAD_ENDS, S.ctaRate]
- R.TRUST_GAP: trustCoverage 2/5 → ikkita trust post (filial manzili va mahsulot suratlari), sale postlar ikkita [R.TRUST_GAP, S.trustCoverage]
- R.CALENDAR: Qora juma (2026-11-27) → sale post 2026-11-28 kuni, tasdiq kerak [R.CALENDAR, S.calendar.blackfriday]
- R.REPLICATE_WINNERS: len:>800 yutuqli → 4 va 5-slotlarda uzun post [R.REPLICATE_WINNERS, S.lengthLift.gt800]

## 5. Sizdan kerak (owner questions)

- Asosiy mahsulot/xizmatlaringiz narxlari qancha? (sotuv postlari narxsiz chiqmaydi)
- Manzilingiz va mo'ljal qanday? Ish vaqtingiz?
- 3 ta haqiqiy mijoz fikri (ism bilan, ruxsat bilan) va raqamlar (yillar, mijozlar soni) bormi?

## 6. Critic report

```json
[
 {
  "slot": 1,
  "status": "fixed",
  "fails": []
 },
 {
  "slot": 2,
  "status": "fixed",
  "fails": []
 },
 {
  "slot": 3,
  "status": "fixed",
  "fails": []
 },
 {
  "slot": 4,
  "status": "fixed",
  "fails": []
 },
 {
  "slot": 5,
  "status": "fixed",
  "fails": []
 }
]
```
