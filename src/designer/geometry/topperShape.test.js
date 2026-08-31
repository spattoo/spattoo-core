import { describe, it, expect } from 'vitest';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { topperShapes, pieceCount, components, bridgeLoose } from './topperShape.js';
import greatVibes from './typefaces/great-vibes.json';

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

describe('stacking — the reason a phrase can exist at all', () => {
  // Sized to the cake, at a fixed span, letters shrink as the phrase grows. That is the whole
  // argument for rows, and it is checked as an inequality rather than described in a comment.
  const atSpan = (text, opts) => {
    const probe = topperShapes(FONT, text, { height: 1, ...opts });
    return topperShapes(FONT, text, { height: 1 / probe.width, ...opts });  // one unit wide
  };

  it('makes the letters BIGGER for the same width across the cake', () => {
    const one = atSpan('Happy Birthday', { lines: 1 });   // explicit: the default now stacks on its own
    const two = atSpan('Happy Birthday', { lines: 2 });
    expect(two.rows).toHaveLength(2);
    expect(one.width).toBeCloseTo(two.width, 6);          // same span, by construction
    expect(two.capHeight).toBeGreaterThan(one.capHeight * 1.5);
  });

  it('breaks where the WIDEST row is narrowest', () => {
    /* ⚠️ Asserted as the property, because guessing the answer got it backwards.
     *
     * "Happy" / "1st Birthday" looks like the tidy split and it is the WORSE one: its long row runs
     * 8.01 ems against 6.70 for "Happy 1st" / "Birthday", so it sets smaller on the same cake. The
     * rule is not "balance the word counts" and not "put the short word on top" — it is minimise the
     * widest row, and the only honest way to test it is to price the alternative and compare. */
    const chosen = atSpan('Happy 1st Birthday', { lines: 2 }).rows;
    expect(chosen).toHaveLength(2);
    const widest = (rows) => Math.max(...rows.map(r => topperShapes(FONT, r, { height: 1 }).width));
    for (const alt of [['Happy', '1st Birthday'], ['Happy 1st Birthday']]) {
      if (alt.join(' ') === chosen.join(' ')) continue;
      expect(widest(chosen)).toBeLessThanOrEqual(widest(alt));
    }
    // And it really does set larger than the same phrase on one line.
    expect(atSpan('Happy 1st Birthday', { lines: 2 }).capHeight)
      .toBeGreaterThan(atSpan('Happy 1st Birthday', { lines: 1 }).capHeight);
  });

  it('lets the author override the balance with a newline', () => {
    // Somebody deciding where their own phrase breaks beats any rule, so an explicit break wins
    // even when it is the worse split.
    expect(topperShapes(FONT, 'Happy 1st\nBirthday', { lines: 2 }).rows)
      .toEqual(['Happy 1st', 'Birthday']);
    expect(topperShapes(FONT, 'Happy\nBirthday').rows).toHaveLength(2);   // without asking for lines
  });

  it('never asks for more rows than there are words', () => {
    expect(topperShapes(FONT, 'Amelia', { lines: 3 }).rows).toEqual(['Amelia']);
    expect(topperShapes(FONT, 'Happy Birthday', { lines: 9 }).rows).toHaveLength(2);
  });

  it('is as tall as the block and as wide as the WIDEST row', () => {
    const t = topperShapes(FONT, 'Happy\nBirthday', { height: 1 });
    expect(t.height).toBeCloseTo(1, 6);
    const rowWidth = (r) => topperShapes(FONT, r, { height: t.capHeight }).width;
    // Not the sum of the rows — a stacked topper is no wider than its longest line.
    expect(t.width).toBeLessThan(rowWidth('Happy') + rowWidth('Birthday'));
    expect(t.width).toBeGreaterThan(t.capHeight);
  });

  it('puts the bar under the BOTTOM row, not through the middle', () => {
    // ⚠️ At y = 0 the bar lands on the TOP row's baseline — a stripe across the middle of the
    // topper, joined to the words above it and holding up nothing. The whole object hangs here.
    const t = topperShapes(FONT, 'Happy\nBirthday', { height: 1, baseline: { thickness: 0.08 } });
    const bar = t.parts.find(p => p.kind === 'baseline');
    const barTop = Math.max(...bar.outer.map(p => p.y));
    const glyphs = t.parts.filter(p => p.kind === 'glyph');
    const lowest = Math.min(...glyphs.flatMap(p => p.outer.map(q => q.y)));
    expect(barTop).toBeLessThan(0);                        // below the block's centre
    expect(barTop).toBeGreaterThan(lowest);                // and biting up into the bottom row
  });

  it('stands on legs that reach the bottom row', () => {
    const { parts, legs } = topperShapes(FONT, 'Happy\nBirthday',
      { height: 1, baseline: { thickness: 0.08 }, legs: { count: 2, length: 0.3 } });
    expect(legs).toHaveLength(2);
    const barBottom = Math.min(...parts.find(p => p.kind === 'baseline').outer.map(p => p.y));
    for (const l of legs) expect(Math.min(...l.outer.map(p => p.y))).toBeLessThan(barBottom);
  });

  it('two rows of a block font are loose until they are bridged', () => {
    // Rows do not touch each other, so a bar under the bottom one leaves the whole top row floating
    // — a bag of letters, and the failure is invisible in a preview. On a script the rows interlock
    // and this is where lineGap earns its keep; on a block font the stems are what save it.
    const t = topperShapes(FONT, 'Happy\nBirthday', { height: 1, baseline: { thickness: 0.08 } });
    expect(pieceCount(t.parts)).toBeGreaterThan(1);
    expect(pieceCount([...t.parts, ...bridgeLoose(t.parts, { width: 0.02 })])).toBe(1);
  });

  it('trades stack height for letter size, but only at a fixed HEIGHT', () => {
    // Held to one block height, closing the rows up leaves more of it for the letters.
    const wide = topperShapes(FONT, 'Happy\nBirthday', { height: 1, lineGap: 1.4 });
    const tight = topperShapes(FONT, 'Happy\nBirthday', { height: 1, lineGap: 0.8 });
    expect(tight.capHeight).toBeGreaterThan(wide.capHeight);

    /* ⚠️ And NOT at a fixed span, which is how a topper is really sized.
     *
     * Worth pinning down because the opposite is the intuitive guess and it is wrong: once the width
     * across the cake is fixed, the letter size follows from the widest ROW's aspect and nothing
     * else. Tightening the gap does not buy a bigger letter — it makes the object stand shorter and
     * brings the rows close enough to touch. Both real effects, neither of them the letter size. */
    const atSpanGap = (g) => {
      const probe = topperShapes(FONT, 'Happy\nBirthday', { height: 1, lineGap: g });
      return topperShapes(FONT, 'Happy\nBirthday', { height: 1 / probe.width, lineGap: g });
    };
    const a = atSpanGap(0.8), b = atSpanGap(1.4);
    expect(a.capHeight).toBeCloseTo(b.capHeight, 6);
    expect(a.height).toBeLessThan(b.height);
  });
});

