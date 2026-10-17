import { describe, it, expect } from 'vitest';
import { tierShape } from './geometry/surface.js';
import { tierShapeAt, tierRadius } from './hooks/useCakeDesign.js';
import { edgeSeatSeed } from './placement.js';
import { TIER_RADII, PLACEMENT_MODES } from './constants.js';

/* ── A perched figure must be seeded against ITS OWN tier's rim ──────────────────────────────────
 *
 * ⚠️ THE TWO FALLBACKS DISAGREE, AND THEY AGREE ONLY AT INDEX 0 — which is exactly why this shipped.
 * `tierShape`'s round branch ends `radius: tier.radius ?? 1.2`, a flat constant, while the stack's
 * widths are positional (`TIER_RADII`). A design tier carries no radius of its own, so every tier
 * above the bottom was measured as the bottom one. A fondant doll perched on the top tier of a
 * two-tier cake was seeded 0.25 outside the wall and hung in mid-air — and because the rim DRAG
 * rail is built the same way, she could not be dragged back on either.
 *
 * These assert the ACCESSOR, not the symptom: anything that needs a tier's real width before the
 * canvas resolves it goes through `tierShapeAt`. */
describe('tierShapeAt resolves a tier\'s real width', () => {
  const bare = { shape: 'round' };              // a design tier, no radius of its own
  const tiers = [bare, bare, bare, bare];

  it('matches TIER_RADII at every index, where raw tierShape does not', () => {
    TIER_RADII.forEach((real, i) => {
      expect(tierShapeAt(tiers, i).radius).toBe(real);
    });
    // The bug, pinned: the raw call is the bottom tier's width at every index.
    expect(tierShape(bare).radius).toBe(1.2);
    expect(tierShapeAt(tiers, 1).radius).toBe(0.9);
  });

  it('seats a perch on its own rim rather than 0.25 outside it', () => {
    const pc = { perch: { edge_inset: 0.05 } };
    const onTopTier = edgeSeatSeed(pc, tierShapeAt(tiers, 1), PLACEMENT_MODES.PERCH);
    expect(onTopTier.z).toBeCloseTo(0.85, 6);          // 0.9 − 0.05, on the wall
    const wrong = edgeSeatSeed(pc, tierShape(bare), PLACEMENT_MODES.PERCH);
    expect(wrong.z - onTopTier.z).toBeCloseTo(0.30, 6); // what she used to float by
  });

  it('still honours a tier that DOES carry its own radius', () => {
    // Templates authored in admin write an explicit radius; it must win over the positional default.
    expect(tierShapeAt([{ shape: 'round', radius: 0.5 }], 0).radius).toBe(0.5);
    expect(tierRadius({ radius: 0.5 }, 3)).toBe(0.5);
  });

  it('falls back to the first tier when the index is out of range', () => {
    expect(tierShapeAt(tiers, 9).radius).toBe(TIER_RADII[0]);
  });
});

/* ── A ribbon tied at the rim hangs straight down ────────────────────────────────────────────────
 *
 * ⚠️ 35° IS A STATEMENT ABOUT THE `center` ANCHOR, not about every verge. It is the calibrated
 * recline for a body that rests its mid-spine on the lip and cantilevers over the edge — a
 * butterfly, a flower. A `hang` piece is tied AT the rim and falls down the OUTSIDE, pivoting at
 * its top, so the same default swings its tails out through the air, clear of the wall they should
 * lie against. Reported on the satin bow, whose row authored -13.5: over 1.12 of bow that is 0.26
 * of daylight at the tails.
 */
describe('edgeSeatSeed — the lean a verge starts with', () => {
  const shp = { kind: 'round', radius: 1.2 };
  const deg = (t) => t * 180 / Math.PI;

  it('still reclines a centre-seat verge by the calibrated 35°', () => {
    expect(deg(edgeSeatSeed({ verge: {} }, shp, PLACEMENT_MODES.VERGE).tiltAngle)).toBeCloseTo(35, 6);
    expect(deg(edgeSeatSeed({ verge: { seat: 'center' } }, shp, PLACEMENT_MODES.VERGE).tiltAngle)).toBeCloseTo(35, 6);
  });

  it('hangs a `hang` seat straight down when the row says nothing', () => {
    expect(deg(edgeSeatSeed({ verge: { seat: 'hang' } }, shp, PLACEMENT_MODES.VERGE).tiltAngle)).toBe(0);
  });

  it('still honours an authored lean on a hang seat', () => {
    const t = edgeSeatSeed({ verge: { seat: 'hang', angle_deg: -13.5 } }, shp, PLACEMENT_MODES.VERGE);
    expect(deg(t.tiltAngle)).toBeCloseTo(-13.5, 6);
  });
});

/* ── Where the rim line touches the model ────────────────────────────────────────────────────────
 *
 * The three named verge seats are three points on ONE line. A model of height 2·halfH touching the
 * rim at fraction f of that height, measured from the TOP, has its centre at `halfH·(2f − 1)`:
 * −halfH at f=0 (`hang`), 0 at f=0.5 (`center`), +halfH at f=1 (`base`).
 *
 * ⚠️ WHY A FRACTION AND NOT A NUDGE. A satin bow is tied at the centre of its KNOT, which sits at
 * f ≈ 0.10 — measured off the GLB, where the loops occupy the top 19% of the height. The same
 * correction expressed as `y_offset` is 0.106 at size 4 and 0.24 at size 9, and that bow's dial
 * spans 1.6 to 9, so a nudge is correct at exactly one size. Sandeep: *"the center of the folded
 * part of the bow should be on the edge."*
 */
describe('the verge anchor is a fraction of the model, not a world nudge', () => {
  const seatTerm = (f, halfH) => halfH * (2 * f - 1);

  it('reproduces the three named seats exactly', () => {
    expect(seatTerm(0,   0.56)).toBeCloseTo(-0.56, 9);   // hang   — top on the lip
    expect(seatTerm(0.5, 0.56)).toBeCloseTo( 0,    9);   // center — mid-spine on the lip
    expect(seatTerm(1,   0.56)).toBeCloseTo( 0.56, 9);   // base   — bottom on the lip
  });

  it('puts the bow\'s knot on the rim at f = 0.10, at EVERY size', () => {
    // halfH = STICKER_SIZE/2 x scale, since the bow's longest axis is its height.
    for (const scale of [1.6, 4, 9]) {
      const halfH = (0.28 / 2) * scale;
      const centre = seatTerm(0.10, halfH);
      const top = centre + halfH;              // relative to the rim line at 0
      const knot = top - 0.10 * (2 * halfH);   // the point the fraction names
      expect(knot).toBeCloseTo(0, 9);          // on the rim, whatever the size
    }
  });

  it('a y_offset doing the same job would be right at one size only', () => {
    const corr = (scale) => 0.10 * 0.28 * scale;   // f x height, in world units
    expect(corr(4)).toBeCloseTo(0.112, 6);
    expect(corr(9)).toBeCloseTo(0.252, 6);
    expect(corr(9) - corr(4)).toBeGreaterThan(0.1);
  });
});
