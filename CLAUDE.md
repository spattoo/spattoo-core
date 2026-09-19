# spattoo-core

The shared cake designer, baker app and storefront. It is **vendored** into `spattoo-web` and
`spattoo-admin` as a packed tarball — nothing here reaches a browser until someone runs a release.

`dev` is trunk in every Spattoo repo. `main` is stale and lands you ~150 versions behind.

---

## Before you act — the five triggers

⚠️ **This list exists because the prose below does not get recalled mid-task.** Everything here is
stated at length further down, with the reasoning and the worked failures. This is the part phrased
as *"when you are about to do X, do Y first"*, because that is the shape a rule has to be in to fire
at the moment it is needed. If a rule cannot be written as a trigger, it belongs in a gate, not here.

| When you are about to… | Do this first |
|---|---|
| build a component, a helper, a row, a panel | grep for the BEHAVIOUR (`:hover`, `focus-visible`, `›`), not the name. Say what came back. |
| say "we should add / the problem is / that already works" | run the command that proves it, and show it in the same message. No command → say it is unchecked. |
| write a number, a price, a count, a limit | find where it is defined. If it lives on another surface, state the dependency and quantify NOTHING. |
| call a screen done | open it, drive it with real input, look at it. A green suite is not a working screen. |
| diagnose anything outside this repo | read `spattoo-docs` and the vendor's own docs before proposing a remedy. Expensive cure → reproduce the fault first. |

Everything below is the reasoning. These five are the part that has to fire without being re-read.

## The rules that apply to EVERY module

These are project-wide: designer, storefront, orders, settings, admin, chef's desk. They are stated
here because this is the file that loads at the start of every session — `src/designer/INVARIANTS.md`
cites "the root CLAUDE.md" as their home, and for a long time that file did not exist, so the rules
were only ever read by whoever happened to open a doc under `src/designer/`. The gap was not
theoretical: a hand-rolled chip was committed in `85cb0ef` while `src/shared/Chip.jsx` sat unused.

### 1. Scan for what exists before building it — or before RECOMMENDING it

⚠️ **This is the rule that gets broken, and it gets broken by writing something good.** Nobody
copy-pastes a component on purpose; they build a fresh one because they never looked. `check:dup`
will not save you — it measures textual similarity, and a 12-line style object that reinvents a
60-line component is not a clone of it.

⚠️ **AND IT APPLIES TO ADVICE, NOT ONLY TO CODE.** `INVARIANTS.md` #3 states this for designer
components — *"open the piping code and reuse it, never approximate from memory"* — and reading it as
being only about the designer is how it gets broken everywhere else. A diagnosis, a suggested fix and
a "we should add X" are all builds. Five in one day (2026-09-19): a shared row component that
`.spattoo-pack` had already solved; a new link host proposed before one `curl` showed nothing was
broken; server-side captcha verification that would have broken the captcha, because Turnstile tokens
are single-use; a support ticket chased over a PE–TM chain that was already Active; and a session
helper for the admin smoke gate that `npm run smoke:session` already was.

⚠️ **SHOW THE CHECK IN THE SAME MESSAGE AS THE CLAIM, OR SAY IT IS UNCHECKED.** This is the rule that
makes the rest of rule 1 real, and it is the one that was missing. Every breach so far has been a
sentence, not a commit — a gate at commit time cannot see a claim made in conversation, and by the
time it could, the wrong thing has already been acted on. So: any statement about how this system
behaves — a cost, a mechanism, a "we already have", a "that will happen" — ships beside the command
that proved it. No command means the words are "I have not checked this."

⚠️ **A NUMBER INSIDE A PROPOSAL IS A CLAIM TOO.** 2026-09-19, drafting a baker-facing notice: "updates
go by WhatsApp and use a credit each". Nobody asked for a price; it was invented while writing the
sentence. What the code does: `spendMessage` debits ONE PER PAID CHANNEL SEND, so a type with both SMS
and WhatsApp on costs two for one update; only the types the baker switched on cost anything; and
`order_placed_customer` is free when the customer placed it. Sandeep: *"why do you make these
promises?"* **When the fact belongs to another surface — cost, balance, entitlement — state the
dependency and quantify NOTHING**, so there is only ever one copy of the rule. `check-plan-copy.mjs`
exists because two surfaces both stating a plan's claims is how one of them goes stale.

**Do these before proposing, and say what came back** — "I looked" is not the same as having looked:
- **Grep for the BEHAVIOUR, not the name.** `.spattoo-pack` is not findable by searching "NavRow"; it
  is findable by searching `:hover`, `focus-visible`, `›`.
- **Read the file's own comments and `package.json` scripts.** This codebase explains itself at
  length, and four of those five were already written down by whoever hit them first.
