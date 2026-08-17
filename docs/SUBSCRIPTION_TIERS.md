# Subscription Tiers → Feature Mapping

**Status:** WORKING DRAFT (shaping for go-live). Last updated 2026-07-28.

This is the human-readable spec for what each subscription tier includes. The
**authoritative values** live as data in `subscription_plans.features` (jsonb) in
Supabase, read by the entitlement resolver in `spattoo-api`
(`src/constants/entitlements.js` = key registry; `supabase/seed_plan_entitlements.sql`
= per-plan values). Keep this doc and that seed in sync.

## Spark is a TRIAL, not a tier (decided 2026-07-26)

**Spark is a 30-day free trial. It must never be presented as a column in the pricing
table.** It remains a plan row in `subscription_plans` because the entitlement resolver
needs something to resolve against — that is an implementation detail, not a product
statement.

Why this matters more than it sounds: the moment Spark appears as the first of four
columns, a reader compares it row-by-row against Flame, finds nearly every row identical
(designer, storefront, branding, order management are all ✅ on both), and concludes Flame
is worthless. That is not a product problem — **it was manufactured by the layout.** Flame
looked like a paywall because it was being measured against a free tier that has
everything.

Presented correctly, Spark is a banner above the table — *"Every plan starts free for 30
days"* — and the table has THREE columns. Flame is then measured against what a baker uses
today (a notebook, a phone gallery, Instagram DMs), which it beats comfortably.

### The trial is the FIRST CARD in the row (refined 2026-08-02)

The strip-above-the-table version failed the other way: a reader who came for prices scrolled
straight past it into the columns, so the free month — the cheapest thing we have to offer — was the
one thing they never saw.

It is now the first of four cards. **That is not a reversal of the rule below, which is narrower
than it reads: never a COMPARISON COLUMN.** The failure being guarded against is ticks that line up
row-for-row against Flame, not presence in the row. So the card has messaging and a CTA — no price
row, no ticks, nothing to run an eye across. The three beside it open with a NUMBER; this one opens
with a SENTENCE, which is most of what stops it reading as a fourth tier.

Copy, and why:
- **"Experience Spattoo for a full month" / "Then decide which plan fits."** The word *trial* is
  ours, not theirs. And the headline leads on the OFFER, not the price — "Free for 30 days" spent
  the largest line on something the CTA and the footnote already said twice.
- **"Everything in Flame"**, never *"every plan starts free for 30 days"*, which the strip did say
  and which was untrue: the trial grants Flame's features, so a Blaze buyer reading it expects
  thirty free days of Blaze and does not get it.

### Spark on the pricing page — a CARD, not a column (refined 2026-07-27)

Spark **does** appear on the pricing page, as one of three cards. What it must never be is a
**column in the comparison matrix**.

The distinction is the entire point. The original failure was not the label — it was the
tick-by-tick comparison: a reader ran their eye across the rows, saw ✓/✓/✓/✓ on designer,
storefront, branding and order management, and concluded Flame added nothing. Naming the
column "Trial" does not fix that; the ticks still line up.

So Spark's card body is **messaging, not a feature list**:

```
┌─────────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  START HERE         │ │  FLAME           │ │  BLAZE ★         │
│  Free for 30 days   │ │  ₹999/mo         │ │  ₹2,499/mo       │
│                     │ │                  │ │                  │
│  Everything         │ │  ✓ ...           │ │  ✓ ...           │
│  unlocked.          │ │  ✓ ...           │ │  ✓ ...           │
│  No card needed.    │ │  ✓ ...           │ │  ✓ ...           │
│                     │ │                  │ │                  │
│  After 30 days,     │ │                  │ │                  │
│  pick a plan.       │ │                  │ │                  │
└─────────────────────┘ └──────────────────┘ └──────────────────┘
```

It is visibly a different KIND of thing from the two plans beside it — an on-ramp, not a
competitor. Any detailed comparison table further down the page has columns **Flame | Blaze
only**. (In THIS engineering doc Spark stays a greyed column, because here we need to see
what it grants. The rule is about the customer-facing page.)

Three cards also means **the Forge decision can wait** — the page doesn't look thin without
it, so Forge can return when staff seats ship and it has something to sell.

### ⚠️ PENDING SIGN-OFF: what does the trial actually grant?

The card copy only works if the trial equals ONE tier. Today Spark is a hybrid — same as
Flame on most rows, but craft guides `preview` vs full, saved templates `3` vs `30`, smart
tools `trial` vs `small`. "Everything in Flame except three things you have not heard of
yet" is not a sentence anyone can put on a card.

- **RECOMMENDED — trial = BLAZE for 30 days.** *"Start with everything. Free for 30 days."*
  The textbook reverse trial, and the model our own research favours: **24% median conversion
  vs 14% for a plain opt-in trial**. Philosophically identical to the metered tease we
  adopted — let them feel it, then let it run out — and since Blaze is THE TARGET, trialling
  at Blaze aims people at the tier we actually want them on.
- **Alternative — trial = FLAME for 30 days.** Safer, keeps Blaze's hooks unspent, but a
  weaker trial that forfeits the reverse-trial advantage.

Either beats today's hybrid, because either produces a one-line card.

