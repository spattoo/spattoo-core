import { describe, it, expect } from 'vitest';
import { rosetteSpiral, rosetteSeats, rosetteCoatPaths, ROSETTE_DEFAULTS } from './rosetteCoat.js';

/* Sandeep: "cream piping is filled on entire cake. we need to achieve this."
 *
 * ⚠️ WHAT IS WORTH TESTING HERE IS COVERAGE AND SEATING, NOT BEAUTY. Whether a rose READS as a rose
 * is a judgement to make by looking at the studio, and no assertion can stand in for that. What a
 * test can hold is the part that is silently wrong in a render: a gap in the packing, a rose buried
 * in the cake, a wall rose pointing up instead of out. */

const R = 1.2, H = 1.45, BASE = 0.1;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('rosetteSpiral', () => {
  it('starts near the middle and finishes at the rim, rope included', () => {
    const s = rosetteSpiral({ radius: 0.26, ropeRadius: 0.055 });
    const rAt = p => Math.hypot(p[0], p[1]);
    expect(rAt(s[0])).toBeLessThan(0.26 * 0.3);
    /* The rope's OUTER edge should land on the asked-for radius, so the centreline stops one rope
       radius short. A rose that spirals all the way to `radius` is a rope radius too wide, and on a
       packed cake that is the difference between interlocking and colliding. */
    expect(rAt(s.at(-1))).toBeCloseTo(0.26 - 0.055, 2);
  });

  it('domes: the centre is lifted and the rim is not', () => {
    const s = rosetteSpiral({ radius: 0.26, peak: 0.5 });
    expect(s[0][2]).toBeCloseTo(0.5 * 0.26, 5);
    expect(s.at(-1)[2]).toBeCloseTo(0, 5);
    // Monotonic — a bump halfway out would read as a crater.
    for (let i = 1; i < s.length; i++) expect(s[i][2]).toBeLessThanOrEqual(s[i - 1][2] + 1e-9);
  });

  /* ⚠️ The reason the old pen rosette was dropped was that it read as coiled rope. Overlap is the
     knob that hides the spiral, so it has to actually change the turn count. */
  it('a fatter rope means fewer turns; more overlap means more', () => {
    const turnsOf = o => {
      const s = rosetteSpiral({ radius: 0.26, ropeRadius: 0.055, coilOverlap: 0, ...o });
      let wound = 0;
      for (let i = 1; i < s.length; i++) {
        const a0 = Math.atan2(s[i - 1][1], s[i - 1][0]), a1 = Math.atan2(s[i][1], s[i][0]);
        let d = a1 - a0;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        wound += d;
      }
      return Math.abs(wound) / (2 * Math.PI);
    };
    expect(turnsOf({ ropeRadius: 0.09 })).toBeLessThan(turnsOf({ ropeRadius: 0.04 }));
    expect(turnsOf({ coilOverlap: 0.6 })).toBeGreaterThan(turnsOf({ coilOverlap: 0 }));
  });

  it('never returns fewer points than can sweep', () => {
    for (const radius of [0.05, 0.26, 0.9]) {
      expect(rosetteSpiral({ radius }).length).toBeGreaterThanOrEqual(9);
    }
  });
});

