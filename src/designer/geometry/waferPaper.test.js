import { describe, it, expect } from 'vitest';
import { waferPanel, buildWaferSkirt, WAFER_PRESETS, WAFER_DEFAULTS, waferPresetFor, bakeWaferAO , waferPresetsOffered } from './waferPaper.js';

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

/* ── Nothing goes inside the cake ─────────────────────────────────────────────────────────────────
 *
 * Sandeep: *"on the top, it shows the penetration into the cake."* +Z is outward in panel space, so
 * a negative z is a sheet passing through the wall. `bow` and `fold` both swing either way and
 * where they summed negative the panel sat inside the tier's radius — and above the rim that put
 * paper over the cake's top FACE, which is where it showed.
 *
 * Worth a test because it is invisible from most angles: the cake hides it, right up until the
 * camera goes over the top or the skirt stands proud of the rim.
 */
describe('a sheet never passes through the wall', () => {
  it('keeps every vertex at or outside the wall, under any shaping', () => {
    for (const o of [{}, { curl: 1 }, { curl: -1 }, { ripple: 0.9 }, { splay: 0.5 },
                     { curl: 0.8, ripple: 0.8 }, { taper: 0.6, curl: 0.9 }]) {
      const g = waferPanel({ width: 1, height: 1, ripples: 7, ...o });
      const p = g.getAttribute('position');
      let min = Infinity;
      for (let i = 0; i < p.count; i++) min = Math.min(min, p.getZ(i));
      expect(min).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  /* And it still stands OFF the wall — a clamp that flattened everything to z = 0 would pass the
     test above and render a painted stripe. */
  it('still stands proud of the wall where it is not resting on it', () => {
    const g = waferPanel({ width: 1, height: 1, ripple: 0.4, ripples: 7 });
    const p = g.getAttribute('position');
    let max = -Infinity;
    for (let i = 0; i < p.count; i++) max = Math.max(max, p.getZ(i));
    expect(max).toBeGreaterThan(0.1);
  });
});

/* ── A crease never overtakes its neighbour ───────────────────────────────────────────────────────
 *
 * The wander that makes a sheet flow is also the thing that can fold it through itself: creases sit
 * `width / folds` apart, and staggering their phase moves neighbours relative to one another. Let
 * that exceed the spacing and the ribbons cross. The first render with meander turned on did
 * exactly that — 16 folds, relative movement five times the gap — and came out shredded.
 *
 * The cap lives in the geometry rather than in the caller, so a slider cannot produce it.
 */
describe('the wander cannot fold a sheet through itself', () => {
  const ordered = (opts) => {
    const folds = opts.ripples, rows = 9;
    const g = waferPanel({ width: 1, height: 1, segH: rows - 1, sway: 0, curl: 0, splay: 0,
                           taper: 0, ripple: 0.2, ...opts });
    const p = g.getAttribute('position');
    for (let i = 0; i < rows; i++) {
      let prev = -Infinity;
      for (let f = 0; f < folds; f++) {
        const x = p.getX((f * 2) * rows + i);
        if (x < prev - 1e-6) return false;      // this crease has overtaken the one to its left
        prev = x;
      }
    }
    return true;
  };

  it('keeps the creases in order at any meander the slider allows', () => {
    for (const ripples of [4, 7, 11, 16]) {
      for (const meander of [0, 0.2, 0.5, 0.9]) {
        for (const skew of [0, 0.35, 0.8, 1.2]) {
          expect(ordered({ ripples, meander, meanders: 2, skew })).toBe(true);
        }
      }
    }
  });

  /* And it still wanders — a cap that killed the motion would pass the test above and render the
     straight pleat it was added to escape. */
  it('still moves the creases sideways', () => {
    const p = waferPanel({ width: 1, height: 1, ripples: 7, meander: 0.5, meanders: 2, skew: 0.4,
                           segH: 8, sway: 0, curl: 0, splay: 0, taper: 0 }).getAttribute('position');
    const xs = [];
    for (let i = 0; i < 9; i++) xs.push(p.getX(i));     // one crease, top to bottom
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.05);
  });
});

/* ── The CUT, including the two that are a shape rather than a hem ───────────────────────────────
 *
 * The domed reference is not a fringe of strips: the paper is cut into petals and laid in
 * overlapping rings. That is the same mechanism as the hem — how far each part of the piece drops —
 * so `round` and `petal` join `straight`, `notch` and `torn` rather than becoming a second system.
 */
describe('the paper can be cut to a shape', () => {
  const dropsAcross = (hem, notch = 0.1) => {
    const folds = 12, rows = 5;
    const g = waferPanel({ width: 1, height: 1, ripples: folds, segH: rows - 1, hem, notch,
                           ripple: 0, sway: 0, curl: 0, splay: 0, taper: 0, meander: 0,
                           rng: () => 0.5 });
    const p = g.getAttribute('position');
    /* The lowest point of each crease. ⚠️ BOTH creases of the last facet, or the right-hand EDGE of
       the piece is never sampled — the first version of this read only each facet's left crease, so
       it stopped at 11/12 of the way across and reported a symmetric cut as lopsided by 0.497. */
    const drops = [];
    for (let f = 0; f < folds; f++) {
      for (const side of f === folds - 1 ? [0, 1] : [0]) {
        let lo = Infinity;
        const start = (f * 2 + side) * rows;
        for (let i = 0; i < rows; i++) lo = Math.min(lo, p.getY(start + i));
        drops.push(-lo);
      }
    }
    return drops;
  };

  it('cuts a rectangle flat across', () => {
    const d = dropsAcross('straight');
    expect(Math.max(...d) - Math.min(...d)).toBeLessThan(1e-6);
  });

  /* A half-disc reaches furthest down the MIDDLE and falls away to both edges — which a hem cannot
     do, and is what makes the domed cake's pieces read as petals rather than as a fringe. */
  it('cuts a half-disc longest in the middle and shortest at both edges', () => {
    const d = dropsAcross('round');
    const mid = d[Math.floor(d.length / 2)];
    expect(mid).toBeGreaterThan(d[0] * 1.5);
    expect(mid).toBeGreaterThan(d[d.length - 1] * 1.5);
    // Symmetric about the centre, because a cut piece is.
    expect(Math.abs(d[0] - d[d.length - 1])).toBeLessThan(0.08);
  });

  /* ⚠️ `notch` keeps a flat band at the top of a round or petal cut. A true semicircle comes to a
     point at both top corners and has almost nothing left to stick onto the cake with. */
  it('leaves a shoulder to glue, never a point', () => {
    for (const hem of ['round', 'petal']) {
      expect(Math.min(...dropsAcross(hem, 0.25))).toBeGreaterThan(0.2);
    }
  });

  it('makes a petal fuller than a half-disc', () => {
    const r = dropsAcross('round', 0), p = dropsAcross('petal', 0);
    const sum = (a) => a.reduce((s, v) => s + v, 0);
    expect(sum(p)).toBeGreaterThan(sum(r));
  });
});

/* ⚠️ A SKIRT THAT ARRIVES INVISIBLE IS A CONTROL THAT LOOKS BROKEN. The chip applied
 * "White, waved" (#fbf7f2) whatever the cake was, so turning wafer paper on over white buttercream
 * gave off-white sheets against a white wall — all the geometry, none of it legible. Sandeep:
 * *"i can hardly see the wafer paper. totally white and hard to differentiate."* */
describe('waferPresetFor — the skirt arrives in something you can see', () => {
  it('keeps the white preset on a coloured cake — white IS the right default', () => {
    expect(waferPresetFor('#f2a0c0').colour).toBe(WAFER_PRESETS['White, waved'].colour);
    expect(waferPresetFor('#4a2c1b').colour).toBe(WAFER_PRESETS['White, waved'].colour);
    expect(waferPresetFor('#6CB7CE').colour).toBe(WAFER_PRESETS['White, waved'].colour);
  });

  /* ⚠️ THESE TWO USED TO ASSERT THE CORAL PRESET, and they were right to until coral was withheld.
   * The contrast rule still runs — it just cannot reach for a preset a baker is not offered, or the
   * skirt arrives on a look with no chip active and no way back to it. Sandeep: *"pink option has
   * been moved from the popup but default only pink coming. default should be 'white waved'."*
   *
   * ⚠️ AND THE OLD BEHAVIOUR WAS NOT A SOLUTION BEING GIVEN UP. White wafer paper on a white cake
   * was reported once as *"i can hardly see the wafer paper. totally white and hard to
   * differentiate"*, and the step-aside answered it by reaching for the coral preset. But coral is
   * withheld for its SHAPE, not its colour — 2.4 folds, taper 0.02, height 0.80 — so that answer
   * was a skirt that does not read as paper and stops a fifth of the way up the wall. One fault
   * papered over with another. Sandeep, on this: *"the issue is not color, but the pink one is too
   * bad structurally."* If white-on-white needs an answer it needs its own, which is a preset that
   * is good enough to OFFER, or the colour wheel beside the chips. */
  it('stays on white for a white cake, because that is what is offered', () => {
    expect(waferPresetFor('#ffffff').colour).toBe(WAFER_PRESETS['White, waved'].colour);
  });

  it('and on an off-white one, which is what buttercream actually is', () => {
    expect(waferPresetFor('#fbf7f2').colour).toBe(WAFER_PRESETS['White, waved'].colour);
    expect(waferPresetFor('#F6F2E9').colour).toBe(WAFER_PRESETS['White, waved'].colour);
  });

  /* ⚠️ A TIE BROKEN BY NOISE IS NOT CONTRAST. The step-aside used to take the LARGEST gap whether or
     not it cleared the bar, so an off-white cake landed on "White, rippled" over "White, waved" on
     a luminance difference of 0.01 — moving the default off the asked-for look for no visible
     reason. It only steps aside now for a preset that genuinely clears WAFER_MIN_CONTRAST. */
  it('does not swap one white for another over a hair of luminance', () => {
    for (const wall of ['#ffffff', '#fbf7f2', '#fdfbf7', '#F6F2E9', '#faf8f5']) {
      expect(waferPresetFor(wall).colour, `${wall} moved off the preferred look`)
        .toBe(WAFER_PRESETS['White, waved'].colour);
    }
  });

  /* The rule still WORKS where it has something to reach for: a dark cake keeps the white skirt,
     which is the case the contrast check was really protecting. */
  it('keeps white on a cake white can be seen against', () => {
    expect(waferPresetFor('#2e2e2e').colour).toBe(WAFER_PRESETS['White, waved'].colour);
    expect(waferPresetFor('#f2766d').colour).toBe(WAFER_PRESETS['White, waved'].colour);
  });

  /* ⚠️ A WHOLE PRESET, never a colour of its own invention: whatever arrives has to be one of the
     chips below, or none of them shows as active and the baker cannot step back to it in one tap. */
  it('always returns one of the offered presets', () => {
    /* ⚠️ `waferPresetsOffered()`, NOT THE WHOLE TABLE — which is what this used to read, and why it
       stayed green while the skirt was arriving on a withheld preset. A test that accepts anything
       in the table cannot see the difference between offered and hidden. */
    const offered = waferPresetsOffered().map(([, p]) => p.colour);
    for (const cake of ['#ffffff', '#000000', '#f2766d', '#c0d8ff', undefined, null, 'nonsense']) {
      expect(offered).toContain(waferPresetFor(cake).colour);
    }
  });

  it('is a copy, so editing one skirt cannot edit the preset table', () => {
    const a = waferPresetFor('#ffffff');
    a.colour = '#123456';
    expect(WAFER_PRESETS['Pink, notched hem'].colour).toBe('#f2766d');
  });
});

/* ⚠️ THE SCENE IS A NEAR-UNIFORM DOME, so a white skirt in front of a white wall carries almost no
 * shading of its own. Measured against a reference photograph of a real wafer cake: the render's
 * p5–p95 luminance range over the wall was 10.8 where the photograph is 80.1. Making the sheets four
 * times denser moved it to 12.1 — *"still cant see anything. total white."* It was never geometry.
 * `bakeCreaseAO` (creamWall.js) is this repo's existing answer to the same problem on the piped
 * wall; this is that answer for the skirt. */
describe('bakeWaferAO — what darkens a white skirt on a white cake', () => {
  const panel = () => waferPanel({ width: 1, height: 1, ripple: 0.4, ripples: 6, rng: () => 0.5 });

  it('paints a colour attribute the material can read', () => {
    const g = bakeWaferAO(panel(), 0.73);
    const col = g.getAttribute('color');
    expect(col).toBeTruthy();
    expect(col.count).toBe(g.getAttribute('position').count);
    expect(col.itemSize).toBe(3);
  });

  /* The ramp is on the panel's LOCAL z — 0 at the wall, positive outward — so it behaves the same on
     a round tier and a sheet one without knowing which it is on. */
  /* ⚠️ THE STRENGTH IS A DECAY RATE, NOT A SLOPE. These used to pass 0.73 and 0.6, which were
     readable numbers while the shade was `1 - ao*phi`. It is `floor + (1-floor)*exp(-ao*phi)` now,
     so the same figures barely darken anything and the assertions failed on the MAGNITUDE while
     the thing they exist to check — which axis the ramp follows — was still correct. Updated
     rather than loosened: the crest must still be open and the root must still be in shadow. */
  it('darkens what is tucked toward the wall and leaves the outer crest alone', () => {
    const g = bakeWaferAO(panel(), 3);
    const pos = g.getAttribute('position'), col = g.getAttribute('color');
    let maxZ = 0;
    for (let i = 0; i < pos.count; i++) maxZ = Math.max(maxZ, pos.getZ(i));
    let crest = -1, deep = 2;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i), c = col.getX(i);
      if (z > maxZ * 0.98) crest = Math.max(crest, c);
      if (z < maxZ * 0.02) deep = Math.min(deep, c);
    }
    expect(crest).toBeGreaterThan(0.95);   // open to the sky
    expect(deep).toBeLessThan(0.45);       // in the gap
  });

  /* ⚠️ OCCLUSION ATTENUATES LIGHT; IT NEVER EXTINGUISHES IT. A crease between two sheets of white
     paper a millimetre apart is grey, because light bounces into it from both sides — it is not
     black at any exposure. The ramp was `Math.max(0, 1 - ao*phi)`, which with any strength above 1
     clipped the root vertices to PURE BLACK; Sandeep saw it at the rim, where you look straight
     down the gap: *"black think is still there."* No strength may reach zero. */
  /* ⚠️ A GAP IS OPEN AT THE TOP. Depth from the wall is only half of what decides whether light
     reaches a point; the other half is whether the sky can see it, and the bake had no idea how
     high a vertex was. So the crown — the one place a real skirt is BRIGHTEST, because the key
     light falls straight into the open channel — came out as a ring of dark slots. Sandeep:
     *"that black part is still there… thats not how it looks when you really add a wafer paper."* */
  it('leaves the open top of a gap alone, however deep it is', () => {
    const g = bakeWaferAO(panel(), 10);
    const pos = g.getAttribute('position'), col = g.getAttribute('color');
    let yTop = -Infinity, yBot = Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i); if (y > yTop) yTop = y; if (y < yBot) yBot = y;
    }
    let crown = 2, deep = 2;
    for (let i = 0; i < pos.count; i++) {
      const d = (yTop - pos.getY(i)) / (yTop - yBot);
      if (d < 0.01) crown = Math.min(crown, col.getX(i));   // at the rim, whatever its depth
      if (d > 0.90) deep = Math.min(deep, col.getX(i));     // near the hem, roofed over
    }
    expect(crown).toBeGreaterThan(0.95);   // open to the sky
    expect(deep).toBeLessThan(0.5);        // and the shading still happens lower down
  });

  it('never reaches black, however hard the gaps are shaded', () => {
    for (const ao of [1, 4, 10, 40]) {
      const col = bakeWaferAO(panel(), ao).getAttribute('color');
      let min = 1;
      for (let i = 0; i < col.count; i++) min = Math.min(min, col.getX(i));
      expect(min, `ao ${ao}`).toBeGreaterThan(0.1);
    }
  });

  it('is grey — occlusion darkens, it does not tint', () => {
    const g = bakeWaferAO(panel(), 0.73);
    const col = g.getAttribute('color');
    for (let i = 0; i < col.count; i += 37) {
      expect(col.getY(i)).toBeCloseTo(col.getX(i), 6);
      expect(col.getZ(i)).toBeCloseTo(col.getX(i), 6);
    }
  });

  it('never goes below black, however hard it is pushed', () => {
    const col = bakeWaferAO(panel(), 4).getAttribute('color');
    for (let i = 0; i < col.count; i++) expect(col.getX(i)).toBeGreaterThanOrEqual(0);
  });

  it('is a no-op at zero, so the old flat look is still reachable', () => {
    expect(bakeWaferAO(panel(), 0).getAttribute('color')).toBeUndefined();
  });

  it('a built skirt carries it, or the material has nothing to read', () => {
    const g = buildWaferSkirt({ shape: { kind: 'round', radius: 1 }, tierHeight: 1, radius: 1, count: 6 });
    expect(g.getAttribute('color')).toBeTruthy();
  });
});