**Tradeoff to accept if we take Blaze — SMALLER THAN THIS SECTION ORIGINALLY ASSUMED
(revised 2026-08-02).** It was written believing a Blaze trialist dropping to Flame lost
X-Ray down to 5 orders a month. They do not: **photo X-Ray survives on every plan**, because
it is paid for with credits (#16). What they actually lose is the DESIGNED-cake report,
background removal, and custom templates — a taper, not a cliff, and the AI-powered X-Ray
they leaned on during the trial keeps working.

Credits go UP, not down, on that transition: the trial grants Spark's 100, Flame grants 300.

That IS the mechanism working — loss aversion is the point — but pre-empt it in the
trial-ending email rather than letting them discover it as a bug report.

**This changes `seed_plan_entitlements.sql` for Spark, so it needs an explicit decision
before it ships.**

## Tiers
- **Spark** — the 30-day free TRIAL (above). Full creative + storefront experience, gated
  by TIME, plus a small saved-template cap (3). Cost-safe because the AI meter (#13), not
  the trial length, bounds real spend. NOT a pricing column.
- **Flame** — the entry plan. Its job is "run your cake business properly": storefront,
  branding, order + quote management. Competes with pen-and-paper, not with Spark.
- **Blaze ⭐ THE TARGET** — serious home baker running a real business. Carries the
  domain-specific production tools (X-Ray, premium storefront look, bigger AI allowance).
  Where most of the market should land.
- **Forge** — studios / multi-staff / established brands. Anchors Blaze as the
  reasonable choice; small segment. Not expected to sell in volume — that is its job.

Market note: Indian home-baker sector is huge and mostly 1–2 person. Differentiation
must be on levers a *solo operator* feels (volume, AI, automation, production help,
pro look) — NOT team seats / custom domain.

## Market sizing — who we are actually selling to (researched 2026-07-26)

Hard numbers (sourced):
- **~500,000 (5 lakh+) active home bakers in India** — the core addressable base.
- **~1,000,000 unorganised bakeries** vs only ~2,000 organised/semi-organised units. Not
  our launch target, but it dwarfs the home-baker base and is the later expansion.
- Bakery market **USD 15.05B (2025) → 32.05B (2034)**, 8.76% CAGR.
- **40–60% of custom cake orders already arrive via Instagram / WhatsApp.** This is the
  single most important stat for positioning: the baker's order flow is ALREADY digital and
  ALREADY chaotic. Flame's story ("stop chasing quotes on WhatsApp") is not a hypothesis —
  it is describing what half the market does today.

**Segment split — ESTIMATE, NOT DATA.** No published source segments the 500k by revenue.
The following is inferred from order-volume ranges and must be treated as a hypothesis to
validate against our own signup data, never quoted as fact:

| Segment | Orders/mo | Est. count | Target plan |
|---|---|---|---|
| Hobby / occasional | <10 | ~325,000 | trial only — will not pay |
| Part-time | 10–30 | ~110,000 | **Flame** |
| Full-time | 30–60 | ~50,000 | **Blaze ⭐** |
| Studio / has staff | 60+ | ~15,000 | **Forge** |

At a conservative **2% penetration**: ~2,200 Flame + ~1,000 Blaze + ~300 Forge ≈
**₹62L/month (~₹7.4Cr ARR)** — before touching the unorganised-bakery base. The business
works at low single-digit penetration, which is worth remembering before spending another
week on ₹999 vs ₹1,199.

Sources: [home bakers](https://bakeyy.com/blogs/bakeyy-blogs/how-to-start-home-bakery-india-2026) ·
[bakery industry study](https://theindiawatch.com/public/web_control/uploads/_3442_Bakery%20Study%20of%20India.pdf) ·
[margins + channel mix](https://trufflenationonline.com/blog/bakery-profit-margin/)

## Pricing MODEL — feature tiers + metered smart tools (decided 2026-07-26)

**The "feature tiers vs order caps" question is a false binary, and we have already chosen
the hybrid the evidence supports.**

Industry data favours having a usage component: SaaS with usage-based elements runs
**115–130% NRR vs 95–105% for pure flat-rate** (~28% advantage), because expansion happens
automatically instead of requiring an upsell motion. But *usage-based* does not mean
*orders*-based. Our usage lever is **smart tools (#13)** — already identified in this doc as
"the SOLE metered cost-bearing lever". That IS the usage layer.

So the model is: **feature tiers as the base + metered smart tools as the usage layer + NO
order cap, ever.** The reasoning for rejecting order caps (customer-driven volume, wrong
actor to cap; gaming pressure if we cap confirmations) survives the data intact — do not
reopen it.

Sources: [usage-based pricing & NRR](https://www.zenskar.com/blog/usage-based-pricing-net-revenue-retention-zenskar) ·
[NRR benchmarks](https://www.m3ter.com/blog/net-revenue-retention)

## Pricing — the numbers and why (decided 2026-07-26)

Previously this doc specified the feature ladder but recorded **no pricing rationale at
all**. The prices below are unchanged from launch; what is new is the justification, so
the next person to change them knows what they are arguing against.

| Plan | Monthly (base) | +18% GST | Yearly (base) |
|---|---|---|---|
| Spark | free (30-day trial) | — | — |
| Flame | ₹999 | ₹1,179 | ₹9,999 |
| Blaze ⭐ | ₹2,499 | ₹2,949 | ₹24,999 |
| Forge | ₹4,999 | ₹5,899 | ₹49,999 |

**The customer's economics** (2026 India, metro home baker): a full-time home baker makes
**30–60 custom cakes/month** at **₹1,400–2,400** each → **₹45,000–1,80,000/month** revenue,
at **60–70% gross margin** → **₹900–1,560 profit per cake**.

So the frame that matters is: **does one extra order per month pay for the plan?** At
₹900–1,560 profit per cake, Flame at ₹999 and Blaze at ₹2,499 both clear that bar. This is
also the frame the marketing copy already uses ("less than the price of one cake") and it
should stay the frame.

**Do NOT benchmark against horizontal tools.** Shopify Basic (₹1,499–1,994), Instamojo
(₹999), Dukaan (₹299) set what a baker *thinks software costs* — they are a floor, not a
ceiling. The right comparable is vertical SaaS sold to the same Indian SMB market:
**Petpooja charges ₹3,000–12,000/month** to restaurants. Vertical products command
15–25% higher ASP than horizontal ones and retain better, because the product becomes part
of how the business operates.

**Category features vs tier features — the distinction that drives all of this:**
- **Category features** (full 3D designer #1–3, A4 print simulator #10a, all decorations)
  are ✅ on **every** tier. Their job is to justify the price LEVEL — why the floor is ₹999
  and not ₹299, and why the Shopify comparison does not apply. **Gating them would destroy
  the category argument**, which is exactly why element-tier-gating was killed.
- **Tier features** (X-Ray #16, storefront template #6, AI allowance #13) justify the
  STEPS between plans.
  
  A category feature must still be **visible** on the pricing page — an "Every plan
  includes" band above the tier table. A feature nobody knows exists cannot defend a price.
  (The A4 simulator was invisible for exactly this reason: absorbed into "photos, PDF".)

**Rejected: lowering Flame to ~₹599.** Considered and dropped. It was derived from a
"1–3% of revenue" rule that applies to back-office admin tools, but the storefront is
demand generation — a marketing line item, which tolerates far more. It also put us on the
Dukaan shelf (commodity store builder) rather than the Instamojo/Interakt shelf (business
tooling), and cheap tiers attract low-intent users whose support cost exceeds their
revenue.

**Direction of travel:** the ladder should get *steeper*, not uniformly higher. Flame is
genuinely horizontal-comparable ("get online, take orders") and holds at ₹999. Blaze is
where every domain feature lives and has headroom — revisit **after** Flame's value story
and activation are fixed, not before. ₹1,099-style nudges are the worst of both worlds:
they break the sub-₹1,000 anchor for ~15%.

**Forge must SHOW its price — "call our sales team" was considered and rejected
(2026-07-26).** The temptation is to hide Forge behind a contact form. The evidence is
against it at our price point:
- Hiding price drives away **70–80% of buyers**, who want to self-qualify on budget before
  talking to anyone; showing it produces **2–3× more demo requests**, because whoever books
  has already accepted the number.
- The documented failure mode is hiding price for products under **$25,000 ACV**. Forge is
  ₹49,999/year ≈ **$600 ACV** — two orders of magnitude below that line.
- *"Contact us for pricing"* with nothing else reads as either embarrassment about the price
  or unexplained expense.
- **Structural reason, specific to us:** Forge's job in this ladder is to ANCHOR Blaze as the
  reasonable choice. A decoy with no number anchors nothing — remove Forge's price and Blaze
  loses the comparison that makes it look sensible.

Correct form if we want the sales conversation: **"From ₹4,999/month — talk to us."** Keeps
the call, keeps the anchor, loses nobody.

Sources: [pricing page optimization](https://resources.rework.com/libraries/saas-growth/pricing-page-optimization) ·
[when to hide pricing](https://successknocks.com/when-to-hide-pricing-on-a-b2b-saas-website/)

**GST:** priced exclusive today. Most home bakers are under the registration threshold and
cannot reclaim input credit (which is why `bakers.gstin` is optional), so the all-in number
belongs on the pricing card — not discovered at checkout. See `subscription-billing.md`.

Market references (retrieved 2026-07-26): [Petpooja
pricing](https://www.dineopen.com/blog/petpooja-pricing-plans-2026.html) · [Shopify
India](https://avada.io/blog/shopify-price-in-india/) ·
[Instamojo](https://www.instamojo.com/pricing/) · [bakery margins,
India](https://trufflenationonline.com/blog/bakery-profit-margin/) · [vertical SaaS
premium](https://www.getmonetizely.com/articles/vertical-specific-saas-pricing-why-industry-context-matters-for-revenue-growth)

## Billing intervals — monthly + yearly only (decided 2026-07-28)

**Quarterly is retired. We sell two intervals: monthly and yearly.** Previously this doc specified
prices per plan but never examined the *intervals* those prices are charged over — which is how a
third interval survived unexamined from the original `billing_periods` seed all the way to now.

**Why quarterly goes:**
- **It cannibalises yearly, not monthly.** The baker who takes 10% off for a three-month commitment
  is the one who was closest to taking 17% off for twelve. You pay a discount to the segment most
  likely to have committed anyway, and collect three months of cash and lock-in instead of twelve.
- **0% / 10% / 17% is a weak ladder.** The middle rung is too small to change behaviour but big
  enough to leak margin, and it blurs the one line that works: *"pay yearly, get two months free."*
- **It quadruples renewal events.** Every renewal is an opportunity for an involuntary failure on
  Indian card/UPI mandates. Four failure points a year instead of one, for no gain.
- **It was never marketed.** The marketing pricing page only ever had a Monthly/Annual toggle;
  quarterly existed solely in the in-app billing panel. Retiring it makes the two agree.

### Monthly-only was considered and REJECTED (2026-07-28)

The prompt was real — ₹24,999 upfront for Blaze annual is a genuine ask in this market — but
dropping yearly costs the two things we can least afford, and doesn't fix the thing it's aimed at.

- **Cake demand is seasonal, and monthly-only converts that into churn.** Weddings, festivals and
  December are peaks; Jan–Feb is genuinely slow. On monthly-only a baker in a quiet month weighs
  ₹2,499 against three orders and cancels — then returns in October. That is a seasonal rental
  business with sawtooth revenue and a re-acquisition cost every cycle, and it is structural to the
  interval, not fixable in product. An annual subscriber rides the slow months without a decision
  point.
- **Monthly-only puts the first renewal decision ~30 days in.** This doc's own argument for a
  30-day trial over 14 is that the aha — landing a real order through a brand-new storefront —
  takes weeks. Monthly-only recreates that trap on the paid side.
- **Annual prepay is the growth capital.** Bootstrapped, ₹9,999 or ₹24,999 landing on day one is
  what funds acquiring the next baker. Monthly-only stretches CAC payback over months we float.

Also worth keeping in proportion: at 30–60 cakes/month and ₹900–1,560 profit each, Blaze annual is
roughly **half a month's profit**, and Flame annual (₹9,999) is about **seven cakes**. The upfront
problem is narrow — it's Blaze annual sold to a stranger on day one — and the people for whom it is
truly impossible are largely not Blaze-segment bakers.

**So fix the timing and the rails, not the structure:** monthly stays the default everywhere (it
already is — the marketing toggle and `BillingPanel`'s `selectedPeriod` both default to monthly), the
annual offer is made at the **PQL moment** (storefront published + ≥1 quote received — the same
trigger this doc already identifies as the highest-leverage change) rather than at signup, and
affordability is answered with UPI Autopay / EMI. **A pricing interval is a permanent structural
decision; affordability is a checkout feature.** Do not reach for semi-annual as a compromise — it
is the quarterly problem again at six months.

### The yearly discount stays at ~17% — two months free

Current prices already are exactly that (₹999 × 12 = ₹11,988 → ₹9,999 = 16.6% off; same ratio on
Blaze and Forge). Keep the number; the reasoning for the next person to argue against:

- **The churn math says it's fairly priced.** Value the discount against what you'd actually collect
  on monthly: at 5% monthly churn you collect ~9.2 months over a year, at 3% churn ~10.2. Yearly at
  17% off = 10 months paid upfront. Across the plausible SMB churn range that is within a few
  percent of break-even on nominal revenue — and then strictly ahead on cash timing, one renewal
  event instead of twelve, and no dunning exposure.
- **Deeper doesn't buy adoption, because the barrier is liquidity, not price.** A baker who can't
  front ₹24,999 can't front ₹22,500 either. Going to 25% would mostly refund the people who'd have
  taken 17% — paying ~8% of the annual base to change almost nobody's mind.
- **Shallower stops reading as a deal.** "Two months free" is roughly the threshold at which
  committing twelve months feels rewarded. The retired 10% quarterly rung is the proof that a
  smaller number moves no one.
- **Don't chase a rounder percentage at the cost of the prices.** ₹9,999 keeps Flame under the ₹10k
  anchor and ₹24,999 keeps Blaze under ₹25k; those matter more than reaching a clean 20%.

**Frame it as "2 months free", not "‑17%"** — same money, concrete and self-evidently good, where a
percentage invites arithmetic. The marketing toggle already says *"save 2 months"*; the in-app
`BillingPanel` badge still renders `-{discount_pct}%`. Copy change pending sign-off, not done here.

### How it's switched off (and back on)

Retiring an interval is a **data** change, not a code change — the same shape as hiding a plan via
`subscription_plans.is_active`:

```sql
update billing_periods set is_active = false where name = 'quarterly';   -- and true to bring it back
```

`supabase/billing_periods_retire_quarterly.sql` carries this. **The row and its id (2) stay
forever** — `baker_subscriptions.billing_period_id` references it and `billingEvents` labels
historical rows through `PERIOD.NAME_BY_ID`, so deleting or renumbering would orphan history and
shift yearly's id. `PERIOD_SHORT` in `BillingPanel` likewise keeps `quarterly` on purpose, so a
subscription created before the retirement can still render its own name.

Two code changes were needed to make that flag *real*, because it previously controlled nothing a
customer could see:
- **`BillingPanel` rendered the interval toggle from a hardcoded `['monthly','quarterly','yearly']`.**
  Flipping the flag would have left a Quarterly button on screen that fell through to `periods[0]`
  and silently billed monthly. The picker is now driven by the fetched `periods`, which
  `GET /billing/periods` already filters on `is_active`.
- **`POST /billing/subscribe` resolved the interval through the `PERIOD.NAME_BY_ID` code constant**,
  so a direct API call could still subscribe to a retired period. It now re-reads the row and
  rejects an inactive one with `billing_period_inactive`.

*(The same class of gap still exists for PLANS — `POST /billing/subscribe` resolves the tier through
`PLAN.ID_BY_NAME`, not the table, so `subscription_plans.is_active` remains a display toggle rather
than a real gate. Left open deliberately: it's entangled with the unresolved Forge question. See
"Hiding a plan".)*

**Verified safe against the in-flight weekly renewal test** (baker `super-bake`, `sub_TGVFzGSSOmXa1A`,
renewal due 29 Jul): that row carries `billing_period_id: null` (hand-linked weekly, not a real
period), renewal runs off the `subscription.charged` webhook which advances `current_period_end` from
Razorpay's own `current_end` and never reads `billing_periods`, and **zero** subscriptions in the DB
reference period 2.

**Known follow-up:** `billing_periods.discount_pct` is only a *fallback* — `periodPrice()` uses it
when a plan has no explicit `price_yearly`, and all four plans have one. So the badge and the actual
charge are computed from different sources. They agree today; they would silently diverge if anyone
edited a yearly price without updating `discount_pct`.

## Legend
- **MVP:** ✅ in go-live · 🔜 post-MVP (v1.1) · 🔮 future
- **Build:** *Built* (works + tier-gated) · *Gate* (feature works, gating needs wiring)
  · *New* (needs building) · *Ops* (not code)

## Mapping

| # | Feature / Lever | Spark | Flame | Blaze ⭐ | Forge | MVP | Build |
|---|---|---|---|---|---|---|---|
| | **— Creative (same for all tiers) —** | | | | | | |
| 1 | Full 3D cake designer | ✅ | ✅ | ✅ | ✅ | ✅ | Built |
| 2 | All decorations / finishes / piping / toppers | ✅ | ✅ | ✅ | ✅ | ✅ | Built — ALL elements ALL tiers (element-tier-gating KILLED) |
| 3 | Cream pen, drip, scatter, foil, luster, etc. | ✅ | ✅ | ✅ | ✅ | ✅ | Built |
| | **— Storefront —** | | | | | | |
| 4 | Public storefront (`{slug}.spattoo.com`) | ✅ | ✅ | ✅ | ✅ | ✅ | Built (gated) |
| 5 | Custom branding (logo, colors, story) | ✅ | ✅ | ✅ | ✅ | ✅ | Built (gated) |
| 6 | Storefront template/layout choice | preview only | preview only | choose & apply | choose & apply | ✅ | Premium-LOOK upsell (evolves thin `storefront_themes`). Standard layout = baseline for all (branding #5 always applies). Spark/Flame can PREVIEW premium (upsell CTA) but NOT apply → live storefront stays standard. NEW build: multi-template infra + Apply gated by `custom_storefront_template` (Spark/Flame false, Blaze+ true). |
| 7 | Storefront analytics (views/conversion) | ❌ | ❌ | ✅ | ✅ | 🔜 | New |
| 8 | White-label (remove Spattoo branding) | ❌ | ❌ | ❌ | ❌ | 🔮 | DROPPED as a lever — hollow without a custom domain: on `*.spattoo.com` + `@spattoo.com` email, Spattoo is unavoidably present. Only real once #9 (custom domain) ships; bundle with it then. |
| 9 | Custom domain | ❌ | ❌ | ❌ | ❌ | 🔮 | Not built — deferred, do NOT market |
| | **— Orders —** | | | | | | |
| 10 | Order/quote management, statuses, photos, PDF | ✅ | ✅ | ✅ | ✅ | ✅ | Built |
| 10a | **A4 edible-print simulator** (`PhotoSheet`) | ✅ | ✅ | ✅ | ✅ | ✅ | Built, **UNGATED on purpose** — a CATEGORY feature. Shows exactly how a customer photo lands on an A4 edible sheet before it is printed, so a mis-sized print doesn't waste the sheet AND the cake under it. No generic store builder can do this; it is a big part of why Spattoo is not comparable to Shopify. Was previously invisible (absorbed into #10) — surface it as its own row and in the pricing page's "Every plan includes" band. Do NOT gate it: gating category features destroys the category argument. |
| 11 | Order cap | none (time-boxed instead) | Unlimited | Unlimited | Unlimited | ✅ | NO order-count cap anywhere. Spark is gated by TIME (see Spark trial). Order count = customer-driven (quote requests) → wrong actor to cap. |
| 12 | Cake flavours catalog | ✅ | ✅ | ✅ | ✅ | ✅ | Built |
| | **— Smart tools (BETA — name the JOB, never "AI") —** | | | | | | |
| 13 | Photo → cake design (BETA) | trial | small | larger | larger | ✅ | MERGED #13+#14 — one baker feature, one metered pool. Two internal pipelines (Meshy generate / GPT library-match) behind it. *Built*; metering *New*; beta: generous, don't charge failed gens |
| 14 | *(merged into #13)* | — | — | — | — | — | Number reserved; "Recreate from inspiration" + "Image→3D" are one baker-facing feature (same job). |
| 15 | Background removal (utility — NOT a headline) | plumbing inside image upload | | | | ✅ | Not marketed/metered separately; folds into the upload flow |
| | **— Production help —** | | | | | | |
| 16 | X-Ray order reports | ✅ | ✅ | ✅ | ✅ | ✅ | Built. **OPENED TO EVERY TIER 2026-08-02 — credits are now the only lever on X-Ray.** History: the "first 5 confirmed orders / month" tease (below) was never implemented; it was replaced by a split where a PHOTO X-Ray was paid for with credits on any plan while a DESIGNED-cake one stayed a Blaze `xray_reports` hook. That split was defensible and unexplainable: on a pricing page it read as "X-Ray: from photos / + your 3D designs", which no baker parses, and in the product a Flame baker could pay credits for the HARDER reading and then be refused the free one on their own design. Designed-cake X-Ray is generated from the design we already hold — no model call, no marginal cost — so opening it gives away a differentiator and nothing else. **Blaze loses what this row once called its strongest hook**; it now differentiates on custom templates, background removal, unlimited saved templates, top-ups and 800 vs 300 credits. The `xray_reports` key and its gate stay, so this is reversible as DATA. |
| 17 | Craft guides | preview | ✅ | ✅ | ✅ | ✅ | Built |
| 18 | Color guide (Chef's Desk) | ✅ | ✅ | ✅ | ✅ | ✅ | Built |
| | **— Automation —** | | | | | | |
| 19 | Email notifications | ✅ | ✅ | ✅ | ✅ | ✅ | Built |
| 20 | WhatsApp notifications | ❌ | ❌ | ❌ | ❌ | 🔮 | REMOVED from MVP / unmarketed — deferred (not killed; big channel in India, likely a Blaze/Forge hook later). Email (#19) covers launch. |
| | **— Account / team —** | | | | | | |
| 21 | Custom saved templates (count) | 3 | 30 | Unlimited | Unlimited | ✅ | COUNT model. Cap is on BAKER-SAVED custom templates only — GLOBAL library templates are unlimited/generous for ALL tiers. Needs `max_saved_templates` int key + UI enforcement. Numbers tunable via seed. |
| 22 | Team members | 1 | 1 | 1 | 1 | 🔮 | **DEFERRED FROM MVP 2026-07-27 — do NOT market.** Staff logins are not being introduced at launch, so every tier is effectively single-seat (the owner). The `max_team_members` values (1/2/4/10) STAY in `seed_plan_entitlements.sql` — they cost nothing, and the anti-resale ceiling should be in place the day seats do ship — but nothing in the UI grants a second login at MVP, so the row must NOT appear on the pricing page or in `feature_bullets`. Per-seat overage remains post-MVP. |
| 23 | Staff access control (plumbing under #22) | n/a | n/a | n/a | n/a | 🔮 | **DEFERRED WITH #22 (2026-07-27).** Was already "not marketed"; now also not in MVP. The capability model stays as built (schema-forever — RBAC is orthogonal to plans and must not be re-modelled later), it simply has no second user to apply to at launch. |
| 24 | Priority support | — | — | ✅ | ✅ | ✅ | Ops |

`*` = the **feature** ships in MVP; the **tier metering** (per-month credits / count
caps) is the new build. Leaner go-live option: ship #13, #21 as simple **on/off per
tier** and add real metering in v1.1.

## Spark trial — gate model (RESOLVED)
- **Gate on TIME, not orders.** Order count is customer-driven (quote requests) → can be
  exhausted by customers/spam before the baker explores; wrong actor to cap. Spark has NO
  order-count cap.
- **Cost is bounded by the AI meter, NOT by trial length.** Only AI (Meshy/GPT) costs real
  money; it's metered LOW on Spark. This decouples cost from how long the trial runs — a
  longer trial doesn't cost proportionally more.
- **Length = 30 days** (recommended over 14 — this product's time-to-value is long: the aha
  is landing a real order through a brand-new storefront, which needs weeks; 2 weeks risks
  expiring pre-value → weak conversion). **Make trial length a CONFIG value** (admin-authored,
  not hardcoded) so 14↔30↔45 is tunable from data without a deploy.
- **Abuse (spam quote requests) handled separately** via rate-limiting on the submission
  endpoint — NOT by the subscription cap. Don't conflate.
- **Secondary in-trial gate = template cap (3, #21)** — not for cost (templates are cheap)
  but as an upgrade nudge: hit 3 saved designs → "upgrade for more". Storage guard too.
- Conversion triggers whenever the baker is convinced (day 3 or 29); 30 days is just the
  outer bound giving the storefront a fair shot at producing a real order.

### Trial model — what the benchmarks say (researched 2026-07-26)

| Model | Range | Median |
|---|---|---|
| Freemium | 2–8% | 4.5% |
| **Opt-in trial, no card** ← Spark today | 8–22% | **14%** |
| **Reverse trial** (full features → limited free tier) | 18–32% | **24%** |
| Opt-out trial, card at signup | 35–55% | 44% |

Three things follow, in order of value:

- **PQL beats the calendar. Do this first.** Prompting on *product-qualified* behaviour
  converts at **25–30%** vs 5–10% for time/marketing-triggered prompts. **Our PQL =
  storefront published AND ≥1 quote request received.** Trigger the upgrade conversation on
  that signal, not on "day 30 approaching". This is the highest-leverage change in this
  whole document and it needs no pricing change at all.
- **Spark ends in a WALL; reverse trials end somewhere alive** — and convert ~10 points
  better. Letting Spark decay into a dormant-but-not-dead state (designer still works,
  storefront stops accepting orders) is worth evaluating. NOTE: this conflicts with the
  "Spark is ONE-TIME, never a fallback" rule below — revisit deliberately, don't drift into it.
- **30 vs 14 days: the data cuts against our choice.** In opt-in (no-card) motion, 14-day
  trials convert **8–12% higher** than 30-day, because urgency drives activation. Our
  long-time-to-value argument is genuinely strong and specific to us, and trial length is
  already a config value — so this is an **A/B test, not an argument**. Run it.

Caveat on all of the above: these benchmarks are predominantly Western B2B SaaS. Indian SMB
self-serve behaviour (price sensitivity, UPI-first, WhatsApp as the support channel) may
shift the magnitudes materially. Trust the DIRECTION of each finding, not the number.

Source: [trial-to-paid benchmarks by trial type, ACV, length and card requirement](https://www.growthspreeofficial.com/blogs/b2b-saas-trial-to-paid-conversion-rate-benchmarks-2026-by-trial-type-acv-length-credit-card)

### Spark lifecycle (RESOLVED + implemented 2026-06-30, api)
- **Spark is ONE-TIME** — granted once (at signup via `bakerProvisioning`), NEVER as a fallback
  after a paid sub lapses. A lapsed baker must pick a paid plan; `activate-spark` rejects with
  `SPARK_ALREADY_USED` if the baker ever had Spark.
- **NEVER permanent-free** — Spark always carries a time-boxed `end_date` (the old `activate-spark`
  `end_date: null` was a bug, fixed). Trial length = `subscription_plans.features.trial_days`
  (config, admin-editable, fallback 30) — read by both grant paths via `getSparkTrialDays()`.
- **Always exactly one (active) subscription** — provisioning guarantees a baker never exists
  without a sub; when Spark's window ends the daily expiry job flips status→expired → entitlements
  collapse → client shows the **upgrade screen** directly (no usable un-subscribed state).
- **Inactive baker → customers can't quote** — already enforced: both order-submission routes
  (`POST /orders`, `POST /customer/orders`) call `getOrderAcceptance` → `BAKER_INACTIVE`. Verified.

## Smart tools (#13, merged) — metering & beta policy (RESOLVED)
- **ONE merged feature, ONE metered pool.** #13 (Image→3D / Meshy) and #14 (Build from
  inspiration / GPT library-match) are the SAME baker job ("photo → cake design") → one
  feature, one quota. Two pipelines stay internal; baker never sees/charges two.
- **Build real metering** (confirmed). Express the limit as a CONCRETE count in the UI
  ("5 photo→cake designs / month"), NOT abstract "credits". Internally meter a real cost
  ledger (compute/₹) for the margin guardrail; show readable counts outside.

  > **Refined 2026-07-31 — the rule holds at the point of USE, not over the pool.** This was
  > written while #13 was ONE merged tool on one pool, where a job count is both concrete AND
  > accurate. Once several tools share that pool it stops being accurate: *"53 build guides · 40
  > cake designs"* reads as two budgets when spending from either drains both. So: a **launcher or
  > button shows the job count** for the action in hand ("this uses 15" is true there), while the
  > **billing card shows ONE number** — credits left — with a help bubble listing what each tool
  > costs. Top-up packs are priced in credits for the same reason: a pack spends anywhere. The
  > intent is untouched — bakers are never asked to think in tokens. See spattoo-docs
  > `features/ai-credits.md`.
- **Name the JOB, never "AI"** — "Photo → cake design". Bakers don't buy "AI"; they buy the
  outcome. (Background removal = plumbing, not a named feature.)
- **BETA / experimental for several months.** Quality varies (Meshy/GPT) → label it,
  state limitations explicitly ("works best with a clear single-cake photo; results vary").
- **Beta fairness:** generous quotas, DON'T charge failed/regenerated attempts (count only
  a generation the baker keeps). Beta = data-gathering phase.
- **Numbers stay soft during beta;** tighten at GA via the seed (`subscription_plans.features`)
  — data edit, NO deploy. Build the mechanism now; values later.

## Resolved decisions
- **#11 order cap — RESOLVED: NO order-count cap anywhere, on any tier.** Spark is gated
  by TIME (30-day trial), see "Spark trial — gate model" below. All paid tiers = UNLIMITED
  orders. Capping a paying baker's revenue mid-month is a business interruption +
  adversarial. Expansion revenue rides on features + metered cost-bearing resources (AI
  #13 — now the SOLE such lever after WhatsApp #20 was deferred), which scale with how busy
  a baker is — never on blocking orders.

  > **Superseded 2026-07-26.** This bullet previously read *"Spark = 10 lifetime orders"*,
  > which the later trial-gate section had already overruled but nobody deleted. That stale
  > sentence is the origin of the **"10 total orders"** claim still shown on the marketing
  > pricing page and in `subscription_plans.feature_bullets` — neither matches
  > `max_orders_total: null` in `seed_plan_entitlements.sql`. Both need correcting; see
  > "Known fixes" at the end.

## Metered tease — let them USE the hook, then run out (decided 2026-07-26)

> **⚠️ NOT BUILT, AND NOT GOING TO BE — superseded 2026-08-02.** The PRINCIPLE below stands and
> was adopted; the specific mechanism (first 5 confirmed orders/month for X-Ray) was never
> implemented and should not be. **The AI credit meter does the same job and does it better:**
> a photo X-Ray costs 15 credits on every plan, so a Flame baker experiences the feature and
> runs out of it, which is exactly what this section asks for — but metered in the unit that
> tracks OUR actual cost, with a balance the baker can see, a history they can audit, and a
> top-up path that turns "ran out" into revenue instead of a wall.
>
> The order-count mechanism would have been a SECOND meter beside the credit one, measuring a
> different thing, needing its own key, its own UI and its own explanation on the pricing page.
> Two meters for one feature is how a pricing page becomes unreadable.
>
> What survives from this section: designed-cake X-Ray costs us nothing to run and stays a
> Blaze+ boolean (`xray_reports`); photo X-Ray costs real money and is metered by credits.
> See #16. Kept below because the REASONING is the reasoning behind the credit meter too.

**A capped allowance of a premium feature beats hiding it, and beats a preview.** This is
the documented pattern: *"usage caps let free users experience a feature, understand its
value, and then hit a limit"* — explicitly preferred over locking the feature away. Slack
and Notion both moved from unlimited-freemium to exactly this in mid-2025.

Applied to **X-Ray (#16): the first 5 CONFIRMED ORDERS each month.** A preview shows a baker
what they are missing; five real build guides make them feel what they would LOSE. That is a
far stronger upgrade trigger, and it fixes the monotonicity bug more cleanly than a preview
mode (one int key instead of a whole second UI state).

**The unit is CONFIRMED ORDERS, not report views — this matters.** Metering views would
punish the baker for re-opening the same build guide while they are actually baking, which
is precisely when they need it. So:
- The allowance is consumed by an ORDER reaching `confirmed`, not by opening a report.
- Once an order is inside the allowance it keeps X-Ray **forever** — open it as often as you
  like, before, during and after the bake.
- `confirmed` is the right trigger: it is the moment the baker has committed to bake the
  cake, which is exactly when a build guide has value. A quote that never closes should not
  burn allowance.
- **Deterministic rule, no extra table:** the allowance covers the **first 5 orders confirmed
  in the calendar month**, ordered by confirmation time. Recomputable from the order rows
  alone, so it cannot drift or need reconciling.
- Reads the same set-once `confirmed_first_at` column the orders calendar needs (see
  `features/orders-calendar.md` — `advance_paid_at` is re-stamped on every transition into
  `confirmed`, so it must NOT be used as the meter).
- **Calendar month, not billing period** — an annual subscriber's period is 12 months long;
  metering per period would hand them 12× the allowance.

Why 5 and not 3: a part-time baker (our Flame segment) does 10–30 orders/month, so 3 is a
sliver — it reads as a stingy demo rather than a real tool. At 5 the baker builds the habit
across a fifth to a half of their month, then feels the wall. Tune from data; the number is
a seed value, not a code constant.

**Graduated nudges are part of the pattern, not optional** — fire at **70% / 90% / 100%** of
the allowance, with different messaging at each: informational → clearer offer → specific
upgrade CTA. Silently failing at the limit wastes the whole mechanism.

Same shape already applies to smart tools (#13) and saved templates (#21); X-Ray now joins
them. **Do NOT extend this to category features** (#1–3, #10a) — those are never gated.

Source: [usage limits & upgrade prompts](https://userpilot.com/blog/increase-trial-to-paid-conversion-rate/) ·
[SaaS upsell strategies](https://ventureharbour.com/saas-free-to-paid-upselling/)

## Staff logins deferred from MVP (decided 2026-07-27)

**Staff logins are not being introduced at launch.** Every tier is single-seat (the owner)
at MVP. Team members (#22) and staff access control (#23) must therefore **not appear on the
marketing pricing page, in `subscription_plans.feature_bullets`, or in the in-app plan
picker** — advertising a seat count nobody can use is the same class of error as the "10
total orders" claim this doc already had to correct.

What stays: the `max_team_members` values in the seed (harmless, and the anti-resale ceiling
should exist the day seats ship) and the capability model behind #23 (RBAC is orthogonal to
plans; re-modelling it later would be far more expensive than leaving it dormant).

### ⚠️ OPEN QUESTION this creates: what is Forge for at MVP?

Per the upgrade chain, **Blaze → Forge was: more team seats + priority support + (later)
granular staff control.** With seats deferred, Forge's only remaining MVP differentiator is
**priority support**. That is not a tier, it is a support policy — and a tier with nothing in
it cannot do the anchoring job Forge exists for.

Three options, not yet decided:

1. **Ship two paid tiers at MVP** (Flame + Blaze) and bring Forge back when seats ship.
   Honest and simple, but loses the three-column anchor that makes Blaze look like the
   sensible middle choice — a real cost, since that framing is why Blaze is the target.
2. **Keep Forge as a SERVICE tier** — "Studio · from ₹4,999 · talk to us" — sold on priority
   support, onboarding help and setup assistance rather than features. Honest (it genuinely
   is a services tier), and it preserves the anchor. **Current lean.**
3. **Give Forge a real MVP feature.** Nothing obvious is left: unlimited X-Ray is already
   Blaze, storefront analytics is v1.1, and the smart-tools allowance is a weak headline on
   its own. Would mean building something specifically to justify the tier, which is the
   wrong order to do things in.

Whichever is chosen, it must be settled BEFORE the marketing page is corrected — otherwise
we ship a fourth column with an empty feature list, which reads worse than three columns.

## Hiding a plan — `subscription_plans.is_active` (2026-07-27)

Forge already exists in the system, so "don't launch Forge yet" is a **data** change, not a
code change. The column is already there:

```sql
update subscription_plans set is_active = false where name = 'forge';
```

**What that hides** — `GET /api/plans` filters `.eq('is_active', true)`
(`subscriptions.js:89`), and that ONE endpoint feeds every customer-facing surface: the
marketing catalog, the billing plan picker (`PlanCards.jsx`) and the signup onboarding
wizard. Flip the flag and Forge disappears from all three at once, with no deploy.

**What it deliberately does NOT touch** (verified 2026-07-27 by tracing every reader of the
table):
- **Existing Forge subscribers keep working.** Entitlements resolve via
  `getPlanFeatures(planId)` → `select features where id = …`, with **no `is_active` filter**
  (`entitlements.js:10`). Hiding a plan is not deactivating a customer.
- **Admin still sees it.** `GET /admin/subscription-plans` selects `*` unfiltered
  (`subscriptions.js:108`), so the plan stays editable and re-launchable.
- Nothing else reads `subscription_plans.is_active` — the other `is_active` filters in
  `billing.js` are on `billing_periods` and `cancellation_reasons`, different tables.

**Known gap to close before relying on this as a gate:** `POST /billing/subscribe` resolves
the tier through the `PLAN.ID_BY_NAME` code constant (`billing.js:219`), **not** through the
table, so it does not check `is_active`. Hiding Forge removes it from every UI, but a direct
API call with `tier: 'forge'` would still be accepted. Fine for MVP (nobody can reach it
through the product), but the subscribe route should validate the target plan is active
before this flag is treated as a real control rather than a display toggle.

**Use the existing flag, do not add a new column.** `is_active` already means "publicly
listed and subscribable", and for Forge at MVP those two are the same thing. A separate
`is_listed` would only earn its keep if we ever need listed-but-not-subscribable (or the
reverse), which is not a case we have.

## ⚠️ Declared vs ENFORCED (audited 2026-08-02)

An entitlement in `constants/entitlements.js` and `seed_plan_entitlements.sql` is a DECLARATION. It
gates nothing until a route or a component reads it, and three of them never got that far — which is
how they reached the pricing page as feature rows.

| key | enforced by | status |
|---|---|---|
| `ai_credits_per_month` | `services/aiCredits.js` | ✅ real |
| `can_buy_credits` | `services/aiCredits.js` | ✅ real |
| `xray_reports` | `orders/OrdersPanel.jsx` | ✅ real (true on every tier since 2026-08-02) |
| `max_saved_templates` | **nothing** | ❌ declared only — the pricing row was removed 2026-08-02 |
| `custom_templates` | **nothing** | ⚪️ inert, and now TRUE on every tier (2026-08-02) — the page says ✓ everywhere, so nothing is mis-sold |
| `ai_background_removal` | **nothing** | ❌ declared only, still sold on the page |
| `max_team_members` | **nothing** | ❌ declared only; seats are not shipped and the row is off the page |

**Before putting an entitlement on the pricing page, grep for the key outside the registry and the
seed.** If the only hits are the declaration and the seed, it is not a feature — it is an intention,
and selling an intention is how a page ends up promising a cap that does not exist (saved templates)
or withholding from Flame something Flame already has (custom templates, background removal).

**Custom templates was resolved by opening it (2026-08-02)** rather than by enforcing it: the
capability was already available to every plan, so the honest fix was to say so. Flame gains a real
selling point it always had.

**Background removal is the one still outstanding** — `—` on Flame, `✓` on Blaze, gated by nothing.
Enforce it, or open it as we did custom templates.

**What Blaze differentiates on today: credits (300 → 800), the ability to buy top-ups, and priority
support.** That is a thin story against Flame at 2.5× the price, and it is a pricing decision rather
than a code one.

### Also on the page now: the A4 edible print sheet

Shipped long ago, gated by nothing, and never sold. A baker arranges the customer's photo frames on
an A4 sheet at true size, checks them against cake-diameter guides (3–8"), and exports a print-ready
PDF with cut marks — onto the edible sheets they already buy.

Called **"Edible print sheet (A4)"** on the pricing page; in the app the button still says
**"Open A4 simulator"**. Those should converge — *simulator* is honest about what it does but reads
as jargon to someone scanning prices, while *edible print sheet* is the baker's own phrase.

## New entitlement keys this implies (not yet in the registry)
~~`max_xray_orders_monthly` (#16)~~ — **DROPPED 2026-08-02, never added.** It was to replace
the `xray_reports` boolean with a graduated allowance; `ai_credits_per_month` does that job
already for the half of X-Ray that costs money, and `xray_reports` correctly gates the half
that does not. Adding this key would have put two meters on one feature.
`ai_credits_per_month` (#13, merged), `custom_storefront_template` (#6 — bool; Spark/Flame
false = preview-only/standard, Blaze+ true = apply), `storefront_analytics` (#7), `max_saved_templates`
(#21 — int; DEPRECATES the old `custom_templates` boolean, now redundant since every tier
creates N≥1). (#20 WhatsApp deferred — no key now.) #22 reuses the existing `max_team_members` int (wire
per-seat overage above Forge's cap, post-MVP). NO element-gating key — element-tier-gating
is KILLED, all elements on all tiers. #8 (white-label) & #9 (custom domain) get no keys
until built. Adding the new keys + a registry-driven admin form (replacing the raw-JSON
textarea in `ManagePlans.jsx`) is a prerequisite once the table firms up.

## Tier philosophy refinements (2026-06-30)
- **Spark = full CREATIVE + STOREFRONT experience** (design, branding, decorate,
  storefront, ALL elements), gated by TIME (30-day trial) + a small template cap (3) —
  NOT every business power-tool. Full X-Ray (#16) stays a Blaze hook Spark only previews.
  The "explore" magic lives in the designing, not in saving business assets.
- **Upgrade chain:**
  - **Spark → Flame — REFRAMED 2026-07-26.** This step used to be described as "unlimited
    orders + time + more saved templates", but orders were already unlimited on Spark, so
    the honest reading was *"your trial ended"* — a toll booth, not a value story. Since
    Spark is a TRIAL and not a column, Flame is no longer measured against it at all.
    Flame's story is stated against what the baker does today:

    > *"I pay ₹999 so my customers can see my cakes and order properly, instead of me
    > chasing quotes on WhatsApp."*

    That is storefront + branding + order/quote management + the A4 simulator — which only
    looked weak while a free column sat beside them showing the same ticks. The saved-
    template jump (3 → 30) stays as a secondary nudge, not the headline.
  - **Flame → Blaze:** premium storefront template (#6 — the strongest hook, customer-facing)
    + X-Ray reports (#16, hard capability) + more AI (#13). NOTE: at Flame=30, custom cake
    templates (#21) is NO LONGER a Flame→Blaze lever (few hit 30) — it's a Spark→Flame lever.
    (White-label/#8 dropped — hollow without #9.)
  - **Blaze → Forge:** more team seats + priority (rare; studio case). **⚠️ Seats deferred
    from MVP 2026-07-27 — this lever is EMPTY at launch. See "Staff logins deferred from
    MVP" for the open question about what Forge is for.**
- **Templates (#21) = COUNT lever, not capability** — every tier can save N (Spark 3 /
  Flame 10 / Blaze+ ∞). Reverses the earlier "Flame = global-only" call (was non-monotonic
  once Spark gets a taste). Cap creates rebuild-friction → upgrade pull at every step.
- **Team (#22) is an anti-resale cap, not a differentiator.** Unlimited seats = revenue
  leak (buy Forge once, resell Spattoo by adding paying users at zero marginal cost).
  Cap every tier; Forge = ~10 included then per-seat overage.

## Staff access control / RBAC (#23) — decided 2026-06-30
- **Not a standalone marketed feature.** Folds into "Team members" (#22) — it's the
  plumbing that makes adding staff *safe*, not a line item. "RBAC" speaks to enterprise
  buyers, not solo/2-person home bakers; on a pricing page it signals the wrong (complex,
  enterprise) vibe. Name the JOB ("add a helper without giving them billing"), not the tech.
- **Relevant only where seats > 1** (Flame+); moot on single-seat Spark.
- **Build staging (get the MODEL right now, stage the UI — NOT a v2 punt):**
  - MVP: keep fixed owner/staff (built); optionally add 1–2 preset staff levels
    ("Staff – full" / "Staff – orders only", no billing/pricing/team access). Covers ~95%.
  - NON-NEGOTIABLE NOW: keep the model **capability-based** (role = set of capabilities)
    so granular custom roles is an additive UI later, NO schema redo (schema-is-forever).
  - Later: full per-employee custom-permission matrix = a natural **Forge** differentiator
    (gives Forge a 2nd reason beyond seat count). Build when real multi-staff bakers ask.

## Storefront templates (#6) — decided 2026-06-30
- **The strongest Blaze lever** — it's the surface the baker's CUSTOMERS see; bakers pay to
  not look generic in front of their customers. Trial-revert adds loss-aversion.
- **Evolves the existing `storefront_themes` axis** (thin today — effectively one). NOT a
  new parallel concept. Distinct from #5 branding (logo/colors/story = ALL tiers, always)
  and #21 cake templates (unrelated). Line: everyone gets a BRANDED storefront on the
  STANDARD layout; choosing a PREMIUM layout is Blaze+.
- **Tiers (RESOLVED — preview-for-all, apply-for-Blaze+):** Spark = preview only · Flame =
  preview only · Blaze/Forge = choose & apply. Live storefront renders the baker's ENTITLED
  template, so Spark/Flame are always standard.
- **No "paid but lost it" trap** (this is why preview-only): nobody ever applies premium then
  loses it. Preview is a pure UI affordance (show all premium templates + "Upgrade to Blaze"
  CTA); the **Apply button is gated** by `custom_storefront_template` (Spark/Flame false,
  Blaze+ true). No trial-revert / entitlement-collapse logic needed for this key.
- **Flame = strictly standard-only** (can preview, can't apply). Settled.
- **Build:** templates = admin-authored master data in `storefront_themes` (DB); baker
  selects (gated); live storefront renders entitled template. **MVP = Standard + ≥5 premium**
  (a 2-template catalog won't justify upgrading — needs to read as a real feature). Architect
  for N. Adds a 2nd strong Flame→Blaze hook beside X-Ray + AI.
- **Storefront = invitation-driven shareable first-impression ("link in bio"), NOT a browse-
  destination.** Custom cakes were never browse-and-checkout (planned/personalized/WhatsApp-led).
  So the premium lever is THEMES (+ customization depth + modest counts: gallery/catalog), and we
  DROP destination-merchandising machinery (festive banners/campaigns, promo engine, occasion
  reminders, real-time slots, Instagram embed). Baseline = first-impression essentials (gallery,
  WhatsApp CTA, reviews display, pricing, story, FSSAI, FAQ). Full ladder + build phases in
  [Storefront Templates plan](https://github.com/spattoo/spattoo-docs/blob/main/plans/storefront-templates.md). (Research-backed; recalibrated.)

## Future features (post-MVP roadmap, not scheduled)
- **Live co-design session (Forge)** — baker + customer finalize the design together in real-time
  (baker-led; customer watches live on phone + directs by voice over WhatsApp). A closing tool
  (↑conversion, fewer revisions, live upsell) + Forge's 2nd pillar. Depends on the core
  state-management refactor (state must be centralized/serializable) + a managed real-time layer.
  Full brainstorm: [Live Co-Design brainstorm](https://github.com/spattoo/spattoo-docs/blob/main/plans/live-codesign-brainstorm.md).
- **Custom domain (#9)** — the #1 first-paid lever industry-wide; strong Flame/Blaze hook once the
  infra is built/tested.
- **WhatsApp Business-API notifications (#20)** — likely Blaze/Forge hook later (big India channel).
- **Granular per-employee permission matrix (#23)** — Forge hook; build the capability model now.
- **White-label (#8)** — only meaningful bundled with custom domain.

## Killed ideas (do NOT revive)
- **Element-tier-gating** — "some elements only for higher tiers." KILLED 2026-06-30. All
  elements on all tiers. Gating building blocks cripples explore, fragments the library,
  and would force per-tier branches in the designer (INVARIANTS violation). Differentiate
  on outputs/tools, never on creative building blocks.
- **White-label / remove-badge (#8)** as a standalone lever — hollow on `*.spattoo.com` +
  `@spattoo.com` email. Only revisit bundled with custom domain (#9).

## Known fixes flagged during this analysis
- **Marketing pricing page contradicts this table and the DB on five rows** (checked
  2026-07-26, `spattoo-web/apps/marketing/components/Pricing.tsx`). It hardcodes tiers
  instead of reading `GET /api/plans`, and every error understates the cheap tiers —
  advertising restrictions that are not enforced:

  | Row | This table + `seed_plan_entitlements.sql` | Marketing says |
  |---|---|---|
  | `{slug}.spattoo.com` | on for ALL tiers | Spark ✗, Flame ✓ |
  | Custom branding | on for ALL tiers | Spark ✗, Flame ✗, Blaze ✓ |
  | Saved templates | 3 / 30 / ∞ / ∞ | renders the DEPRECATED `custom_templates` bool |
  | Team members | 1 / 2 / 4 / 10 | 1 / 2 / **5** / **Unlimited** |
  | Orders (Spark) | 30-day trial, no count cap | **"10 total orders"** |

- **`subscription_plans.feature_bullets` carries the same stale claims**, and
  `PlanCards.jsx` renders them — so the IN-APP plan picker repeats them to bakers who have
  already signed up. Fix the seed alongside the marketing page.
- **Remove Team members / staff access from the marketing page and `feature_bullets`**
  (deferred from MVP 2026-07-27). The marketing page currently advertises "Team Members
  1/2/5/Unlimited" — wrong on the numbers AND on the premise, since no tier grants a second
  login at launch.
- **Pricing page needs an "Every plan includes" band** above the tier table (3D designer,
  A4 print simulator, all decorations, order/quote management, storefront + branding,
  colour guide, email notifications). Category features cannot defend the price level while
  they are invisible.
- `spattoo-admin/OnboardBaker.jsx` uses a stale tier list `['trial','starter','pro','enterprise']`
  that doesn't match real plans (`spark/flame/blaze/forge`) — onboarding can stamp a baker
  with a tier that maps to no plan. Load plans from `/api/admin/subscription-plans` instead.
- Spark is currently seeded as a crippled trial (everything `false`); reseed to "all
  creative + storefront features true, NO order cap, `max_saved_templates`=3, low AI,
  30-day trial" per this table.
