# Fondant Studio — Brainstorm & Direction

> Status: **exploration / direction-setting** (not a build spec yet).
> Date: 2026-06-25. Captures a brainstorm on letting bakers create assets we
> don't have in the library.

---

## The problem

However large an asset library we build, it will always lag reality. Cake
decoration is a long tail: with cream and fondant **any shape can be made**, and
trends evolve constantly. So a baker will always eventually want a
shape / figure / topper / sticker / 3D element we don't have.

**Goal:** shift from a *catalog* model (we ship assets, you pick from them) to a
*generation / composition* model where the baker becomes a creator. The library
becomes a starting point, not a ceiling.

Key leverage: **we already have most of the primitives** — Image→3D wizard
(Meshy), GLB Recompose, procedural finishes (cream wave, weave, palette knife,
luster dust, chocolate drip), `decor_pattern` composites, config-driven
placement, GPT integration, Remove.bg. Much of "make your own" is *packaging
existing pipelines* into a creator-facing surface, not new core tech.

---

## Decisions made in this discussion

- **Creator = the baker, into their own PRIVATE library.** Scales, builds a
  content flywheel, and the baker is a built-in bakeability vetting layer.
  (End-customer freeform creation is deferred — heavy guardrails / support risk.)
- **2D stickers = AI-generated.** Prompt → GPT image → auto-cutout (Remove.bg) →
  recolorable sticker placed via existing config-driven placement.
- **Metering: per-month credit quota by subscription tier.** Only AI actions are
  metered. (See "Token ledger" below.)
- **v1 scope = 2D stickers + *some* procedural 3D.** Drop Meshy / Image→3D from
  v1: it's the one path with unbounded cost + unpredictable quality +
  bakeability risk all at once. Procedural 3D is free, deterministic, bakeable.
- **The 3D ambition = a "Fondant Studio" built as a *construction kit*, not a
  freeform sculptor** (see below).
- **Desktop-only is acceptable** for the Fondant Studio if mobile interaction is
  too hard. Platform-split features are normal. Create on desktop; the resulting
  assets remain fully usable in the mobile designer (mobile-first still applies
  to the baker/customer *designer*, not necessarily this authoring tool).
- **Push/pull (clay-like) deformation = deferred to future.** Practicality
  unclear; not needed for the construction-kit model.
- **Anchor everything on real fondant-artist techniques** (roll, flatten,
  cut-a-shape-from-rolled-fondant, taper, bend…). This is the guardrail: if the
  only operations are ones a real artist does, the output cannot be un-makeable.

---

## The Fondant Studio: construction kit, NOT a sculptor

### Why NOT freeform sculpting
True clay-like mesh sculpting (push/pull/smooth, ZBrush/Blender-style) is the
wrong target — not just "hard", but it actively fights Spattoo:

1. **Mobile kills it** — brush sculpting needs precision/pressure/screen; brutal
   on phones (our audience). (Mitigated by going desktop-only, but still the
   weakest interaction model.)
2. **It destroys the moat** — freeform deform lets bakers design shapes nobody
   can pipe or build. Spattoo's edge is "everything you design is producible."
3. **Tech is nasty in-browser** — dynamic topology, mesh repair, watertight
   geometry. High effort, fragile, low value.

### Why a construction kit is right
Real fondant artists don't sculpt from a block — they **construct**: roll a ball,
flatten a disc, roll a rope, taper a cone, bend it, cut a sheet with a cutter,
and **stick parts together**. A figure = ball (head) + cone (body) + two ropes
(arms). This is a **fixed vocabulary**, which is parametric, deterministic,
bakeable, and reuses what we already have.

**Three ingredients:**

**1. Primitives** ("primary fondant shapes"): ball, rope/cylinder, sheet/disc,
cone, teardrop. Each parametric (length / thickness / radius). We already do
parametric primitives (faux-balls, sphere-packing, GenerateModel).

