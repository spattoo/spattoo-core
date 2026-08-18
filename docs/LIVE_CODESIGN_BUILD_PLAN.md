# Live Co-Design Session — Build Plan

**Status:** planned, ready to build. Supersedes the "FUTURE / blocked on refactor" framing in
[LIVE_CODESIGN_BRAINSTORM.md](./LIVE_CODESIGN_BRAINSTORM.md) — the code investigation (2026-07-07) found the collaboration seam
already exists, so this is buildable now. Decisions locked with the user 2026-07-07.

**One-line:** baker and customer co-design a cake **live** in the real 3D designer — one "pen"
(edit baton) passed between them, a read-only live viewer for a 3rd person the customer invites —
by **syncing the design state**, not streaming pixels.

---

## 0. Locked decisions (2026-07-07)

| Decision | Choice | Why |
|---|---|---|
| Transport | **Supabase Realtime** (Broadcast + Presence) | Already installed everywhere; anon client has it enabled; designer already gets the `supabase` prop. Single-editor baton needs no CRDT. No new vendor/bill. Revises the brainstorm's "pick a managed vendor". |
| Sequencing | **Build MVP now** | The design atom is already centralized + serializable (see §2). Don't wait for the core refactor; fold delta-sync in later. |
| Edit model | **Bidirectional pen** — baker *or* customer can hold it | User requirement; consistent with `PRICING_AND_QUOTE_PLAN.md` §1e ("the customer holds the pen on purpose"). Baker can always take it back. |
| 3rd person | **DESCOPED (2026-07-07)** — parked | The anonymous no-account spectator was dropped after the security review (§5, §9) surfaced it as the highest-risk surface. If revisited, do it **invite-based** (an authenticated read-only participant), NOT anonymous. Baker+customer co-design ships without it. |
| Comms | **WhatsApp/phone voice** (zero to build) | Per brainstorm. In-app voice/video is later polish, not v1. |

---

## 1. Reframe: state sync, not screen share

