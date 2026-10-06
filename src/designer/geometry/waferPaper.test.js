import { describe, it, expect } from 'vitest';
import { waferPanel, buildWaferSkirt } from './waferPaper.js';

const bbox = (g) => {
  const p = g.getAttribute('position');
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.count; i++) for (let a = 0; a < 3; a++) {
    const v = p.getComponent(i, a);
    lo[a] = Math.min(lo[a], v); hi[a] = Math.max(hi[a], v);
  }
  return { lo, hi };
};
const finite = (g) => {
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count * 3; i++) if (!Number.isFinite(p.array[i])) return false;
  return true;
};

describe('one panel', () => {
  /* ⚠️ The top edge is PINNED. A real panel is stuck to the buttercream along its top and nothing
     else; every bend grows downward from that line. If splay or lean ever moved y=0, the panel
     would be floating off the cake it is glued to — which looks like a modelling choice rather
     than a bug, so nothing would report it. */
  it('keeps its top edge at y = 0 and hangs downward', () => {
    const g = waferPanel({ width: 0.3, height: 1, splay: 0.8, ripple: 0.6, curl: 0.5 });
    const { lo, hi } = bbox(g);
    expect(hi[1]).toBeCloseTo(0, 6);
    expect(lo[1]).toBeLessThan(-0.5);
  });

  it('pins the top edge against every bend, including the extremes', () => {
    for (const o of [{ splay: 2 }, { curl: 2 }, { ripple: 2 }, { taper: 0.9 }, { ripples: 9 }, { sway: 2 }, { ripples: 1 }]) {
      const g = waferPanel({ width: 0.3, height: 1, ...o });
      expect(bbox(g).hi[1]).toBeCloseTo(0, 6);
      expect(finite(g)).toBe(true);
    }
  });

  /* The hem swings AWAY from the wall (+Z is outward), and the pinned edge does not. */
  it('splays the hem outward and leaves the top where it was', () => {
    const flat  = waferPanel({ width: 0.3, height: 1, splay: 0, curl: 0, ripple: 0, sway: 0 });
    const swung = waferPanel({ width: 0.3, height: 1, splay: 0.5, curl: 0, ripple: 0, sway: 0 });
    expect(bbox(swung).hi[2]).toBeGreaterThan(bbox(flat).hi[2] + 0.1);
  });

  /* ⚠️ A CUT HEM, NEVER A ROUNDED ONE. Scissors leave straight lines; the notch is linear for
     that reason, and a "smoother" curve here would make every panel read as moulded plastic. */
  it('cuts a notched hem shorter than a straight one, and only at the hem', () => {
    const straight = waferPanel({ width: 0.3, height: 1, hem: 'straight' });
    const notched  = waferPanel({ width: 0.3, height: 1, hem: 'notch', notch: 0.25 });
    expect(bbox(notched).lo[1]).toBeGreaterThan(bbox(straight).lo[1]);
    expect(bbox(notched).hi[1]).toBeCloseTo(0, 6);
  });

  /* A torn hem draws ONE number per column. Drawing inside the vertex loop gives every row of a
     column its own tear and shreds the panel into noise — it still renders, which is why this is
     worth a test: the failure looks like a texture, not like a bug. */
  it('tears per crease, so a crease stays a straight line', () => {
    /* A torn hem is a property of the FOLD, not of a vertex: one random number per crease. Drawn
       per vertex instead, every row of a crease tears differently and the panel shreds into noise —
       which still renders, and looks like a texture rather than like a bug. */
    const folds = 4, rows = 5;
    const g = waferPanel({ width: 0.3, height: 1, hem: 'torn', notch: 0.4, ripples: folds,
                           segH: rows - 1, ripple: 0, sway: 0, curl: 0, splay: 0, taper: 0,
                           rng: () => 0.5 });
    const p = g.getAttribute('position');
    // Facet f holds its two creases as [f*rows*2 … +rows) and [… +rows … +2rows).
    for (let f = 0; f < folds; f++) {
      for (const side of [0, 1]) {
        const start = (f * 2 + side) * rows;
        const xs = [];
        for (let i = 0; i < rows; i++) xs.push(p.getX(start + i));
        expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1e-6);
      }
    }
  });
});

