import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { movableContract } from './movableContract.js';
import { GARNISH_DEFAULTS, garnishPlacement, garnishDragTo, clampRadius, fanPlacements, garnishPlacementOptions, garnishSeat, garnishWhere, fanSpread } from './garnishPlacement.js';
import { sideSeatOffset } from '../placement.js';

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
  // `height` is where a piece sits UP A WALL — a position, like `radius` is on the top.
  positionKeys: ['theta', 'radius', 'height', 'yaw'],
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
    {
      label: 'pressed flat on the side wall',
      cake: { radius: 1.2, topY: 1.55, boardY: 0.1, baseY: 0.55, height: 1.0 },
      params: { ...GARNISH_DEFAULTS, zone: 'side', mode: 'lie' },
      freedoms: [
        { label: 'round the tier', drag: (p, c, u) => garnishDragTo(p, c, u, 0.5),
          targets: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875] },
        { label: 'up the wall', drag: (p, c, v) => garnishDragTo(p, c, 0.25, v),
          targets: [0.3, 0.4, 0.5, 0.6, 0.7] },
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

// ── Which tier a garnish sits on ─────────────────────────────────────────────────────────────────
//
// ⚠️ ABSENT MEANS THE TOP, NOT TIER ZERO. Every piece placed before tiers were understood was nailed
// to the top tier; defaulting a missing `tierIndex` to zero would silently move all of them down the
// cake — a saved order is a record of what somebody bought, not a thing to reinterpret.
describe('a garnish knows its tier', () => {
  const tiers = [
    { radius: 1.4, baseY: 0.1, height: 0.5 },
    { radius: 1.1, baseY: 0.6, height: 0.45 },
    { radius: 0.8, baseY: 1.05, height: 0.4 },
  ];
  const surfaceOf = i => ({ radius: tiers[i].radius, topY: tiers[i].baseY + tiers[i].height });
  const resolve = g => (Number.isInteger(g.tierIndex)
    ? Math.max(0, Math.min(tiers.length - 1, g.tierIndex))
    : tiers.length - 1);

  it('defaults to the top when it has never been asked', () => {
    expect(resolve({})).toBe(2);
    expect(resolve({ tierIndex: null })).toBe(2);
  });

  it('sits on the tier it was given', () => {
    expect(surfaceOf(resolve({ tierIndex: 0 })).topY).toBeCloseTo(0.6, 6);
    expect(surfaceOf(resolve({ tierIndex: 1 })).topY).toBeCloseTo(1.05, 6);
  });

  /* A tier can be removed from under a piece. Clamping keeps it on the cake rather than dropping it
     into space, which is the same rule every other placement here follows. */
  it('clamps to a tier that still exists', () => {
    expect(resolve({ tierIndex: 9 })).toBe(2);
    expect(resolve({ tierIndex: -3 })).toBe(0);
  });

  it('reaches further out on a wider tier, so the rim clamp means the same thing everywhere', () => {
    expect(surfaceOf(0).radius).toBeGreaterThan(surfaceOf(2).radius);
  });
});

/* ── The card topper signs the same contract, because it uses the same placement ─────────────────
 *
 * ⚠️ REGISTERED SEPARATELY EVEN THOUGH THE FUNCTION IS SHARED, and that is the point rather than a
 * duplication. `check:movable` reads the tool keys out of `PROCEDURAL_TOOLS` and asks whether each
 * DRAGGED tool has signed — so a tool that reuses another's placement still has to say so, or the
 * gate cannot tell "reuses a contract" from "has no contract".
 *
 * It also asks the laws of the topper's own defaults, which differ: a topper LIES by default, where
 * a garnish stands. A card stands on a stick pushed into the icing and that is not built yet, so a
 * standing card would float — the default is the honest one until the stick exists.
 */
const TOPPER_DEFAULTS = { ...GARNISH_DEFAULTS, mode: 'lie', radius: 0.35 };
// A topper is wider than it is tall far more often than a garnish is — a name is a long, low card.
const TOPPER_PIECE = { w: 1.1, h: 0.42 };

movableContract('card_topper', {
  positionKeys: ['theta', 'radius', 'yaw'],
  pointsOf: (p, cake) => garnishPlacement(p, cake, TOPPER_PIECE).anchors,
  cases: [
    {
      label: 'lying on the cake top',
      cake: CAKE,
      params: TOPPER_DEFAULTS,
      freedoms: [
        { label: 'round the cake', drag: (p, c, u) => garnishDragTo(p, c, u, 0.35),
          targets: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875] },
        { label: 'out from the middle', drag: (p, c, v) => garnishDragTo(p, c, 0.25, v),
          targets: [0.1, 0.3, 0.5, 0.7, 0.85] },
      ],
    },
    {
      label: 'standing on the cake top',
      cake: CAKE,
      params: { ...TOPPER_DEFAULTS, mode: 'stand' },
      freedoms: [
        { label: 'round the cake', drag: (p, c, u) => garnishDragTo(p, c, u, 0.5),
          targets: [0, 0.2, 0.4, 0.6, 0.8] },
      ],
    },
  ],
});

