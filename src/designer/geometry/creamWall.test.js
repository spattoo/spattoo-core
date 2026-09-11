import { describe, it, expect } from 'vitest';
import {
  ropeRadius, pipedBodyRadius, pipedParams, makeSwirlField,
  buildStyledWall, buildStyledTop, makeWallReliefSampler,
} from './creamWall.js';
import { NOZZLE_BY_KEY, mergePenGeometries } from './creamPen.js';
import { CREAM_STYLES, resolveStyleParams, styleDef } from '../creamStyles.js';

const TAU = Math.PI * 2;
const STAR  = pipedParams({ ...resolveStyleParams('piped'),       nozzle: styleDef('piped').nozzle });
const ROUND = pipedParams({ ...resolveStyleParams('piped_round'), nozzle: styleDef('piped_round').nozzle });

describe('the tip comes from the cream pen, not from here', () => {
  it('every piped row names a REAL pen tip — a typo would silently pipe a 1M instead', () => {
    const rows = Object.values(CREAM_STYLES).filter(s => s.nozzle);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) expect(NOZZLE_BY_KEY[row.nozzle], `${row.label}: ${row.nozzle}`).toBeTruthy();
  });

  it('falls back rather than rendering a tier with no cream on it', () => {
    expect(NOZZLE_BY_KEY[pipedParams({ nozzle: 'no-such-tip' }).nozzle]).toBeTruthy();
  });

  it('the two rows differ in the TIP, not in the algorithm or the knobs', () => {
    expect(styleDef('piped').nozzle).not.toBe(styleDef('piped_round').nozzle);
    expect(styleDef('piped_round').wall).toBe(styleDef('piped').wall);
    expect(styleDef('piped_round').top).toBe(styleDef('piped').top);
    const keys = (k) => (styleDef(k).params ?? []).map(p => p.key);
    expect(keys('piped_round')).toEqual(keys('piped'));
  });
});

describe('rope size is DERIVED, so nothing can disagree with it', () => {
  it('lays `ropes` strokes shoulder to shoulder with no overlap', () => {
    // The pen's PRESSED section spans −1…1 across and 0…1 out, so half-width = depth = thickness.
    const p = { ropes: 36, overlap: 0 };
    const t = ropeRadius(1, p);
    expect(2 * t * p.ropes).toBeCloseTo(TAU * (1 - t), 6);   // spines on the (radius − t) circle
  });

  it('⚠️ puts the CREST on the tier radius — the cake is the size it says it is', () => {
    for (const params of [STAR, ROUND]) {
      const t = ropeRadius(1, params);
      expect((1 - t) + t).toBeCloseTo(1, 12);
      const pos = buildStyledWall('piped', 1, 1.4, params).getAttribute('position');
      let max = 0;
      for (let i = 0; i < pos.count; i++) max = Math.max(max, Math.hypot(pos.getX(i), pos.getZ(i)));
      expect(max).toBeLessThan(1.06);          // `vary` makes some strokes a little fatter, no more
      expect(max).toBeGreaterThan(0.97);       // …and it really does reach it
    }
  });

  it('overlap only ever makes a rope fatter — a hand presses neighbours together', () => {
    expect(ropeRadius(1, { ropes: 36, overlap: 0.2 })).toBeGreaterThan(ropeRadius(1, { ropes: 36, overlap: 0 }));
  });

  it('scales with the tier: a bigger cake gets the same cream, not the same millimetres', () => {
    expect(ropeRadius(2, STAR) / ropeRadius(1, STAR)).toBeCloseTo(2, 12);
  });
});

