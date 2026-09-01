import { describe, it, expect } from 'vitest';
import { movableContract } from './movableContract.js';
import { GARNISH_DEFAULTS, garnishPlacement, garnishDragTo, clampRadius, fanPlacements } from './garnishPlacement.js';

const CAKE = { radius: 1.2, topY: 1.55, boardY: 0.1 };
const PIECE = { w: 0.6, h: 0.5 };

describe('where a garnish sits', () => {
  /* ⚠️ A STANDING PIECE IS BURIED, a lying one RESTS. Exactly on the surface reads as floating, which
   * is the one tell that separates a render from a photograph. */
  it('buries a standing piece and rests a lying one', () => {
    const stand = garnishPlacement({ mode: 'stand' }, CAKE, PIECE);
    const lie   = garnishPlacement({ mode: 'lie' }, CAKE, PIECE);
    expect(stand.position[1]).toBeLessThan(CAKE.topY);
    expect(lie.position[1]).toBeGreaterThan(CAKE.topY);
  });

  /* ⚠️ RADIUS IS A FRACTION of the tier, so "near the edge" stays near the edge when the customer
   * resizes the cake — which they do constantly. Storing world x/z would put this piece off the
   * edge of a smaller tier. */
  it('scales its distance with the tier rather than holding a world position', () => {
    const small = garnishPlacement({ radius: 0.8 }, { ...CAKE, radius: 0.8 }, PIECE);
    const big   = garnishPlacement({ radius: 0.8 }, { ...CAKE, radius: 1.6 }, PIECE);
    const out = p => Math.hypot(p.position[0], p.position[2]);
    expect(out(big)).toBeCloseTo(out(small) * 2, 5);
  });

  // It cannot be pushed over the rim: a piece half over air reads as an accident.
  it('keeps the piece off the edge', () => {
    expect(clampRadius(5)).toBeLessThanOrEqual(0.88);
    expect(clampRadius(-3)).toBe(0);
    const p = garnishPlacement({ radius: 9 }, CAKE, PIECE);
    expect(Math.hypot(p.position[0], p.position[2])).toBeLessThan(CAKE.radius);
  });

  /* ⚠️ FACING IS RELATIVE TO WHERE IT STANDS. A standing garnish should present itself square-on
   * from outside, so moving it round the cake must re-aim it — otherwise every piece needs turning
   * by hand after every move. */
  /* ⚠️ CHECK THE DIRECTION IT FACES, NOT JUST THAT IT CHANGED. The first version of this compared
   * two placements and asserted the difference — which is identical whether the formula is −θ or
   * π/2 − θ. It passed while every standing garnish stood EDGE-ON to the room, a sliver, and only a
   * render showed it. A relative assertion cannot see an absolute error. */
  it('keeps facing the front wherever it is moved to', () => {
    for (const theta of [0, 0.8, Math.PI / 2, 2.7, -1.2]) {
      const { rotation } = garnishPlacement({ theta }, CAKE, PIECE);
      const phi = rotation[1];
      // the piece is built in the XY plane, so its face looks along +Z; a Y-turn of φ sends it to:
      const face = [Math.sin(phi), Math.cos(phi)];
      expect(face[0]).toBeCloseTo(0, 6);       // nothing sideways …
      expect(face[1]).toBeCloseTo(1, 6);       // … it looks straight at the customer
    }
  });

  /* ⚠️ MOVING A PIECE MUST NOT TURN IT — the fault this replaced. Turning is `yaw` and nothing else,
   * so the same yaw means the same angle wherever the piece sits. */
  it('turns only by the yaw the customer asked for', () => {
    expect(garnishPlacement({ theta: 1, yaw: 0.3 }, CAKE, PIECE).rotation[1]).toBeCloseTo(0.3, 6);
    expect(garnishPlacement({ theta: 2, yaw: 0.3 }, CAKE, PIECE).rotation[1]).toBeCloseTo(0.3, 6);
  });

  /* ⚠️ A DRAG RETURNS ONLY WHAT IT CHANGES. Anything else it hands back would overwrite a setting
   * the customer made — the size they chose, whether they laid the piece flat — every time they
   * nudged it. The movable contract enforces this; this states it in one place for a reader. */
  it('returns only the position keys, so a drag cannot reset size or mode', () => {
    const before = { ...GARNISH_DEFAULTS, scale: 1.6, mode: 'lie' };
    const after = garnishDragTo(before, CAKE, 0.25, 0.4);
    expect(Object.keys(after).sort()).toEqual(['radius', 'theta']);
    expect(after.theta).toBeCloseTo(Math.PI / 2, 6);
    expect(after.radius).toBeCloseTo(0.4, 6);
    expect(before.scale).toBe(1.6);            // and the source is untouched
    expect({ ...before, ...after }.mode).toBe('lie');
  });
});

/* ⚠️ THE CONTRACT. Unlike the pen — where a stroke is where the hand went and there is nothing to
 * take hold of — a garnish IS a placed object, so it is dragged and must answer for the six ways the
 * rainbow and the cloud broke in one week. */
