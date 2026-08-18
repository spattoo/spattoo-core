# Storefront Templates — Plan

**Status:** SHAPING (2026-06-30). The biggest single build from the subscription-tier work
(see [SUBSCRIPTION_TIERS.md](./SUBSCRIPTION_TIERS.md) #6). Storefront is the surface the
baker's CUSTOMERS see → the strongest Flame→Blaze upgrade lever.

## Goal & ROLE (recalibrated 2026-06-30)
Turn the thin single-look storefront (`storefront_themes`, one default "spotlight") into a
catalog of **selectable themes/templates** (the LOOK) + modest capability knobs, scaling by tier.

**ROLE = invitation-driven, shareable first-impression — NOT a browse-destination e-commerce site.**
- Custom cakes were NEVER a browse-and-checkout purchase: they're planned, personalized,
  WhatsApp-discussed, relationship-based. Swiggy/Zomato killed direct ordering for COMMODITY
  ready-food, not custom cakes (which never lived there).
- The storefront is the baker's **"link in bio" / shared-on-WhatsApp presence** — the page that
  opens when a customer taps a shared link. Its job = nail the ONE first visit (look pro, show
  work, build trust, one-tap enquiry → designer). Optimize the FIRST IMPRESSION, not repeat
  merchandising.
- Genuinely valuable because most bakers have NO web presence (a full site was never worth it);
  a beautiful shareable subdomain is the right-sized thing they lack.
- **Therefore: DROP destination/merchandising machinery** (festive banners, scheduled campaigns,
  auto LTO/countdown, promo engine, occasion reminders/repeat-order automation, real-time slots,
  Instagram embed — they came FROM Instagram). These assume repeat browsing + outbound marketing
  we are not building.
- **The premium lever is THEMES** ("themes attract; choosing one is a plus") + customization depth
  + modest counts.

MVP scope: **Standard + ≥5 premium templates** (a thin 2-template catalog won't justify an
upgrade — it needs to read as a real feature).

## Responsive — a FOUNDATION requirement (mobile-first ≠ mobile-only)
The storefront is CUSTOMER-facing and opened on ANY device (phone/laptop/tablet) — it must look
intentional on all, not a stretched phone column. Today it's a 600px centred column = skinny strip
+ empty desktop margins. **Solve responsiveness ONCE in the shared renderer (the foundation), so
every template inherits it** — desktop: wider container, gallery as a GRID (not single carousel),
story side-by-side, contained hero. Templates vary the LOOK (tokens); the responsive LAYOUT is
shared (don't re-solve per template — drift trap). Inline styles can't do media queries → use JS
breakpoints (extend `useIsMobile` → mobile/tablet/desktop) or inject a media-query `<style>` block.

## Architecture (scale-correct)
- **ONE storefront renderer driven by template config + theme tokens.** A "template" =
  `{ layout skeleton + section list/order + section variants + theme tokens (colors, fonts,
  spacing, hero style) }`. NOT N bespoke React components (they drift; every template = fresh
  code — same anti-pattern as designer per-type branching).
- **Templates = admin-authored MASTER DATA** in `storefront_themes` (DB). Adding a template
  later = a DB row + preview image, NO deploy. Bounded, O(1) in bakers.
- **Baker branding (#5: logo/colors/story) overlaid at render** on top of any template.
- **DECOUPLE look from capability:** Template = look & arrangement. Entitlement = which
  sections exist + their limits. Sections are NOT tied to a template (avoids combinatorial
  explosion). Any template renders whatever sections the baker's tier unlocks.

## Capability ladder (TRIMMED for invitation-driven role — pending final confirm)
Each tiered row = an entitlement key (int/bool) in `subscription_plans.features`.

**BASELINE — every tier incl. Spark (first-impression essentials, NEVER gated):** hero gallery
(generous), sticky WhatsApp enquiry CTA (free `wa.me`) → designer/ordering, review/rating DISPLAY,
menu+pricing, baker story/about, FSSAI/trust badges, delivery/lead-time/deposit info, FAQ,
enquiry/quote form, basic SEO, mobile-first + WebP/lazy-load/<3s (engine-level). Standard template
+ branding (#5). Optional occasion NAV (first-visit wayfinding, not a campaign).

**CONDITIONAL-RENDER RULE (all optional sections):** a section renders ONLY when the baker has
content for it — NO empty placeholders, NO negative/absence statements. Specifically: **delivery**
shows only if the baker delivers (a pickup-only baker shows nothing about delivery — never "we
don't deliver"); FSSAI badge only if a number is provided; reviews only if reviews exist; FAQ only
if populated; story/gallery only if filled. Always-on: WhatsApp CTA (number captured at onboarding).
Each section = a typed block that's present-when-populated, not a fixed slot that can sit empty.

**TIERED LEVERS (themes-led):**

| Lever | Spark | Flame | Blaze ⭐ | Forge | Type |
|---|---|---|---|---|---|
| Theme / template choice (#6, apply) | preview | preview | ✅ | ✅ | bool `custom_storefront_template` |
| Theme customization depth | — | basic | advanced | full | enum |
| Gallery photos | ~15 | 50 | 200 | ∞ | int (generous) |
| Published cake designs (catalog) | 5–10 | 30 | ∞ | ∞ | int |
| Video hero (optional) | — | — | ✅ | ✅ | bool |
| Light storefront analytics (link opens / enquiries) | — | — | ✅ | ✅ | bool |
| Staff seats (#22) | 1 | 2 | 4 | 10 +overage | int |

**THE premium lever is THEMES** ("themes attract; choosing one is a plus"). Blaze's storefront
hook = premium themes + customization depth + counts — narrower than a merchandising suite, but
real. Blaze still pulls overall via X-Ray (#16) + AI photo→cake (#13) + premium themes (#6).

**DROPPED (destination/merchandising machinery — overkill for an invitation-driven subdomain
with low repeat visits):** festive offer banners, scheduled festive campaigns, auto LTO/countdown,
promo/offer engine, occasion collections-as-merchandising, occasion reminders/repeat-order
automation, real-time availability/slots, Instagram feed embed (redundant — traffic comes FROM
Instagram). A baker promotes festivals on Instagram (where the audience is), not via a banner on a
page nobody re-visits.

**NOTE — "Festive Maximalist" THEME (Direction 3) stays.** Dropping festive *campaign machinery*
≠ dropping the festive *look*. The theme is a permanent jewel-tone aesthetic a festival-focused
baker picks; only the repeat-visit banner/campaign engine is cut.

## Research findings — pass 3 (site-builder tiering, 13 platforms, 2026-06-30)
- **Theme CHOICE is rarely the primary paywall** (~4–5/13 gate it). Most give themes free and gate
  CAPABILITIES + customization DEPTH. Indian builders (Instamojo 1→19, Shoopy, Bikayi, Dukaan 7→14)
  DO gate theme choice → #6 is legit, but works best as ONE lever among several (= this ladder).
- **Closest analog = Pixpa** (per-creator branded storefront): **0% transaction fee all tiers**,
  monetizes purely on features/limits (gallery/storage/products/contributors). → **Spattoo should
  NOT take transaction/commission fees** (matches Model-A direct-pay); pure subscription + capability
  gating. The Indian-D2C fee-stepping pattern is a MARKETPLACE play that doesn't fit us.
- **Custom domain = the #1 first-paid lever (12/13).** We've deferred it (#9, untested infra) — but
  it's the single most proven upgrade trigger; STRONG future Flame/Blaze hook once built.
- **Reviews reconciliation:** DISPLAY = baseline (trust, +60% conv); photo-reviews + collection
  AUTOMATION = premium.
- **Anchor numbers from survey:** staff 1 / 2–5 / 15–20 (we cap Forge at 10 for anti-resale — keep);
  catalog Big Cartel 5/50/500, Shoopy 50/500/5k, Pixpa 3/10/100/∞; gallery Pixpa 200→∞ (so be
  generous); video/reviews/promo commonly mid-tier unlocks.
- **Remove-"Powered by" badge:** common lever (4/13) — but we KILLED it (hollow on `*.spattoo.com` +
  `@spattoo.com`); revisit only bundled with custom domain.

## Build phases
1. **Template model** — config schema (sections, variants, tokens) + extend `storefront_themes`.
   Foundational; everything hangs off it. Research informs the section/variant/token vocabulary.
2. **Refactor current storefront → templated renderer** — extract today's `CustomerStorefront.jsx`
   as "Template 1: Standard", render from config. (Strengthens the weak infra.)
3. **Entitlement gating** — `custom_storefront_template` + the capability keys above. Apply
   gated (Spark/Flame preview-only + upsell CTA; Blaze+ apply). Live storefront renders entitled
   template; sections/limits entitlement-driven.
4. **Author Standard + ≥5 premium templates** as master data + preview images (depends on design).
5. **Admin authoring UI** — `ManageStorefrontTemplates` (create/edit template rows, upload preview),
   + registry-driven entitlement form for the new capability keys.
6. **Baker selection UI** — settings gallery: preview all templates, Apply gated, "Upgrade to
   Blaze" on locked ones; capability limits surfaced (e.g. "5 of 15 gallery photos used").

Phases 1–3 = the reusable engineering backbone; 4–6 grow the catalog.

## Design & inspiration (CONTROL = user's; I bring options, never pick)
- **User owns the aesthetic direction** (full control over visual content). I build the system
  + implement approved looks. Premium templates may be worth commissioning a designer for polish.
- **Sourcing process:** research real references → present 3–5 distinct DIRECTIONS (mood, color/
  type tendencies, hero/layout, what makes it premium) → user picks → build. Optionally mock an
  approved direction in Canva before coding.
- **Market weighting:** Indian home bakers, Instagram-first, MOBILE-FIRST (customers on phones),
  festive/occasion-driven, warm + aspirational — NOT generic Western-minimalist patisserie.

## Research (IN PROGRESS 2026-06-30) — feeds the template config shape
Three parallel passes:
1. Bakery/home-baker storefront DESIGN directions (Indian + Instagram + mobile + festive) →
   distinct visual directions + references for the user to choose.
2. How e-commerce site builders (Shopify/Squarespace/Wix/Square/Pixpa/Dukaan/Dotpe/Big Cartel)
   structure TIERED themes + gated storefront capabilities → capability levers + typical limits.
3. Storefront sections/features that drive conversions for visual/food/D2C businesses →
   prioritized high-value capabilities to inform our config + tiering.

## Research findings — pass 1 (high-converting sections, 2026-06-30)
- **CRITICAL: WhatsApp enquiry CTA (free `wa.me` deep-link) ≠ WhatsApp notifications (#20, deferred).**
  The one-tap WhatsApp button is the #1 conversion path for home bakers ("Instagram = window,
  WhatsApp = sales counter"). It is FREE and must be **baseline on every tier**. Do NOT let the
  #20 Business-API-notifications deferral kill the storefront WhatsApp CTA.
- **Gate growth/automation, NOT trust table-stakes.** Reviews+photos (+60% conversion), transparent
  pricing, FSSAI/trust badges are BASELINE — gating them hurts conversion for all + platform rep.
  (Corrects earlier ladder that put reviews behind Blaze.)
  - **Baseline (all tiers):** hero gallery, WhatsApp CTA, reviews+photos, menu+pricing, baker story,
    FSSAI/trust badges, delivery/lead-time/deposit info, FAQ, basic enquiry/quote form. Mobile-first +
    WebP/lazy-load + <3s load = engine-level (all tiers).
  - **Premium differentiators (Blaze+):** occasion-based collections/merchandising, scheduled festive
    campaigns + automated LTO/countdown banners, Instagram feed embed, promo/offer engine, occasion
    reminders/repeat-order automation, real-time availability/slots, finished-cake proof galleries,
    guided/3D-designer enquiry.
- **Counts (gallery/catalog/featured) scale ON TOP of a conversion-credible baseline** — baseline is
  not "stripped".
- **Authenticity gates urgency:** any LTO/availability/scarcity feature MUST be tied to a real
  deadline/real capacity — fake timers damage trust long-term.
- **Template config must support these section blocks:** hero gallery · sticky WhatsApp/enquiry CTA ·
  reviews+photos · menu/catalog+pricing · occasion-collections nav · festive/seasonal collection + LTO
  banner · Instagram embed · About/baker-story · trust-badge strip (incl. FSSAI) · FAQ ·
  delivery/lead-time/deposit info · enquiry/quote form. All mobile-first + image-optimized.

(Pending: pass 2 = design directions; pass 3 = site-builder tiering numbers — will refine the
capability ladder + numbers when they land.)

## Research findings — pass 2 (design directions, 2026-06-30)
5 distinct directions (user picks which to build — I present, never choose):
1. **Pastel Confectionery** — blush/ivory/gold, sweet/friendly/IG-cute — birthday generalist.
2. **Editorial Patisserie (quiet luxury)** — cream/charcoal/champagne, restrained/gallery — wedding/premium gifting. (Hardest to fake → most "premium".)
3. **Festive Maximalist** — jewel + gold foil, vibrant/local, swappable festive hero + hampers — festival/occasion seller. (Clear gap vs Western minimalist; locally resonant.)
4. **Warm Artisan** — terracotta/kraft/butter, honest/handmade/story-led — solo home baker.
5. **Bold Retro Playful** — saturated clashing, sticker-y/Gen-Z — bento/novelty/dessert-box.

**Architecture VALIDATED by both passes:** build ONE reorderable typed-block library + shared
style tokens (palette, type pair, corner-radius, motif, section-bg). One block library renders
all 5 personalities by swapping tokens — NOT 5 hardcoded template trees. Confirms the config-
driven model above.

**Section blocks the config must support** (typed, optional, reorderable):
header/nav · hero (+ swappable seasonal variant) · sticky WhatsApp/enquiry CTA · catalog/menu
(price optional) · gallery/portfolio · reviews/testimonials/social-proof · story/about (+ baker
photo) · Instagram feed embed · promo/announcement bar · seasonal/occasion collections ·
featured/best-sellers carousel · gifting/hampers · FAQ (custom-order process) · enquiry/quote
form · delivery/service-area + contact/location · footer · newsletter/loyalty.

**Standard vs premium split — OPEN:** (A) all 5 directions premium + a neutral 6th = Standard;
or (B) #1 or #4 = free Standard, other 4 premium + a 6th to keep 5-premium.

## Baker customization + requirements (notes, 2026-06-30)
Baker-facing customization the storefront must support (these are the "theme customization
depth" levers — tier them basic/advanced/full later):
1. **Add a section** — baker can add a custom content section to their storefront (sections =
   config-driven data in `storefront_customizations`, baker-authored — needs the section-list
   render + a baker UI to add/order them).
2. **Change theme colours** — beyond the existing primary/accent (possibly more granular: bg /
   text / accent roles).
3. **Change fonts** — baker overrides the template's font TOKENS (fits the token system directly:
   `tk.font` / `tk.serif` become baker-overridable).

New section type:
- **"This week's / this month's highlight"** — a lightweight, baker-set FEATURED spotlight (one
  item — a cake/cookie/offering — the baker updates). Inspired by Honeybear's "this week's cookie".
  Gives the storefront a focal point + freshness. NOT the cut festive-campaign machinery (no
  countdown/scheduling engine — just a single featured item).

Theme reference:
- **Honeybear Bake Shop** (https://www.honeybearbakeshop.com/) — "simple and good"; candidate for
  a/the STANDARD theme look (friendly, clean; has the "this week's cookie" highlight). To rebuild:
  match its sections/spacing/type/imagery treatment. (Analysis pending — user to confirm fetch or
  guide the look.)

## Open decisions
- Confirm/adjust the capability ladder + exact numbers.
- Exact premium template count for MVP (≥5).
- Which design directions to build (after research).
- Flame: strictly standard template only (confirmed) — but which CAPABILITIES Flame gets vs Blaze.
