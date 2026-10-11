import { describe, it, expect } from 'vitest';
import {
  setShellExtents, setFestoonExtents, setWrapExtents,
  resolveSidePipingBands, sidePipingClearance, festoonSig,
  resolveTopPipingBands, topSurfaceYAt,
} from './pipingMetrics.js';

// A proud side decoration must re-seat onto the OUTER face of any cream band it overlaps, so it
// rests in front of the cream instead of penetrating it. sidePipingClearance is the pure geometry.
describe('sidePipingClearance — deepest OVERLAPPING band, else 0', () => {
  const bands = [
    { loY: 0,   hiY: 2, out: 0.10 },
    { loY: 1.5, hiY: 3, out: 0.30 },
  ];
  it('0 when there are no bands', () => {
    expect(sidePipingClearance({ bands: [], yBottom: 0, yTop: 1 })).toBe(0);
  });
  it('0 when the decoration span misses every band', () => {
    expect(sidePipingClearance({ bands, yBottom: 5, yTop: 6 })).toBe(0);
  });
  it('returns the deepest band it overlaps', () => {
    expect(sidePipingClearance({ bands, yBottom: 1.8, yTop: 2.5 })).toBeCloseTo(0.30); // both → max
    expect(sidePipingClearance({ bands, yBottom: 0,   yTop: 1   })).toBeCloseTo(0.10); // first only
  });
  it('a touching edge counts as overlap (inclusive)', () => {
    expect(sidePipingClearance({ bands, yBottom: 2, yTop: 2 })).toBeCloseTo(0.30);
  });
});

// resolveSidePipingBands turns a tier's stacked piping layers into absolute [loY,hiY]+out bands,
// reading the SAME published extents the renderer measures.
describe('resolveSidePipingBands — absolute bands from published extents', () => {
  it('a bottom festoon anchors at BEND_ANCHOR_FRAC of the wall and reports its outward reach (uncapped)', () => {
    const glbUrl = 'test-festoon.glb';
    setFestoonExtents(glbUrl, festoonSig({ size: 1, bendDepth: 0.4, festoons: 6, bendRing: false, bendTilt: 0 }),
      { bellyFrac: 0.2, topFrac: 0.1, outerFrac: 0.08 });
    const bands = resolveSidePipingBands({
      topPipings: [], bottomPipings: [{ glbUrl, bend: true, size: 1, bendDepth: 0.4, festoons: 6 }],
      topY: 3, yBase: 0, height: 2, radius: 1.5,
    });
    expect(bands).toHaveLength(1);
    const anchor = 0 + 2 * 0.55;   // yBase + height·BEND_ANCHOR_FRAC
    expect(bands[0].loY).toBeCloseTo(anchor - 0.2 * 1.5);
    expect(bands[0].hiY).toBeCloseTo(anchor + 0.1 * 1.5);
    expect(bands[0].out).toBeCloseTo(0.08 * 1.5);   // festoon not capped
  });

  it('a shell band reports its outward reach when under the cap', () => {
    const glbUrl = 'shell.glb';
    setShellExtents(glbUrl, false, 1, { topFrac: 0.1, botFrac: -0.1, outerFrac: 0.05 });
    const bands = resolveSidePipingBands({
      topPipings: [{ glbUrl, size: 1 }], bottomPipings: [], topY: 3, yBase: 0, height: 2, radius: 2,
    });
    expect(bands).toHaveLength(1);
    expect(bands[0].hiY).toBeCloseTo(3 + 0.1 * 2);
    expect(bands[0].out).toBeCloseTo(0.05 * 2);   // 0.10 < cap (0.15·2=0.30) → uncapped
  });

  it('a deep shell band is CAPPED (padded depth bbox would fling the decoration off)', () => {
    const glbUrl = 'deep-shell.glb';
    setShellExtents(glbUrl, true, 1, { topFrac: 0.3, botFrac: -0.3, outerFrac: 0.42 });   // rosette-like; bottom flip=true
    const bands = resolveSidePipingBands({
      topPipings: [], bottomPipings: [{ glbUrl, size: 1 }], topY: 3, yBase: 0, height: 2, radius: 1.2,
    });
    expect(bands).toHaveLength(1);
    expect(bands[0].out).toBeCloseTo(0.2 * 1.2);   // 0.42·1.2=0.504 capped to 0.2·1.2=0.24
  });

  it('a wrap band reads its own extents store (uncapped)', () => {
    const glbUrl = 'wrap.glb';
    setWrapExtents(glbUrl, 1, { topFrac: 0.15, botFrac: -0.15, outerFrac: 0.06 });
    const bands = resolveSidePipingBands({
      topPipings: [], bottomPipings: [{ glbUrl, wrap: true, size: 1, yOffset: 0.5 }],
      topY: 3, yBase: 0, height: 2, radius: 1,
    });
    expect(bands).toHaveLength(1);
    expect(bands[0].out).toBeCloseTo(0.06);
  });

  it('drops a flush band with no outward reach (nothing to penetrate)', () => {
    const glbUrl = 'flat-shell.glb';
    setShellExtents(glbUrl, false, 1, { topFrac: 0.2, botFrac: -0.2, outerFrac: 0 });
    const bands = resolveSidePipingBands({
      topPipings: [{ glbUrl, size: 1 }], bottomPipings: [], topY: 3, yBase: 0, height: 2, radius: 1.5,
    });
    expect(bands).toHaveLength(0);
  });
});