"Screen share" is the user's mental model; literal pixel-streaming (`getDisplayMedia`, Zoom-style)
is the wrong tool and the brainstorm already rejected it (build model #1). We **sync the one
`design` object** between participants; each renders it locally. Strictly better for a 3D app:

- Crisp WebGL on every device (no video compression artifacts on the cake).
- Tiny bandwidth — a ~50-field JSON blob, not a 1080p stream.
- **Independent camera per viewer** — each person orbits the cake themselves (camera is local, §2).
- Runs on a mid-range phone (ties to the asset-optimization mobile budget).

## 2. The collaboration seam already exists (the key finding)

The brainstorm assumed this had to wait for `CORE_ARCHITECTURE_PLAN.md` because state had to be
"centralized + serializable." **It already is.** Investigation (2026-07-07):

- **One design atom.** The entire persisted design is a single `useState` — `design` in
  `hooks/useCakeDesign.js:186`. None of the ~86 `useState` in `CakeDesignerInner` hold persisted
  design; they're all transient UI / selection / catalog / session state.
- **One apply primitive.** `loadDesign(design)` (`useCakeDesign.js:875`) is a single `setDesign`
  (no fan-out; `normalizeDesign` hydrates legacy shapes). This is the exact "apply remote state"
  hook. Already the shared path for template-open (`CakeDesigner.jsx:5098`), order-reopen (`:6127`),
  and invite-resume seed (`:1183`).
- **Already serializable JSON.** The `design` object is plain JSON.
- **Camera is separate** — orbit lives in a ref (`canvas/CakeCanvas.jsx:2110`), not in `design`.
  Independent cameras per viewer come for free.
- **A read-only viewer with its own turntable already exists** — `CakePreview` / `OrderDesignViewer`
  (`CakeCanvas.jsx:2072`, `CakeDesigner.jsx:1148`). The spectator view reuses it.

**Consequence:** broadcast `design`, apply with `loadDesign`. The core refactor is now a *perf*
optimization (smaller re-render blast radius; delta-sync), **not a blocker**.

> **Broadcast the raw `design`, not `buildDesignSnapshot(design)`.** The snapshot serializer
> (`utils/designSnapshot.js:32`) is tuned for persistence and is **lossy** — it drops
> `frostingType / frostingStyle / styleParams / creamLayers`. For lossless live echo send the raw
> `design`. Keep `buildDesignSnapshot` for the persist-on-end step only.

## 3. Roles & the pen (control) model

One **pen** (edit baton), held by exactly one participant at a time.

| Role | Edits | Live view | Can hold pen | Account |
|---|---|---|---|---|
| **Baker** | when holding pen | ✓ | ✓ — default holder, can always reclaim | yes |
| **Customer** | when holding pen | ✓ | ✓ — handed off explicitly | yes (OTP) |
| ~~**Spectator** (3rd-person, no account)~~ | — | — | — | **DESCOPED 2026-07-07** (§9) — if revisited, invite-based & authenticated, not anonymous |

- **Handoff:** current holder "hands the pen" → other side gets edit rights; a `control:*` event on
  the channel flips who's live. Baker override ("take the pen back") always available.
- **Authority:** the pen holder is recorded server-side on `design_sessions.editor_participant_id`;
  the API arbitrates grants so two clients can't both think they hold it.

## 4. Architecture

### 4.1 Transport — Supabase Realtime
One channel per session: `session:<id>`. Message types:
- `design:update` — pen holder → all. Throttled (~20 fps) during drag; final send on pointer-up.
- `control:request` / `control:grant` / `control:release` — pen handoff.
- **Presence** — who's in the room (baker / customer / spectators), join/leave.
- On a new join, the pen holder replies with a full-state `design:update` so late joiners hydrate
  (or the joiner pulls current state from the API — §4.3).

**Echo guard (must-have):** applying a *remote* design calls `loadDesign`, which sets `design`,
which would re-trigger the broadcast effect → infinite echo. Gate remote applies behind an
`isApplyingRemote` ref and skip broadcasting while it's set.

### 4.2 New table `design_sessions` (mirrors the proven `customer_invites` shape)
Reuse the invite ergonomics: **the row `id` IS the link/channel ref**, status lifecycle, `expires_at`.
- Columns (surrogate-FK discipline per CLAUDE.md — reference lookups by compact id, not text):
  `id` (uuid, = link + channel key), `baker_id`, `customer_id` (nullable), `order_id` (nullable —
  set when a session is finalizing an order), `status_id` smallint FK →
  `design_session_statuses(id, key)` (`active|ended|expired`), `editor_participant_id`,
  `design_snapshot` jsonb (last-persisted live design), `created_at`, `ended_at`, `expires_at`.
- **Scale:** high-volume, room-scoped, **O(active sessions), never per-tenant.** Index the hot
  access pattern `(baker_id, status_id)`. This is the correct shape at 25k bakers.
- Prefer **soft lifecycle** (`status_id=ended`) over row deletion (audit + reconnection grace).

### 4.3 Spectator (no-account) path — ~~the only net-new capability~~ DESCOPED (see §9)
**Dropped 2026-07-07** after the security review. The anonymous-viewer design that would have gone
here (scoped self-signed token + public render endpoint + receive-only Realtime RLS) is preserved in
§9 for if/when it's revisited — but the direction then is **invite-based (authenticated), not
anonymous**, which dissolves most of the threats. Not built.

### 4.4 Where it plugs into the designer
- Session lifecycle + channel wiring: a new `useDesignSession(supabase, sessionId, role)` hook
  (keeps the god-component from growing; aligns with the refactor's "carve into domain hooks").
- On `design:update` in → `loadDesign(remote)` behind the echo guard.
- On local `design` change while holding pen → throttled broadcast.
- Entry points: baker "Start live session" (Share/Invite area) → creates session, shows join link;
  customer opens link (already authed via invite/OTP) → joins as participant; customer "invite a
  viewer" → mints a spectator link.

## 5. Security (must-haves — all surfaced by the investigation)

> Items #2 and #4 below are **spectator-specific and now parked** (§9). #1 and #3 still apply to the
> shipped baker+customer case (a non-editor participant must not be able to edit/broadcast).

1. **`hasCap` returns `true` when `capabilities` is null** (`CakeDesigner.jsx:1433`). A spectator with
   no `/me` would be treated as **fully capable**. The viewer build **must force `capabilities=[]`**
   and render no edit UI. #1 correctness trap — do not rely on "we just won't show the buttons."
2. **Cryptographic read-only enforcement** via Supabase **Realtime Authorization** (RLS on the
   channel): the viewer token can *receive* but never *send*. The pen is server-authoritative.
3. **Per-participant id namespacing.** New stickers/texts use `Date.now()`-based ids in places
   (`useCakeDesign.js`). Once both sides can add elements, prefix new ids with a short participant id
   to avoid cross-editor collisions.
4. **Token expiry = session end.** Viewer tokens and the session link die when `status_id=ended` /
   `expires_at` passes. No lingering read access to a baker's live canvas.

## 6. Phasing

- **Phase 0 — Session primitive.** ✅ BUILT (uncommitted, api worktree). `design_sessions` +
  `design_session_statuses` lookup; routes create / get / put-design / pen / end. (Viewer-token
  minting deferred with the spectator.)
- **Phase 1 — Two-party live (baker ⇄ customer).** ✅ BUILT (uncommitted, core worktree).
  `useDesignSession` hook; throttled `design` broadcast; apply via `loadDesign` + echo guard;
  Presence; pen-handoff UI (`SessionBar`). Opt-in props (`enableLive`/`liveSessionId`). Both parties
  have accounts → high trust. **Ship-worthy on its own.** Live end-to-end test pending (run the SQL
  in Supabase dev + run/deploy the api routes).
- ~~**Phase 2 — Read-only spectator.**~~ **DESCOPED 2026-07-07** (§9). Not built.
- **Phase 3 — Polish/scale.** Delta-sync (broadcast the setter+payload, not the whole design — this
  is where the core refactor pays off); live cursor / upsell nudges; persist-on-end → save as
  template/order via `buildDesignSnapshot`.

## 7. Caveats / open questions

- **Drag throttling.** Dragging fires many `setDesign`s; v1 throttles to ~20 fps + final on
  pointer-up. Whole-design broadcast is acceptable for a ~50-field design; deltas (Phase 3) make it
  cheap.
- **Scheduling.** Both parties online at once — async ordering stays the default; live is the
  high-touch path. Needs a "request a live session" affordance (brainstorm open question).
- **Tier gating.** Brainstorm scoped this Forge-only (infra cost scales with active sessions). Revisit
  now that transport is Supabase (no new vendor) — the cost argument is weaker, but "high-touch
  consult" is still a premium motion. Product call, not an architecture blocker.
- **Realtime limits.** Supabase Realtime concurrent-connection / message quotas are per-project and
  scale with plan; a session is 2–4 participants, so load is O(active sessions), well within limits.

## 8. Related
[LIVE_CODESIGN_BRAINSTORM.md](./LIVE_CODESIGN_BRAINSTORM.md) (origin/vision) · [CORE_ARCHITECTURE_PLAN.md](./CORE_ARCHITECTURE_PLAN.md) (perf payoff, not a
blocker) · `PRICING_AND_QUOTE_PLAN.md` §1e (single-pen handoff model) · `SUBSCRIPTION_TIERS.md`
(Forge) · asset-optimization (mobile viewer perf) · reuse: `customer_invites` (link/token pattern),
`GET /api/storefront/:slug` (public read pattern), `CakePreview`/`OrderDesignViewer` (viewer),
`useCakeDesign.loadDesign` (apply-remote seam).

## 9. 3rd-person read-only viewer — DESCOPED (2026-07-07), with threat model preserved

**Decision:** the **anonymous** no-account spectator is dropped from the feature. Baker+customer live
co-design ships without it. If a 3rd-person read-only view is wanted later, build it **invite-based
(authenticated)**, not anonymous — the viewer becomes a real principal (via the existing
`customer_invites` + OTP path) carrying an explicit read-only role. That single change dissolves the
worst threats below (no bearer link, no scoped-token blast radius, no `hasCap`-null exposure to the
open internet).

**Why (security review of the anonymous design), ranked:**
1. **Broadcast is read+write by default (integrity, critical).** A Supabase Realtime subscriber can
   also *send*; a "viewer" could inject `design:update` or spoof `control` (yank/grant the pen). UI
   hiding ≠ read-only. Needed Realtime-Authorization RLS (receive-only) as a hard gate.
2. **`hasCap` returns true when `capabilities` is null (authz, critical).** An account-less viewer
   would read as fully capable (`CakeDesigner.jsx:1433`); must force `capabilities=[]`.
3. **Token blast radius (privesc, high).** A real Supabase anonymous session is accepted by every
   `requireAuth`-only route. A **self-signed scoped JWT** (`role=viewer`, `session_id`, short exp) is
   least-privilege but needs a new `jsonwebtoken` dep + `SUPABASE_JWT_SECRET` env.
4. **Bearer share-link spread (confidentiality, high).** A WhatsApp link forwards/screenshots/leaks
   via `Referer`+history. Needed a separate unguessable token (not the session UUID), short TTL tied
   to session end, revocable, passed in the URL fragment, viewer-count capped.
5. **Over-exposure (confidentiality, medium-high).** Public render endpoint must serve only what the
   *current design* references (never the full catalog/pricing); Presence must be redacted for
   viewers (no raw auth UUIDs / staff names); confirm the `design` payload carries no PII/pricing.
6. **Unauthenticated abuse (availability/cost, medium).** Token-mint + render endpoints need
   rate-limiting keyed on the session id (OTP-route pattern), active-session checks, caching.

**Invite-based alternative (if revisited):** reuse `customer_invites` to admit the 3rd person as an
authenticated read-only participant with a `viewer` role (add to the RBAC matrix, zero edit caps).
Then membership/pen enforcement is the same server-authoritative path as baker+customer; #1–#4 above
largely evaporate; only #5 (redact presence / minimize payload) still applies.
