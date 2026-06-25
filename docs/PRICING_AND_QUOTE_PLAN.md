# spattoo — Pricing, Quote & Payments Plan

> Status: **planned / discussion** (drafted 2026-06-26). Living doc. Companion to
> `CORE_ARCHITECTURE_PLAN.md`.
>
> ⚠️ **The "Payments & settlement (India)" section is NOT legal, tax, or compliance advice.** It maps
> the landscape so we can make decisions, but Indian GST + RBI payment rules are intricate and change
> often (and this is written from general knowledge with a training cutoff). **Confirm every payments/GST
> point with a practising CA and the chosen payment-aggregator partner before collecting any money.**

---

## 1. The order model: request → review → quote → confirm

A custom cake is quote-based, not fixed-cart. The flow:

1. Customer designs in the 3D designer and **places a request** (current `POST /api/orders`).
2. Baker **reviews**: confirms makeability and sets a price → issues a **quote**.
3. Quote goes to the customer; customer **accepts / counters / rejects**.
4. On acceptance the order is **confirmed**.

**The key design decision — the price algorithm is baker-internal.** Spattoo can compute a suggested
price, but the **customer never sees a Spattoo estimate — only the baker's issued quote.** This
eliminates the "wrong estimate hurts the baker" risk and reframes the algorithm as a **baker
productivity tool** (a 10-second pre-filled starting point they override), not a customer-facing
pricing promise. A bad suggestion costs the baker a few seconds, never a lost order or a public wrong
number.

