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

  /* ⚠️ THE MEDIUM MUST NOT DECIDE THE COLOUR — but "the albedo it hands the renderer" and "the colour
   * that was asked for" are no longer the same string, and that is deliberate. `chocolateMaterialProps`
   * divides the albedo by the light this surface measurably receives, so the RENDER is the chosen
   * colour; handing over the raw value is what made a teal garnish arrive as pale mint. The invariant
   * this test protects is that the medium does not IMPOSE a colour of its own (chocolate is not forced
   * brown) — so it now checks the correction is a faithful transform of what was asked, not that it is
   * a no-op. `garnishMaterial.test.js` states the same convention for the same reason. */
  it('renders the colour asked for rather than deciding one of its own', () => {
    const asked = '#EDE0C8';
    const out = MEDIA.chocolate.material({ softness: 0.5 }, asked).color;
    // Still that colour's own hue, just darkened by the measured light — never a colour of the
    // medium's choosing, and never lighter than what was asked for.
    const [r, g, b] = out.match(/\d+/g).map(Number);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);            // #EDE0C8 is warm: R > G > B, and the order survives
    expect(r).toBeLessThan(0xED);            // divided by the light, so darker than asked
    // A different asked colour must give a different albedo — proof it is transforming, not choosing.
    expect(MEDIA.chocolate.material({ softness: 0.5 }, '#3A2117').color).not.toBe(out);
  });
});
