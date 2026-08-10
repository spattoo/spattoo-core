import { describe, it, expect } from 'vitest';
import { buildGrassTuft, grassSeats, grassTriangleCount, GRASS_DEFAULTS } from './grass.js';

// ── What is worth asserting about grass ─────────────────────────────────────────────────────────
// Not that it LOOKS right — no test can tell you that, which is exactly why dev/grass.html exists
// and why the look is being judged before any of this is wired to the catalogue. What a test CAN
// pin is the set of properties whose failure is invisible in a still render and expensive later:
// determinism, containment, and cost.

describe('buildGrassTuft', () => {
  it('is deterministic — the same seed gives the same blades', () => {
    const a = buildGrassTuft({ seed: 42 }).getAttribute('position').array;
    const b = buildGrassTuft({ seed: 42 }).getAttribute('position').array;
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  // The reason determinism matters is not tidiness: an unseeded random would re-roll every blade on
  // each re-render, so the whole patch would shimmer whenever an unrelated slider moved.
  it('and a different seed gives different blades', () => {
    const a = buildGrassTuft({ seed: 1 }).getAttribute('position').array;
    const b = buildGrassTuft({ seed: 2 }).getAttribute('position').array;
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('produces finite geometry with normals and an index', () => {
    const g = buildGrassTuft({ seed: 3 });
    const pos = g.getAttribute('position').array;
    expect(pos.length).toBeGreaterThan(0);
    expect(pos.every(Number.isFinite)).toBe(true);
    expect(g.getAttribute('normal').count).toBe(g.getAttribute('position').count);
    expect(g.index.count % 3).toBe(0);
  });

  // Tips must not sink into the cake. The tolerance is one blade thickness, because the base RING
  // legitimately sits a hair below the surface — that is what hides the seam where a blade meets
  // the frosting. Anything deeper is the droop overpowering the height the blade gained, which is
  // exactly what the first version did: at droop 1 the flattest blades finished 2.7mm underground.
  it('never droops below the surface it grows from', () => {
    for (const seed of [1, 5, 11, 23]) {
      const g = buildGrassTuft({ seed, droop: 1, splay: 1 });   // the worst case for dipping
      g.computeBoundingBox();
      expect(g.boundingBox.min.y).toBeGreaterThan(-GRASS_DEFAULTS.thickness * 1.5);
    }
  });

  it('honours blade height as the upper bound', () => {
    const g = buildGrassTuft({ seed: 6, height: 0.3, droop: 0 });
    g.computeBoundingBox();
    expect(g.boundingBox.max.y).toBeLessThanOrEqual(0.3 + 1e-6);
  });

  // A tuft is a clump, not a firework: blades leave a nozzle FACE, so they start spread over a small
  // disc. If they ever collapse to a single origin the silhouette changes completely.
  it('starts its blades over a face, not a point', () => {
    const g = buildGrassTuft({ seed: 7 });
    const pos = g.getAttribute('position');
    let maxBaseR = 0;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < 1e-3) maxBaseR = Math.max(maxBaseR, Math.hypot(pos.getX(i), pos.getZ(i)));
    }
    expect(maxBaseR).toBeGreaterThan(0);
  });
});

describe('grassSeats', () => {
  const round = { kind: 'round', radius: 1.5 };
  const sheet = { kind: 'rect', halfW: 1.6, halfD: 1.15 };

  it('keeps every tuft on the surface — round', () => {
    const seats = grassSeats({ shape: round, spacing: 0.08 });
    expect(seats.length).toBeGreaterThan(100);
    expect(seats.every(s => Math.hypot(s.x, s.z) <= round.radius)).toBe(true);
  });

  // The same code path, no rect branch — that is the point of clipping with topContains.
  it('keeps every tuft on the surface — sheet', () => {
    const seats = grassSeats({ shape: sheet, spacing: 0.08 });
    expect(seats.length).toBeGreaterThan(100);
    expect(seats.every(s => Math.abs(s.x) <= sheet.halfW && Math.abs(s.z) <= sheet.halfD)).toBe(true);
  });

  it('gets denser as spacing shrinks', () => {
    const loose = grassSeats({ shape: round, spacing: 0.15 }).length;
    const tight = grassSeats({ shape: round, spacing: 0.06 }).length;
    expect(tight).toBeGreaterThan(loose * 3);
  });

  // The football-cake look: grass hugging the rim, the middle left clear for the design underneath.
  it('a rim band leaves the middle empty', () => {
    const band = grassSeats({ shape: round, spacing: 0.08, bandInner: 0.55 });
    expect(band.length).toBeGreaterThan(0);
    expect(band.every(s => Math.hypot(s.x, s.z) >= round.radius * 0.55 - 1e-6)).toBe(true);
  });

  // The band is a scaled copy of the tier's OUTLINE, not a radius — which is the whole point on a
  // sheet. Measuring distance from the centre (the first version) put a CIRCULAR hole in a
  // rectangle: the short edges lost their band entirely while the corners kept a fat one. Here the
  // hole is a rectangle, so the band has even width all the way round and the corners stay grassed.
  it('follows the outline on a sheet, instead of cutting a circular hole', () => {
    const band = grassSeats({ shape: sheet, spacing: 0.06, bandInner: 0.6 });
    expect(band.length).toBeGreaterThan(0);
    // Nothing inside the scaled rectangle…
    expect(band.every(s => !(Math.abs(s.x) <= sheet.halfW * 0.6 && Math.abs(s.z) <= sheet.halfD * 0.6))).toBe(true);
    // …and the band survives on the SHORT edges, which a circular hole of this size would have eaten.
    const nearShortEdge = band.filter(s => Math.abs(s.z) > sheet.halfD * 0.75 && Math.abs(s.x) < sheet.halfW * 0.3);
    expect(nearShortEdge.length).toBeGreaterThan(0);
  });

  it('a wider band (smaller inner) keeps more tufts', () => {
    const narrow = grassSeats({ shape: round, spacing: 0.07, bandInner: 0.8 }).length;
    const wide   = grassSeats({ shape: round, spacing: 0.07, bandInner: 0.3 }).length;
    expect(wide).toBeGreaterThan(narrow);
  });

  it('null bandInner covers the whole top', () => {
    const full = grassSeats({ shape: round, spacing: 0.08 });
    const band = grassSeats({ shape: round, spacing: 0.08, bandInner: 0.55 });
    expect(full.length).toBeGreaterThan(band.length);
    expect(full.some(s => Math.hypot(s.x, s.z) < round.radius * 0.3)).toBe(true);
  });

  it('varies yaw and scale so a field does not read as wallpaper', () => {
    const seats = grassSeats({ shape: round, spacing: 0.1 });
    expect(new Set(seats.map(s => s.yaw.toFixed(4))).size).toBeGreaterThan(seats.length / 2);
    expect(Math.min(...seats.map(s => s.scale))).toBeLessThan(Math.max(...seats.map(s => s.scale)));
  });

  it('is deterministic for a given seed', () => {
    const a = grassSeats({ shape: round, spacing: 0.1, seed: 9 });
    const b = grassSeats({ shape: round, spacing: 0.1, seed: 9 });
    expect(a).toEqual(b);
  });
});

// Cost is a design constraint here, not a footnote: the whole reason this renders as an
// InstancedMesh is that a dense top is thousands of tufts. If the default ever quietly lands in the
// millions, that is a decision someone should make on purpose.
describe('grassTriangleCount', () => {
  it('keeps a dense round top within a sane budget', () => {
    const seats = grassSeats({ shape: { kind: 'round', radius: 1.5 }, spacing: GRASS_DEFAULTS.spacing });
    const tris = grassTriangleCount(seats.length, GRASS_DEFAULTS.strands);
    expect(tris).toBeGreaterThan(10_000);       // sparse enough to be bald would fail here
    expect(tris).toBeLessThan(400_000);         // one draw call, but a phone still rasterises them
  });
});

// ── A ring standing on the board ────────────────────────────────────────────────────────────────
// Bounded OUTWARD by the board and INWARD by the cake — two different outlines, which is why this
// needed `hole` and could not reuse `bandInner`. The failure worth guarding is a tuft seated where
// the cake is: at board height that puts it inside the wall, growing through the sponge.
describe('grassSeats — board ring via hole', () => {
  const cake  = { kind: 'round', radius: 1.2 };
  const board = { kind: 'round', radius: 1.8 };

  it('puts nothing where the cake stands', () => {
    const ring = grassSeats({ shape: board, spacing: 0.06, hole: { shape: cake, scale: 1 } });
    expect(ring.length).toBeGreaterThan(0);
    expect(ring.every(s => Math.hypot(s.x, s.z) >= cake.radius)).toBe(true);
  });

  it('stays on the board', () => {
    const ring = grassSeats({ shape: board, spacing: 0.06, hole: { shape: cake, scale: 1 } });
    expect(ring.every(s => Math.hypot(s.x, s.z) <= board.radius)).toBe(true);
  });

  // `inset` is how the ring's WIDTH is expressed — a narrow ring hugs the cake, a full one reaches
  // most of the way to the board's edge.
  it('a narrower ring keeps fewer tufts and stays closer in', () => {
    const wide   = grassSeats({ shape: board, spacing: 0.06, inset: 0.96, hole: { shape: cake, scale: 1 } });
    const narrow = grassSeats({ shape: board, spacing: 0.06, inset: 0.72, hole: { shape: cake, scale: 1 } });
    expect(narrow.length).toBeLessThan(wide.length);
    const furthest = Math.max(...narrow.map(s => Math.hypot(s.x, s.z)));
    expect(furthest).toBeLessThan(board.radius * 0.96);
  });

  // A sheet on its board: the hole must be the SHEET, not a circle around it, or grass grows across
  // the corners of the cake.
  it('punches out a sheet, not a circle around it', () => {
    const sheet = { kind: 'rect', halfW: 1.3, halfD: 0.9 };
    const tray  = { kind: 'rect', halfW: 1.75, halfD: 1.35 };
    const ring = grassSeats({ shape: tray, spacing: 0.05, hole: { shape: sheet, scale: 1 } });
    expect(ring.length).toBeGreaterThan(0);
    expect(ring.every(s => !(Math.abs(s.x) <= sheet.halfW && Math.abs(s.z) <= sheet.halfD))).toBe(true);
    // Grass DOES reach the middle of a long side, which a circular hole would have blocked.
    expect(ring.some(s => Math.abs(s.x) < 0.3 && Math.abs(s.z) > sheet.halfD)).toBe(true);
  });
});

// ── Strands over the edge ───────────────────────────────────────────────────────────────────────
// The last piece of the reference football cake: grass at the rim spilling down the side. Two
// things have to be true and both are invisible in a still test — hence dev/grass and the studio
// slider — but the SHAPE of the answer is checkable: only rim tufts lean, and they lean OUTWARD.
describe('grassSeats — overhang', () => {
  const round = { kind: 'round', radius: 1.2 };

  it('leaves everything upright when off', () => {
    const seats = grassSeats({ shape: round, spacing: 0.08 });
    expect(seats.every(s => !s.lean)).toBe(true);
  });

  it('tips tufts at the rim and leaves the middle alone', () => {
    const seats = grassSeats({ shape: round, spacing: 0.06, overhang: 1 });
    const middle = seats.filter(s => Math.hypot(s.x, s.z) < round.radius * 0.5);
    const rim    = seats.filter(s => Math.hypot(s.x, s.z) > round.radius * 0.97);
    expect(middle.length).toBeGreaterThan(0);
    expect(rim.length).toBeGreaterThan(0);
    expect(middle.every(s => s.lean === 0)).toBe(true);
    expect(rim.every(s => s.lean > 0)).toBe(true);
  });

  // Leaning the wrong way would push blades ACROSS the cake top instead of over the side — the
  // difference between a drape and a comb-over, and easy to get backwards with a cross product.
  it('leans away from the centre, not across the cake', () => {
    const seats = grassSeats({ shape: round, spacing: 0.06, overhang: 1 }).filter(s => s.lean > 0);
    expect(seats.length).toBeGreaterThan(0);
    for (const s of seats) {
      // `out` is the compass bearing of the seat from the centre — atan2(x, z), the same convention.
      expect(Math.abs(s.out - Math.atan2(s.x, s.z))).toBeLessThan(1e-9);
    }
  });

  it('reaches past the outline so a tuft can straddle the edge', () => {
    const flat = grassSeats({ shape: round, spacing: 0.06 });
    const over = grassSeats({ shape: round, spacing: 0.06, overhang: 1 });
    expect(Math.max(...over.map(s => Math.hypot(s.x, s.z))))
      .toBeGreaterThan(Math.max(...flat.map(s => Math.hypot(s.x, s.z))));
  });

  it('leans further the more overhang is asked for', () => {
    const at = o => Math.max(...grassSeats({ shape: round, spacing: 0.06, overhang: o }).map(s => s.lean));
    expect(at(1)).toBeGreaterThan(at(0.4));
    expect(at(0.4)).toBeGreaterThan(0);
  });
});
