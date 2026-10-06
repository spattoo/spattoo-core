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
    for (const o of [{ splay: 2 }, { curl: 2 }, { ripple: 2 }, { taper: 0.9 }, { ripples: 9 }, { sway: 2 }]) {
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
  it('tears per column, so a column stays a straight line', () => {
    // Every shaping term off: this is a claim about the HEM alone, and `drift` legitimately moves a
    // column sideways as it falls, which would mask it.
    const g = waferPanel({ width: 0.3, height: 1, hem: 'torn', notch: 0.4, segW: 4, segH: 4,
                           ripple: 0, sway: 0, curl: 0, splay: 0, taper: 0, rng: () => 0.5 });
    const p = g.getAttribute('position');
    const cols = 5, rows = 5;
    for (let i = 0; i < cols; i++) {
      const xs = [];
      for (let j = 0; j < rows; j++) xs.push(p.getX(j * cols + i));
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1e-6);
    }
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

  /* `jitter` is the handmade-ness knob, so its two ends have to mean what they say. Measured per
     PANEL rather than over the whole skirt: y is untouched by the yaw that stands each panel on the
     wall, so each panel's own drop is directly comparable, while a single bbox over the merged mesh
     would report the deepest panel and say nothing about the rest.

     ⚠️ Not asserted against WAFER_DEFAULTS.height, which was this test's first and wrong form. The
     drop is `rise − height·cos(lean) + splay·height·sin(lean)`: the panel starts above the rim and
     the lean both shortens the fall and swings the hem out. Expecting the bare height failed by
     0.108 and the geometry was right — the assertion had simply never been worked through. */
  it('makes every panel identical at jitter 0, and different above it', () => {
    const perPanel = (jitter) => {
      const count = 8;
      /* ⚠️ `lean: 0`, and the reason is the interesting half of this test. Each panel gets its own
         fold PHASE whatever the jitter — without that every panel's pleats line up and the cake
         reads as stamped — and a leaning panel rotates its fold depth (Z) partly into height (Y).
         So with the default lean the drops differ by ~0.003 at jitter 0, which is the phase showing
         through, not the jitter. Zeroing the lean isolates the claim being made. */
      const g = buildWaferSkirt({ shape: round, tierHeight: 1, jitter, count, seed: 2, lean: 0 });
      const p = g.getAttribute('position');
      const per = p.count / count;
      return Array.from({ length: count }, (_, k) => {
        let lo = Infinity;
        for (let i = k * per; i < (k + 1) * per; i++) lo = Math.min(lo, p.getY(i));
        return lo;
      });
    };
    const same = perPanel(0);
    expect(Math.max(...same) - Math.min(...same)).toBeLessThan(1e-6);
    const varied = perPanel(0.5);
    expect(Math.max(...varied) - Math.min(...varied)).toBeGreaterThan(0.05);
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
  it('varies depth ACROSS the width at a fixed height', () => {
    const g = waferPanel({ width: 1, height: 1, ripple: 0.4, ripples: 3, sway: 0, curl: 0,
                           splay: 0, taper: 0, segW: 24, segH: 6 });
    const p = g.getAttribute('position');
    const cols = 25;
    const row = [];                                    // one row, halfway down
    for (let i = 0; i < cols; i++) row.push(p.getZ(3 * cols + i));
    expect(Math.max(...row) - Math.min(...row)).toBeGreaterThan(0.15);
  });

  /* And the same fold stays put as the panel falls — a pleat is a line, not a travelling wave.
     Allowing for `open`, which lets the pleat deepen toward the hem, the SIGN must not flip. */
  it('keeps a fold on the same side of the panel all the way down', () => {
    const g = waferPanel({ width: 1, height: 1, ripple: 0.4, ripples: 2, sway: 0, curl: 0,
                           splay: 0, taper: 0, phase: 0.8, segW: 16, segH: 12 });
    const p = g.getAttribute('position');
    const cols = 17, rows = 13;
    for (let i = 0; i < cols; i++) {
      const signs = new Set();
      for (let j = 1; j < rows; j++) {                  // skip the pinned row, where open is small
        const z = p.getZ(j * cols + i);
        if (Math.abs(z) > 1e-3) signs.add(Math.sign(z));
      }
      expect(signs.size).toBeLessThanOrEqual(1);
    }
  });
});
