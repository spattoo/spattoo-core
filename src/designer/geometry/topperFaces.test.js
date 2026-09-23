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
 * That preview was then rebuilt from `topperShapes` — the same geometry the thing is cut from — so
 * it could not disagree with what you get.
 *
 * ⚠️ AND THE PREVIEW IS NOW GONE ALTOGETHER (2026-09-20): the picker is a scrolling strip of font
 * NAMES, because eleven specimen tiles cost three rows on a phone and the cake itself is the live
 * preview, sitting above the sheet while you tap along the strip. See the note where
 * AcrylicFontButton used to live in CakeDesigner.jsx.
 *
 * ⚠️ THIS TEST IS NOT OBSOLETE BECAUSE OF THAT, and it would be easy to think so. What it pins is
 * the property UNDERNEATH the picker, not the picker: each registered key really does load a
 * distinct face. That has to hold whether or not anything draws a swatch — a key that silently
 * falls back gives every topper the same lettering on the cake, which is the same bug one layer
 * down and with no picture to reveal it.
 */
describe('the face registry', () => {
  /* The default is a DEFAULT, not the head of the list — it is what an unauthored row and an
     unknown key both land on, so it is the face most cakes wear without anyone choosing it. Great
     Vibes, which is first, is the heaviest script here and reads as a slab at a topper's size. */
  it('defaults to a face that is on the list but is not simply the first one', () => {
    const keys = Object.keys(TOPPER_FACES);
    expect(keys).toContain(DEFAULT_TOPPER_FACE);
    expect(DEFAULT_TOPPER_FACE).not.toBe(keys[0]);
  });

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

/* ── The fit has to survive a LONG word, not just "Ava" ──────────────────────────────────────────
 * Parisienne and Pinyon Script shipped at -0.08, judged on short words, and turned "Happy
 * Anniversary" into a tangle — the n-n-i-v run collapsing into one shape. Reported 2026-09-23.
 * These pin the ceiling rather than the exact number, because the number is set by LOOKING and a
 * test that froze it would fail every time someone legitimately re-tuned by eye. What must not
 * happen again is a fine copperplate being tightened the way a wide face can be. */
describe('the fit a face wants', () => {
  it('keeps the two fine copperplates loose enough for a long word', () => {
    for (const key of ['parisienne', 'pinyon_script']) {
      expect(faceFit(key)).toBeGreaterThanOrEqual(-0.05);
      expect(faceFit(key)).toBeLessThan(0);          // still negative: letters must close up
    }
  });

  it('leaves every face tighter than the value that eats a letter', () => {
    // -0.16 on Parisienne rendered "Bithday" — the r gone. Nothing may go near that again.
    for (const key of Object.keys(TOPPER_FACES)) expect(faceFit(key)).toBeGreaterThan(-0.15);
  });
});
