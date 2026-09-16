import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ── A studio is not a sticker, and the picker used to say it was ────────────────────────────────
 *
 * Every element in a category was one tile in one grid: same square, same 9px label, and the same
 * sentence written over all of them — "Tap or drag onto the cake to place". For three of them that
 * sentence is false. Tapping a studio replaces the screen; nothing lands on the cake, and nothing
 * had warned anybody. Reported as "studios are staying as just another element".
 *
 * ⚠️ THE SPLIT IS ON WHAT TAPPING DOES, NOT ON `procedural`. Eleven keys carry that field and eight
 * of them drop something on the cake the instant they are tapped — grass, a rainbow, a cloud, letter
 * blocks, writing, a number topper, luster dust, the cream pen. Grouping on "is it procedural" would
 * file a rainbow under Studios and be wrong in the opposite direction. The three that open a screen
 * are marked on their own entry in PROCEDURAL_TOOLS, and `check:procedural-studios` fails the build
 * if that mark and the entry ever disagree.
 *
 * ⚠️ AND NOT A DB COLUMN. `placement_config.procedural` is the one field an admin authors on Add
 * Element; whether that key opens a screen is a consequence of the choice, not a second opinion
 * about it. A column could be ticked on the grass row, and then the heading lies while nothing
 * fails — the shape billing's `discount_pct` already taught this project.
 */
const src = readFileSync(new URL('./CakeDesigner.jsx', import.meta.url), 'utf8');

describe('the split', () => {
  it('asks the tool table, so there is no second list to keep in step', () => {
    expect(src).toMatch(/const isStudioElement = \(el\) =>\s*!!PROCEDURAL_TOOLS\[el\?\.placement_config\?\.procedural\]\?\.opensStudio/);
  });

  /* The mark rides the entry it describes, so the two cannot be separated by an edit. */
  it('marks the three that open a screen, and only those', () => {
    const block = src.slice(src.indexOf('const PROCEDURAL_TOOLS = {'));
    for (const key of ['chocolate_pen', 'chocolate_garnish', 'card_topper']) {
      expect(block).toMatch(new RegExp(`${key}: opensStudio\\(`));
    }
    for (const key of ['grass', 'rainbow', 'cloud', 'letter_blocks', 'writing',
                       'number_topper', 'luster_dust', 'cream_pen']) {
      expect(block).not.toMatch(new RegExp(`${key}: opensStudio\\(`));
    }
  });

  it('never re-derives it from the raw procedural field at the call site', () => {
    const grid = src.slice(src.indexOf('Studios first, and said so'), src.indexOf('</ElementGrid>') + 1 || undefined);
    expect(grid).not.toMatch(/placement_config\?\.procedural/);
  });
});

describe('the shelf', () => {
  /* ⚠️ ONE CARD, MEASURED. Two cards cost two lots of elementCard padding plus the gap between
     them, and at 375×812 that put the "Decorations" heading 47px below the fold — a category with a
     studio in it showed the studio and nothing else, so the forty stickers looked absent until you
     scrolled. One card brings it to 12px, inside the sheet's own adjustable height. */
  it('renders one card holding every group', () => {
    const fn = /function ElementGrid[\s\S]*?\n\}/.exec(src)[0];
    expect(fn).toMatch(/function ElementGrid\(\{ groups = \[\]/);
    expect((fn.match(/\.\.\.s\.elementCard/g) ?? [])).toHaveLength(1);
    expect(fn).toMatch(/live\.map\(/);
  });

  /* A heading earns its line only against something to tell it apart from. The grid's headings were
     removed once before (the ONE-grid note at the call site) and that reasoning still holds for
     element_type; this is a different axis and pays the same rent. */
  it('shows no heading when a category has only one kind', () => {
    const fn = /function ElementGrid[\s\S]*?\n\}/.exec(src)[0];
    expect(fn).toMatch(/const live = groups\.filter\(g => g\.items\?\.length\)/);
    expect(fn).toMatch(/const titled = live\.length > 1/);
    expect(fn).toMatch(/\{titled && title && \(/);
  });

  /* ⚠️ The hint is PER GROUP, and that is half of what was wrong — "tap or drag onto the cake to
     place" was being said over the studios, which is exactly what they do not do. */
  it('gives the studios their own wording rather than the placing one', () => {
    expect(src).toMatch(/title: 'Studios', studio: true,\s*\n\s*hint: 'Tap to open/);
    expect(src).toMatch(/title: 'Decorations',\s*\n\s*hint: 'Tap or drag onto the cake to place'/);
  });

  /* A heading stops being visible the moment it is scrolled past, so the difference has to travel
     with the tile. The arrow is the app's existing word for "this opens a screen" — "Preview &
     customise →", "Open in studio", "← Back" (INVARIANTS #14: reuse the vocabulary). */
  it('marks the studio tiles themselves, not just the heading', () => {
    const fn = /function ElementGrid[\s\S]*?\n\}/.exec(src)[0];
    expect(fn).toMatch(/\{studio && \(/);
    expect(fn).toMatch(/→/);
  });
});