describe('auto — the caller does not have to know rows exist', () => {
  /* ⚠️ The whole feature was invisible while this was opt-in.
   *
   * Stacking shipped behind a `lines` option and "Happy Birthday" still came out as one 11mm line,
   * because nothing types `lines: 2` on a customer's behalf. The shape of the phrase decides this. */
  const at = (text, opts) => topperShapes(FONT, text, { height: 1, ...opts });

  it('stacks a phrase without being asked, and leaves a name alone', () => {
    expect(at('Happy Birthday').rows).toHaveLength(2);
    expect(at('Amelia').rows).toEqual(['Amelia']);
    expect(at('Amy').rows).toEqual(['Amy']);
  });

  it('takes as many rows as the phrase needs, up to the cap', () => {
    expect(at('Happy 1st Birthday Amelia').rows.length).toBeGreaterThan(1);
    expect(at('Happy 1st Birthday Amelia', { maxLines: 2 }).rows).toHaveLength(2);
  });

  it('never breaks a single word, however long', () => {
    // No spaces means no break points. Chopping "Bartholomew" in half is worse than small letters.
    expect(at('Bartholomewwwwwwwwww').rows).toHaveLength(1);
  });

  it('clears the ratio it aims at, measured on the NARROWEST acrylic', () => {
    /* ⚠️ On `feature`, not on `capHeight`. The rule used to be letter height and this test was
     * written against it; both were wrong for the same reason — a script's box is mostly loops, so
     * the letters read tall while the stroke that gets cut is a hairline. */
    const t = at('Happy Birthday', { fitAspect: 60 });
    expect(t.width / t.feature).toBeLessThanOrEqual(60);

    /* And when the bar CANNOT be met it gives its best rather than throwing or giving up: two words
     * break into two rows and no further, so 40 is simply unreachable for this phrase. Silently
     * returning the one-row version would be the dangerous answer — the caller would ship a hairline
     * believing the check had passed. */
    const hard = at('Happy Birthday', { fitAspect: 40 });
    expect(hard.rows).toHaveLength(2);
    expect(hard.width / hard.feature).toBeLessThan(t.width / t.feature + 1e-6);

    // The bar is doing the deciding, in both directions: slack enough and it stays on one row.
    const one = at('Happy Birthday', { lines: 1 });
    expect(at('Happy Birthday', { fitAspect: one.width / one.feature + 1 }).rows).toHaveLength(1);
    expect(at('Happy Birthday', { fitAspect: one.width / one.feature - 1 }).rows.length)
      .toBeGreaterThan(1);
  });

  it('measures the thinnest stroke rather than guessing it from the cap', () => {
    /* The estimate this replaced was a fifth of the cap, asserted as "what a bold sans stem
     * measures". It is wrong for the bold sans too — by a factor of nearly three — and a hairline
     * script would have sailed past the check that exists to catch hairlines. */
    const t = at('Happy Birthday', { lines: 1 });
    expect(t.feature).toBeGreaterThan(0);
    expect(t.feature).toBeLessThan(t.capHeight * 0.15);

    // An 'o' is a ring, and 2A/P is exactly a ring's wall thickness — so the number is a width,
    // not a proxy that happens to sort correctly.
    const o = at('o', { lines: 1 });
    expect(o.feature).toBeGreaterThan(0);
    expect(o.feature).toBeLessThan(o.capHeight / 2);
  });

  it('still does what it is told when told', () => {
    expect(at('Happy Birthday', { lines: 1 }).rows).toHaveLength(1);
    expect(at('Amelia', { lines: 2 }).rows).toHaveLength(1);        // one word, nothing to break
    expect(at('Happy\nBirthday', { lines: 1 }).rows).toHaveLength(2);  // the newline still wins
  });
});