describe('an explicit sink — a piece that carries its own bury', () => {
  const cake = { radius: 1.2, topY: 1.0, boardY: 0.1 };
  const stood = (piece) => garnishPlacement({ theta: 0, radius: 0.3, yaw: 0, mode: 'stand', scale: 1 }, cake, piece);

  it('buries a standing piece by exactly what it asked for', () => {
    const p = stood({ w: 1, h: 1, sink: 0.25 });
    expect(p.position[1]).toBeCloseTo(cake.topY - 0.25, 6);
  });

  /* ⚠️ Every garnish leaves `sink` out, and none of them may move because a topper needed one. */
  it('leaves a piece without one exactly where it was', () => {
    expect(stood({ w: 1, h: 1 }).position[1]).toBeCloseTo(stood({ w: 1, h: 1, sink: undefined }).position[1], 9);
    expect(stood({ w: 1, h: 1 }).position[1]).toBeLessThan(cake.topY);
  });

  it('takes zero literally — a piece asked to sit ON the surface is not pushed in', () => {
    expect(stood({ w: 1, h: 1, sink: 0 }).position[1]).toBeCloseTo(cake.topY, 6);
  });
})

// ── On the side wall ─────────────────────────────────────────────────────────────────────────────
const WALL = { radius: 1.2, topY: 1.55, boardY: 0.1, baseY: 0.55, height: 1.0 };
const SIDE = { ...GARNISH_DEFAULTS, zone: 'side', mode: 'lie' };