/* ⚠️ GROUNDWORK, DEFAULT OFF. A skirt's panels are mounted FACE-OUT, so every sheet lies on the
 * wall like printed wrap. Real wafer paper is strips stood on EDGE: Sandeep, after an afternoon I
 * spent shading the wrong shape, *"wafer paper strips are perpendicularly added to the cake
 * surface. your screenshot shows like the strips are flat."* `fin` is that correction. It is not
 * finished — the look is not the reference yet — but the geometry below is settled and tested, and
 * nothing reaches a cake until a preset asks for it. */
describe('fin mode — a strip stood on edge, not laid flat', () => {
  const opts = { shape: { kind: 'round', radius: 1 }, tierHeight: 1, radius: 1, count: 12, jitter: 0 };

  it('is off by default, so no existing cake moves', () => {
    const flat = buildWaferSkirt(opts);
    const fin  = buildWaferSkirt({ ...opts, fin: true });
    expect(flat).toBeTruthy();
    expect(fin).toBeTruthy();
    // a different mounting produces different geometry; the default must be the flat one
    const a = flat.getAttribute('position'), b = fin.getAttribute('position');
    let same = a.count === b.count;
    if (same) for (let i = 0; i < a.count * 3 && same; i++) same = Math.abs(a.array[i] - b.array[i]) < 1e-9;
    expect(same).toBe(false);
  });

  it('builds without NaN, which a bad transform would introduce silently', () => {
    const g = buildWaferSkirt({ ...opts, fin: true, finAngle: 46, width: 3, ripple: 0.2 });
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count * 3; i++) expect(Number.isFinite(p.array[i])).toBe(true);
  });

  /* ⚠️ THE COVERAGE RELATIONSHIP, written down because it is counter-intuitive and cost a render to
     find: a strip's TANGENTIAL extent is `width × gap × sin(finAngle)`, so the fraction of the wall
     it covers is `width × sin(finAngle)` — INDEPENDENT OF COUNT, since the gap shrinks with it.
     Raising `count` alone can never close the gaps between strips; only width or a lower angle can.
     At the control's current max (width 3.2) a 90° mounting covers nothing at all. */
  it('coverage is width x sin(angle), and count cannot change it', () => {
    const cover = (width, deg) => width * Math.sin(deg * Math.PI / 180);
    expect(cover(3.0, 90)).toBeCloseTo(3.0, 6);
    expect(cover(3.0, 46)).toBeCloseTo(2.158, 3);
    expect(cover(1.3, 74)).toBeCloseTo(1.250, 3);
    // the same two strips at twice the count still cover the same fraction of the wall
    const g1 = buildWaferSkirt({ ...opts, fin: true, count: 20, width: 2 });
    const g2 = buildWaferSkirt({ ...opts, fin: true, count: 40, width: 2 });
    expect(g1.getAttribute('position').count * 2).toBe(g2.getAttribute('position').count);
  });

  it('a strip reaches OUT from the wall rather than straddling it', () => {
    const g = buildWaferSkirt({ ...opts, fin: true, finAngle: 90, width: 2, ripple: 0, curl: 0, sway: 0 });
    const p = g.getAttribute('position');
    let minR = Infinity, maxR = -Infinity;
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getZ(i));
      if (r < minR) minR = r; if (r > maxR) maxR = r;
    }
    expect(minR).toBeGreaterThan(0.9);   // nothing buried inside the tier
    expect(maxR).toBeGreaterThan(1.0);   // and it stands proud of it
  });
});

