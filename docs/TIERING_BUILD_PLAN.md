# Tiering & Storefront — Build Sequencing Plan

**Status:** PLAN (2026-06-30). Sequences the work from [SUBSCRIPTION_TIERS.md](./SUBSCRIPTION_TIERS.md)
+ [STOREFRONT_TEMPLATES_PLAN.md](./STOREFRONT_TEMPLATES_PLAN.md).

**Caveats:** rough SOLO-DEV order-of-magnitude estimates. A ~1-day code-audit spike (current
enforcement sites, existing storefront sections, AI entry-points) should firm these up before
committing dates. Scale: XS <1d · S 1–3d · M ~1wk · L 1–2wk · XL 2–4wk.

## Wave 1 — Tiering goes live (lean MVP) · ~1.5–2 weeks
The tier model works after this; fixes the original onboarding observation immediately.

| # | Item | Size | Notes |
|---|---|---|---|
| 1 | Add new entitlement keys to registry + reseed all 4 plans | S | max_saved_templates, custom_storefront_template, AI usage, storefront capability keys, trial-length. Registry cheap; seed = SQL. |
| 2 | Spark immediate unlock (storefront + branding true, order cap off) | XS | Pure data on already-enforced keys → fixes "Spark can't see store setup/brand colors". |
| 3 | max_saved_templates enforcement (Save-as-template count gate) | S | Count query + UI block at 3/30. |
| 4 | X-Ray gate wiring (#16) | XS | Already seeded; wire UI check. |
| 5 | Trial length as config value (replace hardcoded 30-day) | S | Admin-tunable, no deploy. |
| 6 | Fix OnboardBaker stale tier list | S | Load plans from /api/admin/subscription-plans (real bug — maps to no plan). |
| 7 | AI features on/off per tier (no metering yet) | S | Boolean gate at AI entry-points. |
| 8 | Marketing scrub (custom domain / white-label / WhatsApp) | XS | Remove unbuilt promises. |
| 9 | Hand-seed plan values via SQL (defer admin form) | XS | Bridge until Wave 2 form. |

## Wave 2 — Fast-follow (the real builds)

| Item | Size | Notes |
|---|---|---|
| ~~AI real metering (#13)~~ | — | **DEFERRED 2026-06-30** — the photo→3D cake feature isn't complete; don't meter a feature still changing shape. Revisit once #13 is done. AI stays open (beta), no gating key. |
| ManagePlans → registry-driven typed form | M | Replaces raw-JSON textarea: render a typed field per entitlement key (bool→checkbox, int→number+unlimited) from the registry, served via a new `GET /admin/entitlements-schema`. Kills typos/wrong-types; self-updates as keys are added. ~9 keys today + ~10 storefront keys coming make it necessary. |
| Storefront templating system | XL+ | Long pole — sub-breakdown below (~5–8wk, design-bound). |

### Storefront sub-breakdown
| Sub-item | Size |
|---|---|
| Template config model + extend storefront_themes schema | M |
| Refactor current storefront → config-driven renderer (extract "Standard") | L |
| Entitlement gating + capability keys (counts, customization depth, video, analytics) | M |
| Baseline first-impression essentials audit + gaps (WhatsApp CTA always; FSSAI, reviews, FAQ, delivery = CONDITIONAL-render — show only if baker has content, never show absence) | M (TBD after audit) |
| Admin authoring UI (ManageStorefrontTemplates) | M |
| Baker selection UI (gallery, preview, apply-gate, upsell CTA) | M |
| Light storefront analytics | S–M |
| Author Standard + 5 premium templates | L+ (design-bound) |

## Parallel: Design track (START NOW — longest lead time)
Pick directions + standard/premium split → design/commission 5 templates. User/designer-bound;
gates the storefront build's final step. Kick off early to keep it off the critical path.

## MVP cut-line decision
Storefront templating is the long pole (~5–8wk). Options:
- **RECOMMENDED:** ship Wave 1 as MVP with the CURRENT storefront as "Standard" for all (#6 =
  "coming soon"). Tiering + Spark explore + gates + AI-on/off live in ~2wk. Storefront templates +
  AI metering = fast-follow (also fits AI beta: generous on/off at launch, meter at GA).
- **ALT:** if storefront is core to launch value, fold into MVP, accept the multi-week timeline.

## Future (NOT in this plan — documented, unscheduled)
Custom domain (#9) · WhatsApp notifications (#20) · Live co-design (Forge,
[LIVE_CODESIGN_BRAINSTORM.md](./LIVE_CODESIGN_BRAINSTORM.md)) · Granular RBAC matrix (#23) ·
White-label (#8).

## Recommended next concrete step
1-day audit spike → then start Wave 1 #1–#2 (foundation + Spark unlock) for the immediate fix.