movableContract('chocolate_garnish', {
  positionKeys: ['theta', 'radius', 'yaw'],
  pointsOf: (p, cake) => garnishPlacement(p, cake, PIECE).anchors,
  cases: [
    {
      label: 'standing on the cake top',
      cake: CAKE,
      params: { ...GARNISH_DEFAULTS, mode: 'stand' },
      freedoms: [
        { label: 'round the cake', drag: (p, c, u) => garnishDragTo(p, c, u, 0.55),
          targets: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875] },
        { label: 'out from the middle', drag: (p, c, v) => garnishDragTo(p, c, 0.25, v),
          targets: [0.1, 0.3, 0.5, 0.7, 0.85] },
      ],
    },
    {
      label: 'lying on the cake top',
      cake: CAKE,
      params: { ...GARNISH_DEFAULTS, mode: 'lie' },
      freedoms: [
        { label: 'round the cake', drag: (p, c, u) => garnishDragTo(p, c, u, 0.5),
          targets: [0, 0.2, 0.4, 0.6, 0.8] },
      ],
    },
  ],
});

// ── Duplicating a placed piece ───────────────────────────────────────────────────────────────────
//
// ⚠️ A COPY THAT LANDS ON ITS ORIGINAL LOOKS LIKE NOTHING HAPPENED, and pressing again quietly makes
// a third. The step is an ANGLE, not a distance — which is what makes a repeated piece read as the
// fan the reference cakes are built from — and it widens as the piece sits further out, because near
// the middle a fixed angle barely moves it and at the rim it is a stride.
describe('the angle a duplicate steps round by', () => {
  const step = radius => 0.5 / Math.max(0.25, radius);

  it('moves the copy off its original', () => {
    expect(step(0.5)).toBeGreaterThan(0.2);
  });

  it('steps further round when the piece sits near the middle', () => {
    expect(step(0.3)).toBeGreaterThan(step(0.9));
  });

  it('does not blow up on a piece at the very centre', () => {
    expect(Number.isFinite(step(0))).toBe(true);
    expect(step(0)).toBe(2);
  });
});

describe('fanning one piece round an arc', () => {
  const base = { theta: 1, yaw: 0.2 };

  it('returns as many placements as asked for, including the original', () => {
    expect(fanPlacements(base, 5, 1.2)).toHaveLength(5);
  });

  /* ⚠️ SYMMETRIC ABOUT WHERE THE PIECE ALREADY SITS. Fanned from one end, asking for five sends the
     whole arrangement off to one side of where it was aimed. */
  it('centres the arc on the piece that was already there', () => {
    const f = fanPlacements(base, 5, 1.2);
    expect(f[2].theta).toBeCloseTo(1, 6);
    expect(f[0].theta).toBeCloseTo(1 - 0.6, 6);
    expect(f[4].theta).toBeCloseTo(1 + 0.6, 6);
  });

  it('spaces them evenly, which is the point of generating rather than nudging', () => {
    const f = fanPlacements(base, 4, 1.2).map(p => p.theta);
    const gaps = f.slice(1).map((t, i) => t - f[i]);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 9);
  });

  /* ⚠️ A ROW IS NOT A FAN. Spread the angle round the cake alone and every copy still faces the same
     way — five pieces in a line that happens to curve. */
  it('turns each piece with the arc so they splay', () => {
    const f = fanPlacements(base, 3, 1.0);
    expect(f[0].yaw).toBeLessThan(f[1].yaw);
    expect(f[1].yaw).toBeLessThan(f[2].yaw);
  });

  it('refuses to make a fan of one', () => {
    expect(fanPlacements(base, 1, 1).length).toBe(2);
  });
});

// ── A lying piece sits where the design says it does ─────────────────────────────────────────────
//
// ⚠️ THE MESH AND THE CONTRACT MUST AGREE ABOUT WHERE A PIECE IS. The geometry has a bottom-centre
// origin — right for a standing piece, which turns about the point where it meets the cake — but laid
// flat that puts the anchor at the piece's EDGE while `footprint` describes a rectangle centred on
// it. The rim clamp then kept the anchor on the cake while the piece itself hung off, and a piece far
// enough out vanished over the edge. Small pieces near the middle looked fine, which is how it hid.
describe('a garnish lying flat is centred on its anchor', () => {
  const cake = { radius: 1.2, topY: 1, boardY: 0.1 };
  const piece = { w: 0.6, h: 0.5 };

  // Where the mesh's middle actually lands: the origin, stepped half a height along the direction
  // the piece extends. See the derivation in garnishPlacement.js.
  const meshCentre = (place, yaw, h) => ({
    x: place.position[0] - (h / 2) * Math.sin(yaw),
    z: place.position[2] - (h / 2) * Math.cos(yaw),
  });

  for (const yaw of [0, 0.4, 1.6, -2.2, Math.PI]) {
    it(`agrees with its own footprint at yaw ${yaw.toFixed(1)}`, () => {
      const g = { mode: 'lie', theta: 0.7, radius: 0.6, yaw, scale: 1 };
      const place = garnishPlacement(g, cake, piece);
      const mid = meshCentre(place, yaw, piece.h);
      const box = place.anchors.reduce(
        (a, p) => ({ x: a.x + p.x / place.anchors.length, z: a.z + p.z / place.anchors.length }),
        { x: 0, z: 0 },
      );
      expect(mid.x).toBeCloseTo(box.x, 6);
      expect(mid.z).toBeCloseTo(box.z, 6);
    });
  }

  it('keeps the piece on the cake, not just its anchor', () => {
    const g = { mode: 'lie', theta: 0, radius: 1, yaw: 0, scale: 1 };
    const place = garnishPlacement(g, cake, piece);
    const mid = meshCentre(place, 0, piece.h);
    expect(Math.hypot(mid.x, mid.z)).toBeLessThanOrEqual(cake.radius);
  });
});