- **Check `spattoo-docs` before diagnosing anything outside this repo.**
- **Check the vendor's own docs before proposing to use their API** — single-use, expiry, idempotency.
- **When the remedy is expensive** — a migration, a redeploy, re-approving a third party's templates,
  a support ticket — **reproduce the fault before designing the fix.** The cost of the cure sets how
  hard the disease has to be proven.

Already built, app-wide, in `src/shared/`:

| | |
|---|---|
| `Panel.jsx` | **The** panel shell — scrim, header, close, Esc, backdrop click, and the `Z` stacking scale. Centred dialog on desktop, bottom sheet on phone. Twelve files each had their own before this. |
| `Chip.jsx` | The toggleable pill. Handles `aria-pressed`, focus, and phone hit-targets. |
| `AnchoredPopup.jsx` | Popovers positioned against a trigger. |
| `icons.jsx` | Line icons. There are no emoji — see rule 4. |
| `useNarrow.js` | **The** definition of "is this a phone". Gated by `check:narrow`. |
| `validators.js`, `image.js`, `useUploadLimits.js` | File validation, compression, and the server's real upload ceiling. |
| `panelTopBar.jsx` | Back arrow, breadcrumb and dismiss for panel headers. |
| `Disclosure.jsx` | **The** "question you can open" — a labelled toggle with the shared chevron, and an answer folded under it. For the explanation a new baker needs and a returning one has read fifty times. |
| `canvas/envMap.js` | **The** answer to "which HDRI lights this scene". A host mounting anything that draws a cake must call `configureEnvMap(assetsBase)`; without it the scene silently falls back to a 1.4MB drei preset from GitHub raw. Gated by `check:env-map`. |
| `NavRow.jsx` | **The** row that opens something — label, hint, right-hand value, chevron, and the press/hover/focus behaviour. See rule 7. |

Inside the designer: `PreviewTile` (`src/designer/shared/`), and `ColorWheel`, `SizeDial`,
`PlacementChooser` — all three currently live inside `src/designer/CakeDesigner.jsx`. `ColorWheel` is
**the** colour control for every colour a customer picks; `SizeDial` is **the** size control. Never a
row of hand-rolled swatches, never a native `<input type="color">`.

When asked for something "like the piping popup", open the piping code and reuse it. Do not
approximate from memory.

### 2. Config-driven, never type-driven

Behaviour flows from data and keys, never from a branch on a name. A finish or geometry *algorithm*
legitimately lives in code — it cannot be a DB row — but it is reached through a **key**
(`render`, `wall`, `grain`, `procedural`), never `if (slug === 'rainbow')`.

A second variant of an existing thing is a **new row in a config table**, not a second component.

### 3. Admin authors master data — every tunable value is DB-overlaid

Config-driven does not by itself mean authorable. Every value an admin would ever tune — params,
**defaults**, palettes, material numbers, the enabled set, labels — must be seeded in code and
**overlaid from the DB** via an API route. If an admin cannot change it without a deploy, it is in
the wrong place.

The seam already exists: `applyTextureConfig` (`src/designer/creamStyles.js`) and
`applyMaterialConfig` (`src/designer/frostings.js`). Extend it; never invent a parallel store, and
never `localStorage`.

⚠️ **A studio whose output can only be pasted into code is not authoring — it is a mock-up.**

### 4. No pictographic emoji in any UI. Zero, anywhere.

Use `src/shared/icons.jsx`. (Comments and docs are not UI; `⚠️` in source is fine.)

### 5. Every UI works on a phone

A baker's screen is a phone. Check at 375px wide before calling anything done — not by resizing a
thought, by opening it.

### 6. Verify in the real app

⚠️ **A build that compiles and a suite that passes do not prove a screen works.** This has been
demonstrated repeatedly and expensively. Open the thing, drive it, look at it.

Driving a React screen from a script: **do not assign `input.value` directly** — that bypasses
React's value tracker, `onChange` never fires, and you get a moved slider, an unchanged readout and a
screenshot of something broken that looks fine. Use real pointer or keyboard input.

### 7. If it does something, it must look like it does something

⚠️ **This is judged at REST, on a phone.** A baker's screen has no hover, so an affordance that only
appears on pointer-over does not exist for most of the people using the app. Hover and press are
feedback *on top of* a control that already reads as pressable — never the thing that makes it
legible.

Top-ups shipped with two rows that were plain text, a faint grey balance and a literal `›`. They
opened whole screens and nobody could tell. Sandeep: *"the two options here do not look like they are
clickable. make this a standard. any clickable should look like clickable."*