describe('weight — the remedy offered for a hairline', () => {
  /* ⚠️ Tested against a SCRIPT, because the bug this catches is invisible in a block font.
   *
   * `offsetRing` takes the right-hand normal to the direction of travel, which points out of a
   * counter-clockwise ring and into a clockwise one. Helvetiker winds every contour the same way, so
   * every test here passed while Great Vibes — which does not — had letters SHRINK when asked to
   * thicken. Weight read as doing nothing and quietly raised the piece count: the one control the
   * docs point at for a hairline, breaking the exact thing it exists to fix.
   */
  const SCRIPT = new FontLoader().parse(greatVibes);

  it('thickens the thinnest stroke, whichever way a contour winds', () => {
    const at = (w) => topperShapes(SCRIPT, 'Happy Birthday', { height: 1, weight: w, lines: 1 });
    const [a, b, c] = [at(0), at(0.004), at(0.01)];
    expect(b.feature).toBeGreaterThan(a.feature);
    expect(c.feature).toBeGreaterThan(b.feature);
  });

  it('never breaks a design apart by thickening it', () => {
    // Fattening strokes can only ever make letters meet. A rising count means some ring went the
    // wrong way, which is exactly how the winding bug announced itself.
    const at = (w) => pieceCount(topperShapes(SCRIPT, 'Happy Birthday', { height: 1, weight: w, lines: 1 }).parts);
    const base = at(0);
    for (const w of [0.004, 0.008, 0.012]) expect(at(w)).toBeLessThanOrEqual(base);
  });

  it('is measured on the letters as they will be cut, not before', () => {
    // The weight used to be applied after the rows were measured, so `feature` and the row-count
    // rule both judged a design that never ships.
    const thin = topperShapes(SCRIPT, 'Happy Birthday', { height: 1, weight: 0, lines: 1 });
    const fat = topperShapes(SCRIPT, 'Happy Birthday', { height: 1, weight: 0.02, lines: 1 });
    expect(fat.feature / thin.feature).toBeGreaterThan(1.2);
  });
});