describe('a garnish pressed flat on the side of a tier', () => {
  /* ⚠️ IT FACES OUT OF THE CAKE, whatever angle it sits at. On the top, facing the front was a choice;
   * on a wall anything but outward sticks the piece INTO the cake. Checked as a direction, not as a
   * difference between two placements — a relative check cannot see an absolute error. */
  it('faces straight out of the wall at every angle', () => {
    for (const theta of [0, 0.8, Math.PI / 2, 2.7, -1.2]) {
      const { rotation, position } = garnishPlacement({ ...SIDE, theta }, WALL, PIECE);
      const face = [Math.sin(rotation[1]), Math.cos(rotation[1])];       // +Z after the Y-turn
      const out = [position[0], position[2]].map(v => v / Math.hypot(position[0], position[2]));
      expect(face[0]).toBeCloseTo(out[0], 6);
      expect(face[1]).toBeCloseTo(out[1], 6);
    }
  });

  // Its height is a fraction of the wall, so halfway up stays halfway up on a taller tier.
  it('sits at its height as a fraction of the wall', () => {
    const p = garnishPlacement({ ...SIDE, height: 0.5 }, WALL, PIECE);
    expect(p.position[1]).toBeCloseTo(WALL.baseY + 0.5 * WALL.height, 6);
    const tall = garnishPlacement({ ...SIDE, height: 0.5 }, { ...WALL, height: 2 }, PIECE);
    expect(tall.position[1]).toBeCloseTo(WALL.baseY + 1, 6);
  });

  // The whole piece stays on the wall: not into the board, not over the rim.
  it('keeps the whole piece between the base and the rim', () => {
    const low = garnishPlacement({ ...SIDE, height: 0 }, WALL, PIECE);
    const high = garnishPlacement({ ...SIDE, height: 1 }, WALL, PIECE);
    expect(low.position[1] - PIECE.h / 2).toBeCloseTo(WALL.baseY, 6);
    expect(high.position[1] + PIECE.h / 2).toBeCloseTo(WALL.baseY + WALL.height, 6);
  });

  /* ⚠️ SEATED BY ITS BACK, and over any piping in its way. Its middle sits the wall gap plus half its
   * thickness out, and whatever the tier's piping needs on top — the same question every side
   * decoration asks (INVARIANTS #3b). */
  it('rests its back on the wall and rides over piping', () => {
    const piece = { ...PIECE, d: 0.02 };
    const bare = garnishPlacement(SIDE, WALL, piece);
    const out = p => Math.hypot(p.position[0], p.position[2]);
    expect(out(bare)).toBeCloseTo(WALL.radius + sideSeatOffset(WALL.radius) + 0.01, 6);
    const piped = garnishPlacement(SIDE, { ...WALL, clearance: () => 0.08 }, piece);
    expect(out(piped) - out(bare)).toBeCloseTo(0.08, 6);
  });

  // A round wall bends the piece at the radius its middle sits at; a flat face does not bend it.
  it('bends to a round wall and lies flat on a square one', () => {
    const round = garnishPlacement(SIDE, WALL, PIECE);
    expect(round.wall.radius).toBeCloseTo(Math.hypot(round.position[0], round.position[2]), 6);
    const square = { ...WALL, shape: { kind: 'rect', halfW: 1.1, halfD: 0.8, cornerR: 0.05 } };
    const flat = garnishPlacement({ ...SIDE, theta: 0 }, square, PIECE);
    expect(flat.wall.radius).toBe(0);
    expect(flat.position[0]).toBeGreaterThan(1.1);                // on the +X face, just proud of it
    expect(flat.position[2]).toBeCloseTo(0, 3);
    expect(Math.sin(flat.rotation[1])).toBeCloseTo(1, 3);         // facing +X, out of that face
  });

  // Turn spins it within the wall; it does not change where it sits.
  it('spins within the wall without moving', () => {
    const a = garnishPlacement({ ...SIDE, yaw: 0 }, WALL, PIECE);
    const b = garnishPlacement({ ...SIDE, yaw: 0.6 }, WALL, PIECE);
    expect(b.position[0]).toBeCloseTo(a.position[0], 6);
    expect(b.position[2]).toBeCloseTo(a.position[2], 6);
    expect(b.wall.spin).toBeCloseTo(0.6, 6);
  });

  it('drags round and up the wall, and changes nothing else', () => {
    const before = { ...SIDE, scale: 1.4, yaw: 0.3 };
    const after = garnishDragTo(before, WALL, 0.25, 0.7);
    expect(Object.keys(after).sort()).toEqual(['height', 'theta']);
    expect(after.theta).toBeCloseTo(Math.PI / 2, 6);
    expect(after.height).toBeCloseTo(0.7, 6);
  });

  /* ⚠️ A FAN ON A WALL IS A BAND, NOT A PINWHEEL. Turn spins a piece in the wall's plane, so splaying
   * the copies would spin each one further. */
  it('fans round the wall without spinning the copies', () => {
    const seats = fanPlacements({ ...SIDE, theta: 1, yaw: 0.2 }, 5, 1);
    expect(seats.every(seat => !('yaw' in seat))).toBe(true);
    expect(seats[0].theta).toBeCloseTo(0.5, 6);
    expect(seats[4].theta).toBeCloseTo(1.5, 6);
  });
});

