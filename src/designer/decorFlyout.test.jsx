import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ── What the Decor flyout shows in the second before its categories arrive ───────────────────────
 *
 * `openElements()` opens the flyout FIRST and awaits `fetchElementCategories()` after it. For the
 * length of that fetch `categories` is `[]` — and `[]` used to mean two different things:
 *
 *    "this deployment never ran migration 065"   → draw the whole pre-065 element list
 *    "we have not asked yet"                     → draw nothing, the tiles are coming
 *
 * Both branches took the first reading, so every open began by rendering the legacy layout. And
 * because the two "My decorations" shelves were fetched on MOUNT, their rows were already in memory
 * while the catalogue had not been requested at all — so the one thing that painted instantly was
 * the baker's own decorations.
 *
 * Sandeep, 2026-09-20: "when i click on decor - flyout first shows the elements from My decorations.
 * This should not be the case." And: "how are my deocorations loading faster than others? are they
 * stored locally than in R2?" — they are not. They were simply started minutes earlier.
 *
 * ⚠️ THESE ARE SOURCE ASSERTIONS, WHICH IS WEAKER THAN OPENING THE PANEL and is not a substitute for
 * it. The flyout lives inside CakeDesigner behind a baker sign-in, so it cannot be driven from a
 * harness. They exist to stop the two conditions silently reverting to `!categories.length`, which
 * reads as correct and is the whole bug.
 */
const src = readFileSync(new URL('./CakeDesigner.jsx', import.meta.url), 'utf8');

/* ⚠️ COMMENTS DO NOT COUNT. Every line below is EXPLAINED somewhere in that file, quoting itself —
   block comments first, then line comments; taking `{/* … *​/}` out as one unit first swallows every
   plain comment between the first `{/*` and the next `*​/}`. */
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

describe('the Decor flyout does not flash the legacy layout', () => {
  it('tells "not asked yet" apart from "no categories exist"', () => {
    expect(code).toMatch(/const \[categoriesLoaded, setCategoriesLoaded\] = useState\(null\)/);
    // All three outcomes are recorded, or the flyout can hang on the spinner.
    expect(code).toMatch(/setCategoriesLoaded\(true\)/);
    expect(code.match(/setCategoriesLoaded\(false\)/g) ?? []).toHaveLength(2);   // empty, and threw
  });

  it('gates both legacy branches on "asked and none", never on an empty list', () => {
    // The element grid, and the "My decorations" shelf.
    expect(code.match(/categoriesLoaded === false/g) ?? []).toHaveLength(3);
    // The reading that caused it must not come back in either condition.
    expect(code).not.toMatch(/!categories\.length \|\| \(activeCategory/);
    expect(code).not.toMatch(/\(!categories\.length && !activeCategory\)/);
  });
});

describe('the kept pieces are not fetched before anybody wants them', () => {
  /* Two requests on every designer load, for a shelf most sessions never open — and the reason they
     appeared to be "faster than others". The categories comment in the same file already stated the
     rule they broke: "nothing is fetched until the customer picks one". */
  it('waits for the shelf, like every category waits for its tap', () => {
    expect(code).toMatch(/const \[myShelfWanted, setMyShelfWanted\] = useState\(false\)/);
    // Both shelves, and neither may run before it is wanted.
    expect(code.match(/if \(!myShelfWanted\) return undefined;/g) ?? []).toHaveLength(2);
    for (const call of ['fetchGarnishes', 'fetchCardToppers']) {
      const at = code.indexOf(call);
      expect(at, `${call} is gone`).toBeGreaterThan(-1);
      // The guard sits above the call, inside the same effect.
      expect(code.slice(Math.max(0, at - 260), at)).toMatch(/myShelfWanted/);
    }
  });

  it('still reloads when a studio closes, so a piece just saved appears', () => {
    // The dependency that makes the shelf refresh on save must survive the new guard.
    expect(code).toMatch(/\[apiClient, garnishStudio, myShelfWanted\]/);
    expect(code).toMatch(/\[apiClient, topperStudio, myShelfWanted\]/);
  });
});
