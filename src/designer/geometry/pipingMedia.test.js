import { describe, it, expect } from 'vitest';
import { MEDIA, mediumOf, DEFAULT_MEDIUM } from './pipingMedia.js';
import { NOZZLE_BY_KEY } from './creamPen.js';

/* One pen, two media. What these protect is that the difference stays DATA — and above all that a
 * stroke piped before chocolate existed still renders as the cream it was.
 */

describe('what is in the bag', () => {
  /* ⚠️ THE COMPATIBILITY CASE. Every stroke saved before this existed has no `medium` at all. If an
   * unknown key fell through to chocolate, or threw, every cake in the database would change. */
  it('falls back to cream for a stroke with no medium, or an unknown one', () => {
    expect(mediumOf(undefined)).toBe(MEDIA.cream);
    expect(mediumOf(null)).toBe(MEDIA.cream);
    expect(mediumOf('royal-icing-someday')).toBe(MEDIA.cream);
    expect(DEFAULT_MEDIUM).toBe('cream');
  });

  // Chocolate is glossy, cream is matte — that is the whole reason chocolate read as buttercream.
  it('shades chocolate glossy and cream matte at the same setting', () => {
    const choc  = MEDIA.chocolate.material({ softness: 0.85 }, '#4A2C1B');
    const cream = MEDIA.cream.material({ softness: 0.85 }, '#ffffff');
    expect(choc.roughness).toBeLessThan(cream.roughness);
    expect(choc.clearcoat).toBeGreaterThan(0.9);
    expect(cream.clearcoat).toBeUndefined();      // cream has sheen, not a lacquer layer
    expect(cream.sheen).toBeGreaterThan(0);
  });

  /* ⚠️ THE RHYTHM COMES FROM THE TIP, NOT FROM THIS TABLE. An earlier version declared
   * `character: { twist: 0, ruffle: 0 }` here and this test asserted it — and both were theatre,
   * because nothing read the field. What actually makes chocolate smooth is defaulting to the round
   * tip, which carries twist 0 in creamPen's own nozzle list. Assert the real mechanism. */
  it('gets a smooth line from the tip, not from a second switch', () => {
    expect(NOZZLE_BY_KEY[MEDIA.chocolate.defaults.nozzle].twist).toBe(0);
    expect(NOZZLE_BY_KEY[MEDIA.chocolate.defaults.nozzle].ruffle).toBe(0);
    expect(NOZZLE_BY_KEY[MEDIA.cream.defaults.nozzle].twist).toBe(1);
    expect(MEDIA.chocolate.character).toBeUndefined();
  });

  it('gives chocolate a fine round tip by default', () => {
    expect(MEDIA.chocolate.defaults.nozzle).toBe('round');
    expect(MEDIA.chocolate.defaults.thickness).toBeLessThan(MEDIA.cream.defaults.thickness ?? 0.03);
  });

  it('passes the colour through rather than deciding it', () => {
    expect(MEDIA.chocolate.material({ softness: 0.5 }, '#EDE0C8').color).toBe('#EDE0C8');
  });
});
