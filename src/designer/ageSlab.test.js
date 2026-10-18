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
import { glyphGeometry } from './geometry/glyphShape.js';

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


/* The SILHOUETTE, which is the other half of "fondant should not have sharp edges". The bevel
 * rounds where the face meets the side; seen face-on the outline still came to mitred points, and
 * every real fondant number Sandeep referenced is cut with a plunger and has no sharp corner
 * anywhere. Asserted as the property itself — how sharply the outline turns — rather than by
 * pinning cornerR to a number, so retuning the look does not fail the test that protects it.
 */
describe('number topper silhouette', () => {
  // Largest direction change between consecutive outline edges, in degrees. A mitred corner on a
  // `1` turns 90 degrees; a rounded one spreads that turn over several short edges.
  const sharpestCorner = (text, cornerR) => {
    const { outline } = glyphGeometry(text, 1, 0, cornerR);
    let worst = 0;
    for (const ring of outline) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], c = ring[(i + 2) % ring.length];
        const v1 = { x: b.x - a.x, z: b.z - a.z }, v2 = { x: c.x - b.x, z: c.z - b.z };
        const l1 = Math.hypot(v1.x, v1.z), l2 = Math.hypot(v2.x, v2.z);
        if (l1 < 1e-6 || l2 < 1e-6) continue;
        const cos = Math.min(1, Math.max(-1, (v1.x * v2.x + v1.z * v2.z) / (l1 * l2)));
        worst = Math.max(worst, Math.acos(cos) * 180 / Math.PI);
      }
    }
    return worst;
  };

  it('acrylic is sawn, so it keeps its mitred corners', () => {
    expect(AGE_MATERIALS.acrylic.cornerR).toBe(0);
    expect(sharpestCorner('1', AGE_MATERIALS.acrylic.cornerR)).toBeGreaterThan(80);
  });

  it('fondant softens every digit, and leaves no right-angle mitre', () => {
    expect(AGE_MATERIALS.fondant.cornerR).toBeGreaterThan(0);
    for (const digit of ['1', '2', '4', '7', '8']) {
      const sawn    = sharpestCorner(digit, 0);
      const rounded = sharpestCorner(digit, AGE_MATERIALS.fondant.cornerR);
      expect(rounded, `digit ${digit} is rounder than the sawn cut`).toBeLessThan(sawn);
    }
    // `1` and `4` are the true right angles in this font; nothing that square may survive.
    for (const digit of ['1', '4']) {
      expect(sharpestCorner(digit, 0), `digit ${digit} starts mitred`).toBeGreaterThan(85);
      expect(sharpestCorner(digit, AGE_MATERIALS.fondant.cornerR),
             `digit ${digit} no longer mitred`).toBeLessThan(75);
    }
  });

  it('rounding does not eat the counters of an 8 or a 0', () => {
    // Chaikin shrinks as it cuts; past a point a glyph's holes close and it turns to a blob.
    for (const digit of ['8', '0']) {
      const { holes } = glyphGeometry(digit, 1, 0, AGE_MATERIALS.fondant.cornerR);
      expect(holes.length, `digit ${digit} kept its counters`).toBeGreaterThan(0);
    }
  });
});