- A row that goes somewhere is **`src/shared/NavRow.jsx`**. Not a `<div>` with an `onClick` and some
  text in it.
- A clickable is a `<button>` or an `<a>` — it gets keyboard focus, Enter and Space for free, and a
  screen reader announces it. There are still **24** `<div onClick>` in `src/` (2026-09-18); every
  one is a small bug, so do not add the twenty-fifth.
- Give it a visible resting state (its own surface or edge), a press state, and `:focus-visible`.
  `.spattoo-navrow` and `.spattoo-pack` are the two worked examples.

---

- **A control and what it changes must be visible at the same time** (INVARIANTS #11). The most
  repeated correction in this project. Side by side first; effect above control second; tabs last.
  Narrating text goes BESIDE or BEFORE the thing it narrates, never below it.
- **Lay a surface out by how often each control is used** (INVARIANTS #12), not by the order the
  features were built. What is touched constantly goes near the work; what is set once and left can
  collapse. A label names what the control actually acts on.

- **Calibrate colour ON grey, choose the taper ON the palette bakers use** (INVARIANTS #16). Grey is
  the only patch that exposes a CAST in the light, so the reference light is solved there — but the
  rolloff is a judgement about which colours matter, and grey is not one of them. Tuning it on grey
  picked a setting measurably worse across ten real cake colours. Every reference light is PER
  SURFACE and interpolated from two readings; one division always overshoots.

- **Unsaved work is never dismissed by accident** (INVARIANTS #13). `Panel` already takes
  `guardUnsaved` — every occurrence of this bug has been a panel that never passed it. Deliberate
  exits (✕, Cancel) still close.

- **An icon means the same thing everywhere** (INVARIANTS #14). Find the control this codebase
  already uses for that job before drawing a new one; a generated preview must obey the same rules as
  the thing it previews.

- **A preview and the thing previewed ask ONE function** (INVARIANTS #15). Never tune a 2D preview
  towards a 3D render — share the function that decides what a colour looks like. Colour is chosen
  deliberately; a preview that is wrong about it is worse than none.

## Designer work

**Read `src/designer/INVARIANTS.md` first, and open the file — the rules above are a SUBSET of it.**
Eighteen are numbered there; six are restated here (#11–#16). That gap is not a filing detail, it is
where the silent ones live: #2 one renderer, #3b nothing may PENETRATE what is already placed, #8
never hardcode a world dimension, #9's anchoring half, #10's five laws, #17 a studio is lit like the
cake it authors for, #18 `envMapIntensity` does nothing.

⚠️ **This section is the instruction that gets skipped, and skipping it is cheap because the summary
above reads like the whole story.** It is not. Worked example, 2026-09-16: a vertical drag was added
to a piping border with the summary open and the file shut. It wrote the pointer's height straight in
as the anchor, so the border jumped by however far the grabbed cream and the anchor happened to be
apart — a plain breach of #10 law 5, "`handleAt` and `dragTo` are exact inverses". Nothing errored,
every gate passed, 1945 tests were green. It was found by someone asking whether the file gets read.

⚠️ **#10 IS FIVE LAWS, NOT A REGISTRATION.** Anything dragged on the cake must register with
`movableContract()` or `check:movable` fails the build — but the gate checks that you SIGNED, and the
suite can only ask three of them (2, 3 and 5). For laws 1 (one place says where it is) and 4 (what you
can grab is what you can see, from every angle) the script greps two smells and says so itself — a
grep is not the law, and those two are what broke the cloud and the rainbow six ways in a week. Read
them before writing a gesture, not after.

## Gates

`npm run verify` runs them all: `bindings`, `paths`, `fonts`, `cors`, `hooks`, `movable`, `narrow`,
`env-map`, `one-chevron`, `priced-copy`, `occasions`, `dup`, then `test`. They encode the automatable subset of the rules above — the
judgement calls in 1, 2, 3 and 6 are not checkable and are yours to keep.

Git hooks need node and gitleaks on PATH; a login shell that has not sourced nvm will fail them:

```sh
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; export PATH="/opt/homebrew/bin:$PATH"
```

Features are documented in `spattoo-docs` and gated by `check:feature-docs`: **edit the doc, commit
the code, then commit the doc** — the gate looks for a doc edit that is uncommitted or committed in
the last 12 hours.

## Releasing

```sh
npm run release -- --web /users/sandeep/dev/spattoo-web
```

Vendors the tarball into **both** web and admin, runs the gates and a 50-screen smoke, and pushes
each. It refuses while a consumer dev server is running. Afterwards, restart any dev server that was
already up — Vite ignores a changed tarball behind an unchanged version spec and will serve a blank
screen with `Outdated Optimize Dep`.