**2. Operations** (real techniques as *parametric modifiers*, not sculpt
strokes):

| Fondant technique     | Digital operation                  | Reuses                     |
|-----------------------|------------------------------------|----------------------------|
| Roll into a rope      | cylinder length/thickness params   | parametric primitives      |
| Flatten / roll out    | squash on one axis                 | scale transform            |
| Taper / cone          | linear taper modifier              | —                          |
| Bend (arch an arm)    | bend modifier along axis           | vertex deform              |
| Pinch / point         | local scale                        | —                          |
| Cut with a cutter     | clip a sheet with a 2D outline     | **extrude-the-sticker (v1)** |
| Emboss / texture      | displacement / normal map          | weave, cream-wave, luster  |

The "cut with a cutter" row **is** the v1 extrude-the-sticker path — so v1 is
*slice 0* of the Fondant Studio, not throwaway.

**3. Assembly** — combine parts into a figure. **Critical call:**

> **Do NOT merge meshes (no real CSG boolean union).** Keep each part a separate
> mesh in a group.

In-browser boolean mesh-merging is the nastiest, most fragile 3D work — and
unnecessary. A real fondant figure *is* separate balls stuck together; model it
the same way: a **group of positioned parts**, visually touching, structurally
independent. We already have this: `decor_pattern` composites with `groupId`
(move/resize as a unit, drill into one part). A fondant figure = a composite of
parametric parts instead of GLBs. **Reuse it; don't build a parallel path.**