describe('pipedBodyRadius — how far the tip was pressed in', () => {
  it('⚠️ buries most of each rope, or the wall is a curtain of hanging strips', () => {
    // Left at the crevice line, half of every rope stands proud and the valleys are a seventh of the
    // tier deep. `press` is what turns thirty-six ropes into a surface.
    const t = ropeRadius(1, STAR);
    expect(1 - pipedBodyRadius(1, STAR)).toBeLessThan(0.9 * t);
  });

  it('never goes below the line where two ropes cross — that would show the board through them', () => {
    for (const p of [STAR, ROUND, pipedParams({ ropes: 12, overlap: 0, press: 0 })]) {
      const t = ropeRadius(1, p), Rc = 1 - t;
      const a = Rc * Math.sin(Math.PI / p.ropes);
      const crevice = Rc * Math.cos(Math.PI / p.ropes) - (a < t ? Math.sqrt(t * t - a * a) : 0);
      expect(pipedBodyRadius(1, p)).toBeGreaterThanOrEqual(crevice - 1e-9);
    }
  });

  it('never reaches the crest, or there would be no ribs to see', () => {
    expect(pipedBodyRadius(1, pipedParams({ press: 1 }))).toBeLessThan(1);
  });
});

describe('makeWallReliefSampler describes the same wall the geometry builds', () => {
  const sample = (params) => {
    const f = makeWallReliefSampler('piped', 1, params, 1.4);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 4000; i++) {
      const r = f(-Math.PI + TAU * i / 4000, 0.5);
      lo = Math.min(lo, r); hi = Math.max(hi, r);
    }
    return { lo, hi };
  };

  // Where two neighbouring ropes actually cross, measured the way the geometry lays them out.
  const crossing = (p) => {
    const t = ropeRadius(1, p), Rc = 1 - t;
    const a = Rc * Math.sin(Math.PI / p.ropes);
    return Rc * Math.cos(Math.PI / p.ropes) + Math.sqrt(Math.max(0, t * t - a * a)) - 1;
  };

  it('⚠️ reads NEGATIVE — piped ropes are laid inside the nominal radius, not grown outside it', () => {
    const { lo, hi } = sample(STAR);
    expect(hi).toBeCloseTo(0, 3);              // 0 on a rope's spine: that is the crest, and the radius
    expect(lo).toBeLessThan(-0.02);            // and it dips between them
  });

  it('dips to where two strokes CROSS, not to the body — that is the point of the overlap', () => {
    for (const p of [STAR, ROUND]) {
      const { lo } = sample(p);
      expect(lo).toBeCloseTo(crossing(p), 1);
      expect(lo).toBeGreaterThanOrEqual(pipedBodyRadius(1, p) - 1);   // the body stays behind them
    }
  });
});

describe('the top — a spatula swirl, not a coil', () => {
  it('is null for every style that leaves the top flat', () => {
    expect(buildStyledTop('piped', undefined, 1, 1.4, STAR)).toBeNull();
    expect(buildStyledTop('wave', null, 1, 1.4, {})).toBeNull();
  });

  it('joins itself at the ±π seam — a ring that did not would show as a crack to the middle', () => {
    const f = makeSwirlField({ turns: 7, rOut: 1 });
    for (const r of [0.15, 0.5, 0.95]) {
      expect(f(r, Math.PI - 1e-7)).toBeCloseTo(f(r, -Math.PI + 1e-7), 5);
    }
  });

  it('is a spiral, not rings: one turn moves it exactly one ring inward', () => {
    const turns = 7, f = makeSwirlField({ turns, rOut: 1 });
    expect(f(0.5, 0)).toBeCloseTo(f(0.5 - 1 / turns, TAU), 9);
  });

  it('⚠️ stays SHALLOW — an order of magnitude under a rope, or the lid fights the wall', () => {
    const geo = buildStyledTop('piped', 'spiral', 1, 1.4, STAR);
    const pos = geo.getAttribute('position');
    let top = -Infinity;
    for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
    expect(top).toBeLessThan(0.4 * ropeRadius(1, STAR));
  });

  it('reaches the tier radius and carries uvs — it is the lid AND it covers the ropes\' ends', () => {
    const geo = buildStyledTop('piped', 'spiral', 1, 1.4, STAR);
    expect(geo.getAttribute('uv')).toBeTruthy();
    const pos = geo.getAttribute('position');
    let max = 0;
    for (let i = 0; i < pos.count; i++) max = Math.max(max, Math.hypot(pos.getX(i), pos.getZ(i)));
    expect(max).toBeCloseTo(1, 6);
  });
});

