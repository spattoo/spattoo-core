import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TemplateGrid from './TemplateGrid.jsx';

/* ── The one grid of cake templates ──────────────────────────────────────────────────────────────
 *
 * Extracted from CakeDesigner.jsx, so these tests pin the behaviours that were only ever asserted by
 * looking at the screen. Every number below is from the real thing: 24 a page (the hook's default),
 * 180 on the image attributes, 165px minimum columns.
 *
 * ⚠️ WHAT A STATIC RENDER CAN AND CANNOT SEE, measured rather than assumed. The first cut of this
 * file asserted that the reveal hook shows EVERYTHING here, on the grounds that node has no
 * `IntersectionObserver` and the hook documents a reveal-everything fallback. Both halves are true
 * and the conclusion was still wrong: the fallback runs inside a `useEffect`, and
 * `renderToStaticMarkup` runs no effects. The count therefore stays at its `useState(page)` initial
 * value, so a static render always shows EXACTLY THE FIRST PAGE — 24 images, sentinel present, no
 * tail line. Measured: 24 `<img>` and one `height:1px` sentinel from a list of 30.
 *
 * So paging and the tail cannot be tested here at all; they are a browser's job. What can be pinned
 * is the first page, the sentinel, and everything the tile promises.
 */

const T = (n, extra = {}) => ({ id: `t${n}`, name: `Cake ${n}`, thumbnail_url: `c${n}.webp`, tier_count: 1, ...extra });
const many = (n) => Array.from({ length: n }, (_, i) => T(i + 1));
const html = (props) => renderToStaticMarkup(<TemplateGrid templates={[]} {...props} />);

describe('the tile', () => {
  it('draws the picture and nothing else — no caption, no name', () => {
    const out = html({ templates: [T(1)] });
    expect(out).toContain('src="c1.webp"');
    // The name reaches the DOM only as alt text; a visible caption would be a regression.
    expect(out).toContain('alt="Cake 1"');
    expect(out).not.toContain('>Cake 1<');
  });

  /* ⚠️ THE SQUARE RULE. `height="180"` is a presentational hint that BEATS `aspect-ratio` unless an
     author height is set, which measured 171x180 on a tile that was square in the stylesheet. Both
     the attribute (reserves the box, no reflow as the grid fills) and the style must be present. */
  it('keeps height:auto beside the 180 attribute, or tiles are not square', () => {
    const out = html({ templates: [T(1)] });
    expect(out).toContain('height="180"');
    expect(out).toContain('height:auto');
    expect(out).toContain('aspect-ratio:1 / 1');
  });

  it('reserves the tile with lazy loading, so off-screen pictures are never fetched', () => {
    const out = html({ templates: [T(1)] });
    expect(out).toContain('loading="lazy"');
    expect(out).toContain('width="180"');
  });

  it('falls back to a neutral placeholder when there is no thumbnail', () => {
    const out = html({ templates: [{ id: 'x', name: 'No picture' }] });
    expect(out).not.toContain('<img');
    expect(out).toContain('aspect-ratio:1 / 1');   // the placeholder keeps the grid square
  });

  it('reads either thumbnail field, because the list route and the full row differ', () => {
    expect(html({ templates: [{ id: 'a', name: 'A', thumb_key: 'k.webp' }] })).toContain('src="k.webp"');
    expect(html({ templates: [{ id: 'b', name: 'B', thumbnail_url: 'u.webp' }] })).toContain('src="u.webp"');
  });

  it('badges only a premium template', () => {
    expect(html({ templates: [T(1, { offering: 'premium' })] })).toContain('Premium');
    expect(html({ templates: [T(1, { offering: 'standard' })] })).not.toContain('Premium');
  });
});

describe('the preview control', () => {
  /* Tapping a tile picks the template, so on a phone the preview needs a target of its own. On
     desktop hover does it, and an extra button would be furniture. */
  it('gives a phone an explicit button, and a desktop none', () => {
    expect(html({ templates: [T(1)], isMobile: true })).toContain('Preview Cake 1');
    expect(html({ templates: [T(1)], isMobile: false })).not.toContain('Preview Cake 1');
  });

  it('offers no preview button when there is no picture to enlarge', () => {
    const out = html({ templates: [{ id: 'x', name: 'No picture' }], isMobile: true });
    expect(out).not.toContain('Preview No picture');
  });
});

describe('growing as you reach the bottom', () => {
  /* A list shorter than a page is already complete, so `done` is true by arithmetic — `count`
     starts at 24 and 24 >= 5 — and the sentinel must not be drawn. This holds without any effect
     running, which is why it is testable here at all. */
  it('draws no sentinel when the whole list already fits in the first page', () => {
    expect(html({ templates: many(5) })).not.toContain('aria-hidden="true"');
  });

  /* Longer than a page: the sentinel is what the observer watches, and it must sit AFTER the grid
     and inside the same scroller so an ancestor that scrolls clips the intersection. */
  it('draws the sentinel when there is more to reveal', () => {
    const out = html({ templates: many(30) });
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain('height:1px');
    // After the last tile, never between them.
    expect(out.lastIndexOf('<img')).toBeLessThan(out.indexOf('aria-hidden="true"'));
  });

  it('shows exactly one page at first, not the whole list', () => {
    expect((html({ templates: many(30) }).match(/<img/g) ?? []).length).toBe(24);
    expect((html({ templates: many(10) }).match(/<img/g) ?? []).length).toBe(10);
  });

  it('honours a caller-chosen page size', () => {
    expect((html({ templates: many(30), page: 6 }).match(/<img/g) ?? []).length).toBe(6);
  });

  /* ⚠️ The "That's all N templates." line needs `done`, which needs the observer to have advanced
     the count — an effect. It cannot appear in a static render, so its ABSENCE here is correct and
     is asserted so nobody later reads a passing suite as proof the line works. */
  it('cannot show the end-of-list line in a static render, and does not pretend to', () => {
    expect(html({ templates: many(30) })).not.toContain('templates.');
    expect(html({ templates: many(4) })).not.toContain('templates.');
  });
});

describe('the seams the catalogue surfaces need', () => {
  it('renders a per-tile overlay where one is given', () => {
    const out = html({ templates: many(2), overlay: (t) => <b>drop {t.id}</b> });
    expect(out).toContain('drop t1');
    expect(out).toContain('drop t2');
  });

  it('draws a chosen tile differently, for the browser showing what is already stocked', () => {
    const chosen = html({ templates: [T(1)], selectedIds: new Set(['t1']) });
    const plain  = html({ templates: [T(1)] });
    expect(chosen).not.toBe(plain);
    expect(chosen).toContain('box-shadow');
  });

  it('survives an absent list and absent callbacks rather than throwing', () => {
    expect(() => html({ templates: undefined })).not.toThrow();
    expect(() => html({ templates: null })).not.toThrow();
    expect(() => html({ templates: [T(1)] })).not.toThrow();   // no onPick, no onPreview
  });
});

describe('the grid itself', () => {
  /* Counts its own columns rather than asserting a number per breakpoint: two on a phone, three in
     the widened flyout, without either number appearing anywhere. */
  it('lets the width decide the column count', () => {
    const out = html({ templates: [T(1)] });
    expect(out).toContain('repeat(auto-fill, minmax(165px, 1fr))');
  });
});
