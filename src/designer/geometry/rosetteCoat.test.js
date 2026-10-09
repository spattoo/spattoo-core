import { describe, it, expect } from 'vitest';
import { rosetteSpiral, rosetteSeats, rosetteCoatPaths, ROSETTE_DEFAULTS, SEAT_OVERLAP } from './rosetteCoat.js';
import { topContains } from './surface.js';

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

  it('covers the lid out to the edge', () => {
    /* ⚠️ NO LONGER ASSERTS RINGS. The lid is a hex grid clipped to the outline plus a walk of the
       edge, because concentric rings are a circle's answer and a heart has no centre to ring
       about. What matters is reach and coverage, not the lattice that achieves it. */
    const top = seats({ coverSide: false }).filter(s => s.kind === 'top');
    const radii = top.map(s => Math.hypot(s.p[0], s.p[2]));
    expect(Math.min(...radii)).toBeLessThan(ROSETTE_DEFAULTS.rosetteRadius);   // something near the middle
    expect(Math.max(...radii)).toBeGreaterThan(R * 0.95);                      // and out to the edge
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

  /* ── The arithmetic that was missing ─────────────────────────────────────────────────────────
   *
   * Sandeep: "are we not doing it by the calculation involving height of the cake, and the height
   * of rosette?" We were not — rows were inset by a fraction of a nominal RADIUS, so the bottom
   * row sat at 0.55·r when a piece resting on a board needs its centre at half its own HEIGHT.
   * It rendered as pieces hanging through the board. */
  it('stands the bottom row ON the board, not through it', () => {
    for (const pieceH of [0.3, 0.52, 0.9]) {
      const side = rosetteSeats({ tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0,
                                  pieceW: 0.5, pieceH, rimRow: false });
      const lowest = Math.min(...side.filter(s => s.kind === 'side').map(s => s.p[1]));
      expect(lowest - pieceH / 2).toBeCloseTo(BASE, 6);      // its underside rests exactly on the board
    }
  });

  it('keeps the top row under the lid', () => {
    const pieceH = 0.52;
    const side = rosetteSeats({ tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0,
                                pieceW: 0.5, pieceH, rimRow: false }).filter(s => s.kind === 'side');
    expect(Math.max(...side.map(s => s.p[1])) + pieceH / 2).toBeCloseTo(BASE + H, 6);
  });

  /* ── The shoulder ────────────────────────────────────────────────────────────────────────────
   * Sandeep, with the reference photo: "rim was covered completely by cream piping." A 90° edge
   * has nothing tangent to it, so top and side pieces both miss it however they are packed. */
  it('puts a row across the corner, facing the bisector', () => {
    const rim = rosetteSeats({ tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0,
                               pieceW: 0.5, pieceH: 0.5 }).filter(s => s.kind === 'rim');
    expect(rim.length).toBeGreaterThan(8);
    const k = Math.SQRT1_2;
    for (const s of rim) {
      expect(Math.hypot(s.p[0], s.p[2])).toBeCloseTo(R, 6);     // on the rim circle
      expect(s.p[1]).toBeCloseTo(BASE + H, 6);                  // at the lid's height
      expect(s.n[1]).toBeCloseTo(k, 6);                         // 45° up…
      expect(Math.hypot(s.n[0], s.n[2])).toBeCloseTo(k, 6);     // …and 45° out
      expect(Math.hypot(...s.n)).toBeCloseTo(1, 6);
      // The frame must be orthonormal or the piece shears.
      expect(s.u[0] * s.n[0] + s.u[1] * s.n[1] + s.u[2] * s.n[2]).toBeCloseTo(0, 6);
      expect(s.v[0] * s.n[0] + s.v[1] * s.n[1] + s.v[2] * s.n[2]).toBeCloseTo(0, 6);
      expect(s.u[0] * s.v[0] + s.u[1] * s.v[1] + s.u[2] * s.v[2]).toBeCloseTo(0, 6);
      expect(Math.hypot(...s.v)).toBeCloseTo(1, 6);
    }
  });

  /* ⚠️ THE SHOULDER OVERLAYS, IT DOES NOT DISPLACE. Making the two faces retreat to leave it a
     strip put three surfaces against two seams, both of which had to be exact — and narrowing one
     widens the other. Both faces now cover themselves fully and the rim is a third layer on the
     join, which is also how it is piped. */
  it('does not pull the top or the side back — it covers the join on top of them', () => {
    const o = { tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0, pieceW: 0.5, pieceH: 0.5 };
    const withRim = rosetteSeats(o), without = rosetteSeats({ ...o, rimRow: false });
    const outer = l => Math.max(...l.filter(s => s.kind === 'top').map(s => Math.hypot(s.p[0], s.p[2])));
    const highest = l => Math.max(...l.filter(s => s.kind === 'side').map(s => s.p[1]));
    /* The WALL is identical either way — the shoulder takes nothing from it. The lid differs for
       a different reason: with no shoulder it must overhang the rim to close the seam itself, and
       with one it stops at the edge and lets the shoulder cover past it. Neither is a retreat. */
    expect(highest(withRim)).toBeCloseTo(highest(without), 6);
    expect(outer(withRim)).toBeCloseTo(R, 6);
    expect(outer(without)).toBeGreaterThan(R);
    expect(withRim.filter(s => s.kind === 'rim').length).toBeGreaterThan(8);
  });

  it('covers the wall to the lid whether or not there is a shoulder', () => {
    const P = 0.5;
    for (const rimRow of [true, false]) {
      const all = rosetteSeats({ tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0,
                                 pieceW: P, pieceH: P, rimRow });
      const highest = Math.max(...all.filter(s => s.kind === 'side').map(s => s.p[1]));
      expect(highest + P / 2).toBeCloseTo(BASE + H, 6);
      const outer = Math.max(...all.filter(s => s.kind === 'top').map(s => Math.hypot(s.p[0], s.p[2])));
      expect(outer).toBeGreaterThanOrEqual(R - 1e-9);        // out to the rim, at least
    }
  });

  /* ⚠️ The rim loop needs BOTH faces; its two set-backs must agree with it or the top is pulled
     away from the rim for a row that never gets built. That was a real bug. */
  it('does not pull a face back when no rim row will be built', () => {
    const topOnly = rosetteSeats({ tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0,
                                   pieceW: 0.5, pieceH: 0.5, coverSide: false });
    expect(topOnly.some(s => s.kind === 'rim')).toBe(false);
    expect(Math.max(...topOnly.map(s => Math.hypot(s.p[0], s.p[2])))).toBeGreaterThan(R * 0.85);
  });

  /* ⚠️ As tall as the wall. Ceiling the count means anything shorter gets two overlapping rows,
     which is correct and is the point of the ceil; and now the shoulder takes nothing off the top,
     the usable span only collapses when the piece is the full height. */
  it('a single row rests on the board rather than floating in the middle', () => {
    const pieceH = H;
    const side = rosetteSeats({ tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0,
                                pieceW: 0.4, pieceH }).filter(s => s.kind === 'side');
    expect(new Set(side.map(s => s.p[1].toFixed(5))).size).toBe(1);
    expect(side[0].p[1] - pieceH / 2).toBeCloseTo(BASE, 6);
  });

  /* ⚠️ A GLB IS SCALED ON ITS WIDEST HORIZONTAL EXTENT, so a piece wider than it is tall is
     SHORTER than 2r — and every row count built on r is then wrong. The two axes are independent. */
  it('counts rows from the piece height and columns from the piece width', () => {
    const rowsFor = pieceH => new Set(
      rosetteSeats({ tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0, pieceW: 0.5, pieceH })
        .filter(s => s.kind === 'side').map(s => s.p[1].toFixed(5))).size;
    expect(rowsFor(0.25)).toBeGreaterThan(rowsFor(0.5));

    const colsFor = pieceW => rosetteSeats({ tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0,
                                             pieceW, pieceH: 0.5 })
      .filter(s => s.kind === 'side' && s.p[1].toFixed(5) === rosetteSeats({
        tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0, pieceW, pieceH: 0.5 })
        .filter(x => x.kind === 'side')[0].p[1].toFixed(5)).length;
    expect(colsFor(0.3)).toBeGreaterThan(colsFor(0.6));
  });

  it('a piece as tall as the wall gets exactly one row', () => {
    const side = rosetteSeats({ tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0,
                                pieceW: 0.4, pieceH: H, rimRow: false }).filter(s => s.kind === 'side');
    expect(new Set(side.map(s => s.p[1].toFixed(5))).size).toBe(1);
  });

  it('falls back to the radius when no piece size is given', () => {
    const r = 0.26;
    const byRadius = rosetteSeats({ tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0, rosetteRadius: r });
    const byPiece  = rosetteSeats({ tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0,
                                    pieceW: r * 2, pieceH: r * 2 });
    expect(byRadius.map(s => s.p)).toEqual(byPiece.map(s => s.p));
  });

  /* ⚠️ THE PITCH MUST NEVER EXCEED THE SPACING THE COVERAGE WAS CALCULATED FOR. Rounding a count
     picks the nearest whole number, which half the time stretches the pitch — and that rendered as
     bare rings of cake between every row. Overlapping more than intended is invisible; a gap is
     not, so the error may only ever go one way. */
  it('never spaces rows or columns wider than asked', () => {
    for (const [pieceW, pieceH] of [[0.5, 0.5], [0.37, 0.41], [0.22, 0.63], [0.6, 0.29]]) {
      const all = rosetteSeats({ tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0,
                                 pieceW, pieceH, rimRow: false });
      const stepW = pieceW * (1 - SEAT_OVERLAP), stepH = pieceH * (1 - SEAT_OVERLAP);

      const ys = [...new Set(all.filter(s => s.kind === 'side').map(s => s.p[1]))].sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) {
        expect(ys[i] - ys[i - 1]).toBeLessThanOrEqual(stepH + 1e-9);
      }

      const row = all.filter(s => s.kind === 'side' && Math.abs(s.p[1] - ys[0]) < 1e-9);
      const chord = 2 * R * Math.sin(Math.PI / row.length);   // centre-to-centre around the wall
      expect(chord).toBeLessThanOrEqual(stepW + 1e-9);
    }
  });

  /* Sandeep, on a GLB that left a band under the rim: "can we bend the rim glb till it touches
     the below / or covers the gap?" Stretched rather than bent, and the amount is computed from
     where its two neighbours actually reach rather than dialled in. */
  describe('the shoulder stretches to meet its neighbours', () => {
    const rimOf = o => rosetteSeats({ tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0,
                                      pieceW: 0.5, pieceH: 0.5, ...o }).filter(s => s.kind === 'rim');

    it('reaches at least as far as the top of the highest side piece', () => {
      const topY = BASE + H, k = Math.SQRT1_2;
      for (const P of [0.3, 0.5, 0.75]) {
        const all = rosetteSeats({ tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0,
                                   pieceW: P, pieceH: P });
        const sideTop = Math.max(...all.filter(s => s.kind === 'side').map(s => s.p[1])) + P / 2;
        const rim = all.find(s => s.kind === 'rim');
        const reach = topY - (P / 2) * k * rim.stretch;
        expect(reach).toBeLessThanOrEqual(sideTop + 1e-9);   // overlaps, never falls short
      }
    });

    it('never shrinks a piece, and never smears one', () => {
      for (const P of [0.15, 0.3, 0.5, 0.9]) {
        const st = rimOf({ pieceW: P, pieceH: P })[0].stretch;
        expect(st).toBeGreaterThanOrEqual(1);
        expect(st).toBeLessThanOrEqual(1.5);
      }
    });

    it('carries 1 on every other seat, so a caller need not branch on kind', () => {
      const all = rosetteSeats({ tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0,
                                 pieceW: 0.5, pieceH: 0.5 });
      expect(all.filter(s => s.kind !== 'rim').every(s => s.stretch === 1)).toBe(true);
      expect(all.every(s => typeof s.stretch === 'number')).toBe(true);
    });
  });

  /* ⚠️ The fault this replaces: the lid's last ring could sit a full step inside the edge, a bare
     annulus a top-down render showed as a clean pink ring. A grid clips just as raggedly, so the
     edge is now WALKED as well — which is also what makes a heart's notch come out covered. */
  it('walks the lid edge so the boundary is never left ragged', () => {
    for (const pieceW of [0.22, 0.31, 0.44]) {
      const top = rosetteSeats({ tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0,
                                 pieceW, pieceH: pieceW, coverSide: false })
        .filter(s => s.kind === 'top');
      // No point on the rim is further than half a piece from some lid seat.
      let worst = 0;
      for (let i = 0; i < 180; i++) {
        const a = (i / 180) * Math.PI * 2;
        const q = [Math.cos(a) * R, BASE + H, Math.sin(a) * R];
        worst = Math.max(worst, Math.min(...top.map(s => dist(s.p, q))));
      }
      expect(worst).toBeLessThan(pieceW / 2);
    }
  });

  /* ── Shapes that are not circles ──────────────────────────────────────────────────────────────
   *
   * Sandeep: "lets target heart and rectangular shapes now. ideally it this support al the shapes
   * we have." Nothing here knows what a heart IS — `perimeter` walks any outline by arc length and
   * `topContains` clips the lid, both of which core already had for the piping ring. */
  describe('any footprint', () => {
    const RECT = { kind: 'rect', halfW: 1.1, halfD: 0.8, cornerR: 0.14 };
    /* A heart as a closed outline, the shape `outlineOf('heart')` produces — normalised to [-1,1]². */
    const HEART = {
      outline: Array.from({ length: 72 }, (_, i) => {
        const t = (i / 72) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const z = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        return { x: (x / 16) * 1.1, z: (z / 17) * 1.1 };
      }),
    };

    for (const [name, shape] of [['rect', RECT], ['heart', HEART]]) {
      it(`${name}: seats sit ON the wall, not on a phantom circle`, () => {
        const side = rosetteSeats({ shape, tierHeight: H, baseY: BASE, jitter: 0,
                                    pieceW: 0.3, pieceH: 0.3 }).filter(s => s.kind === 'side');
        expect(side.length).toBeGreaterThan(20);
        /* ⚠️ The failure this guards is the one `isRoundWall` was introduced for elsewhere: a
           non-round shape falling into the circle branch and seating on a bounding radius out in
           front of the wall. Every seat must lie on the outline itself. */
        const radii = side.map(s => Math.hypot(s.p[0], s.p[2]));
        expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.05);  // NOT constant ⇒ not a circle
        for (const s of side) {
          expect(Math.hypot(s.n[0], s.n[2])).toBeCloseTo(1, 6);   // unit outward normal
          expect(s.n[1]).toBeCloseTo(0, 9);
          // the frame stays orthonormal all the way round, corners and notch included
          expect(s.u[0] * s.n[0] + s.u[2] * s.n[2]).toBeCloseTo(0, 6);
        }
      });

      it(`${name}: the lid is covered and nothing is seated outside it`, () => {
        const all = rosetteSeats({ shape, tierHeight: H, baseY: BASE, jitter: 0,
                                   pieceW: 0.3, pieceH: 0.3 });
        const top = all.filter(s => s.kind === 'top');
        expect(top.length).toBeGreaterThan(20);
        /* Grid seats are inside by construction; the edge walk is inset a quarter piece, so
           nothing should sit more than that outside the outline. */
        for (const s of top) {
          expect(topContains(shape, s.p[0], s.p[2], 1.25)).toBe(true);
        }
      });

      it(`${name}: gets a shoulder all the way round, facing the bisector`, () => {
        const rim = rosetteSeats({ shape, tierHeight: H, baseY: BASE, jitter: 0,
                                   pieceW: 0.3, pieceH: 0.3 }).filter(s => s.kind === 'rim');
        expect(rim.length).toBeGreaterThan(10);
        const k = Math.SQRT1_2;
        for (const s of rim) {
          expect(s.n[1]).toBeCloseTo(k, 6);                        // 45° up
          expect(Math.hypot(s.n[0], s.n[2])).toBeCloseTo(k, 6);    // 45° out, along the real normal
          expect(s.p[1]).toBeCloseTo(BASE + H, 6);
        }
      });
    }

    it('a rect walks its corners at the same spacing as its straights', () => {
      const side = rosetteSeats({ shape: RECT, tierHeight: H, baseY: BASE, jitter: 0,
                                  pieceW: 0.3, pieceH: 0.3 }).filter(s => s.kind === 'side');
      const row = side.filter(s => Math.abs(s.p[1] - side[0].p[1]) < 1e-9);
      const gaps = row.map((s, i) => {
        const n = row[(i + 1) % row.length];
        return Math.hypot(s.p[0] - n.p[0], s.p[2] - n.p[2]);
      }).slice(0, -1);        // the wrap-around pair is not a step
      const step = 0.3 * (1 - SEAT_OVERLAP);
      for (const g of gaps) expect(g).toBeLessThanOrEqual(step + 1e-6);
    });
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