/* ⚠️ THE AO AXIS TURNS WITH THE PANEL, and getting it wrong does not read as bad occlusion — it
 * reads as scorching. Lying flat, "away from the wall" is local Z. Stood on edge, local Z is the
 * WAVE axis and local X is the radius, so the flat ramp paints a gradient ACROSS each strip's face:
 * *"the shadows are so bad that it looks like burnt paper."* */
/* ⚠️ GLUED MEANS TOUCHING, and it only shows from directly above. The transform pins a panel's top
 * EDGE to the wall, but the sheet itself left it there: at the glue line the pleat was already 35%
 * open and `bow` stood the side edges off as well. Looking straight down you saw board between the
 * cake and its own skirt — Sandeep: *"there is a gap between cake and wafer papers. they look
 * separate."* From the side the sheet in front hides it, which is why it survived every render
 * taken at eye level. */
describe('the sheet is stuck ON the cake, not hovering beside it', () => {
  const panelAt = (glue) => waferPanel({ width: 1, height: 1, ripple: 0.4, ripples: 6, curl: 0.3,
                                         splay: 0.1, rng: () => 0.5, glue });
  // +Z is outward from the wall, so z IS the standoff.
  const standoff = (g, a, b) => {
    const p = g.getAttribute('position');
    let yTop = -Infinity, yBot = Infinity;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > yTop) yTop = y; if (y < yBot) yBot = y; }
    let n = 0, sum = 0;
    for (let i = 0; i < p.count; i++) {
      const d = (yTop - p.getY(i)) / (yTop - yBot);
      if (d >= a && d < b) { sum += p.getZ(i); n++; }
    }
    return n ? sum / n : NaN;
  };

  it('touches the wall along the glue line', () => {
    expect(standoff(panelAt(0.10), 0, 0.02)).toBeLessThan(0.01);
  });

  it('and still opens into a pleat below it', () => {
    const g = panelAt(0.10);
    expect(standoff(g, 0.3, 0.5)).toBeGreaterThan(standoff(g, 0, 0.02) + 0.05);
  });

  /* ⚠️ THE GLUE LINE IS THE RIM, NOT THE TOP OF THE PANEL. A panel starts `riseFrac` of its drop
     ABOVE the rim, and that part is stuck to nothing — there is no cake behind it. Pressing it
     flat (which measuring the pinch from the panel's top does) leaves a zero-width vertical sliver
     at exactly the tier's radius, and from directly above that hides under the cake's own top
     edge: the skirt then reads as a ring the cake is sitting IN. Sandeep, after the first glue
     fix: *"there is still some gap from the top view."* So the pinch is a V about the rim. */
  it('splays over the rim instead of hiding under the cake edge', () => {
    const g = waferPanel({ width: 1, height: 1, ripple: 0.4, ripples: 6, curl: 0.3,
                           rng: () => 0.5, glue: 0.10, riseFrac: 0.2 });
    const p = g.getAttribute('position');
    // Panel-local y: 0 at the top, -height at the hem, so the rim sits at -riseFrac × height.
    let yTop = -Infinity, yBot = Infinity;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > yTop) yTop = y; if (y < yBot) yBot = y; }
    const rimY = yTop - 0.2 * (yTop - yBot);
    const reach = (lo, hi) => {
      let n = 0, sum = 0;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        if (y > lo && y <= hi) { sum += p.getZ(i); n++; }
      }
      return n ? sum / n : NaN;
    };
    expect(reach(rimY + 1e-6, yTop)).toBeGreaterThan(reach(rimY - 0.02, rimY + 0.02));
  });

  it('glue 0 is the old behaviour — the pleat opens at the glue line', () => {
    expect(standoff(panelAt(0), 0, 0.02)).toBeGreaterThan(standoff(panelAt(0.10), 0, 0.02));
  });
});