### The superpower: auto-generated recipe
Because every shape comes from a known primitive + known operations, we can
**auto-generate the craft recipe** ("Head: 4cm ball. Body: 6cm cone, flattened.
Arms: two 3cm ropes, bent."). That's the X-Ray craft-guide feature, free as a
side effect. A generic 3D tool can never do this — it doesn't know *how* the
shape was made. This is the defensible differentiator.

---

## Auto-composer (text/image → shape) — the unlock

Question explored: *is there an algorithm / AI service that can craft a desired
shape from basic shapes — an auto-composer using the existing library?* Yes — but
the *right kind* matters.

### Family A — pure geometric decomposition (WRONG fit)
Convex decomposition (V-HACD), shape-abstraction / primitive-fitting (fit
spheres/cylinders/superquadrics to a target mesh). Two problems:
- Needs a **target mesh as input** — which we're trying to avoid generating.
- Optimizes for *geometric coverage*, not *fondant technique* → produces weird
  convex blobs, not "a ball and two ropes." Breaks bakeability.

### Family B — LLM emits a *construction program* in our DSL (RIGHT)
> The AI doesn't generate **geometry**. It generates a **plan** — a list of parts
> in our primitive+operation DSL — and our deterministic engine renders it.

Flow: baker types "teddy bear" (or pastes a reference image) → GPT, **given our
fondant DSL** (allowed primitives, operations, constraints), emits structured
JSON:

```
[ {part:"head",  primitive:"ball",  r:4, at:[0,9,0]},
  {part:"body",  primitive:"cone",  ...,  op:"flatten 0.8"},
  {part:"arm.L", primitive:"rope",  ...,  op:"bend 30°", attachTo:"body"},
  ... ]
```

Why this is the unlock:
- **Bakeability guaranteed by construction** — the DSL only contains real
  fondant moves, so the AI *cannot* emit something un-makeable. AI does the
  creative "what parts, where"; the engine enforces "only producible things."
- **Fully editable afterward** — output is a plan/config, not a baked mesh.
  (Meshy output is a dead mesh; this is alive.)
- **Same artifact as manual building** — auto-compose and hand-build both emit
  the same construction JSON → ONE abstraction, one renderer, one editor. Not a
  parallel AI path. (Matches the "one unit/group abstraction, never parallel
  paths" principle.)
- **Reuses GPT + existing metering** — same billable action as the 2D generator.
- LLMs are strong at *constrained structured planning* (DSL emission) and weak at
  good 3D geometry — this plays to the strength.

Widen the composer's vocabulary beyond primitives to **existing library
elements** and it becomes the **"Build from Inspiration phase 2"** vision
(retrieval + composition from our library via tags/embeddings). The auto-composer
and inspiration-phase-2 are the *same system*.

---

## The core architectural decision

**The DSL is the central artifact.** Everything — manual studio build, AI
text→shape, image→shape, inspiration-recompose — becomes "produce a construction
plan in the DSL → render deterministically." Commit to this now; it's expensive
to retrofit.

This drives the phasing:

> You **cannot** build the auto-composer without first having the
> construction-kit data model + renderer + desktop editor. The composer's entire
> output is the manual kit's JSON. So the manual studio isn't a detour you do
> *instead* of the AI dream — it's the **prerequisite that makes the AI dream
> cheap** (a thin "GPT → DSL → existing renderer" layer).

---

## Commercial plumbing (needed regardless)

### Token / credit ledger — design for scale up front
- **Meter *operations*, not raw OpenAI tokens.** Define our own credit unit;
  price each action (e.g. image gen = 1, 3D = 10). Re-tune without schema change.
- **Per-action cost is DATA, not code** — a `credit_costs` table (admin-authored
  master data via API).
- **Append-only `credit_transactions` ledger** (grant on renewal, debit per
  action); balance = sum (+ periodic checkpoint). No mutable
  `credits_remaining` integer (double-spend race, no audit trail).
- **Atomic debit** — reserve before the expensive call, refund on failure.
- **Reset vs. rollover on renewal** — *open decision.* Lean: reset (hard cost
  ceiling, simple), maybe small-cap rollover.
- Scale framing: hot-path, write-heavy, per-baker, grows forever — index by
  `baker_id`, never scan full history unbounded.

### Private library — bake ownership in from day one
- `cake_elements` is today the *global* library. Add `owner_baker_id`
  (null = global/system, set = private) + `source`/`visibility`
  (`system` | `baker_generated`). Add columns before the UI ships — retrofitting
  ownership is painful.
- **Flywheel:** a baker's best generated asset can be *promoted* (admin-curated)
  into the global library (`owner_baker_id` → null). Free, high-quality,
  user-authored content. Design the path now even if promotion is manual in v1.

### Other risks
- **Content moderation / brand & IP risk** on freely-prompted GPT output (it's
  our key, our platform name). Light guardrail even in v1.
- **3D conversion quality** (if/when Meshy returns) — gate hard: mandatory
  preview + approve before it spends credits.

---

## Proposed phasing

| Slice | What | Cost | Notes |
|-------|------|------|-------|
| **0 (= v1)** | 2D sticker (GPT → cutout → recolor) **+** cut/extrude that shape into a standing fondant cutout | 2D metered, extrude free | extrude = first fondant op |
| **1** | Place & combine 2–3 parametric primitives as a `decor_pattern`-style group (assembly, no deform) — e.g. a snowman = 3 balls | free | reuses composite/groupId |
| **2** | Add highest-value deform ops: flatten, taper, bend | free | covers most simple figures |
| **3** | Fondant surface finish + emboss (reuse weave/displacement) | free | — |
| **4** | **Auto-composer**: GPT text/image → DSL plan → existing renderer | metered | thin layer on the kit |
| **5+** | Widen DSL to include library elements → merges with Inspiration phase 2 | metered | retrieval + composition |

Each slice is independently shippable and useful on its own.

---

## Open decisions to pin before a build spec
1. **DSL vocabulary at first kit:** primitives-only, or primitives + existing
   library elements from day one? (Lean: primitives-only, then widen.)
2. **Credit reset semantics:** reset vs. rollover on monthly renewal.
3. Exact primitive set + first operation set for slice 1–2.
4. Desktop-only studio interaction model (snap/turntable + sliders vs. free 3D
   gizmo).
