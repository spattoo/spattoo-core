# Baker Self-Signup Plan

Status: **planning** (no code yet). Decisions locked 2026-06-27.

## Goal
Let a baker self-onboard from the marketing site instead of admin-only creation.
On signup they land on the **free Spark** tier; pricing is shown on marketing and tier
upgrades live on the in-app Billing screen. Real paid checkout is **deferred** until
Razorpay is live (payments are currently stubbed).

## Locked decisions
- **Tier at signup:** default everyone to **Spark (free)**. No tier picker / no card at
  signup. Pricing shown on marketing for transparency; upgrades happen in-app (Billing
  screen already built). A real "choose tier → checkout" step is added only in Phase 4,
  when Razorpay is live. Rationale: payments are stubbed (`sub_mock_…`) and tier feature
  gating isn't enforced yet, so a tier picker today would give paid tiers away or be
  cosmetic — a throwaway.
- **Auth:** user-chosen password via Supabase **`signUp`** + built-in **email
  verification**. No admin-style temp passwords for self-serve.
- **No service key on a public endpoint:** profile creation runs on an **authenticated**
  route using the new user's JWT — not `admin.createUser` exposed publicly.
- **One baker per user:** the completion route is idempotent on `auth_user_id`.
- **Signup screen lives in `apps/app` at `/signup`**; marketing "Get Started Free" links
  there. Marketing stays static (keep WaitlistModal for "Request a demo").

## Current state (as mapped)
- Creation today: `POST /api/admin/bakers` (`spattoo-api/src/routes/bakers.js`, gated by
  `requireCapability('baker:onboard')`) — service-key `admin.createUser` (email
  pre-confirmed, temp password), then writes `bakers` + `baker_appusers`
  (role `owner`, `is_primary`) + `baker_subscriptions` (Spark, `billing_period` monthly,
  `start_date` today, `end_date` +30d) + sets `bakers.subscription_plan_id` /
  `subscription_status_id` + logs a subscription event.
- Plans seeded (`supabase/billing_tables.sql`): spark ₹0 / flame ₹999 / blaze ₹2499 /
  forge ₹4999 (monthly; quarterly −10%, yearly −17%). Constants in
  `src/constants/subscriptionPlans.js` (PLAN.SPARK=1 …).
- Subscription statuses: 1 active / 2 pending / 3 paused / 4 past_due / 5 expired /
  6 cancelled (`src/constants/subscriptionStatuses.js`).
- `apps/app` auth: `lib/supabase.ts` (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY),
  `BakerApp.tsx` `BakerLogin` uses `signInWithPassword` only; after login
  `api.fetchBakerProfile()` → `/api/baker/profile` resolves baker via `baker_appusers`.
- In-app Billing already wired: `activateSparkPlan` / `createSubscription` /
  `fetchBillingStatus` etc. (added to `bakerApi.ts`).

## Phase 0 — Prerequisites (verify before building)
1. **Schema gap:** code reads/writes `bakers.subscription_status_id` but it was not found
   in `supabase/*.sql`. Confirm the column exists in Supabase; add an ALTER migration if
   not. Self-signup writes it, so this must be solid first.
2. **SMTP for verification:** Supabase email verification needs working SMTP (same config
   the invite/notification emails use). Confirm verification mails deliver.
3. **Public-storefront default:** decide whether a brand-new baker's storefront starts
   `storefront_published=false` (draft). Note: inviting customers requires a published
   storefront (`/api/baker/customers/invite` 409s otherwise) — fine, but the post-signup
   setup should make publishing obvious.

## Phase 1 — Backend (spattoo-api)
1. **Extract `createBakerForUser({...})` service** (`src/services/bakerProvisioning.js`)
   from the admin route body — the rows + event log. Used by BOTH:
   - the existing admin route (admin supplies the created auth user), and
   - the new self-signup route (uses `req.user`).
   DRY: one creation path, no duplication.
2. **`GET /api/bakers/slug-available?slug=`** (public, rate-limited): returns
   `{ available: boolean, suggestion? }`. Validates slug format (lowercase, hyphens).
3. **`POST /api/bakers/self`** (auth required — the new user's JWT; NOT admin):
   - Idempotent: if a `baker_appusers` row exists for `req.user.id`, return that baker.
   - Body: `{ name, slug }` (+ optional phone/city). Re-check slug uniqueness server-side.
   - Calls `createBakerForUser` with `plan = SPARK`, `status = ACTIVE`, owner/primary.
   - Locale defaults INR / Asia-Kolkata; branding deferred.
   - Storefront starts as draft (Phase 0 decision).
4. Rate-limit the public endpoints; basic abuse guards.

## Phase 2 — Signup UI (spattoo-web `apps/app`)
1. **`/signup` route** beside login. Short form: email, password, business name, slug
   (auto-derived from name, live availability via `slug-available`, editable).
2. Flow: `supabase.auth.signUp({ email, password })` → "check your email" screen.
3. On verify/first login: `BakerApp` detects **logged-in but no baker profile**
   (`fetchBakerProfile` 404/empty) → routes to a small **setup step** that calls
   `POST /api/bakers/self`, then drops into the app on Spark.
4. Marketing: point "Get Started Free" at `apps/app` `/signup` (keep WaitlistModal for
   "Request a demo").

## Phase 3 — Post-signup setup (in-app)
- Lightweight wizard using the **already-wired** methods: branding
  (`updateBakerProfile`), flavours (`updateBakerFlavourExclusions`), publish storefront
  (`publishStorefront`). "You're on Spark — upgrade anytime" upsell to the Billing screen.

## Phase 4 — Paid tiers (when Razorpay is live; deferred)
- Replace stubs in `src/routes/billing.js` with real Razorpay; wire `createSubscription`
  to a real checkout. Only then add an optional "choose your plan" step to onboarding.
  See [[project_pricing_quote_payments.md]] (Model A direct-pay).

## Open questions
- Slug collisions: auto-suggest `name-2`? Reserve a wordlist (admin, api, www, app…)?
- Should self-signup also create the storefront theme default, or leave to setup?
- Multi-user bakers: invite teammates is a later concern (owner/staff roles exist).
- Do we want a light fraud/qualify gate (e.g. business name + phone) before activating?
