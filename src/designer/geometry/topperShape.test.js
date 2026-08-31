import { describe, it, expect } from 'vitest';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { topperShapes, pieceCount, components, bridgeLoose } from './topperShape.js';

// ── An acrylic topper has to be ONE piece ────────────────────────────────────────────────────────
//
// Everything else in this module is arithmetic. `pieceCount` is the part that decides whether the
// object can exist at all, and it is the one question the preview cannot answer: on screen a
// floating letter looks exactly like an attached one, and the difference shows up when somebody
// cuts it and posts a bag of loose letters to a customer.
//
// Tested against helvetiker — a BLOCK font whose letters never touch. That is deliberate: it is the
// worst case, so "not connected" here is the correct answer and proves the check can say no. A
// script would pass for reasons the test could not distinguish from the check being broken.
const FONT = new FontLoader().parse(helvetikerBold);

const build = (text, opts) => topperShapes(FONT, text, { height: 1, ...opts });

describe('topperShapes', () => {
  it('turns a word into shapes sized by height, not width', () => {
    const a = build('Amy'), b = build('Charlotte');
    expect(a.shapes.length).toBeGreaterThan(0);
    // Both stand the same tall; only the footprint grows. A baker's two toppers are the same object
    // at two lengths, not two different sizes.
    expect(a.height).toBeCloseTo(1, 6);
    expect(b.height).toBeCloseTo(1, 6);
    expect(b.width).toBeGreaterThan(a.width);
  });

  it('gives every glyph its counters', () => {
    // The hole in an 'o' has to survive to the cut file, or the topper comes back as a solid blob.
    const { parts } = build('oo');
    const withHoles = parts.filter(p => p.kind === 'glyph' && p.holes.length > 0);
    expect(withHoles.length).toBe(2);
  });

  it('is empty for empty input rather than throwing', () => {
    for (const t of ['', '   ', null, undefined]) {
      expect(build(t).shapes).toEqual([]);
    }
    expect(topperShapes(null, 'Amy').shapes).toEqual([]);
  });
});

describe('pieceCount — the check that decides if it can be cut', () => {
  it('says a block font is NOT one piece', () => {
    // Three separate letters, three separate objects. This is the failure the whole check exists
    // for, and a check that cannot produce this answer is worthless.
    const { parts } = build('Amy');
    expect(pieceCount(parts)).toBe(3);
  });

  it('a single letter is already one piece', () => {
    expect(pieceCount(build('A').parts)).toBe(1);
  });

  it('a baseline bar makes it one piece', () => {
    // The bar is the answer for any font whose letters do not meet — which is most of them.
    const { parts } = build('Amy', { baseline: { thickness: 0.1 } });
    expect(pieceCount(parts)).toBe(1);
  });

  it('the bar OVERLAPS the letters rather than sitting under them', () => {
    // A bar that merely touches the baseline is a butt joint at the one place the whole object
    // hangs from. Asserted as geometry, not as a comment: the bar's top must be above the letters'
    // lowest point.
    const plain = build('Amy');
    const withBar = build('Amy', { baseline: { thickness: 0.1 } });
    const bar = withBar.parts.find(p => p.kind === 'baseline');
    const barTop = Math.max(...bar.outer.map(p => p.y));
    const lettersBottom = Math.min(...plain.parts.flatMap(p => p.outer.map(q => q.y)));
    expect(barTop).toBeGreaterThan(lettersBottom);
  });

  it('weight can close a gap on its own', () => {
    // Bolding a script is the first thing to reach for before adding a bar. On a block font it
    // takes an absurd weight, which is exactly why the count is measured rather than assumed.
    const thin = build('AA');
    expect(pieceCount(thin.parts)).toBe(2);
    const fat = build('AA', { weight: 0.5 });
    expect(pieceCount(fat.parts)).toBeLessThan(pieceCount(thin.parts));
  });
});

describe('legs', () => {
  it('hang below the word and join what is above them', () => {
    const { parts, legs } = build('Amy', { baseline: { thickness: 0.1 }, legs: { count: 2 } });
    expect(legs).toHaveLength(2);
    // Still one piece: a prong joined to nothing is the part that snaps off, silently, because on
    // screen it looks attached.
    expect(pieceCount(parts)).toBe(1);
    const barBottom = Math.min(...parts.find(p => p.kind === 'baseline').outer.map(p => p.y));
    for (const leg of legs) expect(Math.min(...leg.outer.map(p => p.y))).toBeLessThan(barBottom);
  });

  it('land under material, not in the gaps between letters', () => {
    // A leg at a tidy fraction of the width can easily fall between two letters. Each anchor must
    // sit within some glyph's horizontal span.
    const { parts, legs } = build('Amelia', { legs: { count: 2 } });
    const spans = parts.filter(p => p.kind === 'glyph').map(p => {
      const xs = p.outer.map(q => q.x);
      return [Math.min(...xs), Math.max(...xs)];
    });
    for (const leg of legs) {
      const xs = leg.outer.map(q => q.x);
      const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
      expect(spans.some(([lo, hi]) => mid >= lo - 1e-6 && mid <= hi + 1e-6)).toBe(true);
    }
  });

  it('one leg is centred, and none is none', () => {
    expect(build('Amy', { legs: { count: 1 } }).legs).toHaveLength(1);
    expect(build('Amy', { legs: { count: 0 } }).legs).toHaveLength(0);
    expect(build('Amy').legs).toHaveLength(0);
  });
});

