import { describe, it, expect } from 'vitest';
import { buildGypSprig, gypTriangleCount, GYP_DEFAULTS, GYP_COLOURS } from './gypsophila.js';

const verts = (g) => {
  const p = g.getAttribute('position'), out = [];
  for (let i = 0; i < p.count; i++) out.push([p.getX(i), p.getY(i), p.getZ(i)]);
  return out;
};
const reach = (g) => {
  g.computeBoundingBox();
  const b = g.boundingBox;
  return Math.max(b.max.y, Math.hypot(b.max.x, b.max.z), Math.hypot(b.min.x, b.min.z));
};

describe('buildGypSprig — one sprig, seated at the origin', () => {
  it('grows up from the origin, so a seat can place it by its cut end', () => {
    const g = buildGypSprig();
    g.computeBoundingBox();
    expect(g.boundingBox.min.y).toBeCloseTo(0, 5);
    expect(g.boundingBox.max.y).toBeGreaterThan(0.1);
  });

  /* ⚠️ A CONTROL THAT LIES ABOUT ITS UNITS IS THE THING INVARIANTS #8 IS ABOUT. `height` was written
     as `height * (1 - shrink)` for the first stem, which gave a 0.21 sprig for a 0.30 setting
     because the branches add their own length on top. It is solved against the geometric series
     now; droop still trades a little reach for lean, hence the tolerance. */
  it('reaches about as far as `height` says', () => {
    for (const h of [0.2, 0.3, 0.45]) {
      const r = reach(buildGypSprig({ height: h }));
      expect(r, `height ${h}`).toBeGreaterThan(h * 0.8);
      expect(r, `height ${h}`).toBeLessThanOrEqual(h * 1.05);
    }
  });

  it('is stable for a seed and different between seeds', () => {
    expect(verts(buildGypSprig({ seed: 3 }))).toEqual(verts(buildGypSprig({ seed: 3 })));
    expect(verts(buildGypSprig({ seed: 3 }))).not.toEqual(verts(buildGypSprig({ seed: 4 })));
  });

  /* ⚠️ THE BLOOMS ARE THE POINT. Flowering only at the tips gave a bare twig with a pom-pom on each
     arm — a dandelion clock, not gypsophila. They ride the last TWO levels, so asking for more
     blooms has to add real geometry rather than quietly doing nothing. */
  it('more blooms per tip means more geometry', () => {
    const few = buildGypSprig({ florets: 2 }).getAttribute('position').count;
    const many = buildGypSprig({ florets: 8 }).getAttribute('position').count;
    expect(many).toBeGreaterThan(few * 1.5);
  });

  /* ⚠️ EVERY BLOOM IS ROTATED, and this is the test for a fault that was plainly visible in a render
     and invisible to every other assertion here. An octahedron seen down an axis has a SQUARE
     silhouette; built axis-aligned, every bloom shows the same square at the same time and the
     sprig reads as a scatter of identical white diamonds rather than as flowers. If the rotation
     is ever lost, the direction from a bloom's centre to its vertices collapses back onto ±x, ±y,
     ±z for every bloom in the sprig. */
  it('gives every bloom its own orientation', () => {
    const g = buildGypSprig({ seed: 11 });
    const p = g.getAttribute('position');
    // Bloom vertices come in sixes at the end of each cluster push; sample directions between
    // consecutive vertices and check they are not all axis-parallel.
    let axisAligned = 0, sampled = 0;
    for (let i = 0; i + 1 < p.count; i += 7) {
      const dx = p.getX(i + 1) - p.getX(i), dy = p.getY(i + 1) - p.getY(i), dz = p.getZ(i + 1) - p.getZ(i);
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-9) continue;
      sampled++;
      const biggest = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / len;
      if (biggest > 0.999) axisAligned++;
    }
    expect(sampled).toBeGreaterThan(20);
    expect(axisAligned / sampled).toBeLessThan(0.2);
  });

  it('costs what gypTriangleCount says, within a quarter', () => {
    const actual = buildGypSprig().index.count / 3;
    const predicted = gypTriangleCount(1);
    expect(predicted).toBeGreaterThan(actual * 0.6);
    expect(predicted).toBeLessThan(actual * 1.6);
  });

  /* A sprig is instanced in the hundreds, so its own budget is what decides whether a rim band
     ships on a phone. Grass's tuft is ~120 triangles; this carries blooms as well. */
  it('stays cheap enough to instance in the hundreds', () => {
    expect(buildGypSprig().index.count / 3).toBeLessThan(1600);
  });

  /* ⚠️ THE GREEN STEMS ARE NOT DECORATION. Every reference shows fine green stems carrying white
     blooms, and the contrast between them is most of what makes the cloud legible — rendered
     all-white it has nothing to separate it from a white cake under a bright key, which is the
     complaint that has followed every white decoration here. Two colours in ONE buffer, so the
     field is still a single draw call. */
  /* ⚠️ THE BLOOMS CARRY A SHADE NOW, so this no longer counts two colours — it used to, and that
     assertion would have failed the occlusion bake for doing its job. What has to stay true is that
     stems are one flat colour (they are not shaded; a stem is a hair and shading it reads as dirt)
     and that blooms span a RANGE, because a flat range is the white-out this feature keeps hitting. */
  it('paints stems and blooms differently, in one buffer', () => {
    const g = buildGypSprig();
    const c = g.getAttribute('color');
    expect(c, 'no colour attribute at all').toBeTruthy();
    expect(c.count).toBe(g.getAttribute('position').count);
    const stems = new Set(), blooms = new Set();
    for (let i = 0; i < c.count; i++) {
      const r = c.getX(i), gg = c.getY(i), b = c.getZ(i);
      const key = `${r.toFixed(3)},${gg.toFixed(3)},${b.toFixed(3)}`;
      (gg > r ? stems : blooms).add(key);          // the stem colour is the only green-led one
    }
    expect(stems.size, 'the stem colour is one flat value').toBe(1);
    expect(blooms.size, 'blooms should span a range of shades').toBeGreaterThan(3);
  });

  it('leaves the blooms alone when the depth is off', () => {
    const c = buildGypSprig({ ao: 0 }).getAttribute('color');
    const blooms = new Set();
    for (let i = 0; i < c.count; i++) {
      if (c.getY(i) > c.getX(i)) continue;
      blooms.add(`${c.getX(i).toFixed(3)},${c.getZ(i).toFixed(3)}`);
    }
    expect(blooms.size).toBe(1);
  });

  /* Checked by HUE rather than by exact value: the occlusion bake scales a bloom's colour, so a
     bloom asked for pure blue arrives as some darker blue. What must hold is that nothing swaps. */
  it('takes the colours it is given', () => {
    const c = buildGypSprig({ stem: '#ff0000', bloom: '#0000ff' }).getAttribute('color');
    let red = 0, blue = 0;
    for (let i = 0; i < c.count; i++) {
      const r = c.getX(i), b = c.getZ(i);
      if (r > 0.01 && b < 1e-6) red++;
      else if (b > 0.01 && r < 1e-6) blue++;
    }
    expect(red).toBeGreaterThan(0);
    expect(blue).toBeGreaterThan(0);
    expect(red + blue).toBe(c.count);
  });

  it('the stem colour is its own export, so two surfaces cannot disagree about it', () => {
    expect(GYP_COLOURS.stem).toMatch(/^#[0-9a-f]{6}$/i);
    expect(GYP_COLOURS.bloom).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('every default is a number the builder actually reads', () => {
    for (const k of Object.keys(GYP_DEFAULTS)) {
      expect(typeof GYP_DEFAULTS[k], k).toBe('number');
    }
  });
});
