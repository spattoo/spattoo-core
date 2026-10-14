import { describe, it, expect } from 'vitest';
import { GYP_PLACEMENTS, gypPlacement, GYP_DEFAULTS } from './gypsophila.js';

/* ── How a filler sits on each surface is the ROW's to change ────────────────────────────────────
 *
 * Sandeep: *"placement is not driven by config. so many violations on driving the rendering from
 * config… we already have invariant to honor the config but surprisingly many times its missing."*
 *
 * These four sets used to be written out in the tier card, which breaks rule 3 twice over: an admin
 * could not change how a filler arrives on a rim without a deploy, and two rows over one generator
 * could differ only in the sprig, never in how it is laid.
 */
describe('gypPlacement', () => {
  it('seeds every placement the card offers', () => {
    expect(Object.keys(GYP_PLACEMENTS).sort()).toEqual(['board', 'free', 'rim', 'side']);
  });

  it('returns the seeded set when the row says nothing', () => {
    expect(gypPlacement('rim')).toEqual(GYP_PLACEMENTS.rim);
    expect(gypPlacement('rim', {})).toEqual(GYP_PLACEMENTS.rim);
    expect(gypPlacement('rim', { gyp: {} })).toEqual(GYP_PLACEMENTS.rim);
  });

  it('lets a row override one value without losing the rest', () => {
    const got = gypPlacement('rim', { gyp: { zones: { rim: { lay: 10 } } } });
    expect(got.lay).toBe(10);
    expect(got.spacing).toBe(GYP_PLACEMENTS.rim.spacing);
    expect(got.rimIn).toBe(GYP_PLACEMENTS.rim.rimIn);
  });

  it('keeps one row\'s zones out of another zone', () => {
    const got = gypPlacement('side', { gyp: { zones: { rim: { lay: 10 } } } });
    expect(got.lay).toBe(GYP_PLACEMENTS.side.lay);
  });

  it('is unknown-key safe, so a row naming a zone this build has not got returns nothing odd', () => {
    expect(gypPlacement('nowhere')).toEqual({});
    expect(gypPlacement('nowhere', { gyp: { zones: { nowhere: { lay: 3 } } } })).toEqual({ lay: 3 });
  });

  /* ⚠️ PLACEMENT, NOT THE SPRIG. What a flower IS stays one answer for the whole element — it is
     one flower wherever it is put — so none of these sets may carry the sprig's own shape. Getting
     this wrong would let a row be two different flowers depending on where it landed. */
  it('carries no sprig geometry', () => {
    const sprig = ['levels', 'forks', 'spread', 'shrink', 'thickness', 'florets',
                   'floretSize', 'floretVary', 'size', 'seed'];
    for (const [name, set] of Object.entries(GYP_PLACEMENTS)) {
      for (const k of sprig) {
        expect(set[k], `${name} must not decide the sprig's ${k}`).toBeUndefined();
      }
    }
  });

  /* The wall's own correction, pinned where it cannot drift back: at 90° a sprig points straight
     out and the camera sees it end-on, which reads as sprinkles rather than flowers. */
  it('lays the wall sprigs along the wall, not at the viewer', () => {
    expect(GYP_PLACEMENTS.side.lay).toBeLessThan(60);
    expect(GYP_PLACEMENTS.board.lay).toBeGreaterThan(60);   // a board is card: laid, not planted
  });

  it('does not duplicate what GYP_DEFAULTS already says', () => {
    for (const set of Object.values(GYP_PLACEMENTS)) {
      expect(set.size).toBeUndefined();
      expect(set.bloom).toBeUndefined();
    }
    expect(GYP_DEFAULTS.size).toBeGreaterThan(0);
  });
});
