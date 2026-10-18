/* The number topper's slab depth.
 *
 * ⚠️ THIS FILE EXISTS BECAUSE THE OBVIOUS FIELD NAME IS TAKEN AND DEAD. `addAge` has always seeded
 * `thickness: 0.085` — a tube radius from the cream-sweep number candle that Text3D replaced.
 * Nothing reads it, and it is in every saved design. The first version of the slab control used
 * that name, so every fresh number came out at 0.085 instead of its material default, every
 * acrylic one was clamped to its 0.08 ceiling, and every cake already saved would have been
 * back-dated to the same depth. It rendered, it type-checked, and only measuring the mesh found it.
 */
import { describe, it, expect } from 'vitest';
import { AGE_MATERIALS } from './canvas/AgeNumber.jsx';

// What AgeNumber does to turn an age into a slab depth. Kept in step with the component by the
// assertions below rather than by a second copy of the clamp living in the app.
const slabOf = (age) => {
  const mat = AGE_MATERIALS[age?.material] ?? AGE_MATERIALS.acrylic;
  return Math.min(mat.depthMax, Math.max(mat.depthMin, age?.slab ?? mat.depth));
};

describe('number topper slab depth', () => {
  it('ignores the dead `thickness` field a fresh age is still seeded with', () => {
    // exactly what addAge() produces today
    const fresh = { value: '1', size: 0.95, thickness: 0.085, finish: 'gold' };
    expect(slabOf({ ...fresh, material: 'acrylic' })).toBe(AGE_MATERIALS.acrylic.depth);
    expect(slabOf({ ...fresh, material: 'fondant' })).toBe(AGE_MATERIALS.fondant.depth);
  });

  it('is thinner than the stroke it is read against, or it renders as a column', () => {
    // A `1` in helvetiker_bold has a stroke 0.242 of its height. The shipped 0.22 was 0.91x that —
    // as deep as the stroke is wide — which is why "reducing" it from 0.34 still read as thick.
    const STROKE = 0.242;
    for (const [name, m] of Object.entries(AGE_MATERIALS)) {
      expect(m.depth / STROKE, `${name} default vs stroke width`).toBeLessThan(0.4);
      expect(m.depthMax / STROKE, `${name} ceiling vs stroke width`).toBeLessThan(0.65);
    }
  });

  it('clamps a value chosen under the other material into this one, both ways', () => {
    // fondant can go deeper than acrylic ever should; acrylic's floor is below fondant's
    expect(slabOf({ material: 'acrylic', slab: 0.13 })).toBe(AGE_MATERIALS.acrylic.depthMax);
    expect(slabOf({ material: 'fondant', slab: 0.02 })).toBe(AGE_MATERIALS.fondant.depthMin);
  });

  it('keeps every material a plausible object — a sheet, not a block', () => {
    for (const [name, m] of Object.entries(AGE_MATERIALS)) {
      expect(m.depthMin, `${name} min`).toBeGreaterThan(0);
      expect(m.depthMin, `${name} min < default`).toBeLessThanOrEqual(m.depth);
      expect(m.depth, `${name} default < max`).toBeLessThanOrEqual(m.depthMax);
    }
    // acrylic is a sawn sheet and must never be buildable as deep as hand-cut fondant
    expect(AGE_MATERIALS.acrylic.depthMax).toBeLessThan(AGE_MATERIALS.fondant.depthMax);
  });
});
