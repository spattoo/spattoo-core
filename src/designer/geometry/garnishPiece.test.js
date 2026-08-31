import * as THREE from 'three';
import { describe, it, expect } from 'vitest';
import { buildGarnishGeometry, garnishTransform, insertionDepth } from './garnishPiece.js';

/* Turning drawn paths into a piece you can pick up. What these protect is the part that makes
 * placing one work at all: where its origin is, and that a standing piece is pushed INTO the cake
 * rather than balanced on it.
 */

const square = [[[100, 100], [300, 100], [300, 300], [100, 300], [100, 100]]];

describe('building the piece', () => {
  it('builds one mesh from several paths', () => {
    const out = buildGarnishGeometry([...square, [[150, 150], [250, 250]]]);
    expect(out.geometry.getAttribute('position').count).toBeGreaterThan(100);
    expect(out.size.w).toBeGreaterThan(0);
    expect(out.size.h).toBeGreaterThan(0);
  });

  /* ⚠️ BOTTOM-CENTRE ORIGIN, and this is what makes standing work at all. With a centred origin a
   * standing piece sinks half its height into the buttercream, and every caller has to apply a
   * compensating offset — which is how two of them end up disagreeing. */
  it('rests on y = 0 and is centred on x', () => {
    const { geometry } = buildGarnishGeometry(square);
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    expect(Math.abs(bb.min.y)).toBeLessThan(1e-6);
    expect(Math.abs(bb.min.x + bb.max.x)).toBeLessThan(1e-6);
  });

  /* ⚠️ A GARNISH IS FLAT. Piped on parchment it is a couple of rope widths thick and no more — one
   * thick enough to read as a slab is one that would never have set in that shape. */
  it('is barely thicker than the rope it was piped with', () => {
    const out = buildGarnishGeometry(square, { rope: 6 });
    expect(out.size.d).toBeLessThan(out.ropeWorld * 3);
    expect(out.size.d).toBeGreaterThan(0);
  });

  // What the baker drew is the SHAPE. Drawing bigger should not produce a bigger garnish.
  it('comes out the same size however large it was drawn', () => {
    const small = buildGarnishGeometry(square);
    const large = buildGarnishGeometry([square[0].map(([x, y]) => [x * 1.5, y * 1.5])]);
    expect(Math.abs(large.size.w - small.size.w * 1.5)).toBeGreaterThan(0);   // scales with the drawing
    expect(large.size.w).toBeLessThan(2);                                     // and stays cake-sized
  });

  it('returns nothing rather than throwing on nothing', () => {
    expect(buildGarnishGeometry(null)).toBeNull();
    expect(buildGarnishGeometry([])).toBeNull();
    expect(buildGarnishGeometry([[[1, 1]]])).toBeNull();      // a single point is not a path
  });
});

describe('sitting where it was put', () => {
  /* ⚠️ A STANDING PIECE IS PUSHED IN. Resting exactly on the surface reads as floating, which is the
   * one tell that separates a render from a photograph. */
  it('buries the foot of a standing piece', () => {
    const t = garnishTransform('stand', { height: 0.5, rope: 0.02, surfaceY: 1.4 });
    expect(t.y).toBeLessThan(1.4);
    expect(1.4 - t.y).toBeGreaterThanOrEqual(0.02 * 1.5);
  });

  it('gives even a tiny piece a real bite', () => {
    expect(insertionDepth(0.02, 0.02)).toBeGreaterThanOrEqual(0.03);
  });

  it('lays a flat piece ON the surface, not half-sunk in it', () => {
    const t = garnishTransform('lie', { rope: 0.02, surfaceY: 1.4 });
    expect(t.y).toBeGreaterThan(1.4);
    expect(t.rotation[0]).toBeCloseTo(-Math.PI / 2);
  });
});

// ── A two-tone piece: one geometry per colour, all in one frame ───────────────────────────────────
// Two shapes far apart, built as separate colour parts. In one shared frame they must keep the gap
// between them; centred on themselves they would both land on the origin.
const left  = [[[20, 200], [60, 200], [60, 240], [20, 240], [20, 200]]];
const right = [[[360, 200], [400, 200], [400, 240], [360, 240], [360, 200]]];
const cx = g => { g.computeBoundingBox(); return (g.boundingBox.min.x + g.boundingBox.max.x) / 2; };

describe('a two-tone piece keeps its parts where they were drawn', () => {
  it('separates them in a shared frame, and stacks them without one', () => {
    const a = buildGarnishGeometry(left, {}), b = buildGarnishGeometry(right, {});
    expect(Math.abs(cx(a.geometry) - cx(b.geometry))).toBeLessThan(0.01);   // the bug: both centred

    const frame = new THREE.Box3().union(a.bounds).union(b.bounds);
    const fa = buildGarnishGeometry(left, { frame }), fb = buildGarnishGeometry(right, { frame });
    expect(cx(fb.geometry) - cx(fa.geometry)).toBeGreaterThan(0.5);         // the fix: still apart
  });
});
