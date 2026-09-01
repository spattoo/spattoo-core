# spattoo-core

The shared cake designer, baker app and storefront. It is **vendored** into `spattoo-web` and
`spattoo-admin` as a packed tarball — nothing here reaches a browser until someone runs a release.

`dev` is trunk in every Spattoo repo. `main` is stale and lands you ~150 versions behind.

---

## The rules that apply to EVERY module

These are project-wide: designer, storefront, orders, settings, admin, chef's desk. They are stated
here because this is the file that loads at the start of every session — `src/designer/INVARIANTS.md`
cites "the root CLAUDE.md" as their home, and for a long time that file did not exist, so the rules
were only ever read by whoever happened to open a doc under `src/designer/`. The gap was not
theoretical: a hand-rolled chip was committed in `85cb0ef` while `src/shared/Chip.jsx` sat unused.

### 1. Scan for what exists before building it

⚠️ **This is the rule that gets broken, and it gets broken by writing something good.** Nobody
copy-pastes a component on purpose; they build a fresh one because they never looked. `check:dup`
will not save you — it measures textual similarity, and a 12-line style object that reinvents a
60-line component is not a clone of it.

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

---

- **A control and what it changes must be visible at the same time** (INVARIANTS #11). The most
  repeated correction in this project. Side by side first; effect above control second; tabs last.
  Narrating text goes BESIDE or BEFORE the thing it narrates, never below it.
- **Lay a surface out by how often each control is used** (INVARIANTS #12), not by the order the
  features were built. What is touched constantly goes near the work; what is set once and left can
  collapse. A label names what the control actually acts on.

## Designer work

Read `src/designer/INVARIANTS.md` first — placement modes, zones, the one-renderer rule, right-side
popups, and the movable contract. Anything dragged on the cake must register with
`movableContract()`, or `check:movable` fails the build.

## Gates

`npm run verify` runs them all: `bindings`, `paths`, `fonts`, `cors`, `hooks`, `movable`, `narrow`,
`occasions`, `dup`, then `test`. They encode the automatable subset of the rules above — the
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