describe('rosetteSeats', () => {
  const seats = (o = {}) => rosetteSeats({ tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0, ...o });

  it('covers the top out to the rim, and a little past it', () => {
    const top = seats({ coverSide: false });
    const radii = top.map(s => Math.hypot(s.p[0], s.p[2]));
    expect(Math.min(...radii)).toBe(0);                       // one in the middle
    expect(Math.max(...radii)).toBeGreaterThan(R * 0.85);     // and out to the edge
    /* Overhanging the rim is deliberate — it is what closes the seam against the wall. */
    expect(Math.max(...radii)).toBeLessThan(R + ROSETTE_DEFAULTS.rosetteRadius);
    expect(top.every(s => Math.abs(s.p[1] - (BASE + H)) < 1e-9)).toBe(true);
  });

  /* ⚠️ THE GAP TEST. A bald patch is the whole failure mode of this feature and it is invisible in
     a unit test unless something actually measures it. Every point on the top surface must be
     within a rosette radius of SOME seat, or the cake shows through. */
  it('leaves no bald patch on the top', () => {
    const top = seats({ coverSide: false });
    let worst = 0;
    for (let i = 0; i < 400; i++) {
      // Sample the disc uniformly: sqrt keeps the points from bunching in the middle.
      const a = (i * 2.399963) % (2 * Math.PI), rr = Math.sqrt(((i + 0.5) / 400)) * R;
      const q = [Math.cos(a) * rr, BASE + H, Math.sin(a) * rr];
      worst = Math.max(worst, Math.min(...top.map(s => dist(s.p, q))));
    }
    expect(worst).toBeLessThan(ROSETTE_DEFAULTS.rosetteRadius);
  });

  /* The same failure, on the surface that is actually facing the customer. A wall is unrolled into
     a band, so "within a radius of a seat" is measured on the cylinder rather than in a plane. */
  it('leaves no bald patch on the side', () => {
    const side = seats({ coverTop: false });
    const lo = Math.min(...side.map(s => s.p[1])), hi = Math.max(...side.map(s => s.p[1]));
    let worst = 0;
    for (let i = 0; i < 600; i++) {
      const a = (i * 2.399963) % (2 * Math.PI);
      const y = lo + ((i + 0.5) / 600) * (hi - lo);
      const q = [Math.cos(a) * R, y, Math.sin(a) * R];
      worst = Math.max(worst, Math.min(...side.map(s => dist(s.p, q))));
    }
    expect(worst).toBeLessThan(ROSETTE_DEFAULTS.rosetteRadius);
  });

  it('wraps the side in staggered rows, every row a whole number of roses', () => {
    const side = seats({ coverTop: false });
    expect(side.length).toBeGreaterThan(20);
    for (const s of side) {
      expect(Math.hypot(s.p[0], s.p[2])).toBeCloseTo(R, 6);   // on the wall, not inside it
      expect(s.p[1]).toBeGreaterThan(BASE);
      expect(s.p[1]).toBeLessThan(BASE + H);
    }
    // Rows are staggered: consecutive rows must not share the same set of angles.
    const byRow = new Map();
    for (const s of side) {
      const k = s.p[1].toFixed(4);
      (byRow.get(k) ?? byRow.set(k, []).get(k)).push(Math.atan2(s.p[2], s.p[0]));
    }
    const rows = [...byRow.values()];
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0][0]).not.toBeCloseTo(rows[1][0], 4);
  });

  /* ⚠️ A WALL ROSE FACES OUT. If `n` came back as world-up on the side, every rose would lie flat
     against the cake and sink into it — and the bug is invisible from the front of a render. */
  it('gives a wall rose an outward normal and a frame that follows the wall', () => {
    for (const s of seats({ coverTop: false })) {
      expect(s.n[1]).toBeCloseTo(0, 9);
      const radial = [s.p[0] / R, 0, s.p[2] / R];
      expect(s.n[0] * radial[0] + s.n[2] * radial[2]).toBeCloseTo(1, 6);
      // u (around) and v (up) are unit, perpendicular to each other and to the normal.
      expect(Math.hypot(...s.u)).toBeCloseTo(1, 6);
      expect(s.v).toEqual([0, 1, 0]);
      expect(s.u[0] * s.n[0] + s.u[1] * s.n[1] + s.u[2] * s.n[2]).toBeCloseTo(0, 6);
    }
  });

  it('honours the two coverage switches', () => {
    expect(seats({ coverTop: false, coverSide: false })).toEqual([]);
    expect(seats({ coverSide: false }).every(s => s.kind === 'top')).toBe(true);
    expect(seats({ coverTop: false }).every(s => s.kind === 'side')).toBe(true);
  });

  it('is deterministic for a seed, and jitter actually moves things', () => {
    const a = rosetteSeats({ seed: 5, jitter: 0.4 });
    const b = rosetteSeats({ seed: 5, jitter: 0.4 });
    const c = rosetteSeats({ seed: 6, jitter: 0.4 });
    expect(a.map(s => s.p)).toEqual(b.map(s => s.p));
    expect(a.map(s => s.p)).not.toEqual(c.map(s => s.p));
  });
});

describe('rosetteCoatPaths', () => {
  it('returns one seated polyline per seat', () => {
    const { paths, seats } = rosetteCoatPaths({ tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0 });
    expect(paths).toHaveLength(seats.length);
    expect(paths.every(p => p.length >= 9 && p.every(q => q.length === 3))).toBe(true);
  });

  /* ⚠️ SEATED MEANS CLEAR OF THE CAKE. buildPipingStroke's contract is that the points it gets are
     already offset along the normal by the rope radius — if this module returned raw surface
     points, every rose would be half-buried and the cake would look dipped rather than piped. */
  it('lifts every point clear of the surface it sits on', () => {
    const o = { tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0, ropeRadius: 0.055 };
    const { paths, seats } = rosetteCoatPaths(o);
    paths.forEach((path, i) => {
      const s = seats[i];
      for (const q of path) {
        const along = (q[0] - s.p[0]) * s.n[0] + (q[1] - s.p[1]) * s.n[1] + (q[2] - s.p[2]) * s.n[2];
        expect(along).toBeGreaterThanOrEqual(0.055 - 1e-9);
      }
    });
  });

  it('keeps a top rose flat and a wall rose vertical', () => {
    const { paths, seats } = rosetteCoatPaths({ tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0, peak: 0 });
    const top = paths[seats.findIndex(s => s.kind === 'top')];
    const ys = top.map(p => p[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1e-6);   // peak 0 ⇒ a flat disc

    const wi = seats.findIndex(s => s.kind === 'side');
    const wall = paths[wi];
    // A wall rose spans height, which a flat-on-the-top one cannot.
    expect(Math.max(...wall.map(p => p[1])) - Math.min(...wall.map(p => p[1]))).toBeGreaterThan(0.1);
  });

  it('scales with the tier rather than assuming the default cake', () => {
    const small = rosetteCoatPaths({ tierRadius: 0.6, tierHeight: 0.9, jitter: 0 });
    const big   = rosetteCoatPaths({ tierRadius: 2.4, tierHeight: 2.0, jitter: 0 });
    expect(big.paths.length).toBeGreaterThan(small.paths.length * 2);
  });
});
