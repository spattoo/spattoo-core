# AI Credits — metering, pricing, surface area, legality

**Status:** ANALYSIS / WORKING DRAFT. Written 2026-07-29.
**Reads against:** [SUBSCRIPTION_TIERS.md](./SUBSCRIPTION_TIERS.md) (#13 smart tools, #16 X-Ray,
"Metered tease"), [FONDANT_STUDIO_BRAINSTORM.md](./FONDANT_STUDIO_BRAINSTORM.md) ("Commercial
plumbing"), [FONDANT_BUILD_GUIDE_PLAN.md](./FONDANT_BUILD_GUIDE_PLAN.md) (craft guides).

Nothing here is built. `spattoo-core` contains **no AI code at all** today — every reference to
GPT/Meshy in this repo is in `docs/`. The ledger, the meter and every model call belong in
`spattoo-api`; core only ever *reads* a balance and *renders* a wall.

---

## 0. The one decision that has to be made first

`SUBSCRIPTION_TIERS.md` already ruled on this, and the ruling is the opposite of the name of
this feature:

> **Express the limit as a CONCRETE count in the UI ("5 photo→cake designs / month"), NOT
> abstract "credits". Internally meter a real cost ledger (compute/₹) for the margin
> guardrail; show readable counts outside.**
> — *Smart tools (#13) — metering & beta policy (RESOLVED)*

and

> **Name the JOB, never "AI"** — bakers don't buy "AI"; they buy the outcome.

**That decision should stand, and it is not in conflict with building this.** The resolution:

| Layer | Unit | Who sees it |
|---|---|---|
| Ledger / margin guardrail | **credits** (+ `provider_cost_inr` stamped per debit) | us, admin, finance |
| Entitlement / seed | `ai_credits_per_month` int | us, admin |
| Baker UI | **"X photo→cake designs left this month"** | baker |
| Top-up purchase | a **pack of jobs** ("+20 designs, ₹399") priced off credits | baker |

So: **credits are the internal primitive; jobs are the retail unit.** Build the credit ledger
exactly as the brainstorm specifies — you cannot run margin control on "designs" once there are
six different AI actions with a 20× cost spread — but do not put the word "credits" on a baker's
screen, and never show token counts or a model name.

**Why this matters beyond taste:** §5 shows that the *legal* distinction between "a Customer
Application" (allowed) and "reselling the Services" (prohibited by both OpenAI and Anthropic)
turns on almost exactly this. A UI that sells "AI credits" and shows what they buy in model terms
walks toward resale. A UI that sells "20 build guides from a photo" is unambiguously a product.
The pricing decision and the legal decision point the same way.

There is one honest cost to this: with N metered actions, per-job packs multiply
(a designs pack, an X-Ray pack, a stickers pack). Mitigation — **one wallet, N prices**: the
balance is credits internally and the UI renders the *same* balance as whichever job the baker is
currently standing in front of ("enough for 14 more build guides"). One number in the DB, a
context-appropriate sentence on screen. Revisit only if bakers start asking for a single
fungible balance, which is a problem worth having.

---

## 1. Free grant per tier + metering — and X-Ray for photo-only orders

### 1.1 X-Ray costs ₹0 today. Do not put it on the AI meter.

This is the most important thing in this document, because getting it wrong converts a working
free feature into a paid one.

`buildXrayReport()` (`src/orders/xray/report.js:62`) is **pure deterministic computation** from
`order.design_snapshot` + `weight_kg` + craft-guide rows fetched by element ID:

- `tinHelper.computeTinPlan()` — tin sizes from tier geometry + weight. Arithmetic.
- `harvestColors/Piping/Placeables()` — walks the snapshot. Object traversal.
- `gelLibrary.gelRecipeFor()` — hex → gel mixing recipe. A lookup table.
- `xrayProject.js` — projects 3D anchors onto the thumbnail with a fixed camera. Three.js maths.
- `fetchCraftGuides(elementIds)` — reads pre-authored rows from the DB.

Marginal cost per report: **zero**. It is a Blaze hook because it is *valuable*, not because it
is expensive. Its meter is already specified and is a completely different kind of meter:

| | `max_xray_orders_monthly` (#16) | AI credits (#13 + new) |
|---|---|---|
| Purpose | upgrade lever — "metered tease" | **cost recovery + cost ceiling** |
| Unit | confirmed orders (first 5 of the calendar month) | credits ≈ ₹ of landed provider cost |
| Marginal cost | ₹0 | real ₹ |
| Consumed by | order reaching `confirmed` | a successful AI job the baker keeps |
| Re-opening the report | free, forever | free, forever (result is cached) |

Two meters, two reasons, no overlap. **Keep them separate in the schema and in the UI.** A baker
on Blaze has unlimited X-Ray on designed orders and always will.

### 1.2 The actual new thing: X-Ray for orders that have no design

`OrderModal` in `manual` mode submits `referenceKeys` — reference photo keys — explicitly
"stand[ing] in for a design snapshot" (`src/orders/OrderModal.jsx:504`). Those orders have
`design_snapshot === null`, which today means:

- `OrdersPanel.jsx:470` — "Reference photos" section renders *only* for these orders.
- `OrdersPanel.jsx:896` — the 3D edit button is `disabled`.
- `XrayReport.jsx:41,255` — reads `order.design_snapshot` and `design.tiers` directly, so it
  cannot render a photo-only order at all.

  > **Correction (2026-07-29).** An earlier draft of this section called that a *live bug*. It is
  > not: `XrayLauncher` guards on `!order?.design_snapshot` as well as on the entitlement
  > (`OrdersPanel.jsx:111`), so the report is never reached with a null design. The claim came
  > from a grep that did not cover that line. Nothing was broken — the work is purely additive.

#### The architecture: AI produces a *snapshot*, not a *report*

**The model's job is to fill in the missing `design_snapshot`, not to write the build guide.**

```
reference photo ──▶ vision model ──▶ design_estimate (design_snapshot-shaped jsonb)
                                            │
                       baker reviews / corrects (weight, tiers, colours)
                                            │
                                            ▼
                            buildXrayReport()  ← UNCHANGED, 2,100 existing lines
                                            │
                              XrayReport.jsx  ·  xrayPdf.js
```

This is the same pattern the fondant brainstorm already chose for the auto-composer ("GPT → DSL →
existing renderer"), and it is right here for four independent reasons:

1. **You keep the 2,111 lines of X-Ray you already own.** Tin planning, gel recipes, nozzle
   confidence bands, the deduping, the PDF, the leader-line layout — all reused verbatim. The AI
   surface is one function returning one JSON object.
2. **The AI never authors baking instructions.** It identifies structure. Nozzle recommendations
   still come from your curated craft guides via `fetchCraftGuides()`; gel recipes still come from
   `gelLibrary`. This is exactly the safety argument `FONDANT_BUILD_GUIDE_PLAN.md` already makes
   ("the accuracy concern is real **only for per-order, on-the-fly** generation").
3. **It is inspectable and correctable.** A snapshot is editable in a form; a paragraph of prose
   is not. If the model says 3 tiers and it is 2, the baker fixes one field.
4. **It converges with the designer.** A good enough estimate can seed an actual editable design
   — the photo-order becomes a designed order, and the "Edit in 3D" button at
   `OrdersPanel.jsx:896` lights up. That is a genuinely new product capability, not a
   consolation prize.

**Rejected: photo → prose report.** One call, no reuse, unverifiable, uneditable, and it puts the
model in the position of telling a baker how to bake — the exact thing the craft-guide plan was
designed to avoid.

#### What the model must return

`design_snapshot`-shaped, so `harvest.js` walks it without a branch. Minimum viable:

```jsonc
{
  "source": "ai_estimate",          // vs "designer" — NEVER omit; every downstream surface needs it
  "confidence": 0.0-1.0,            // per-field where it matters, not just overall
  "tiers": [ { "shape": "round|square|rect", "radius": n, "height": n, "color": "#hex",
               "topPipings": [{ "id": "<library element id|null>", "name": "...", "color": "#hex" }],
               "bottomPipings": [ ... ] } ],
  "stickers":  [ { "name": "...", "color": "#hex" } ],   // toppers / decorations seen
  "texts":     [ { "content": "...", "color": "#hex" } ],
  "anchors2d": [ { "key": "...", "x": 0..1, "y": 0..1 } ] // see the diagram caveat below
}
```

Two implementation notes that will otherwise bite:

- **Match piping to real library element IDs.** Give the model the element catalogue (name +
  reference image) and force it to choose from that list or return `null`. If it returns a real
  `elementId`, `fetchCraftGuides()` works and the photo-order report is *as good as* a designed
  one. If it invents an ID, `report.js` will silently produce a guide-less row. Constrain with
  structured output + validate every ID against `cake_elements` server-side before storing.
- **The leader-line diagram cannot use `xrayProject.js` as-is.** That module rebuilds the
  *thumbnail's* fixed camera (`CAMERA_POSITION`, `CAMERA_FOV`, `lookAt(0,2,0)`) to project 3D
  anchors onto a known render. A customer photo has an unknown camera. Options: (a) omit the
  annotated diagram for photo-orders — cheapest, and the tin/colour/nozzle tables carry most of
  the value; (b) have the model return **normalised 2D anchors on the photo** and give
  `XrayCakeDiagram` a second, projection-free path that takes `ax/ay` directly. `layoutDiagram()`
  already separates "where the line points" (`ax,ay`) from "where the label sits" (`ly`), so (b)
  is a small change — feed it pre-projected anchors and skip `projectToScreen`. **Ship (a), design
  for (b).**

#### Metering rules for it

- **Meter the estimate, never the view.** Store the result as `orders.design_estimate` jsonb.
  Re-opening, re-printing, re-PDFing is free forever — the same principle already settled for
  X-Ray in "Metered tease" ("metering views would punish the baker for re-opening the same build
  guide while they are actually baking").
- **A re-run after the baker edits costs nothing** (no model call — it is the same deterministic
  pipeline over corrected data).
- **A regenerate-from-scratch costs a credit**, but per the beta policy, **failed generations
  never charge**. Which means *we* absorb failures — see §2, the loaded-cost calculation.
- **Charge on keep, not on call.** Reserve → generate → baker accepts → commit; baker discards →
  refund. Matches the brainstorm's "atomic debit — reserve before the expensive call, refund on
  failure".

### 1.3 Grant per tier

The grant's job is **a hard cost ceiling**, not revenue. `SUBSCRIPTION_TIERS.md` already leans on
it heavily: *"Cost is bounded by the AI meter, NOT by trial length"* — the 30-day Spark trial is
only safe because of this. So the grant must be sized from *worst-case spend*, and only then
sanity-checked against *typical usage*.

Seed values (illustrative — `subscription_plans.features.ai_credits_per_month`, a data edit):

| Plan | Credits/mo | ≈ photo→cake designs | ≈ photo X-Rays | Worst-case COGS at 100% burn |
|---|---|---|---|---|
| Spark (trial) | 200 | ~10 | ~13 | see §2 — must be a number you would pay 500 trialists |
| Flame | 200 | ~10 | ~13 | |
| Blaze ⭐ | 800 | ~40 | ~53 | |
| Forge | 2,000 | ~100 | ~133 | |

Three rules about these numbers:

1. **They are seed data, not constants.** Same discipline as `max_xray_orders_monthly` — tuned
   from the DB, no deploy. Numbers stay soft through beta; tighten at GA.
2. **Spark = Flame, deliberately.** If the pending "trial = Blaze for 30 days" decision lands
   (§SUBSCRIPTION_TIERS "PENDING SIGN-OFF"), the trial grants Blaze's *features* — but the AI
   grant should stay at the low value regardless. It is the only line item with real marginal
   cost, and a 30-day trial at Blaze's AI allowance is the one way a trialist can cost you
   money. Call this out explicitly in that sign-off; "trial = Blaze" must mean *features*, not
   *credits*.
3. **Graduated nudges at 70/90/100%** — already the house pattern for metered features, already
   argued in "Metered tease". Silent failure at the wall wastes the mechanism.

**Reset vs rollover — DECIDED 2026-07-29: the monthly allowance resets; purchased credits never
expire.** The allowance is a hard cost ceiling, so it cannot accumulate. Purchased credits are
prepaid money — expiring them is a goodwill problem with a one-person business, and it would have
to be stated at the point of purchase to be enforceable, so it is not something that can be added
later. Allowance is always spent first, so a baker never burns credits they paid for while free
ones remain.

---

## 2. Pricing credits to be profitable

### 2.1 The framing correction: "cost + X%" will not produce a business

The request is *"for a spend of x rupees on the GPT api, we collect x + %"*. Run the arithmetic
before committing to that shape.

A photo→X-Ray estimate is one vision call: roughly 1 image + ~800 prompt tokens in, ~1,500
structured tokens out. On mid-tier current pricing that is on the order of **$0.01–0.03 ≈
₹1–3**. A 25% markup earns **₹0.25–0.75 per build guide.** A Blaze baker doing 40 a month
generates **₹10–30/month of gross profit** — against a ₹2,499 subscription and a bespoke
double-entry ledger with reservations, refunds and reconciliation. That is not a revenue line, it
is a rounding error with a schema.

**Price on value, floored by cost.** A build guide that saves 20 minutes of guesswork and
prevents one remake is worth ₹20–50 to a baker whose gross profit per cake is ₹900–1,560
(the customer economics already established in `SUBSCRIPTION_TIERS.md`). The cost tells you the
*floor* and the *ceiling on your exposure*; it should not set the price.

So state the target as a **gross margin on the metered layer, not a markup on tokens:**

> **Target ≥ 80% gross margin on every metered action** (i.e. retail ≥ 5× landed cost), and
> **never below 60%** (2.5×) for any single action. Below 60%, the action is either mispriced or
> should not be metered at all.

80% is the right anchor because the rest of the business is ~90%+ gross margin software; a
metered layer that runs at 25% margin *drags the blended number down* and makes the whole P&L
look worse the more successful the feature is. This is the standard failure mode of AI features
bolted onto SaaS.

### 2.2 Landed cost — what actually goes into the "x"

The provider invoice is not the cost. Compute a **landed cost per successful action**:

```
landed = provider_list_price
       × (1 + retry_rate)          // beta policy: failures are free to the baker → we eat them
       × (1 + pipeline_overhead)   // multi-call jobs: cutout, moderation, validation pass
       + fixed_per_job             // R2 storage + egress, job runner, remove.bg / Meshy unit fees
       × (1 + fx_buffer)           // providers bill USD, we price INR
```

- **`retry_rate` is the one everybody forgets.** "Don't charge failed generations" is the right
  beta policy and it is *our* cost. At a 25% discard rate the landed cost per *kept* result is
  **1.33× list**, not 1.0×. Instrument it from day one; it is also the single best quality metric
  you will have.
- **`fx_buffer`: +8–10%.** You bill INR monthly and pay USD monthly. Do not re-price per call —
  re-tune `credit_costs` quarterly and let the buffer absorb drift.
- **GST on the purchase side:** buying API capacity from OpenAI/Anthropic is an **import of
  service → 18% GST under Reverse Charge Mechanism**, self-invoiced. Recoverable as ITC once
  registered, so for a registered entity it is a *cash-flow* item rather than a cost — but it
  **is a real 18% cost until registration**, and Spattoo's own docs note most bakers are below
  the threshold (that is bakers, not us — confirm our own position with the CA).
- **Not in landed cost, deliberately: craft-guide generation.** Craft guides are generated
  **once per element, admin-side, and amortised across every baker forever**
  (`FONDANT_BUILD_GUIDE_PLAN.md`). That is a content-production COGS line, not a per-baker meter.
  Never charge a baker a credit for reading one.

### 2.3 The credit unit

- **1 credit ≈ ₹1 of RETAIL value.** Peg to retail, never to provider cost. Legible top-ups
  (₹499 → 500 credits), and a model price change moves your *margin*, not your shelf price.
- **`credit_costs` is a table, not code** (already the brainstorm's decision). `action_key →
  credits`, admin-authored master data.
- **Round every action UP to whole credits.** No fractional credits in the ledger, ever.
- **Stamp `provider_cost_inr` on every debit row.** This is the margin guardrail: realized margin
  per action, per week, is a query — and it is what catches a model price change, a prompt
  regression that triples output tokens, or a retry-rate blowout *before* the month closes. Alert
  when any action drops under 60%.

Worked example (**illustrative — replace every number from a real invoice before shipping**;
assumes ~₹90/USD):

| Action | Provider list | ×retry/overhead | Landed ₹ | Price (credits) | GM |
|---|---|---|---|---|---|
| Photo → X-Ray estimate | ~$0.02 | 1.35× | ~₹2.7 | **15** | 82% |
| Photo → cake design (GPT library-match) | ~$0.03 | 1.4× | ~₹4.2 | **20** | 79% |
| 2D sticker (image gen + cutout) | ~$0.04 + remove.bg | 1.5× | ~₹14 | **60** | 77% |
| Image → 3D (Meshy) | *fill from invoice* | 1.6× | TBD | TBD | ≥75% |
| Enquiry → draft order (text only) | ~$0.002 | 1.2× | ~₹0.25 | **2** | 88% |

Top-up packs, retail-framed per §0: *"+20 build guides · ₹399"* (= 300 credits), never
*"300 credits · ₹399"*.

### 2.4 GST on the selling side — settle this before the ledger design

Indian GST treats a prepaid instrument's timing by whether the supply is identifiable at issue.
For Spattoo credits it **is** identifiable — they are only ever redeemable for Spattoo AI
features, taxed at the same 18% SAC 9983 as the subscription. That points to **time of supply =
date of issue → GST charged and remitted when the baker buys the pack, not when they burn it.**

Consequences to design for now, because retrofitting them is painful:

- Recognise the **sale** at purchase; the ledger's job is fulfilment tracking, not revenue
  recognition.
- **Unused purchased credits are margin that has already been taxed.** Because the tax falls at
  sale rather than redemption, a balance sitting unredeemed forever is not a growing liability —
  which is what makes the never-expire decision (§1.3) cheap rather than open-ended. The only
  real exposure is provider cost if an old balance is burned all at once, and the per-action
  margin floor already bounds that.
- Do **not** build a "recognise on redemption" model.
- **Have the CA confirm** — voucher/PPI treatment has moved recently and this note is a
  direction, not an opinion.

---

### 2.5 Why would a baker pay us, when ChatGPT is free?

The question that decides whether any of §2 matters. `FONDANT_BUILD_GUIDE_PLAN.md` concedes the
premise: this is *"exactly like the kind of how-to sheet you can ask ChatGPT to produce from a
photo."*

**Be honest about where the answer is "they shouldn't."** A baker who wants a rough method should
use ChatGPT — it is cheaper, already on their phone, and conversational. We lose that argument if
we contest it.

We are not selling a better model; it is the same class of model. **We are selling what the answer
is checked against:**

| | ChatGPT | Us |
|---|---|---|
| Tin sizes | guesses, or asks | derived from **the weight on this order**, split by real tier volumes |
| Gel recipe | *"add purple until it looks right"* | *"¼ tsp Sugarflair Grape Violet per 500g"* — ~32 real gels |
| Nozzles | invents tip numbers | curated `nozzles` catalogue + human-reviewed craft guides |
| Allergen conflict | **cannot** — has no idea what is in your Hazelnut Praline | *"Customer asked nut-free; top tier is Hazelnut Praline"* |
| Completeness | confidently omits the topper | enumerates every placeable, with a test asserting none is missed |
| Honesty | never says "I could not identify this" | names what it could not read |

The last two carry the most weight. **ChatGPT's failure mode is confident omission** — a beautiful
sheet that quietly leaves out the lion topper. And the allergen band is not a *better* answer, it
is one ChatGPT cannot produce at all, because it has no access to the baker's own flavour
declarations.

**The frame that actually decides it** is not AI-vs-AI: ~₹17.60 per build guide against ₹900–1,560
profit per cake, where a remake costs the whole cake. Roughly 1–2% of one cake's profit to not
guess the tin. Nobody optimises that by switching to a chat window and re-typing the order.

Three things follow, and they are constraints rather than preferences:

- **Never market it as AI.** The moment we say "AI-powered build guides" we are comparable, and we
  lose. Name the grounding: *your tins, your gels, your nozzles.* (This is the existing "name the
  JOB, never AI" rule earning its keep a second time.)
- **Show the working on the sheet.** If it reads like generic model output it will be judged as
  generic model output. The tin line should say it is for the weight on this order; the nozzle line
  should read as coming from the craft guides.
- **One tap, no prompt box, ever** — the binding constraint, with its full reasoning in spattoo-docs
  `features/ai-credits.md`. If we ask a baker to type anything, we have handed the advantage back.

**A gap worth closing:** we do not know which nozzles a baker actually owns (`nozzles.is_common` is
a global heuristic, not an inventory). *"Wilton 1M — you have this"* versus *"Ateco 863"*, which
they cannot buy before Saturday, is the difference between a useful sheet and an annoying one. A
per-baker tip inventory would make this argument close to unanswerable, and it is small.

**And the bottom line to hold ourselves to:** we are selling the only build guide that knows what
the customer ordered, what is in your flavours, and what is in your gel box — and that admits what
it could not see. If we ever ship one that does not do those things, the objection becomes correct
and we should stop charging for it.

## 3. Where else AI earns its keep

Ranked by (value to baker × strategic fit) ÷ (cost + risk). Anchored to things this codebase and
these docs already establish.

### Tier 1 — build these

| # | Job (never call it AI) | Why it wins | Cost | Meter? |
|---|---|---|---|---|
| A | **Build guide from a photo** (§1) | The request. Extends X-Ray — the strongest Blaze hook — to the ~half of orders that never touch the designer. | ~₹3 | ✅ |
| B | **Enquiry → draft order** | **Probably the highest-ROI item in this list and it is not on any roadmap.** Spattoo's own research says *40–60% of custom cake orders arrive via Instagram/WhatsApp*, and Flame's entire pitch is *"stop chasing quotes on WhatsApp"*. Paste the customer's message → a pre-filled `OrderModal`: date, weight, tiers, flavour, occasion, dietary flags, delivery mode. Text-only, ~₹0.25, and it makes the cheapest tier's promise literally true. | ~₹0.25 | ✅ (cheap → generous) |
| C | **Storefront cold-start copy** | Bakery story, cake descriptions, alt text, FAQ — generated at onboarding from a few photos + three answers. Activation is the stated weak point ("PQL = storefront published AND ≥1 quote request"); an empty storefront is the thing that stops both. One-off per baker, so it is nearly free and it moves the metric that matters most. | ~₹1 | ⚠️ soft cap only |
| D | **Photo → cake design** (#13, already decided) | Existing roadmap item; merged pool. | ~₹4 | ✅ |

### Tier 2 — after the ledger exists

| # | Job | Note |
|---|---|---|
| E | **Customer reply drafts** | Answer a customer's question in the baker's own tone, from the order context. Pairs with B; same channel, same pain. |
| F | **2D sticker generation** | Fondant Studio v1, already specced. Highest per-job cost and the **main content-moderation / IP surface** — it is the only place a baker types a free prompt. Guardrail before launch, not after. |
| G | **Storefront photo cleanup** | Background removal is already plumbing (#15); auto-crop/straighten/enhance for gallery consistency. Not a headline. |
| H | **Auto-composer (GPT → fondant DSL)** | Brainstorm phase 4. Blocked on the construction-kit data model. |

### Tier 3 — think hard first

| # | Job | The problem with it |
|---|---|---|
| I | **Price suggestion from a design** | Attractive and genuinely useful, but it is advice about the baker's own margin. Frame as a *reference range from comparable orders*, show the inputs, never a single authoritative number. |
| J | **Dietary / allergen cross-check** | **Do not ship as authoritative.** `report.js:44-58` already states the principle for exactly this text: *"any attempt to infer structure from it is us guessing at intent. Ambiguity belongs to the customer."* An allergen error is a health incident, not a bug. Acceptable form: flag *"the customer's note mentions nuts — check this"* and make the baker resolve it. Never auto-populate `dietaryRequirementKeys`. |

### Explicitly NOT AI

Tin planning, gel colour recipes, nozzle matching, X-Ray on designed orders, the A4 print
simulator, demand/production forecasting from the orders calendar. All deterministic, all
already correct, all cheaper and more trustworthy as code. **Adding a model to any of these makes
the product worse and more expensive simultaneously.**

---

## 4. GPT vs Claude — price, value, and which to use where

**Headline: at matched capability tiers the price is a wash (within ~10%), so price is not the
deciding variable for any job in §3.** Where the two providers differ is at the *edges* of the
range — and those edges happen to matter to us.

*All rates July 2026, per 1M tokens, in/out. ₹ at an assumed **₹90/USD** — replace with your real
settlement rate. **Verify every number against the provider's own pricing page at build time.***

| Tier | Anthropic | OpenAI |
|---|---|---|
| Top | Fable 5 — $10 / $50 | GPT-5.6 Sol — $5 / $30 |
| High | Opus 5 — $5 / $25 | *(Sol)* |
| Mid | **Sonnet 5 — $3 / $15** *(intro $2/$10 to Aug 31)* | **GPT-5.6 Terra — $2.50 / $15** |
| Low | **Haiku 4.5 — $1 / $5** | **GPT-5.6 Luna — $1 / $6** |
| Floor | *(none)* | **GPT-5.4 nano — $0.20 / $1.25** |
| Caching | up to 90% off cached input | 90% off cache reads; writes 1.25× |
| Batch | flat 50% | flat 50% |
| Image generation | **none — Anthropic does not generate images** | GPT Image 2 / 1.5 ($0.005–$0.21) |

### 4.1 Cost per job, both providers

**Job A — photo → X-Ray design estimate.** Assumes one 1024×1024 photo (~1,400 image tokens by
Anthropic's `(w×h)/750`; OpenAI's varies by model — treated as comparable here), a **4,000-token
element catalogue served from cache**, 500 fresh instruction tokens, 1,200 structured output
tokens.

| Model | ₹ / call | vs. its counterpart |
|---|---|---|
| GPT-5.4 nano | **₹0.18** | no Anthropic equivalent |
| Claude Haiku 4.5 | ₹0.75 | **13% cheaper** than Luna |
| GPT-5.6 Luna | ₹0.86 | |
| Claude Sonnet 5 *(intro)* | **₹1.49** | 30% cheaper than Terra — **until Aug 31** |
| GPT-5.6 Terra | ₹2.14 | 4% cheaper than Sonnet 5 at list |
| Claude Sonnet 5 *(list)* | ₹2.24 | |
| Claude Opus 5 | ₹3.74 | **13% cheaper** than Sol |
| GPT-5.6 Sol | ₹4.28 | |

**Job B — enquiry → draft order** (text only, ~600 in / 400 out):
nano **₹0.06** · Haiku 4.5 ₹0.23 · Luna ₹0.27 · Sonnet 5 ₹0.70.

**Job C — storefront copy** (~1,500 in / 1,200 out): Terra ₹1.96 · Sonnet 5 ₹2.03. A wash.

**Job F — 2D sticker:** GPT Image 2 at medium quality ≈ $0.04 ≈ ₹3.6, plus remove.bg.
**No Anthropic option exists.**

**The single biggest cost lever is neither provider — it is prompt caching.** The element
catalogue is byte-identical on every photo→X-Ray call. Cached, it costs ~10% of list; uncached it
would roughly double Job A's price on the cheap tiers. Build the prompt with a stable static
prefix from day one, on whichever provider you pick. Batch API (50% on both) is the equivalent
lever for craft-guide generation, which is bulk and latency-insensitive.

### 4.2 The three places the providers genuinely differ

1. **Image generation: OpenAI only.** Anthropic has no text-to-image API and has publicly chosen
   not to build one. Fondant Studio v1 (2D stickers, item F) is *the* v1 slice in the brainstorm,
   so **an OpenAI account is unavoidable regardless of what else you decide.** This is a hard
   constraint, not a preference. (FLUX / Stable Diffusion via Replicate is the alternative if you
   ever want to move off it.)
2. **A genuine cost floor: OpenAI only.** GPT-5.4 nano at $0.20/$1.25 is **5× cheaper on input
   and 4× cheaper on output than Anthropic's cheapest model.** For Job B — high-volume, short,
   structurally simple text — that is ₹0.06 vs ₹0.23. Both are >90% margin at a 2-credit price,
   so it does not change the P&L today; it changes it if enquiry-parsing becomes something every
   baker runs on every WhatsApp message.
3. **Vision quality: Claude leads on the published benchmarks.** Claude's multimodal and
   document/diagram-understanding scores run ahead of OpenAI's on the 2026 comparisons — most
   relevantly on *extracting structure from an image*, which is precisely Job A. Treat this as a
   hypothesis worth testing, not a settled fact: these are vendor-adjacent benchmarks on generic
   tasks, and "reads architectural diagrams well" does not automatically mean "counts cake tiers
   and names piping styles well".

One smaller engineering difference: OpenAI's strict JSON-Schema structured outputs guarantee
schema conformance, where Anthropic achieves it via forced tool-use. Both work; OpenAI's is
marginally less code for the `design_estimate` contract. Not a deciding factor.

### 4.3 DECIDED 2026-07-29 — do not run a formal eval before launch

**Start on the hypothesis, instrument so the eval accrues, refine from real data.** The formal
model bake-off in §4.3.3 below is **deferred, not cancelled** — it is kept because it is the right
method if the question ever becomes expensive, and because §4.3.2 is a cheaper version of the same
idea that runs by itself.

The reasoning: provider choice is a ~10% price difference behind a config key (§4.1), on an action
whose model is a `credit_costs` row. A wrong call costs a config change. That does not justify a
day of harness-building before a line of the feature exists.

**Starting hypothesis — build against this:**

| | Choice | Why |
|---|---|---|
| Provider | **OpenAI** | already required for image gen, already the disclosed subprocessor |
| Job A / D (vision) | **GPT-5.6 Terra** — mid tier, *not* the cheap tier | see below |
| Job B (enquiry text) | **GPT-5.4 nano** | 4× cheaper at the floor, simplest task |
| Prompt | static element-catalogue prefix, **cached from call one** | the biggest single cost lever (§4.1) |

**Start at mid tier, not the cheap tier — this is the part that looks wrong and isn't.** During
beta the volume is negligible (100 estimates/month at ₹2 is ₹200 *total*), so cost is not a real
constraint yet. Starting on nano conflates *"model too small"* with *"task too hard"*, and bad
output then teaches you nothing about whether the feature is viable. Start where failures are
**informative**, then walk down to Luna/nano once the correction data (§4.3.2) shows the headroom.
Optimising down later is a config change with evidence behind it; optimising up is re-litigating
the feature.

#### 4.3.1 The one check that is NOT skippable — and it is 30 minutes

Distinguish two questions that look alike:

- *"Which provider?"* — **skippable.** 10% of a rupee, reversible, no urgency.
- *"Can a model read a cake photo well enough for this feature to exist?"* — **not skippable**,
  because build-order steps 2–4 (entitlement keys, ledger, top-up packs) are all premised on the
  answer being yes. If it is no, you have built a credit ledger for a single action.

Method: open the playground, paste **5 thumbnails** from orders you already know, ask for the
`design_estimate` JSON, eyeball tier count / shape / colours against the real snapshot. No
harness, no scoring, no code. 5/5 roughly right → proceed on the hypothesis. 2/5 → the sprint you
just saved paid for the half hour, and the ledger gets built around enquiry-parsing instead.

#### 4.3.2 Make production BE the eval — one schema decision, expensive to retrofit

**Store the model's raw output immutably, and the baker's corrections separately.**

```
orders.design_estimate       jsonb  -- what the model said. NEVER overwritten.
orders.design_estimate_meta  jsonb  -- { provider, model, prompt_version, created_at }
orders.design_snapshot       jsonb  -- what the baker accepted / corrected (existing column)
```

The diff between the first and the third **is** the eval — running continuously, on real customer
photos, with human labels, for free. It is strictly better data than §4.3.3's thumbnail set,
because thumbnails are clean studio renders and these are phone photos of cakes on kitchen
counters. Within a month it yields tier-count accuracy, element-ID hit rate, and — most useful of
all — *which fields bakers always fix*, which is a prompt backlog rather than a model question.

**If the estimate is overwritten when the baker edits, none of this exists**, and the provider
question gets re-opened in six months with no more information than today. This is the single
non-reversible decision in the whole plan; everything else is a config row.

`prompt_version` earns its column alongside `model`: most quality movement will come from prompt
and catalogue changes, not model swaps, and without the stamp you cannot attribute the change.

#### 4.3.3 The formal eval — deferred, kept for when it is worth it

**Every designed order in the database has both a `design_thumbnail_url` and the ground-truth
`design_snapshot` that produced it.**

That is a free, perfectly-labelled eval set for Job A, and it is sitting there right now. Take
~50 orders spanning 1/2/3 tiers, feed each thumbnail to a candidate model, and diff the returned
estimate against the real snapshot on the fields that decide whether a build guide is right:

| Field | Why it is the one that matters |
|---|---|
| tier **count** | wrong count → wrong tin plan → the baker bakes the wrong cake |
| tier **shape** | round vs square changes `computeTinPlan` entirely |
| colour ΔE per tier | drives `gelRecipeFor` — a bad hex is a bad gel recipe |
| piping **element ID** hit-rate | a wrong/`null` ID silently drops the craft guide from the report |
| placeables recall | the "completeness trap" `harvest.js` warns about — a missed topper ships missing |

That gives you a **number per model per rupee**, on your own data, instead of a benchmark
argument — and it also answers whether the cheap tier (Haiku 4.5 / Luna at ~₹0.8) is good enough,
which is worth more than the provider question because it is a 3× cost difference on the same job.

Caveat: thumbnails are clean studio renders, so scores will be **optimistic** relative to a
customer's phone photo of a cake on a kitchen counter. Use it to *rank* models, not to predict
absolute accuracy.

**When to actually run this:** when §4.3.2's production data says a specific thing is wrong (a
field bakers correct on most orders), or when the metered actions get expensive enough that a 3×
tier difference is real money — not before. Until then it is a harness nobody reads.

### 4.4 Recommendation

**Ship on OpenAI alone. Revisit only if §4.3.2's production data shows a specific, attributable
weakness in the model — not on benchmark reputation.**

The reasoning:

- **OpenAI is already required** (image generation, §4.2.1) and is **already the disclosed
  subprocessor** in the privacy policy — for "AI vision (identifying decorative elements)", which
  is Job A almost word for word. Zero new legal or compliance work.
- **Price is not a reason to add a second vendor** — §4.1 shows matched tiers within ~10%.
- **A second provider is real recurring overhead for a small team:** two contracts, two DPAs, two
  key rotations, two rate-limit regimes, two moderation surfaces, two invoices to self-invoice for
  RCM (§2.2), and two sets of failure modes on call at 2am. That cost is worth paying for a
  *quality* win on the job where being wrong causes a remake. It is not worth paying to save 13%
  on ₹0.80.
- **But keep the door open architecturally, at near-zero cost:** `credit_costs` is keyed by
  **action**, never by model (already the brainstorm's decision). Add `provider` + `model` columns
  to the debit row (already recommended in §5, rule 6). Swapping the model behind
  `photo_to_xray_estimate` then becomes a config change, and you can run a 90/10 shadow split to
  keep the comparison live as models turn over — which they will, twice a year.

**If** evidence later favours Claude on Job A, the resulting split is clean and worth the second
vendor. Keep this table as the target shape, not as a launch plan:

| Job | Provider | Model | Why |
|---|---|---|---|
| A — photo → X-Ray estimate | **Claude** | Sonnet 5, fall back to Haiku 4.5 if eval permits | structural vision extraction; highest cost-of-being-wrong |
| D — photo → cake design | **Claude** | same as A | same task shape, same catalogue, shares the cached prefix |
| B — enquiry → draft order | **OpenAI** | GPT-5.4 nano | 4× cheaper at the floor, highest volume, simplest task |
| C — storefront copy | **Claude** | Sonnet 5 | prose and tone; cost irrelevant at one-off volume |
| E — customer reply drafts | **Claude** | Haiku 4.5 / Sonnet 5 | tone-sensitive, baker's voice |
| F — 2D sticker generation | **OpenAI** | GPT Image 2 | **no alternative** |
| Craft guides (admin, bulk) | either | mid tier + **Batch API (−50%)** | latency-insensitive, generated once, amortised |

Note the shape of that table: **A, D and C are the jobs where a quality difference is worth paying
for, and they are all cheap and low-volume. B and F are the high-volume/high-unit-cost jobs, and
both land on OpenAI anyway.** So even the two-vendor outcome puts the money on OpenAI and the
judgement on Claude — which is a comfortable place to be, and the reason this decision is safe to
defer rather than study.

---

## 5. Is this allowed? Is it resale?

**Short answer: yes, this model is allowed, and it is not resale — provided the product sells
outcomes rather than model access.** The dividing line is sharp and both providers draw it in
roughly the same place.

*Not legal advice. Have counsel review the final ToS, and re-check both agreements at build time
— they change.*

### Anthropic — Commercial Terms of Service (eff. 2025-06-17)

- **A.1 grants it explicitly:** *"Anthropic gives Customer permission to use the Services,
  including to power products and services Customer makes available to its own customers and end
  users."* That sentence is Spattoo's use case verbatim.
- **D.4 restricts:** *"Customer may not... access the Services to build a competing product or
  service, including to train competing AI models or **resell the Services** except as expressly
  approved by Anthropic."*
- Nothing restricts what you charge your own customers.

### OpenAI — Business Terms / Services Agreement

- Restricts: **"Customer may not resell or lease access to its Account or any End User Account."**
- Grants, in the same breath: the licence **"includes the right to use OpenAI's API to integrate
  the Services into Customer Applications and to make Customer Applications available to End
  Users."**
- Output ownership is assigned to the customer, and API/Enterprise tiers carry IP
  indemnification.

### The test, stated plainly

> **Selling access to the model is resale. Selling an outcome your product computes is a Customer
> Application.**

Spattoo sells "a build guide from your reference photo" and "a cake design from an inspiration
picture". A baker cannot type an arbitrary prompt and receive raw model output. That is a
Customer Application, and charging for it — at any margin — is ordinary product pricing. Marking
up your own compute costs is what every SaaS does; neither agreement contains a price-control
clause.

### Nine rules that keep it on the right side

1. **No general-purpose prompt box returning raw model output.** Every action is a bounded,
   product-specific job with our prompt and a structured schema we validate. This is the single
   most important rule.
2. **Never name the model, show tokens, or price in model terms.** No "GPT-5 credits", no
   "powered by OpenAI credits", no token counters. Conveniently identical to the existing
   "name the JOB, never AI" rule — the safest legal framing is also the agreed product framing.
3. **No BYO-key, ever.** A baker supplying their own key, or us proxying calls on their behalf,
   is the shape that actually looks like leasing account access.
4. **Bind bakers to the providers' usage policies in Spattoo's ToS**, with an explicit right to
   suspend for abuse. Both agreements make *us* responsible for our end users' conduct.
5. **Moderate free-text prompt input** (sticker generation, item F). The brainstorm already
   flags this: *"content moderation / brand & IP risk on freely-prompted GPT output — it's our
   key, our platform name."*
6. **Log provider + model + request id on every debit row.** Needed for the indemnity, the margin
   guardrail (§2.3) and any abuse investigation. One column, enormous downstream value.
7. **Label AI-derived output as an estimate.** `source: "ai_estimate"` must reach the screen and
   the printed PDF. Wanted for safety anyway — a baker must never mistake an inferred tin plan
   for a measured one — and it keeps us clear of any "presented as human-authored" concern.
8. **Confirm no-training / retention posture and keep the privacy policy current.**
   `spattoo-web/apps/marketing/content/legal/privacy-policy.md:134-136` already discloses OpenAI
   ("AI vision — identifying decorative elements"), Meshy and remove.bg as subprocessors with
   locations. Photo→X-Ray sends *customer* reference photos to a US processor — the disclosure
   covers it in spirit; re-read it against the final feature set and confirm API data is excluded
   from training.
9. **Don't train on it.** No fine-tuning a competing model on provider output — the one thing
   D.4 names first.

### Residual risks, honestly

- **Provider price/terms change unilaterally.** Mitigated by metering *operations* rather than
  tokens (already decided) — a price change moves margin, not the shelf price, and
  `credit_costs` re-tunes without a deploy. Keep the abstraction; it is load-bearing.
- **Single-provider dependency.** `credit_costs` keyed by *action* (not by model) means swapping
  GPT→Claude for a given job is a config change. Worth preserving even before you need it.
- **"Except as expressly approved by Anthropic"** — if Spattoo ever *does* want a
  pass-through/BYO-model offering, that is a conversation with Anthropic, not a product decision.

---

## 6. Build order

0. **The 30-minute smoke test** (§4.3) — 5 thumbnails, playground, eyeball the JSON. The only
   pre-work, and it exists solely to stop steps 2–4 being built on a feature that cannot work.
1. ~~**Fix the photo-order X-Ray guard.**~~ **Withdrawn** — there was no defect; `XrayLauncher`
   already guarded on `design_snapshot` (see the correction in §1.2). Replaced by the real core
   work: `xray/resolveDesign.js` as the single answer to "which design does X-Ray read", consumed
   by the launcher, the report and the PDF so they cannot disagree.
2. **Entitlement keys** — `ai_credits_per_month` and `max_xray_orders_monthly` into the registry
   + seed; retire the `xray_reports` boolean (`OrdersPanel.jsx:784` is its only reader in core).
3. **Ledger** (spattoo-api) — append-only `credit_transactions`, `credit_costs` master table,
   reserve/commit/refund, `provider_cost_inr` + `provider` + `model` per debit, balance = sum +
   checkpoint. Per the brainstorm: no mutable `credits_remaining` integer.
4. **One action end-to-end: enquiry → draft order (item B).** Cheapest, lowest-risk, highest
   ratio — and it proves reserve/commit/refund on something that cannot embarrass you.
5. **Photo → X-Ray estimate** on the §4.3 hypothesis (OpenAI / Terra / cached catalogue prefix),
   diagram omitted (option (a)). **Ships with `design_estimate` + `design_estimate_meta` immutable
   from the first commit** (§4.3.2) — this is the step where that becomes irreversible.
6. Balance UI + 70/90/100% nudges + top-up packs.
7. Margin dashboard — realized GM per action per week, **plus** estimate-vs-corrected field
   accuracy from §4.3.2. **Before** opening the more expensive actions, not after.

## Open decisions

1. **Trial grant.** If "trial = Blaze" is signed off, does the trial get Blaze's AI credits?
   Recommendation: **no** — features yes, credits at the Flame value. This is the only line with
   real marginal cost.
2. ~~**Reset vs rollover.**~~ **DECIDED 2026-07-29 — the monthly allowance resets; purchased
   credits NEVER expire.** The 12-month life previously recommended here was dropped. Expiring
   prepaid money is a goodwill problem with a one-person business, it would have to be stated at
   the point of purchase to be enforceable, and it could never be retrofitted onto packs already
   sold. It also costs less than it looks: GST on a pack falls due at SALE, not redemption (§2.4),
   so an unredeemed balance is not a growing tax liability — it is margin that has already been
   taxed. Implemented in `023_ai_credit_packs.sql`: no expiry column, no sweep.
3. **The illustrative prices in §2.3** need replacing with figures from an actual provider
   invoice + our real FX settlement rate before anything ships.
4. **Does photo→X-Ray need the annotated diagram to be worth selling?** Ship without and find
   out; it decides whether option (b) gets built.
5. ~~**One provider or two?**~~ **DECIDED 2026-07-29 — OpenAI alone, on the hypothesis, no
   pre-launch eval** (§4.3). Reversible by config; revisit only when §4.3.2's production data
   names a specific weakness. The corollary that is *not* optional: `design_estimate` must be
   immutable and separate from `design_snapshot` from the first commit, or the data this decision
   defers to never exists.

## Sources

Provider terms: [Anthropic Commercial Terms](https://www.anthropic.com/legal/commercial-terms) ·
[OpenAI Services Agreement](https://openai.com/policies/services-agreement/) ·
[OpenAI Business Terms](https://openai.com/en-GB/policies/may-2025-business-terms/) ·
[commercial-use analysis](https://terms.law/forum/thread/openai-api-terms-commercial-use.html)

Pricing (July 2026, **verify against the providers' own pages before use** — these are
third-party trackers and models turn over roughly twice a year):
[OpenAI API pricing](https://www.tldl.io/resources/openai-api-pricing) ·
[OpenAI per-model breakdown](https://pricepertoken.com/pricing-page/provider/openai) ·
[OpenAI image pricing](https://costgoat.com/pricing/openai-images) ·
[Anthropic API pricing](https://www.tldl.io/resources/anthropic-api-pricing) ·
[Claude pricing docs](https://platform.claude.com/docs/en/about-claude/pricing) ·
[Anthropic caching & batch](https://www.finout.io/blog/anthropic-api-pricing)

Model comparison: [vision/multimodal benchmarks](https://www.edenai.co/post/claude-fable-5-vs-gpt-5-5-benchmark) ·
[Claude vs GPT 2026](https://tech-insider.org/claude-vs-chatgpt-2026/) ·
[image token cost formulas](https://blog.roboflow.com/image-token-cost-vlm/) ·
[Claude has no image generation](https://godofprompt.ai/blog/can-claude-generate-images/)

India GST: [OIDAR & AI tools](https://ebizfiling.com/blog/how-gst-applies-to-ai-tools-under-oidar-rules/) ·
[vouchers & gift cards, EY India](https://www.ey.com/en_in/media/podcasts/indirect-tax-insights/episode-3-understanding-gst-treatment-of-gift-cards-and-vouchers) ·
[time of supply](https://vakilsearch.com/article/time-of-supply-under-gst/) ·
[GST on SaaS subscriptions / RCM](https://readyfiling.com/2026/03/03/gst-on-saas-subscriptions-chatgpt-claude-etc-rcm/)