/* A rim ring also covers part of the LID, and a sprinkle thrown where it sits has to land ON it.
 * Reported against a rosette rim: the sprinkles rendered at the lid height, so they were under the
 * roses — visible only in the bare middle. The same picture shows them sitting correctly on the
 * chocolate drip, because the SIDE has had this since resolveSidePipingBands. */
describe('resolveTopPipingBands / topSurfaceYAt — what a sprinkle lands on', () => {
  const topY = 1.0, radius = 0.35;
  const ring = (glbUrl, over = {}) => ({ glbUrl, size: 1, ...over });

  it('a rim ring is an annulus at the rim, raised by its own height', () => {
    setShellExtents('rose.glb', false, 1, { topFrac: 0.4, botFrac: 0, radialOutFrac: 0, radialInFrac: -0.6 });
    const [b] = resolveTopPipingBands({ topPipings: [ring('rose.glb')], topY, radius });
    expect(b.outerR).toBeCloseTo(0.35, 6);                 // outer edge on the rim
    expect(b.innerR).toBeCloseTo(0.35 - 0.35 * 0.6, 6);    // reaches 0.6 radii inward
    expect(b.surfaceY).toBeCloseTo(topY + 0.35 * 0.4, 6);  // and stands 0.4 radii proud
  });

  /* ⚠️ THE CASE THAT SHIPPED WRONG, AND WHY THE FIRST TESTS MISSED IT: every one of them set
     `botFrac: 0`, so a surface computed as `topFrac - botFrac` was indistinguishable from
     `topFrac`. A real shell dips BELOW its anchor — botFrac is negative — and subtracting it
     counted that depth twice, putting the surface a whole shell above the cream. Sandeep, with a
     picture of gold beads hanging in clear air: *"sprinkles are floating"*.
     topFrac/botFrac are both measured FROM THE ANCHOR; the top is simply anchor + topFrac. */
  it('measures the top from the anchor, and does not add the below-anchor reach back', () => {
    setShellExtents('dips.glb', false, 1, { topFrac: 0.3, botFrac: -0.5, radialOutFrac: 0, radialInFrac: -0.5 });
    const [b] = resolveTopPipingBands({ topPipings: [ring('dips.glb')], topY, radius });
    expect(b.surfaceY).toBeCloseTo(topY + 0.35 * 0.3, 6);          // anchor + topFrac…
    expect(b.surfaceY).not.toBeCloseTo(topY + 0.35 * 0.8, 6);      // …never + |botFrac| as well
  });

  it('lifts a sprinkle inside the ring and leaves one in the middle alone', () => {
    setShellExtents('rose.glb', false, 1, { topFrac: 0.4, botFrac: 0, radialOutFrac: 0, radialInFrac: -0.6 });
    const bands = resolveTopPipingBands({ topPipings: [ring('rose.glb')], topY, radius });
    expect(topSurfaceYAt(bands, 0.30, topY)).toBeCloseTo(topY + 0.14, 6);  // under the roses
    expect(topSurfaceYAt(bands, 0.05, topY)).toBe(topY);                   // bare lid, untouched
    expect(topSurfaceYAt([], 0.30, topY)).toBe(topY);                      // no rings at all
  });

  /* ⚠️ Rim rings NEST, so two can cover the same radius. A sprinkle rests on whatever is highest —
     "the last one resolved" would drop it inside the taller ring. */
  it('rests on the TALLEST ring where two overlap', () => {
    setShellExtents('short.glb', false, 1, { topFrac: 0.2, botFrac: 0, radialOutFrac: 0, radialInFrac: -0.9 });
    setShellExtents('tall.glb',  false, 1, { topFrac: 0.5, botFrac: 0, radialOutFrac: 0, radialInFrac: -0.9 });
    const bands = resolveTopPipingBands({ topPipings: [ring('tall.glb'), ring('short.glb')], topY, radius });
    expect(topSurfaceYAt(bands, 0.3, topY)).toBeCloseTo(topY + 0.35 * 0.5, 6);
  });

  /* ⚠️ THE DOME. A rim ring is not a shelf: measured on the catalogue Rosette after its authored
     -85° tilt, the crest sits at 100% in the middle of the band and falls to 42% / 33% at the
     edges. Seating everything at the crest floats all but a thin circle at the crest radius, which
     is what shipped: *"why the sprinkles forming a circle on the cream layer."* */
  it('follows the band profile instead of seating everything at the crest', () => {
    // inner 0.1, crest 0.5, outer 0.2 — fracs of radius, the shape the renderer publishes
    setShellExtents('dome.glb', false, 1, {
      topFrac: 0.5, botFrac: 0, radialOutFrac: 0, radialInFrac: -1,
      radialProfile: [0.1, 0.3, 0.5, 0.35, 0.2],
    });
    const bands = resolveTopPipingBands({ topPipings: [ring('dome.glb')], topY, radius });
    const at = (r) => topSurfaceYAt(bands, r, topY);
    const innerR = bands[0].innerR, outerR = bands[0].outerR;
    expect(at(innerR)).toBeCloseTo(topY + radius * 0.1, 5);                 // low at the inner edge
    expect(at((innerR + outerR) / 2)).toBeCloseTo(topY + radius * 0.5, 5);  // crest in the middle
    expect(at(outerR)).toBeCloseTo(topY + radius * 0.2, 5);                 // low again at the outer
    // and every sample in between lands under the crest — nothing hovers
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const h = at(innerR + t * (outerR - innerR));
      expect(h).toBeLessThanOrEqual(topY + radius * 0.5 + 1e-6);
      expect(h).toBeGreaterThanOrEqual(topY + radius * 0.1 - 1e-6);
    }
  });

  it('interpolates between samples rather than stepping', () => {
    setShellExtents('ramp.glb', false, 1, {
      topFrac: 0.4, botFrac: 0, radialOutFrac: 0, radialInFrac: -1,
      radialProfile: [0, 0.4],
    });
    const bands = resolveTopPipingBands({ topPipings: [ring('ramp.glb')], topY, radius });
    const { innerR, outerR } = bands[0];
    expect(topSurfaceYAt(bands, innerR + 0.5 * (outerR - innerR), topY))
      .toBeCloseTo(topY + radius * 0.2, 5);
  });

  it('falls back to the crest when a shell has not published a profile yet', () => {
    setShellExtents('nope.glb', false, 1, { topFrac: 0.4, botFrac: 0, radialOutFrac: 0, radialInFrac: -0.5 });
    const bands = resolveTopPipingBands({ topPipings: [ring('nope.glb')], topY, radius });
    expect(topSurfaceYAt(bands, bands[0].innerR + 0.01, topY)).toBeCloseTo(topY + radius * 0.4, 5);
  });

  /* ⚠️ THE THREE SKIPS, each the difference between a sprinkle on icing and one in mid-air. */
  it('ignores a drip: procedural, no glbUrl, and it hangs outside the wall', () => {
    expect(resolveTopPipingBands({ topPipings: [{ drip: true, glbUrl: null }], topY, radius })).toHaveLength(0);
  });

  it('ignores a wrap band: it is re-routed onto the wall, not the lid', () => {
    setShellExtents('band.glb', false, 1, { topFrac: 0.4, botFrac: 0, radialOutFrac: 0, radialInFrac: -0.2 });
    expect(resolveTopPipingBands({ topPipings: [ring('band.glb', { wrap: true })], topY, radius })).toHaveLength(0);
  });

  it('ignores a SINGLE-arrangement layer: a few shells at authored angles are not an annulus', () => {
    setShellExtents('one.glb', false, 1, { topFrac: 0.4, botFrac: 0, radialOutFrac: 0, radialInFrac: -0.3 });
    const single = ring('one.glb', { instances: [{ id: 1, angle: 0 }] });
    expect(resolveTopPipingBands({ topPipings: [single], topY, radius })).toHaveLength(0);
  });

  it('follows the ring inward when it is nudged off the rim', () => {
    setShellExtents('rose.glb', false, 1, { topFrac: 0.4, botFrac: 0, radialOutFrac: 0, radialInFrac: -0.4 });
    const [b] = resolveTopPipingBands({ topPipings: [ring('rose.glb', { userRadialOffset: -0.1 })], topY, radius });
    expect(b.outerR).toBeCloseTo(0.25, 6);
  });
});