describe('components — naming what is loose', () => {
  it('finds the dot on an i, which is the commonest loose piece there is', () => {
    // A tittle is its own contour and touches nothing, so every i and j in a block font floats.
    // "2 pieces" on a word that looks finished sends an author hunting; this is what lets the studio
    // paint the offender red instead.
    const { parts } = build('Amelia', { baseline: { thickness: 0.09 } });
    const groups = components(parts);
    expect(groups).toHaveLength(2);
    // Body first, stragglers after — [0] is the topper, everything else is the bag.
    expect(groups[0].length).toBeGreaterThan(groups[1].length);
    expect(groups[1]).toHaveLength(1);
    // And it really is a glyph, not the bar or a leg.
    expect(parts[groups[1][0]].kind).toBe('glyph');
  });

  it('agrees with pieceCount, always', () => {
    for (const opts of [{}, { baseline: { thickness: 0.09 } }, { baseline: { thickness: 0.09 }, legs: { count: 2 } }]) {
      const { parts } = build('Amelia', opts);
      expect(components(parts).length).toBe(pieceCount(parts));
    }
  });

  it('is empty for nothing, and one group for one part', () => {
    expect(components([])).toEqual([]);
    expect(components(build('A').parts)).toHaveLength(1);
  });

  it('covers every part exactly once', () => {
    // A part missing from every group would be invisible to the studio — never highlighted, never
    // counted, and cut anyway.
    const { parts } = build('Happy Birthday', { baseline: { thickness: 0.07 }, legs: { count: 3 } });
    const seen = components(parts).flat().sort((a, b) => a - b);
    expect(seen).toEqual(parts.map((_, i) => i));
  });
});

describe('bridgeLoose — making an i-dot part of the topper', () => {
  it('joins the stray dot, taking Amelia to one piece', () => {
    // The whole reason this exists: without it every name containing an i or a j comes back loose,
    // which is most names, and the feature would only work with scripts nobody has sourced yet.
    const { parts } = build('Amelia', { baseline: { thickness: 0.09 } });
    expect(pieceCount(parts)).toBe(2);
    const joined = [...parts, ...bridgeLoose(parts, { width: 0.02 })];
    expect(pieceCount(joined)).toBe(1);
  });

  it('does nothing when there is nothing to join', () => {
    const { parts } = build('Amy', { baseline: { thickness: 0.1 } });
    expect(pieceCount(parts)).toBe(1);
    expect(bridgeLoose(parts)).toEqual([]);
  });

  it('drops the stem DOWNWARD from the stray part, not up from the bar', () => {
    // A stem drawn from the bar to the dot would cross the letter it is joining and read as a
    // stripe through the i. It has to start at the dot and stop at the first thing beneath it.
    const { parts } = build('Amelia', { baseline: { thickness: 0.09 } });
    const stray = components(parts)[1][0];
    const strayLow = Math.min(...parts[stray].outer.map(p => p.y));
    const [bridge] = bridgeLoose(parts, { width: 0.02 });
    const top = Math.max(...bridge.outer.map(p => p.y));
    const bottom = Math.min(...bridge.outer.map(p => p.y));
    expect(top).toBeGreaterThanOrEqual(strayLow - 1e-6);   // reaches the dot
    expect(bottom).toBeLessThan(strayLow);                 // and goes down from it
  });

  it('sits under the stray part it is joining', () => {
    const { parts } = build('Amelia', { baseline: { thickness: 0.09 } });
    const stray = components(parts)[1][0];
    const sx = parts[stray].outer.map(p => p.x);
    const [bridge] = bridgeLoose(parts, { width: 0.02 });
    const bx = bridge.outer.map(p => p.x);
    const mid = (Math.min(...bx) + Math.max(...bx)) / 2;
    expect(mid).toBeGreaterThanOrEqual(Math.min(...sx) - 1e-6);
    expect(mid).toBeLessThanOrEqual(Math.max(...sx) + 1e-6);
  });

  it('joins several strays, not just the first', () => {
    // "iii" is three dots and three stems: six contours, three of them floating.
    const { parts } = build('iii', { baseline: { thickness: 0.09 } });
    const before = pieceCount(parts);
    expect(before).toBeGreaterThan(1);
    expect(pieceCount([...parts, ...bridgeLoose(parts, { width: 0.02 })])).toBe(1);
  });
});