describe('nesting — rows that meet instead of rows that get stapled', () => {
  /* ⚠️ The bug this fixes was VISIBLE and shipped anyway.
   *
   * Stacked at a fixed gap the rows never touch, so `bridgeLoose` dropped a stem from every floating
   * letter of the top row straight down through the bottom one — six hairlines ruled through the
   * middle of a script. No real two-line topper has them: the lines are set close enough that the
   * descenders of the upper run into the ascenders of the lower and the letterforms join themselves.
   */
  const SCRIPT = new FontLoader().parse(greatVibes);
  const at = (opts) => topperShapes(SCRIPT, 'Happy\nBirthday', { height: 1, lineGap: 1.2, ...opts });

  it('pulls the rows together until they actually touch', () => {
    const loose = at({ nest: false }), nested = at({});
    expect(nested.lineGap).toBeLessThan(loose.lineGap);
    expect(pieceCount(nested.parts)).toBeLessThan(pieceCount(loose.parts));
  });

  it('leaves fewer stems to drop, which was the whole complaint', () => {
    expect(bridgeLoose(at({}).parts, { width: 0.02 }).length)
      .toBeLessThan(bridgeLoose(at({ nest: false }).parts, { width: 0.02 }).length);
  });

  it('takes the LOOSEST gap that connects, not the tightest', () => {
    // Past the first point of contact, more overlap only makes the two lines harder to read. So the
    // result must sit just below where it stops connecting, not down at the floor.
    const g = at({}).lineGap;
    expect(g).toBeGreaterThan(at({}).lineGap - 0.05);
    expect(pieceCount(at({ nest: false, lineGap: g }).parts))
      .toBeLessThan(pieceCount(at({ nest: false, lineGap: g + 0.15 }).parts));
  });

  it('never tightens past minGap, and leaves one row alone', () => {
    expect(at({ minGap: 1.1 }).lineGap).toBeGreaterThanOrEqual(1.1);
    // A single row has nothing to nest against and must come back exactly as asked.
    expect(topperShapes(SCRIPT, 'Amelia', { height: 1, lineGap: 1.2 }).lineGap).toBeCloseTo(1.2, 6);
  });

  it('keeps the requested gap when the rows can never meet', () => {
    // Crushing lines that will not touch leaves them unreadable AND still bridged. Better to stay
    // legible and let the stems do their job, which the piece count still reports honestly.
    const far = topperShapes(SCRIPT, 'Amy\nBob', { height: 1, lineGap: 1.2, minGap: 1.15 });
    expect(far.lineGap).toBeCloseTo(1.2, 6);
  });
});

