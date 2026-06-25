# spattoo-core — Manageability & Performance Plan

> Status: **planned** (drafted 2026-06-26, to be taken up the week of 2026-06-29). Living doc — update
> it as phases land. spattoo-core is the heart of the product; every step here is **incremental and
> behavior-preserving**, never a big-bang rewrite, and each slice is verified in the real app.

## Why
The designer is growing fast and both *manageability* and *performance* trace to **one root cause**: a
single god component with coarse, centralized state.

### Diagnosis (measured 2026-06-26)
| File | Lines | Notes |
|---|---|---|
| `CakeDesigner.jsx` | 6,501 | **92 `useState`**, only **2** `useMemo`/`useCallback`; ~25 handlers, 6 card-body renderers, SVG tool-icon path builders — all inline |
| `canvas/CakeCanvas.jsx` | 2,178 | two near-identical scene render paths |
| `canvas/CakeTier.jsx` | 1,276 | top/bottom piping-ring prop spreads duplicated |
| — | — | these 3 files ≈ **53%** of the 18.7k-line codebase |

- **Manageability:** one file holds selection state, every domain's handlers, and every popup renderer.
- **Performance (same cause):** 92 `useState` in the top component → *any* change (a drag, a colour
  tweak) re-renders the whole 6.5k-line tree; with almost no memoization, handlers/props handed to the
  R3F `<Canvas>` children are recreated each render and can cascade into 3D-scene reconciliation. The
  existing targeted fixes (coalesced drag moves, no per-frame shader recompile, reused canvases) are
  band-aids on this structural issue — each new finish risks reintroducing the same class of bug.

**Fixing manageability *is* the biggest perf lever** — it shrinks the re-render blast radius.

## Plan (phased, gated, verified each slice)

### Phase 0 — Guardrails first (cheap, zero risk)
- **File-size budget** in `npm run verify`: fail when a file exceeds a ceiling (e.g. 1,500 lines).
  `CakeDesigner.jsx` is grandfathered with a **shrinking** ceiling that ratchets down as it's carved
  up (same ratchet discipline as the jscpd gate).
- **Bundle-size budget**: fail if the `dist` build grows past a threshold (catches accidental heavy
  imports). Baseline today ≈ 1.26 MB raw / 303 KB gzip (three.js is the bulk — inherent).

### Phase 1 — Carve handlers into domain hooks (behavior-preserving extraction)
- `usePipingControls` — the ~25 piping/drip handlers (`handlePipingColorChange`, …).
- `useSelection` — selection state machine + `handle*Select` / `handleDelete` / `clearAllSelections`.
- Others as cohesive seams emerge (stickers, tiers).
- Expected: drops `CakeDesigner` by ~1,500–2,000 lines and isolates state so a change touches a
  narrower subtree.

### Phase 2 — Extract the right-side card renderers
- `renderFoilBody`, `renderPipingBody`, … → per-card components (each self-contained, independently
  testable). Reuse the shared `s.editPopup` container and existing shared controls (`ChipPicker`,
  `SizeDial`, `PreviewTile`) per INVARIANTS §3/§3a.

### Phase 3 — Measure, THEN optimize performance (no guessing)
- Wire React DevTools Profiler / an R3F stats overlay in **dev** to capture where re-renders and frame
  time actually go (per the "verify in the real env, don't guess" rule).
- Memoize the **proven** hotspots; stabilize props into `<CakeCanvas>`; confirm the 3D scene isn't
  reconciling on unrelated state changes.
- Candidate structural moves only if measurement supports them: split design STATE from UI chrome so a
  flake drag doesn't re-render the toolbar; consider a reducer/context for design state.

### Constraints
- Render/popup/canvas changes follow **analysis-first + visual-verify** (CLAUDE.md, INVARIANTS.md).
- One cohesive slice at a time; `npm run verify` green + a real-app check before each commit.

## Quality gates — current + proposed
**In place:** `check:paths` (no element-type branching) · `check:dup` (jscpd, threshold ratcheting
down, now 1.8%) · `vitest` (placement + sphere-packing contract tests).

**Proposed (rough priority):**
1. **ESLint + `eslint-plugin-react-hooks`** — biggest cheap win. No lint exists today; catches
   rules-of-hooks violations (we just added a hook), stale `useEffect` deps, unused vars/imports.
2. **File-size budget** (Phase 0) — caps monolith growth; ratchets down.
3. **Bundle-size budget** (Phase 0) — guards load/perf.
4. **Layer/import boundaries** (`eslint-plugin-boundaries` or dependency-cruiser) — keep `geometry/`
   pure (no React), stop cross-layer leaks; directly supports manageability.
5. **Dead-code / unused-exports** (`knip`) — finds orphaned exports as the surface grows.
6. **Visual-regression** (Playwright screenshot diffs per element × surface) — high value for WebGL
   (INVARIANTS already aspires to this); heavier to set up + maintain → schedule deliberately.
7. **Render-count / frame-budget tests** — assert key interactions don't re-render the world;
   aspirational, pairs with Phase 3.
8. **Incremental type safety** — `// @ts-check` + JSDoc on shared helpers (`placement.js`,
   `geometry/`, the new `utils/`); a longer-term investment, not a near-term gate.

## Track record (context for the ratchet)
DRY pass already shipped 6 shared helpers, duplication 2.82% → 1.73%, jscpd gate live and ratcheting:
`heightfieldToNormalMap`, `makeValueNoise`, `mulberry32` (`utils/random.js`), `tierAbove`/
`occludedTopFrac` (`placement.js`), `ChipPicker`, `useDragPlacement`.