describe('bakeWaferAO follows the mounting', () => {
  const panel = () => waferPanel({ width: 1, height: 1, ripple: 0.4, ripples: 6, rng: () => 0.5, fin: true });

  it('a fin darkens by RADIUS (local x), not by its wave', () => {
    const g = bakeWaferAO(panel(), 3, true);
    const pos = g.getAttribute('position'), col = g.getAttribute('color');
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); if (x < lo) lo = x; if (x > hi) hi = x; }
    let atWall = 2, atFree = -1;
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getX(i) - lo) / (hi - lo), c = col.getX(i);
      if (t < 0.02) atWall = Math.min(atWall, c);
      if (t > 0.98) atFree = Math.max(atFree, c);
    }
    expect(atFree).toBeGreaterThan(0.95);   // the open edge is lit
    expect(atWall).toBeLessThan(0.6);       // the root is in the gap
  });

  /* The two modes must disagree, or the axis is not being honoured at all. */
  it('flat and fin shade the same geometry differently', () => {
    const a = bakeWaferAO(panel(), 3, false).getAttribute('color');
    const b = bakeWaferAO(panel(), 3, true).getAttribute('color');
    let same = true;
    for (let i = 0; i < a.count && same; i++) same = Math.abs(a.getX(i) - b.getX(i)) < 1e-9;
    expect(same).toBe(false);
  });
});