describe('bridging along the shortest path, not straight down', () => {
  /* ⚠️ A stem that falls vertically is right for a tittle and wrong for everything else.
   *
   * In "Happy Birthday" set in Great Vibes, one stray letter's nearest neighbour is 1.35mm to the
   * SIDE. Falling downward the stem missed it entirely and ran on until it hit the row below — a bar
   * ruled through the whole design to reach material that was never the closest thing to it. It was
   * plainly visible in every render and shipped anyway, so it gets a test.
   */
  const SCRIPT = new FontLoader().parse(greatVibes);
  const span = (text, opts = {}) => {
    const p = topperShapes(SCRIPT, text, { height: 1, ...opts });
    return topperShapes(SCRIPT, text, { height: 1 / p.width, ...opts });
  };
  const longestSide = (part) => {
    const xs = part.outer.map(p => p.x), ys = part.outer.map(p => p.y);
    return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  };

  it('never rules a bridge across the design to reach something further away', () => {
    const t = span('Happy Birthday', { baseline: { thickness: 0.08 } });
    const bridges = bridgeLoose(t.parts, { width: 0.02 });
    expect(bridges.length).toBeGreaterThan(0);
    // Every join is local. A stem that fell to the row below measured most of the object's height.
    for (const b of bridges) expect(longestSide(b)).toBeLessThan(t.capHeight * 0.4);
  });

  it('joins each stray to its genuinely nearest material', () => {
    const t = span('Happy Birthday', { baseline: { thickness: 0.08 } });
    const groups = components(t.parts);
    const dist = (A, B) => {
      let m = Infinity;
      for (const p of A) for (const q of B) m = Math.min(m, Math.hypot(p.x - q.x, p.y - q.y));
      return m;
    };
    const bridges = bridgeLoose(t.parts, { width: 0.02 });
    for (let k = 1; k < groups.length; k++) {
      let nearest = Infinity;
      for (const i of groups[k]) for (const j of groups[0]) {
        nearest = Math.min(nearest, dist(t.parts[i].outer, t.parts[j].outer));
      }
      // Some bridge must be about that long — not longer, which is what falling vertically produced.
      expect(bridges.some(b => longestSide(b) < nearest + 0.05)).toBe(true);
    }
  });

  it('still drops a tittle straight down, because that IS its nearest material', () => {
    // The i-dot case must not regress: the stem below the dot is the closest thing to it, so the
    // shortest path and the downward drop are the same join.
    const t = topperShapes(FONT, 'Amelia', { height: 1, baseline: { thickness: 0.09 } });
    const stray = components(t.parts)[1][0];
    const strayLow = Math.min(...t.parts[stray].outer.map(p => p.y));
    const [b] = bridgeLoose(t.parts, { width: 0.02 });
    expect(Math.min(...b.outer.map(p => p.y))).toBeLessThan(strayLow);
    const bx = b.outer.map(p => p.x), sx = t.parts[stray].outer.map(p => p.x);
    const mid = (Math.min(...bx) + Math.max(...bx)) / 2;
    expect(mid).toBeGreaterThanOrEqual(Math.min(...sx) - 0.02);
    expect(mid).toBeLessThanOrEqual(Math.max(...sx) + 0.02);
  });
});

describe('fit — letters that meet, instead of a bar bolted across the gap', () => {
  /* ⚠️ The first sweep of this concluded tracking did nothing, and stopped at -0.05.
   *
   * A script's "h" and "d" not quite meeting got a straight 3mm rectangle laid across the gap, which
   * read exactly like what it was. Tightening the fit is what a type designer would reach for, and
   * it works — at about -0.16em, three times further out than I looked before giving up on it.
   */
  const SCRIPT = new FontLoader().parse(greatVibes);
  const at = (tracking) => {
    const p = topperShapes(SCRIPT, 'Happy Birthday', { height: 1, tracking });
    return topperShapes(SCRIPT, 'Happy Birthday', { height: 1 / p.width, tracking });
  };

  it('joins the word to itself with no bar and no bridges', () => {
    expect(bridgeLoose(at(0).parts, { width: 0.02 }).length).toBeGreaterThan(0);
    expect(bridgeLoose(at(-0.15).parts, { width: 0.02 }).length).toBe(0);
    expect(pieceCount(at(-0.15).parts)).toBe(1);
  });

  it('changes nothing at all at fit 0', () => {
    /* The row is set glyph by glyph now rather than by generateShapes, and that had better be the
     * same picture: three.js applies no kerning — createPaths advances by glyph.ha and nothing else
     * — so tracking 0 must be byte-identical to the old path, or every existing element shifts. */
    const a = topperShapes(SCRIPT, 'Happy Birthday', { height: 1, tracking: 0 });
    const b = topperShapes(SCRIPT, 'Happy Birthday', { height: 1 });
    expect(a.width).toBeCloseTo(b.width, 9);
    expect(a.parts.length).toBe(b.parts.length);
    expect(a.parts[0].outer[0].x).toBeCloseTo(b.parts[0].outer[0].x, 9);
  });

  it('never welds two words into one', () => {
    // Tightening the fit of a WORD must not close the space between words, or "Happy Birthday"
    // becomes "HappyBirthday" at the fit that makes its letters touch.
    const tight = topperShapes(SCRIPT, 'Happy Birthday', { height: 1, tracking: -0.2, lines: 1 });
    const loose = topperShapes(SCRIPT, 'Happy Birthday', { height: 1, tracking: 0, lines: 1 });
    const words = topperShapes(SCRIPT, 'HappyBirthday', { height: 1, tracking: -0.2, lines: 1 });
    expect(tight.width).toBeLessThan(loose.width);
    expect(tight.width).toBeGreaterThan(words.width);
  });
});