describe('mergePenGeometries', () => {
  it('⚠️ CARRIES the index rather than expanding it — expanding costs six times the vertices', () => {
    const a = buildStyledWall('piped', 1, 1.4, STAR);
    expect(a.getIndex()).toBeTruthy();
    // A tube shares each vertex between six triangles, so an expanded merge would be ~6x this.
    expect(a.getIndex().count).toBeGreaterThan(a.getAttribute('position').count * 2);
  });

  it('is null for nothing, and passes a single part straight through', () => {
    expect(mergePenGeometries([])).toBeNull();
    expect(mergePenGeometries([null, undefined])).toBeNull();
  });
});

describe('the wall geometry', () => {
  it('carries cylindrical uvs, so a gradient or a stripe reads around it', () => {
    const geo = buildStyledWall('piped', 1, 1.4, STAR);
    const uv = geo.getAttribute('uv');
    expect(uv).toBeTruthy();
    let uMin = 9, uMax = -9, vMin = 9, vMax = -9;
    for (let i = 0; i < uv.count; i++) {
      uMin = Math.min(uMin, uv.getX(i)); uMax = Math.max(uMax, uv.getX(i));
      vMin = Math.min(vMin, uv.getY(i)); vMax = Math.max(vMax, uv.getY(i));
    }
    expect(uMin).toBeGreaterThanOrEqual(0);
    expect(uMax).toBeLessThanOrEqual(1);
    expect(vMax - vMin).toBeGreaterThan(0.9);
  });

  it('⚠️ rolls every rope to face outward — without it the wall comes out patchy', () => {
    // Each rope must reach the crest. `rmFrames` starts every vertical stroke from the same world
    // direction, so an unrolled 1M shows a lobe to some ropes and a valley to others: those fall
    // short of the radius and the wall reads as wide panels beside thin lines.
    const pos = buildStyledWall('piped', 1, 1.4, STAR).getAttribute('position');
    const reach = new Array(STAR.ropes).fill(0);
    for (let i = 0; i < pos.count; i++) {
      const th = Math.atan2(pos.getZ(i), pos.getX(i));
      const k = Math.floor(((th + Math.PI) / TAU) * STAR.ropes) % STAR.ropes;
      reach[k] = Math.max(reach[k], Math.hypot(pos.getX(i), pos.getZ(i)));
    }
    for (const r of reach) expect(r).toBeGreaterThan(0.985);
  });

  it('is deterministic — the same design must render the same twice', () => {
    const a = buildStyledWall('piped', 1, 1.4, STAR).getAttribute('position');
    const b = buildStyledWall('piped', 1, 1.4, STAR).getAttribute('position');
    expect(a.count).toBe(b.count);
    for (let i = 0; i < a.count; i += 97) expect(a.getX(i)).toBe(b.getX(i));
  });
});

describe('the pen sweeps outward-facing geometry', () => {
  it('⚠️ every stroke faces OUT — it faced in, and back-face culling hid it', () => {
    /* For a right-handed (T, N, B) frame and an anticlockwise profile, `T × dProfile` points INWARD,
     * so the old winding gave every swept stroke normals facing into its own tube. Nothing looked
     * obviously broken — you were seeing the inside of the far wall, shaded by an inverted normal,
     * which on a matte cream reads as plausible-but-flat. It only became unmissable with a section
     * that is not symmetric: a wall of strokes with a ribbed front and a flat back rendered as a
     * smooth cylinder with a few slits in it. */
    const geo = buildStyledWall('piped', 1, 1.4, STAR);
    const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal');
    // Take the outermost vertex in each of 360 angular bins — the surface a viewer actually sees.
    const best = new Array(360).fill(null);
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getY(i)) > 0.1) continue;
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      const k = Math.floor(((Math.atan2(pos.getZ(i), pos.getX(i)) + Math.PI) / TAU) * 360) % 360;
      if (!best[k] || r > best[k].r) best[k] = { r, i };
    }
    let facingOut = 0, seen = 0;
    for (const b of best) {
      if (!b) continue;
      seen++;
      const { r, i } = b;
      if ((nor.getX(i) * pos.getX(i) + nor.getZ(i) * pos.getZ(i)) / r > 0) facingOut++;
    }
    expect(seen).toBeGreaterThan(300);
    expect(facingOut).toBe(seen);
  });
});
