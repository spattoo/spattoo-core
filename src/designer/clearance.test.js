import { describe, it, expect } from 'vitest';
import { CLEARANCE_FRACTION, clearanceRadius, occupantRadius } from './placement.js';
import { withoutCollarCentres } from './canvas/useSeatedInstances.js';
import { wallSeats, withoutWallOccupants } from './geometry/wallSeats.js';

/* ── Fillers must get BETWEEN things, not stop at the edge of the run ────────────────────────────
 *
 * Reported on a rim carrying five roses: *"it should find the gaps between the roses and merge like
 * an arrangement. but it simply skipped the area where roses are present."*
 *
 * ⚠️ ONE ROSE HID THIS. Cleared alone, the bare arc came out narrower than the rose's own span, so
 * the filler looked like it was nestling and every single-occupant test passed. It only shows with
 * several close together, where the cleared discs union into one dead zone — so that is the case
 * these tests set up. */

const ROSE_R = 0.448;        // sample-rosette.glb at the size the report used
const APART  = 0.537;        // adjacent centres in that arrangement
/* ⚠️ THE REAL BAND, NOT ONE CENTRED ON THE ROSES. `rimBand(shape, { inn: 0.14, out: 0.10 })` on a
   1.2 tier runs from 1.03 OUT to 1.32 — it straddles the rim and reaches past it, while the roses
   sit at 1.02, just inside its inner edge. A first version of these tests put the band at
   0.86–1.16, symmetric about the roses, and concluded the ring was severed at every rose when the
   render plainly showed it passing round them. The band's own geometry is why it gets through. */
const BAND_IN = 1.03, BAND_OUT = 1.32, ROSE_V = 1.02;

describe('clearance around something already placed', () => {
  it('is a FRACTION of the occupant, never a margin on top of it', () => {
    /* `occupantRadius` is already a maximum — the GLB's bounding half-width. Growing it again is
       the double-count that caused the dead zone. */
    expect(CLEARANCE_FRACTION).toBeLessThan(1);
    expect(clearanceRadius({ r: 1 })).toBeCloseTo(CLEARANCE_FRACTION, 10);
  });

  /* ⚠️ THE BAND HAS WIDTH, AND MY FIRST VERSION OF THIS TEST DID NOT. It asserted
     `2 × clearance < centre spacing` — seats strictly on the rim circle, between two rose centres —
     and failed at 0.58 against 0.537. The number is not wrong; the model was. Those two roses
     OVERLAP each other (0.537 apart with radius 0.448 apiece), so at the surface there is genuinely
     nothing between them, and a filler that squeezed in there would be growing through both. What
     a rim ring actually does is pass AROUND each rose, through the inner and outer parts of the
     band, which is what the render shows and what "merge like an arrangement" looks like. */
  it('passes through the band alongside a rose rather than stopping at it', () => {
    const rose = { x: 0, z: ROSE_V, r: ROSE_R };
    const band = [];
    for (let v = BAND_IN; v <= BAND_OUT; v += 0.03)
      for (let a = -0.5; a <= 0.5; a += 0.01)
        band.push({ x: v * Math.sin(a * Math.PI), z: v * Math.cos(a * Math.PI) });
    const kept = withoutCollarCentres(band, [{ x: rose.x, z: rose.z, inner: clearanceRadius(rose) }]);
    /* Seats survive at the rose's own bearing, on the inner and outer edges of the band. */
    const behind = kept.filter(s => Math.abs(Math.atan2(s.x, s.z)) < 0.12);
    expect(behind.length, 'the band is cut clean through at the rose').toBeGreaterThan(0);
  });

  it('still refuses a seat inside an occupant', () => {
    const seats = [{ x: 0, z: 0 }, { x: ROSE_R * 0.3, z: 0 }, { x: 2, z: 0 }];
    const kept = withoutCollarCentres(seats, [{ x: 0, z: 0, inner: clearanceRadius({ r: ROSE_R }) }]);
    expect(kept.map(s => s.x)).toEqual([2]);
  });

  /* ⚠️ THE REPORTED FAULT, AS A TEST. Five roses in a run, and a band of seats across the rim. The
     old figure (occupantRadius × 1.15) cleared 0.515 apiece against centres 0.537 apart, so the
     discs met and the whole run went bare — 171° of dead rim over a run of roses spanning 122°.
     Stated as the thing a baker sees: the ring must not be cut into two separate arcs. */
  it('does not skip the whole run of roses', () => {
    const roses = Array.from({ length: 5 }, (_, k) => {
      const a = (-0.34 + k * 0.17) * Math.PI;
      return { x: ROSE_V * Math.sin(a), z: ROSE_V * Math.cos(a), r: ROSE_R };
    });
    const band = [];
    for (let v = BAND_IN; v <= BAND_OUT; v += 0.03)
      for (let a = -1; a <= 1; a += 0.004) band.push({ x: v * Math.sin(a * Math.PI), z: v * Math.cos(a * Math.PI) });
    const bite = (f) => withoutCollarCentres(band, roses.map(o => ({ x: o.x, z: o.z, inner: o.r * f })));
    const widest = (kept) => {
      const TAU = Math.PI * 2;
      const us = kept.map(s => ((Math.atan2(s.x, s.z) % TAU) + TAU) % TAU).sort((a, b) => a - b);
      let w = 0;
      for (let i = 0; i < us.length; i++) {
        const g = (i === us.length - 1 ? us[0] + TAU : us[i + 1]) - us[i];
        if (g > w) w = g;
      }
      return w * 180 / Math.PI;
    };
    const was = widest(bite(1.15));
    const now = widest(bite(CLEARANCE_FRACTION));
    expect(was, 'the old figure should still show the fault').toBeGreaterThan(90);
    expect(now, `a ${now.toFixed(0)}deg hole is still skipping the run`).toBeLessThan(30);
  });

  /* ⚠️ THE WALL IS DELIBERATELY NOT CHANGED, and this records why rather than leaving it to look
     like an oversight. The dome argument is about a piece RESTING on a surface; a piece on a wall
     is pressed flat against it, and for a flat one the silhouette IS roughly the bounding box.
     Importing the smaller figure here made `wallSeats.test.js` fail at once — seats surviving 0.19
     from the centre of a 0.2 occupant — which is the suite catching a generalisation I had not
     measured. It stays conservative until the wall case is measured the way the rim case was. */
  it('leaves the WALL clearance alone, which is a different question', () => {
    const seats = wallSeats({ kind: 'round', radius: 1.2 }, { height: 1.45, spacing: 0.04 });
    const rose = { x: 0, z: 1.2, dy: 0.7, r: 0.2 };
    const kept = withoutWallOccupants(seats, [rose]);
    expect(kept.length).toBeLessThan(seats.length);
    for (const s of kept) {
      expect(Math.hypot(s.x - rose.x, s.z - rose.z, s.dy - rose.dy)).toBeGreaterThanOrEqual(0.2);
    }
  });

  it('scales with the piece, so a resized rose clears more', () => {
    const one = occupantRadius({ scale: 1 }, 0.2);
    const two = occupantRadius({ scale: 2 }, 0.2);
    expect(clearanceRadius({ r: two })).toBeCloseTo(clearanceRadius({ r: one }) * 2, 10);
  });
});