/* ── The crease is the texture ────────────────────────────────────────────────────────────────────
 *
 * ⚠️ TWO RENDERS WENT OUT BEFORE THIS WAS RIGHT, and both looked like a material — just not this
 * one. A fold in paper is C0: the position is continuous across it and the NORMAL IS NOT. A sine
 * across the width plus `computeVertexNormals()` gives the opposite — a smooth corrugation whose
 * normals are averaged straight through the fold — and that renders as satin.
 *
 * So each facet carries its own vertices. These two tests are the contract that buys: the seam is
 * in the TOPOLOGY, and a later "optimise the duplicate vertices away" would silently return the
 * satin.
 */
describe('a fold is a crease, not a wave', () => {
  const folds = 5, rows = 7;
  const panel = () => waferPanel({ width: 1, height: 1, ripple: 0.4, ripples: folds, segH: rows - 1,
                                   sway: 0, curl: 0, splay: 0, taper: 0, rng: () => 0.5 });

  it('splits the vertices at every crease rather than sharing them', () => {
    const g = panel();
    // folds facets × 2 creases × rows. A shared-vertex grid would be (folds + 1) × rows.
    expect(g.getAttribute('position').count).toBe(folds * 2 * rows);
  });

  /* The two halves of a crease sit in the SAME PLACE with DIFFERENT normals. That pair is the whole
     definition of a fold, and it is what makes one side of the line catch the light and the other
     fall dark — the structure the photograph is full of. */
  it('is continuous in position and discontinuous in normal across a crease', () => {
    const g = panel();
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    let checked = 0;
    for (let f = 0; f < folds - 1; f++) {
      const right = (f * 2 + 1) * rows;          // facet f's right crease
      const left  = ((f + 1) * 2) * rows;        // facet f+1's left crease — the same crease
      for (let i = 1; i < rows; i++) {
        const a = right + i, b = left + i;
        expect(Math.abs(p.getX(a) - p.getX(b))).toBeLessThan(1e-6);
        expect(Math.abs(p.getY(a) - p.getY(b))).toBeLessThan(1e-6);
        expect(Math.abs(p.getZ(a) - p.getZ(b))).toBeLessThan(1e-6);
        const dot = n.getX(a) * n.getX(b) + n.getY(a) * n.getY(b) + n.getZ(a) * n.getZ(b);
        expect(dot).toBeLessThan(0.999);         // not the same normal: there is a real crease here
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('alternates which way each facet leans, so it reads as a concertina', () => {
    const g = panel();
    const p = g.getAttribute('position');
    const mid = Math.floor(rows * 0.8);
    const z = [];
    for (let f = 0; f <= folds - 1; f++) z.push(p.getZ((f * 2) * rows + mid));
    let flips = 0;
    for (let i = 1; i < z.length; i++) if (Math.sign(z[i]) !== Math.sign(z[i - 1])) flips++;
    expect(flips).toBeGreaterThanOrEqual(z.length - 2);
  });
});

describe('the skirt round the cake', () => {
  const round = { kind: 'round', radius: 1 };

  it('builds one mesh with no NaN', () => {
    const g = buildWaferSkirt({ shape: round, tierHeight: 0.8 });
    expect(g).toBeTruthy();
    expect(finite(g)).toBe(true);
    expect(g.getAttribute('position').count).toBeGreaterThan(1000);
  });

  /* ⚠️ EVERYTHING × THE TIER (INVARIANTS #8). Double the radius and the skirt doubles with it —
     a panel width in world units would look right on a 6" and wrong on a 10", and the only way to
     find that is to build both. */
  it('scales with the tier instead of carrying a world size', () => {
    const small = bbox(buildWaferSkirt({ shape: { kind: 'round', radius: 1 }, tierHeight: 1 }));
    const big   = bbox(buildWaferSkirt({ shape: { kind: 'round', radius: 2 }, tierHeight: 2 }));
    expect(big.hi[0] / small.hi[0]).toBeGreaterThan(1.8);
    expect(big.lo[1] / small.lo[1]).toBeCloseTo(2, 0);
  });

  /* ⚠️ A PERIMETER, NOT A CIRCLE — festoon.js's lesson, and the one that produced a real bug there:
     garland spikes radiating off a sheet cake. A rect wall must get panels along its faces, not a
     circle of them at the bounding radius hanging in mid-air. */
  it('follows a rectangular wall instead of circling it', () => {
    const rect = buildWaferSkirt({ shape: { kind: 'rect', halfW: 1.5, halfD: 0.8, cornerR: 0.15 },
                                   tierHeight: 1, count: 60 });
    const { lo, hi } = bbox(rect);
    // A circle at the bounding radius would reach ±1.7 on BOTH axes; the real wall is much
    // shallower in Z than in X, and the skirt has to show that.
    expect(hi[0]).toBeGreaterThan(1.4);
    expect(hi[2]).toBeLessThan(1.25);
    expect(hi[0] - hi[2]).toBeGreaterThan(0.35);
  });

  /* The same seed must give the same cake. A skirt that reshuffles on every render is a cake that
     changes while a customer looks at it, and the bug only shows on a re-render. */
  it('is deterministic in its seed', () => {
    const a = buildWaferSkirt({ shape: round, tierHeight: 1, seed: 3 });
    const b = buildWaferSkirt({ shape: round, tierHeight: 1, seed: 3 });
    const c = buildWaferSkirt({ shape: round, tierHeight: 1, seed: 4 });
    expect(a.getAttribute('position').array).toEqual(b.getAttribute('position').array);
    expect(a.getAttribute('position').array).not.toEqual(c.getAttribute('position').array);
  });

  /* ── The hem is level; the crown is ragged ──────────────────────────────────────────────────────
   *
   * ⚠️ THIS WAS UPSIDE DOWN AND THE PHOTOGRAPH IS WHAT CAUGHT IT. Jittering the panel HEIGHT varies
   * the bottom, which gave a sawtooth of spikes along the hem and a flat line at the top — the
   * reference's silhouette exactly inverted. The sheets reach the board and REST on it, so their
   * bottoms line up whatever else varies, and the leftover length stands up above the rim.
   *
   * So jitter must show at the TOP and never at the hem, and that is what these pin. Measured per
   * panel, with `lean: 0` — a leaning panel rotates fold depth (Z) partly into height (Y), which
   * would blur both readings. */
  const extremes = (jitter, count = 10) => {
    const g = buildWaferSkirt({ shape: round, tierHeight: 1, jitter, count, seed: 2, lean: 0 });
    const p = g.getAttribute('position');
    const per = p.count / count;
    return Array.from({ length: count }, (_, k) => {
      let lo = Infinity, hi = -Infinity;
      for (let i = k * per; i < (k + 1) * per; i++) {
        const y = p.getY(i); lo = Math.min(lo, y); hi = Math.max(hi, y);
      }
      return { lo, hi };
    });
  };
  const spread = (xs) => Math.max(...xs) - Math.min(...xs);

  it('keeps every hem at the same height, however much it jitters', () => {
    for (const j of [0, 0.5, 1]) {
      expect(spread(extremes(j).map(e => e.lo))).toBeLessThan(1e-6);
    }
  });

  it('puts the variation in the crown instead', () => {
    expect(spread(extremes(0).map(e => e.hi))).toBeLessThan(1e-6);
    expect(spread(extremes(0.6).map(e => e.hi))).toBeGreaterThan(0.01);
  });

  it('survives a count of one and a count of none', () => {
    expect(finite(buildWaferSkirt({ shape: round, tierHeight: 1, count: 1 }))).toBe(true);
    expect(finite(buildWaferSkirt({ shape: round, tierHeight: 1, count: 0 }))).toBe(true);
  });
});

/* ── The fold direction, pinned ───────────────────────────────────────────────────────────────────
 *
 * ⚠️ THE FIRST VERSION SWAYED THE PANEL SIDEWAYS AS IT FELL, and it was the wrong gesture — broad
 * sheets with a diagonal twist, no vertical structure, nothing that looked handled. A baker PLEATS
 * the strip: the folds run from the glued top edge down to the hem, and those fold lines are what
 * every reference reads as a curtain of narrow ribbons.
 *
 * It is worth a test because both versions render a plausible object, and the difference is only
 * visible against the photograph. A later "simplify the two sine terms into one" would quietly
 * restore the version that looked wrong.
 */
describe('the folds run top to bottom, not side to side', () => {
  /* ⚠️ THE FIRST VERSION SWAYED THE PANEL SIDEWAYS AS IT FELL, and it was the wrong gesture —
     broad sheets with a diagonal twist, no vertical structure, nothing that looked handled. A baker
     PLEATS the strip: the folds run from the glued top edge down to the hem. */
  const folds = 6, rows = 9;
  const g = () => waferPanel({ width: 1, height: 1, ripple: 0.4, ripples: folds, segH: rows - 1,
                               sway: 0, curl: 0, splay: 0, taper: 0, rng: () => 0.5 });

  it('varies depth ACROSS the width at a fixed height', () => {
    const p = g().getAttribute('position');
    const row = Math.floor(rows * 0.6), z = [];
    for (let f = 0; f < folds; f++) z.push(p.getZ((f * 2) * rows + row));
    expect(Math.max(...z) - Math.min(...z)).toBeGreaterThan(0.15);
  });

  /* And a crease stays on the same side of the panel all the way down — a pleat is a line, not a
     travelling wave. `open` lets it deepen toward the hem, so only the SIGN has to hold. */
  it('keeps a crease on the same side of the panel all the way down', () => {
    const p = g().getAttribute('position');
    for (let f = 0; f < folds; f++) {
      const signs = new Set();
      for (let i = 1; i < rows; i++) {
        const z = p.getZ((f * 2) * rows + i);
        if (Math.abs(z) > 1e-3) signs.add(Math.sign(z));
      }
      expect(signs.size).toBeLessThanOrEqual(1);
    }
  });
});

/* ── Sheets stack; they never pass through one another ───────────────────────────────────────────
 *
 * Sandeep: *"at few places it looks like the wafer papers are intersecting. that does not happen in
 * real."* Two mechanisms answer it and both are easy to undo by accident, so both are pinned.
 *
 * ⚠️ NEITHER IS A PROOF OF NON-INTERSECTION. Panels overlap tangentially by design and their folds
 * are deeper than the gap between them, so no shingle step could separate them outright — the real
 * answer is that adjacent sheets NEST, ridge into valley, because each is pressed against the one
 * already there. These check that the two mechanisms are present and doing what they claim; the
 * render is still what says whether it is enough.
 */
describe('panels stack instead of crossing', () => {
  const round = { kind: 'round', radius: 1 };
  const radii = (opts) => {
    const count = 8;
    const g = buildWaferSkirt({ shape: round, tierHeight: 1, count, seed: 5, jitter: 0,
                                ripple: 0, curl: 0, sway: 0, splay: 0, lean: 0, ...opts });
    const p = g.getAttribute('position');
    const per = p.count / count;
    // The radius of each panel's pinned top edge — the shingle, with every shaping term off.
    return Array.from({ length: count }, (_, k) => {
      const i = k * per;
      return Math.hypot(p.getX(i), p.getZ(i));
    });
  };

  it('pushes each panel further out than the last, wrapping before it bulges', () => {
    const r = radii({ shingle: 0.02, width: 2.2 });
    const layers = Math.ceil(2.2) + 1;                 // how many overlap, so how many layers
    expect(r[1]).toBeGreaterThan(r[0]);                // it shingles at all
    expect(r[layers] ?? r[0]).toBeCloseTo(r[0], 5);    // and resets rather than ramping forever
  });

  it('sits every panel on one radius when the shingle is off', () => {
    const r = radii({ shingle: 0, width: 2.2 });
    expect(Math.max(...r) - Math.min(...r)).toBeLessThan(1e-6);
  });

  /* ⚠️ `nest` must make the crease phase a function of WHERE THE PANEL SITS, not of the RNG. A
     random phase per panel is what put one sheet's ridge exactly where its neighbour's valley went,
     which is an intersection the shingle cannot be deep enough to prevent.

     ⚠️ ASSERTED AS AN EFFECT, NOT AS SEED-INDEPENDENCE, and the first version of this test got that
     wrong and failed. Only the PHASE is positional — crease DEPTHS stay seeded deliberately, since
     a hand-folded sheet is not evenly pleated — so two seeds never agree even at nest 1, and
     demanding they do was a claim the feature does not make. */
  it('changes the crease rhythm when nesting is turned on', () => {
    const z = (nest) => {
      const g = buildWaferSkirt({ shape: round, tierHeight: 1, count: 6, seed: 3, nest,
                                  jitter: 0, ripple: 0.3, ripples: 5, lean: 0 });
      return Array.from(g.getAttribute('position').array.slice(0, 60));
    };
    expect(z(1)).not.toEqual(z(0));
    expect(z(1)).toEqual(z(1));              // and it is deterministic, like everything else here
  });
});