// ── Where a garnish may go, from config ──────────────────────────────────────────────────────────
describe('placement options from the garnish tool\'s config', () => {
  const ids = o => o.zones.map(z => `${z.id}:${z.modes.map(m => m.id).join('/')}`);

  it('offers the top, the side and the board when the row carries no block', () => {
    const o = garnishPlacementOptions(null);
    expect(ids(o)).toEqual(['top:stand/lie', 'side:lie', 'board:stand/lie']);
    expect(o.authored).toBe(false);
    expect(o.zones.find(z => z.id === 'side').modes[0].label).toBe('Flat against the side');
  });

  /* ⚠️ AN AUTHORED BLOCK IS THE WHOLE LIST — a place it leaves out is not offered. Merging over the seed
   * would make removing the side impossible without a deploy. */
  it('treats an authored block as the whole list, in the shared zone vocabulary', () => {
    const o = garnishPlacementOptions({ top_surface: { modes: ['hug', 'stand'] }, side: 'hug' });
    expect(ids(o)).toEqual(['top:lie/stand', 'side:lie']);
    expect(o.authored).toBe(true);
  });

  it('ignores poses a garnish cannot take, and falls back when nothing usable is left', () => {
    expect(ids(garnishPlacementOptions({ top_surface: { modes: ['perch', 'stand'] } }))).toEqual(['top:stand']);
    expect(ids(garnishPlacementOptions({ rim: 'verge' }))).toEqual(ids(garnishPlacementOptions(null)));
    expect(ids(garnishPlacementOptions({ top_surface: 'perch' }))).toEqual(ids(garnishPlacementOptions(null)));
  });

  // A pick, a zone switch and a stale saved value are all held to what is offered.
  it('only ever seats a piece somewhere the options allow', () => {
    const o = garnishPlacementOptions(null);
    expect(garnishSeat(o, 'side', 'stand')).toEqual({ zone: 'side', mode: 'lie' });
    expect(garnishSeat(o, 'top', 'lie')).toEqual({ zone: 'top', mode: 'lie' });
    expect(garnishSeat(o, 'rim', 'stand')).toEqual({ zone: 'top', mode: 'stand' });
    const topOnly = garnishPlacementOptions({ top_surface: 'stand' });
    expect(garnishSeat(topOnly, 'side', 'lie')).toEqual({ zone: 'top', mode: 'stand' });
  });

  // The words a baker reads on the build sheet — unchanged for the top and board, new for the side.
  it('describes where a piece goes', () => {
    expect(garnishWhere({ zone: 'top', mode: 'stand' })).toBe('On the top tier, standing up');
    expect(garnishWhere({ zone: 'board', mode: 'lie' })).toBe('On the board, lying flat');
    expect(garnishWhere({ zone: 'side', mode: 'lie' })).toBe('On the side of the tier, pressed flat against it');
  });
});

/* ── How wide a fan opens ────────────────────────────────────────────────────────────────────────
 *
 * The card offered 3, 5 and 7 and computed the arc at the button: `0.55 + n * 0.09`. Asked for more
 * pieces — a band round a whole tier rather than a spray on the top — that line does not extend: read
 * as the GAP BETWEEN PIECES it keeps closing, so 24 pieces would land 6.8° apart, stacked on each
 * other. A slider wired to it would have shipped a control whose upper half produces a smear.
 *
 * ⚠️ THE TUNED PART MUST NOT MOVE. 3, 5 and 7 are a LOOK somebody chose by eye, and every cake
 * already fanned was fanned with them.
 */
describe('fanSpread', () => {
  const GAP = (n) => fanSpread(n) / (n - 1);

  it('leaves the three the card already offered exactly as they were', () => {
    for (const n of [3, 5, 7]) expect(fanSpread(n)).toBeCloseTo(0.55 + n * 0.09, 12);
  });

  /* Below seven the fan TIGHTENS as it grows — that is the tuned look, and it is what makes five
     read as a spray rather than as five things in a row. */
  it('closes the gap up to seven, the way it was tuned to', () => {
    expect(GAP(3)).toBeGreaterThan(GAP(5));
    expect(GAP(5)).toBeGreaterThan(GAP(7));
  });

  /* Past seven the spacing holds and the ARC grows instead. The two rules meet exactly at seven, so
     there is no step in the middle of the slider. */
  it('holds the seven-piece spacing above seven, and meets it without a jump', () => {
    for (const n of [8, 12, 16, 24]) expect(GAP(n)).toBeCloseTo(GAP(7), 12);
  });

  /* ⚠️ A fan cannot pass a full turn: beyond it the last piece laps the first and the arc reads as a
     mistake. `(n-1)/n` of a turn is the widest honest one — a full ring with a single gap. */
  it('never opens past a full circle, however many pieces', () => {
    for (let n = 2; n <= 200; n++) {
      expect(fanSpread(n)).toBeLessThanOrEqual((Math.PI * 2 * (n - 1)) / n + 1e-12);
      expect(fanSpread(n)).toBeLessThan(Math.PI * 2);
    }
  });

  it('is monotonic — more pieces is never a narrower fan', () => {
    for (let n = 3; n <= 60; n++) expect(fanSpread(n)).toBeGreaterThanOrEqual(fanSpread(n - 1));
  });

  it('survives a count that is not a whole number, or below two', () => {
    expect(fanSpread(5.4)).toBeCloseTo(fanSpread(5), 12);
    expect(fanSpread(0)).toBeCloseTo(fanSpread(2), 12);
    expect(fanSpread(-3)).toBeCloseTo(fanSpread(2), 12);
  });
});

