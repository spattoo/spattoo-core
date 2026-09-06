import { describe, it, expect } from 'vitest';
import { TOPPER_FACES, DEFAULT_TOPPER_FACE, loadTopperFace, faceFit, isMonoline } from './topperFaces.js';
import { topperShapes } from './topperShape.js';

/* ── Every face has to actually be a different face ──────────────────────────────────────────────
 *
 * ⚠️ The font picker drew all eight acrylic buttons the same, because it previewed with
 * `creamFontPreview` — which only knows the CREAM faces and falls back for anything else. The
 * picker looked complete and told you nothing; you could not tell Great Vibes from Pinyon without
 * choosing one and looking at the cake.
 *
 * The preview is now built from `topperShapes` — the same geometry the thing is cut from — so it
 * cannot disagree with what you get. What this pins is the property underneath: each registered key
 * really does load a distinct face.
 */
describe('the face registry', () => {
  const sample = async (key) => {
    const font = await loadTopperFace(key);
    return topperShapes(font, 'Abc', { height: 1, lines: 1, stroke: 0.12, tracking: faceFit(key) });
  };
  const signature = (t) =>
    t.parts.map(p => p.outer.map(q => `${q.x.toFixed(3)},${q.y.toFixed(3)}`).join(';')).join('|');

  it('gives every key its own outlines', async () => {
    const seen = new Map();
    for (const key of Object.keys(TOPPER_FACES)) {
      const t = await sample(key);
      expect(t.parts.length, `${key} produced nothing`).toBeGreaterThan(0);
      const sig = signature(t);
      expect(seen.get(sig), `${key} is identical to ${seen.get(sig)}`).toBeUndefined();
      seen.set(sig, key);
    }
    expect(seen.size).toBe(Object.keys(TOPPER_FACES).length);
  });

  it('resolves an unknown key to the default EVERYWHERE, not just when loading', async () => {
    /* ⚠️ A design carrying a face an admin has since withdrawn must still render, and render the
     * same as the default in every respect. `loadTopperFace` substituted the default while
     * `faceFit` returned 0 — so it came out as the right letters at the wrong spacing, set as drawn
     * with a bridge across every gap. This test found that while trying to assert something else. */
    expect(faceFit('no_such_face')).toBe(faceFit(DEFAULT_TOPPER_FACE));
    expect(signature(await sample('no_such_face'))).toBe(signature(await sample(DEFAULT_TOPPER_FACE)));
  });

  it('knows which faces have a stroke to set', () => {
    // The stroke is a control on a centreline face and a property of the drawing on an outline one.
    // The studio shows that slider off `kind`; getting it backwards offers a knob that does nothing.
    expect(isMonoline('ems_allure')).toBe(true);
    expect(isMonoline('great_vibes')).toBe(false);
    for (const [key, f] of Object.entries(TOPPER_FACES)) {
      expect(isMonoline(key)).toBe(f.kind === 'centreline');
    }
  });

  it('carries a fit for every face, and they are all tighter than as-drawn', () => {
    // A face with no fit would set at its print spacing and need a bridge across every gap.
    for (const key of Object.keys(TOPPER_FACES)) {
      expect(typeof faceFit(key), key).toBe('number');
      expect(faceFit(key), key).toBeLessThan(0);
    }
  });
});
