import { describe, it, expect } from 'vitest';
import { pipingLayerAtClick } from './pipingPick.js';

/* ── A body click near a border, with more than one border there ─────────────────────────────────
 *
 * Sandeep, on a cake wearing a chocolate drip AND a ring of chocolate balls on the same rim:
 * *"when chocolate ball is on chocolate drip, chocolate ball is loosing its pointer. when i click
 * on chocolate ball, drip popup opens."*
 *
 * The rule used to be `tops[0]` — the first layer on the rim, whichever one was clicked. Right for
 * years, because a rim carried one border; a coin-flip the moment it carries two, and the loser is
 * unreachable, which reads as a decoration with no pointer at all.
 */
const T = { topY: 2, yBase: 1, height: 1 };            // band = 0.25 at each end
const drip = { layerId: 'drip' };
const ring = { layerId: 'ring' };

describe('pipingLayerAtClick', () => {
  it('opens the one border there is', () => {
    expect(pipingLayerAtClick({ ...T, tops: [drip], bottoms: [], y: 1.9 }))
      .toEqual({ zone: 'rim', layerId: 'drip' });
    expect(pipingLayerAtClick({ ...T, tops: [], bottoms: [drip], y: 1.1 }))
      .toEqual({ zone: 'board', layerId: 'drip' });
  });

  /* ⚠️ THE REPORTED FAULT. Two layers on one rim and a click on the cake between them: the old rule
     answered "the first one", so the drip opened and the ball ring could not be reached at all. */
  it('declines to guess when a rim carries two', () => {
    expect(pipingLayerAtClick({ ...T, tops: [drip, ring], bottoms: [], y: 1.9 })).toBeNull();
  });

  it('declines on the board too, for the same reason', () => {
    expect(pipingLayerAtClick({ ...T, tops: [], bottoms: [drip, ring], y: 1.1 })).toBeNull();
  });

  /* ⚠️ DECLINING IS NOT THE SAME AS BREAKING THE RINGS. Null means "the tier's own click handles
     it"; each ring still renders its own shell and reports its own layerId, so a click ON a ball
     opens the ball ring. This function only ever sees clicks that MISSED every ring. */
  it('answers nothing away from either band', () => {
    expect(pipingLayerAtClick({ ...T, tops: [drip], bottoms: [ring], y: 1.5 })).toBeNull();
  });

  it('answers nothing when the rim is bare', () => {
    expect(pipingLayerAtClick({ ...T, tops: [], bottoms: [], y: 1.95 })).toBeNull();
  });

  /* The band is a quarter of the TIER, not a fixed distance — a short tier and a tall one both give
     a quarter of themselves, which is the rule this replaced, kept exactly. */
  it('scales its band with the tier', () => {
    const tall = { topY: 5, yBase: 1, height: 4 };     // band = 1
    expect(pipingLayerAtClick({ ...tall, tops: [drip], bottoms: [], y: 4.2 }))
      .toEqual({ zone: 'rim', layerId: 'drip' });
    expect(pipingLayerAtClick({ ...tall, tops: [drip], bottoms: [], y: 3.8 })).toBeNull();
  });

  /* ⚠️ THE TWO BANDS CANNOT OVERLAP, and I wrote a test that assumed they could — a quarter of the
     height at each end leaves half the tier between them at every size. The real ordering question
     is simpler: a click inside the rim band is answered by the rim even when the board also carries
     a border, and never falls through to it. */
  it('answers the rim for a rim-band click, with a border at both ends', () => {
    expect(pipingLayerAtClick({ ...T, tops: [drip], bottoms: [ring], y: 1.9 }))
      .toEqual({ zone: 'rim', layerId: 'drip' });
    expect(pipingLayerAtClick({ ...T, tops: [drip], bottoms: [ring], y: 1.1 }))
      .toEqual({ zone: 'board', layerId: 'ring' });
  });
});