/* ⚠️ THE SLIDER CANNOT APPLY AS IT MOVES, and this is the assertion that keeps that true. `fanGarnish`
   MULTIPLIES — it adds count−1 real garnishes and moves the original — so a live slider would strew
   hundreds of pieces across one drag and leave undo with no single step to take back. The slider
   chooses the number; a button does it. */
describe('the fan control', () => {
  const card = readFileSync(new URL('../CakeDesigner.jsx', import.meta.url), 'utf8');

  it('fans when the gesture ENDS, never while it moves', () => {
    const slider = /<PenSlider label="Pieces"[\s\S]*?\/>/.exec(card)[0];
    expect(slider).toMatch(/onCommit=\{n => fanGarnish\(g\.id, \{ count: n, spread: fanSpread\(n\) \}\)\}/);
    // ⚠️ the live channel must stay clear of it: onChange fires per pixel, and fanGarnish multiplies
    expect(slider).toMatch(/onChange=\{setFanCount\}/);
    expect(/onChange=\{[^}]*fanGarnish/.test(slider)).toBe(false);
  });

  /* ⚠️ AND onCommit MUST ANSWER THE KEYBOARD. A range input is arrow-key operable, and wiring only
     the pointer would leave the fan unreachable without a mouse — the quiet half of this, because
     it looks finished when you test it by dragging. */
  it('commits on pointer and on key, so the slider is not mouse-only', () => {
    const fn = /function PenSlider[\s\S]*?\n\}/.exec(card)[0];
    expect(fn).toMatch(/onPointerUp: e => onCommit\(Number\(e\.currentTarget\.value\)\)/);
    expect(fn).toMatch(/onKeyUp:\s*e => onCommit\(Number\(e\.currentTarget\.value\)\)/);
    // and a slider that was given no onCommit gets neither handler
    expect(fn).toMatch(/\{\.\.\.\(onCommit \? \{/);
  });

  /* A slider plus a button to confirm the slider is one control too many — the button is gone. */
  it('has no separate apply button beside it', () => {
    expect(card).not.toMatch(/Fan out \{fanCount\}/);
  });

  /* ⚠️ A SLIDER SHOWING ONLY ITS CURRENT VALUE READS AS ITS LIMIT. Sitting at 5 with "5" beside it,
     the control was taken for one that stops at five — reported off a screenshot by someone who had
     just been told the range. The number a baker needs in order to decide is the one they have not
     got yet, so the readout carries the ceiling and so does the line under the button. */
  it('shows the ceiling, not just where the slider happens to be', () => {
    expect(card).toMatch(/const FAN_MAX = \d+;/);
    expect(card).toMatch(/fmt=\{v => `\$\{v\} \/ \$\{FAN_MAX\}`\}/);
    /* ⚠️ ON ONE LINE, SPACES INTACT. JSX strips the newline and indent before an expression, so a
       line break either side of {FAN_MAX} eats the space and the card printed "up to24 of them".
       Caught by looking at a screenshot, not by any of this — which is the point of rule 6. */
    expect(card).toMatch(/up to \{FAN_MAX\} of them/);
    // and one source for the number, so the three places cannot drift apart
    expect(card).toMatch(/max=\{FAN_MAX\}/);
    expect(card).not.toMatch(/max=\{24\}/);
  });

  /* The arc is the geometry's business, not the button's — it used to be written inline at the call
     site, which is why it could not be extended without touching the UI. */
  it('asks the geometry for the arc rather than computing it at the button', () => {
    expect(card).not.toMatch(/spread: 0\.55 \+ n \* 0\.09/);
    expect(card).toMatch(/spread: fanSpread\(n\)/);
  });
});
