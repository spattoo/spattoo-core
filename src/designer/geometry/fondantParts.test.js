import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  expandParts, restingY, settle, buildBounds, defaultPart, PRESETS, SHAPES, toConfig,
} from './fondantParts.js';

// ⚠️ Every piece gets its OWN id. restingY skips a part whose id matches the falling one (nothing
// rests on itself), so a helper that reused one id made every stack silently fall to the bench —
// and the assertions still read as if they were testing gravity.
let n = 0;
const at = (pos, size, extra = {}) => ({ ...defaultPart('ball', `p${n++}`), pos, size, ...extra });

/* The two rules worth protecting here are the ones a later "let's simplify this" would delete,
 * because both look like special cases and neither is:
 *   • a mirrored piece is stored ONCE  — two rows decay into mismatched ears
 *   • gravity applies at PLACEMENT only — a running simulation collapses the bear
 */

describe('mirroring', () => {
  it('draws one stored ear twice, reflected across X', () => {
    const out = expandParts([at([0.3, 1, 0], [0.1, 0.1, 0.1], { id: 'ear', mirror: true })]);
    expect(out.map(p => p.pos[0])).toEqual([0.3, -0.3]);
    expect(out.map(p => p.reflected)).toEqual([false, true]);
  });

  // A tilted ear that leaned the same way on both sides made the bear look knocked sideways.
  it('flips yaw and roll with the reflection, but not pitch', () => {
    const [, m] = expandParts([at([0.3, 1, 0], [0.1, 0.1, 0.1], { mirror: true, rot: [0.2, 0.5, 0.7] })]);
    expect(m.rot).toEqual([0.2, -0.5, -0.7]);
  });

  // ⚠️ Reflecting a centred piece stacks a second copy in the same place — doubled surface that
  // z-fights and darkens. A nose sits on the centre line and is the everyday case.
  it('does not reflect a piece sitting on the centre line', () => {
    expect(expandParts([at([0, 1, 0], [0.1, 0.1, 0.1], { mirror: true })])).toHaveLength(1);
  });

  it('skips a shape it does not know rather than guessing one', () => {
    expect(expandParts([{ ...at([0, 0, 0], [1, 1, 1]), shape: 'sphere' }])).toEqual([]);
    expect(expandParts(null)).toEqual([]);
  });
});

describe('where a piece comes to rest', () => {
  it('sits on the bench when it touches nothing', () => {
    expect(restingY(at([0, 9, 0], [0.2, 0.2, 0.2]), [])).toBeCloseTo(0.2);
  });

  // Exact for two balls: centres are (rA + rB) apart when stacked.
  it('rests exactly on top of a ball directly below it', () => {
    const below = at([0, 0.5, 0], [0.5, 0.5, 0.5]);
    expect(restingY(at([0, 9, 0], [0.2, 0.2, 0.2]), [below])).toBeCloseTo(1.2);
  });

  // Off-centre it settles LOWER, hugging the curve — the thing that makes a placed ear look pressed
  // into the head rather than balanced on it.
  it('settles lower as it moves off centre', () => {
    const below = at([0, 0.5, 0], [0.5, 0.5, 0.5]);
    const centred = restingY(at([0, 9, 0], [0.2, 0.2, 0.2]), [below]);
    const offset  = restingY(at([0.4, 9, 0], [0.2, 0.2, 0.2]), [below]);
    expect(offset).toBeLessThan(centred);
    expect(offset).toBeGreaterThan(0.2);          // still above the bench
  });

  it('falls past a piece it does not overlap in plan', () => {
    const aside = at([5, 0.5, 0], [0.5, 0.5, 0.5]);
    expect(restingY(at([0, 9, 0], [0.2, 0.2, 0.2]), [aside])).toBeCloseTo(0.2);
  });

  it('lands on the highest thing under it, not the first', () => {
    const low  = at([0, 0.3, 0], [0.3, 0.3, 0.3]);
    const high = at([0, 1.0, 0], [0.3, 0.3, 0.3]);
    // 1.0 + (0.3 + 0.2) — the HIGHER ball holds it up; the lower one is irrelevant once passed.
    expect(restingY(at([0, 9, 0], [0.2, 0.2, 0.2]), [low, high])).toBeCloseTo(1.5);
  });

  // Nothing may pass through the board, whatever is or isn't beneath it.
  it('never sinks below the bench', () => {
    expect(restingY(at([0, -50, 0], [0.2, 0.2, 0.2]), [])).toBeCloseTo(0.2);
    expect(restingY(at([0, -50, 0], [0.2, 0.2, 0.2]), [at([0, -9, 0], [0.2, 0.2, 0.2])])).toBeCloseTo(0.2);
  });

  it('does not rest on itself', () => {
    const p = at([0, 4, 0], [0.2, 0.2, 0.2]);
    expect(restingY(p, [p])).toBeCloseTo(0.2);
  });

  it('settle keeps x and z and only changes height', () => {
    const s = settle(at([0.7, 9, -0.4], [0.2, 0.2, 0.2]), []);
    expect([s.pos[0], s.pos[2]]).toEqual([0.7, -0.4]);
    expect(s.pos[1]).toBeCloseTo(0.2);
  });
});

describe('the bear', () => {
  const parts = PRESETS.bear.parts();

  it('is built from shapes that exist', () => {
    expect(parts.every(p => SHAPES[p.shape])).toBe(true);
  });

  // The preset is the whole reason the tool is usable, so it has to arrive symmetric.
  it('stores each paired piece once and draws it twice', () => {
    const mirrored = parts.filter(p => p.mirror);
    expect(mirrored.map(p => p.id)).toEqual(['eye', 'ear', 'arm', 'leg']);
    expect(expandParts(parts)).toHaveLength(parts.length + mirrored.length);
  });

  it('stands on the bench rather than floating or sinking', () => {
    const box = buildBounds(parts);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.06);
    expect(box.min.y).toBeLessThan(0.06);
  });

  it('is taller than it is wide, like a bear', () => {
    const s = buildBounds(parts).getSize(new THREE.Vector3());
    expect(s.y).toBeGreaterThan(s.x);
  });

  // The bounds must include the reflected copies — a box built from stored parts alone is half a
  // bear wide, and everything downstream frames and fits against it.
  it('measures the drawn figure, not the stored rows', () => {
    const box = buildBounds(parts);
    expect(box.min.x).toBeLessThan(0);
    expect(box.max.x).toBeCloseTo(-box.min.x, 5);
  });

  it('bunny is the same skeleton with taller ears and no muzzle', () => {
    const b = PRESETS.bunny.parts();
    expect(b.find(p => p.id === 'muzzle')).toBeUndefined();
    const ear = b.find(p => p.id === 'ear'), bearEar = parts.find(p => p.id === 'ear');
    expect(ear.size[1]).toBeGreaterThan(bearEar.size[1]);
    expect(ear.mirror).toBe(true);
  });
});

describe('what gets persisted', () => {
  // Stamped from the first row written: a parts list whose meaning changes later must be readable
  // as its older meaning, and adding the field afterwards means guessing which rows predate it.
  it('carries a version', () => {
    expect(toConfig([]).version).toBe(1);
  });

  it('has no bounds for an empty bench', () => {
    expect(buildBounds([])).toBe(null);
  });
});
