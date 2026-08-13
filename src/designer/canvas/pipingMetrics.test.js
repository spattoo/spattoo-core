import { describe, it, expect } from 'vitest';
import {
  setShellExtents, setFestoonExtents, setWrapExtents,
  resolveSidePipingBands, sidePipingClearance, festoonSig,
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
