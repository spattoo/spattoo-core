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