/* ⚠️ THE SHADING FOLLOWS THE MOUNTING, and getting this wrong is what "burnt paper" was. 0.86 was
 * calibrated against the reference photograph with every sheet lying FLAT, where a neighbour
 * overlaps you by two whole widths. A fin's occluder is the thin gap at its root, so the same ramp
 * darkens paper that nothing is shading. Not a per-look number, which is why it is NOT in the
 * presets — and an explicit value still has to win, or no sweep can ever measure it. */
describe('ao is a property of how the paper is stuck on', () => {
  const build = (opts) => buildWaferSkirt({
    shape: { kind: 'round', radius: 1 }, tierHeight: 1, radius: 1,
    count: 12, width: 1.4, jitter: 0, seed: 3, ...opts,
  });
  // The darkest vertex colour the bake produced: a deeper ramp reaches a darker floor.
  const floor = (geo) => {
    const c = geo.attributes.color;
    let min = 1;
    for (let i = 0; i < c.count; i++) min = Math.min(min, c.getX(i));
    return min;
  };

  it('a fin is shaded less than a flat sheet, with nothing said either way', () => {
    expect(floor(build({ fin: true }))).toBeGreaterThan(floor(build({ fin: false })));
  });

  it('an explicit ao wins over the mounting default', () => {
    expect(floor(build({ fin: true, ao: WAFER_DEFAULTS.ao })))
      .toBeCloseTo(floor(build({ fin: false, ao: WAFER_DEFAULTS.ao })), 5);
  });

  /* At 0 the bake does not write a colour attribute at all, which is the real "off": a mesh with
     no vertex colours is lit by the scene alone. Asserting the attribute's ABSENCE rather than a
     floor of 1, because an all-white attribute would also pass that and would still cost memory on
     every panel of every skirt. */
  it('ao: 0 writes no vertex colours at all, on either mounting', () => {
    expect(build({ fin: true,  ao: 0 }).attributes.color).toBeUndefined();
    expect(build({ fin: false, ao: 0 }).attributes.color).toBeUndefined();
  });
});
