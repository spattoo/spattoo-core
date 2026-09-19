import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ── Height belongs to the SIDE, and on the side it is a drag ────────────────────────────────────
 *
 * ⚠️ THE RULE, stated once so the next `yOffset` control has something to fail against: nothing a
 * customer places on the TOP SURFACE has a height they choose. It rests on the cake. Every writer of
 * a top sticker's `yOffset` SOLVES it from the geometry —
 *
 *   useCakeDesign   the calibrated perch/verge seat, or a ball's stacking lift
 *   manualSeat      recomputed on every drag (CakeCanvas: "never balances on 1–2 balls and NEVER
 *                   FLOATS", which is the rule in the code's own words)
 *   resizeClusterBall  re-seats after a resize, so growing a ball cannot bury it
 *
 * — and for a while one writer did not: a `Height` ↓/↑ pair on a top-surface GLB, added with the
 * faux balls (d60aeb63). Pressing ↑ lifted a ball straight off the seat `manualSeat` had just
 * computed and hung it in mid-air. It was clamped `Math.max(0, …)`, so floating was the ONLY thing
 * it could do; sinking is a separate control ("Bury", insertDepth) and always was.
 *
 * On the SIDE the height is real, and it is already a gesture rather than a number:
 * `DraggableSideSticker` writes `{ theta, y }` from one raycast, so a decoration goes round the cake
 * and up it in the same movement. That is why there is no Height stepper for the side either.
 */
const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const designer = read('./CakeDesigner.jsx');
const canvas   = read('./canvas/CakeCanvas.jsx');

describe('nothing on the cake top has a height a human picks', () => {
  it('offers no Height control for a top-surface sticker', () => {
    expect(designer).not.toMatch(/panelLabel: 'Height'/);
    expect(designer).not.toMatch(/isGlbTop/);
  });

  /* ⚠️ The specific shape that came back once already: a stepper writing yOffset straight onto a
     sticker. The seat-solvers below write it too, so the ban is on the CONTROL — a yOffset written
     from a button's onClick, with no geometry between the press and the number. */
  it('never writes a sticker yOffset straight from a button', () => {
    const code = designer.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/onClick=\{[^}]*updateSticker\([^)]*yOffset/);
  });

  /* The solvers stay — this is a rule about who decides the number, not about the field. */
  it('leaves the seat solvers alone, because they compute it rather than ask', () => {
    expect(canvas).toMatch(/manualSeat\(newX, newZ, selfR, balls, topY\)/);
    expect(canvas).toMatch(/onMove\(sticker\.id, \{ x: seat\.x, z: seat\.z, yOffset: seat\.y - topY - selfR \}\)/);
    expect(designer).toMatch(/updateSticker\(id, \{ scale, x: seat\.x, z: seat\.z, yOffset: seat\.y - topY - selfR \}\)/);
  });
});

describe('on the side, height is a drag', () => {
  /* One raycast gives the angle AND the height, so a decoration goes round the cake and up it in the
     same gesture — which is why the side has no Height stepper to remove. */
  it('writes theta and y together from the wall', () => {
    expect(canvas).toMatch(/theta: startSticker\.current\.theta \+ deltaTheta,\s*\n\s*y: clampY\(startSticker\.current\.y \+ deltaY\)/);
  });

  /* ⚠️ And the TOP drag must not grow one. Its plane is horizontal at the tier top — two degrees of
     freedom, x and z — and that is the whole reason the top has no height to choose. */
  it('keeps the top drag to x and z', () => {
    const top = canvas.slice(canvas.indexOf('function DraggableTopSticker'));
    expect(top).toMatch(/new THREE\.Plane\(new THREE\.Vector3\(0, 1, 0\), -topY\)/);
    expect(top).toMatch(/startSticker\.current\s*=\s*\{ x: sticker\.x, z: sticker\.z \}/);
  });
});