### 1a. The flow is a negotiation loop, not a line
Home bakers price by affordability *through conversation*, so the state machine must branch:
- **Baker review** resolves three ways: **quote**, **request a design change** ("can't do 3 tiers by
  Saturday — drop to 2?"), or **decline**.
- **Customer response to a quote**: accept, reject, or **counter** ("can you do ₹X?") → baker re-quotes
  → repeat. The quote is a **short revisable thread**, not a single immutable field.
- **Expiry**: tie quote validity to the delivery date (auto-expire a few days before).
- **Cancel** at any stage.

### 1b. Quotes are pinned to a design version
- A quote prices *this* design + weight + date. Any later design edit **supersedes** the quote (forces
  a re-quote).
- If the **baker** edits the design for makeability (`PATCH /orders/:id/design` exists), the change
  **round-trips back to the customer to confirm** — nobody ends up with a different cake (or price)
  than they agreed to. The order audit log already exists to track this.

### 1c. The quote is a transparent itemized artifact
Show line items — base (weight × flavour), decorations, delivery, packaging — not just a total. Reduces
sticker shock, makes negotiation concrete, becomes the confirmation/invoice, and yields the calibration
data (suggested vs quoted vs final-agreed).

### 1d. The baker review screen (where the algorithm earns its keep)
Design + **suggested price (override-able)** + itemized decoration breakdown + **makeability flags**
(too many tiers for the date, a decoration the baker hasn't enabled, structural concerns). This is the
same enumeration the X-Ray order-help feature does — one shared engine.

---

## 2. Pricing model — we own the *structure*, the baker owns the *rates*

- **Base (exact):** `weightKg × per-flavour-per-kg`, baker-configured. No estimation risk.
- **Decorations (fuzzy):** the design snapshot lists every placed element, so we **enumerate and
  itemize**; each element type carries a price contribution — **admin seeds defaults, baker overrides**
  (seed-in-code + DB overlay). Math/counting is ours; rates are theirs. Optional complexity factors
  (tier count, total decoration count).
- **Delivery + packaging:** baker config (flat / distance / per-tier).
- **Minimum order value:** baker-set floor; protects the too-low case.
- Because it's the baker's own rates and the quote is baker-confirmed, an over/under suggestion is never
  binding and never customer-facing.

### Phasing
- **Phase 0 — price only what's exact.** Baker configures per-flavour/kg + delivery + packaging.
  Decorations shown to the baker as an itemized **list without prices**; baker fills the decoration
  price at review. Immediate value, zero estimation risk; builds the config UI, schema, and the
  baker-confirms-final flow.
- **Phase 1 — baker-tunable decoration suggestion (internal).** Per-element default prices + baker
  overrides; algorithm suggests a decoration subtotal **on the baker's review screen only**.
- **Phase 2 — calibration loop.** Store suggested vs quoted vs final-agreed per order; surface variance
  back to the baker ("your foil orders close ~15% above suggestion — raise the rate?"); optionally
  auto-tune. The long-term moat; only possible because Phase 1 captured the data.

---

## 3. Schema / API deltas (most order *management* already exists)
- **Status enum + transition rules**: `requested → under_review → changes_requested ⇄ customer →
  quoted → negotiating ⇄ → confirmed → in_production → ready → completed`, plus `declined`, `expired`,
  `cancelled`. (`PATCH /orders/:id/status` + audit already exist.)
- **Quote fields on the order**: `suggested_price` (algo, internal-only), `quoted_price` + `line_items`,
  `quote_valid_until`, `final_price`, `priced_at`.
- **Pricing config (DB, via API; never localStorage)**: `baker_flavour_prices` (per-kg),
  `baker_pricing_settings` (delivery, packaging, min order, display mode), element default price on the
  library + `baker_element_prices` overlay.
- **Net-new customer surface**: a **"your quote" view** in the storefront — does NOT exist today (the
  storefront has no order-status/quote screen). Main new customer-facing build.
- **Notifications**: request → baker, quote → customer, accept → baker. Set a visible "typical response
  time" to manage the human-in-the-loop latency.

---

## 4. Payments & settlement (India) — landscape & decision

> ⚠️ Re-read the disclaimer at the top. Verify all of this with a CA + the PA partner.

### The core question
Should Spattoo **collect customer money and settle it to the baker**, or stay **software-only** with
payment happening **directly between customer and baker**? They have very different compliance weight.

### Model A — SaaS / lead-gen (Spattoo never touches the money) — RECOMMENDED START
Payment happens **directly customer → baker** (the baker's own UPI / payment link, or cash on
delivery). Spattoo facilitates design + quote + order and charges **bakers a subscription**.
- **Sidesteps** RBI payment-aggregator licensing, e-commerce-operator (ECO) GST collection, and TCS
  entirely — Spattoo is just software.
- **Fits home bakers with personal/savings accounts perfectly** — they receive money the way they
  already do.
- Trade-off: no transaction take-rate, weaker escrow/trust, no in-app deposit. Acceptable for v1.
- In the schema, payment is just **recorded** ("paid directly / COD / UPI ref"), not processed.

### Model B — Marketplace collect-and-settle (Spattoo collects, settles to baker)
Unlocks in-app deposits, escrow-style trust, refunds, and a transaction take-rate — but pulls in real
compliance:
- **You do NOT get your own RBI Payment Aggregator licence.** The bar is high (RBI authorisation +
  large net-worth requirements). Instead you build on an **authorised PA partner** —
  **Razorpay Route**, **Cashfree (Easy Split / marketplace)**, PhonePe, etc. — whose **split-settlement**
  product collects from the customer and settles to **linked/sub-merchant accounts**.
- **Savings-account fit (the make-or-break for home bakers):** PA partners commonly support **linked
  accounts for individuals with PAN-based KYC and a savings account** — a current account is **not
  always required**. ✅ This is promising, but **confirm current KYC norms with the specific partner**,
  as they tighten periodically.

### The Swiggy model — important correction
Swiggy/Zomato collecting and **paying GST on the restaurant's behalf** is a **specific carve-out for
notified *restaurant services* under GST Section 9(5)** (effective Jan 2022), where the ECO is deemed
the supplier for GST. **A cake/bakery supply is generally *goods*, not a 9(5) notified service** — so
that "we pay their GST" mechanism **likely does not apply to us**. Instead, an ECO that collects payment
typically falls under:
- **TCS (Section 52):** the ECO collects ~1% TCS on net taxable supplies and deposits it, filing
  **GSTR-8** — which requires **Spattoo itself to be GST-registered**. The baker remains liable for
  their *own* GST.
- ⚠️ Whether a *custom, made-to-order* cake is "goods" vs a "service" has genuine nuance — **CA call.**

### The GST-threshold trap for home bakers
- Most home bakers are **below the GST registration threshold** (~₹40L goods / ₹20L services) → **not
  GST-registered**.
- Historically, selling through an ECO **forced** GST registration regardless of turnover — a major
  adoption deterrent. **Recent relaxations (≈Oct 2023) exempt small intra-state goods suppliers below
  threshold** under conditions. **Verify whether onboarding a baker to "collect on their behalf" forces
  them into GST** — if it does, Model B becomes a hard sell to exactly our core users.

### Permissions / what we'd need for Model B
- A **registered Spattoo business entity** + **GST registration** (as the platform/ECO).
- A contract with an **authorised PA partner**; Spattoo onboarded as a platform, bakers as **linked
  sub-merchant accounts** (PAN + bank KYC; savings often OK — verify).
- **TCS collection + GSTR-8 filing** if treated as an ECO collecting consideration.
- Baker **KYC** capture (PAN, bank details, possibly Aadhaar/address).
- PCI/card-data scope is **offloaded to the PA partner** (we don't store card data).

### Recommendation (phased, low-regret)
- **P0: Model A.** Ship the full request→quote→confirm flow with payment **direct customer↔baker**
  (recorded, not processed). Zero fund-handling, zero new licensing, perfect home-baker fit. Spattoo
  monetises via the **baker subscription**.
- **P1 (later, optional): add a PA partner (Route/Easy Split)** for optional in-app **deposit/payment**,
  onboarding bakers as linked accounts (savings OK) — **only after** (a) a CA confirms the GST/TCS/ECO
  posture and the home-baker registration impact, and (b) the partner confirms savings-account KYC.
- Design the order/payment schema now so Model B can layer on without rework (a `payment_mode`:
  `direct | cod | gateway`, and nullable settlement fields).

### Open questions for the CA + PA partner (resolve before P1)
1. Does collecting on a home baker's behalf force them into GST registration (post-2023 relaxations)?
2. Is a custom made-to-order cake "goods" (TCS/Sec 52) or could any part be a 9(5) service?
3. Does the chosen PA partner settle to **individual savings accounts** with PAN-only KYC today?
4. If Spattoo is an ECO: TCS rate, GSTR-8 cadence, and our own GST-registration obligations.
5. Refunds/chargebacks/cancellation handling across the split settlement.
