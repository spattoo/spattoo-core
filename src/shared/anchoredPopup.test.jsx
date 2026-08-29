import { describe, it, expect, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AnchoredPopup from './AnchoredPopup.jsx';

// ── Where an anchored popup lands ────────────────────────────────────────────────────────────────
// The colour picker used to place itself against a hardcoded `EST_H = 400`, and the popup is taller
// than that — a wheel, a swatch grid, colours-from-cake, and a gradient row. So the clamp did not
// lift it far enough and the bottom fell off the screen. It read as "the more decorations I add the
// more of the picker I lose", which is not about decorations at all: a longer card stack just puts
// the swatch low enough for a too-small estimate to show.
//
// renderToStaticMarkup runs no effects and every element measures 0, so the MEASURED position
// cannot be tested here — that is the layout effect's job in a browser. What can be pinned is the
// horizontal placement and the two guarantees that hold whatever the height turns out to be: the
// popup never exceeds the viewport, and it can always be scrolled if it would.

const styleOf = (html) => Object.fromEntries(
  (html.match(/style="([^"]*)"/)?.[1] ?? '')
    .split(';').filter(Boolean)
    .map(d => d.split(':').map(x => x.trim().replace(/&quot;/g, '"'))),
);

const render = (props) => styleOf(renderToStaticMarkup(
  <AnchoredPopup anchor={{ top: 300, left: 900 }} width={244} {...props}>x</AnchoredPopup>,
));

afterEach(() => { delete globalThis.window; });
const viewport = (w, h) => { globalThis.window = { innerWidth: w, innerHeight: h }; };

describe('AnchoredPopup', () => {
  it('renders nothing without an anchor', () => {
    viewport(1440, 900);
    expect(renderToStaticMarkup(<AnchoredPopup anchor={null} width={244}>x</AnchoredPopup>)).toBe('');
  });

  it('sits to the LEFT of the anchor when there is room', () => {
    viewport(1440, 900);
    // 900 - 244 - 18 = 638
    expect(render().left).toBe('638px');
  });

  it('flips to the right when the left would go off-screen', () => {
    viewport(1440, 900);
    // No room at 40 - 244 - 18; flips to 40 + 26 + 18.
    expect(render({ anchor: { top: 300, left: 40 } }).left).toBe('84px');
  });

  it('never sits closer than 8px to either edge', () => {
    viewport(320, 900);
    const left = parseInt(render({ anchor: { top: 300, left: 300 } }).left, 10);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + 244).toBeLessThanOrEqual(320 - 8 + 1);   // +1 for the rounding at the clamp
  });

  it('can never be taller than the viewport, whatever it contains', () => {
    // The guarantee that replaces the estimate: no content can push it past the screen, and if it
    // would, it scrolls rather than clipping.
    viewport(1440, 900);
    const st = render();
    expect(st['max-height']).toBe('calc(100vh - 16px)');
    expect(st['overflow-y']).toBe('auto');
  });

  it('can never be wider than the viewport either', () => {
    viewport(1440, 900);
    expect(render()['max-width']).toBe('calc(100vw - 16px)');
  });

  it('starts no higher than 8px from the top before it has measured itself', () => {
    // First paint, pre-effect: an anchor near the top must not produce a negative top, which would
    // put the popup's header off-screen where nothing can reach it.
    viewport(1440, 900);
    expect(render({ anchor: { top: 10, left: 900 } }).top).toBe('8px');
  });

  // ── side ──────────────────────────────────────────────────────────────────────────────────────
  // Left is the default because the colour picker hangs off a swatch on the right-hand card stack.
  // A calendar day is the opposite: the grid fills the window, so opening left drops the board on
  // top of the day being pointed at — which is what it did, live, until this existed.
  it('opens to the RIGHT when asked, instead of over its anchor', () => {
    viewport(1440, 900);
    // anchor.left is the cell's right edge; anchorSize 0 means "start here".
    expect(render({ side: 'right', anchorSize: 0, gap: 10, anchor: { top: 300, left: 500 } }).left)
      .toBe('510px');
  });

  it('flips back to the left when there is no room on the right', () => {
    viewport(1000, 900);
    // 900 + 10 + 244 = 1154, past the edge — so it goes left of the anchor instead.
    expect(render({ side: 'right', anchorSize: 0, gap: 10, anchor: { top: 300, left: 900 } }).left)
      .toBe('646px');
  });

  it('still never leaves the viewport, whichever side it opened', () => {
    viewport(320, 900);
    for (const side of ['left', 'right']) {
      const left = parseInt(render({ side, anchor: { top: 300, left: 300 } }).left, 10);
      expect(left).toBeGreaterThanOrEqual(8);
      expect(left + 244).toBeLessThanOrEqual(320 - 8 + 1);
    }
  });

  it('keeps the caller\'s own styling', () => {
    viewport(1440, 900);
    const st = render({ style: { background: '#fff', zIndex: 4000 } });
    expect(st.background).toBe('#fff');
    expect(st['z-index']).toBe('4000');
  });
});
