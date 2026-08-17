# Live Co-Design Session — Brainstorm (FUTURE / Forge-only)

> **→ Now has a concrete build plan: [LIVE_CODESIGN_BUILD_PLAN.md](./LIVE_CODESIGN_BUILD_PLAN.md).** The 2026-07-07 code
> investigation found the collaboration seam already exists (design is one serializable atom), so
> this is buildable now — the build plan revises three assumptions below: (1) transport = **Supabase
> Realtime**, not a new managed vendor; (2) **not** blocked on the core refactor; (3) **either** baker
> or customer holds the pen, plus a read-only no-account spectator. This doc stays as the origin/vision.

**Status:** FUTURE idea, documented 2026-06-30. Not scheduled. Forge-tier feature.
Originated as "screen share option" — reframed to **live co-design** (see below).

## Concept
Baker + customer enter a real-time session and finalize the cake design *together*, live,
instead of the async quote↔revise↔quote loop. "Make it lilac, raise the flowers" → baker
does it → customer watches it update on their phone → "yes, that one." Collapses days of
back-and-forth into one ~10-min session. Forge-only (studio / high-touch / weddings / corporate).

## Build model — pick the right one (the naming matters)
1. **Passive screen-share** (stream pixels, customer watches video). Cheap but laggy, customer
   passive — undersells it. ✗
2. **Full multiplayer** (both edit simultaneously, Figma-style). Max wow but HARD (state sync +
   conflict resolution + edit permissions + presence) AND undesirable — don't want the customer
   fumbling 3D tools; the baker is the expert. ✗ (maybe a later enhancement)
3. **Baker-led live co-design** ✅ THE SWEET SPOT — baker drives the designer; customer sees it
   update live (read-only viewer) and directs by voice. One editor, broadcast state to a viewer.
   Cheaper than #2 AND better UX (matches the real interaction: expert baker + directing customer).

## Pragmatic v1 (when built)
Baker starts a session → shares a join link over WhatsApp → customer opens on phone → sees the
designer live as baker drives → **they talk on a normal WhatsApp/phone call** (ZERO comms to
build) → finalize → order placed. The ONLY new build: session/room concept + state-sync transport
+ a read-only live viewer. Native in-app voice/video = later polish, NOT v1.

## Business case (it's a CLOSING tool, not just speed)
- **Higher conversion** — a customer who co-designs has invested + seen *their* cake → far more
  likely to order.
- **Fewer/zero revision cycles** — finalize in one session.
- **Live upsell** — "for ₹400 more I can add gold leaf — want to see it?" *clicks*. Raises AOV.
- **Differentiator** — no competitor offers live 3D co-design of a cake.
- **Gives Forge a real 2nd pillar** beyond team seats + granular RBAC (Forge was thin).

## Why FUTURE, and dependencies
- **Payoff of the core state-management refactor.** Real-time sync needs the designer state
  CENTRALIZED + SERIALIZABLE — exactly what [CORE_ARCHITECTURE_PLAN.md](./CORE_ARCHITECTURE_PLAN.md) fixes (6.5k-line god
  component / 92 useState). Building live sync on the current mess would be brutal. **Sequence
  AFTER the refactor.** (We already serialize design snapshots for orders — reuse that state shape.)
- **Real-time transport = the main infra decision.** A stateful WS/WebRTC layer or a MANAGED one
  (Liveblocks / Ably / Pusher). Pick managed; don't hand-roll. Reserve for Forge partly because
  this infra cost scales with live sessions (O(active sessions), room-scoped, NOT per-tenant).
  Current stack has Redis (BullMQ) — Redis pub/sub could back presence/session fan-out.

## Why Forge
High-touch consultative motion (weddings/premium/corporate) where a live design consult justifies
the price; needs the baker available (fits a studio w/ staff, not a solo baker mid-bake);
real-time infra cost → top tier. Async quote↔revise stays the default for everyone else.

## Risks / open questions
- **Scheduling** — both parties must be available; async stays the default, live is for high-value
  orders. Need a "request a live session" / booking affordance.
- **Customer device** — must run the 3D viewer smoothly on a mid-range phone (ties to the mobile
  GLB memory budget / asset-optimization work).
- **Handing limited control** — optional refinement: baker can briefly hand the customer a limited
  control (e.g. colour picker) without full multiplayer. Later.
- **Native comms** — start with "use your WhatsApp call"; in-app voice/video only if demand proves it.
- Reuse the existing order design-snapshot state shape as the synced payload.

## Related
[CORE_ARCHITECTURE_PLAN.md](./CORE_ARCHITECTURE_PLAN.md) (hard dependency) · asset-optimization (mobile viewer perf) ·
SUBSCRIPTION_TIERS.md (Forge tier).
