import { describe, it, expect, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StudioHeader } from './studioChrome.jsx';

// ── The header a baker actually sees on a phone ──────────────────────────────────────────────────
// The studio's header is the one piece of chrome that RESHAPES, and the phone form is the form that
// was broken: title + buttons in one row fits a laptop and not a 390px screen, where the title lost
// the fight for width and wrapped to three lines — "Edible / Print / Studio" — beside buttons that
// kept their full size.
//
// Worth a test precisely because it is the branch nobody looks at. Every other test in this repo
// renders at the default (no window → wide), so the narrow layout could break and every one of them
// would stay green. INVARIANTS #9 says no gate protects mobile; this is the part that CAN be pinned,
// so it is.
//
// `window` is stubbed rather than reached for: these tests run in node, where useStudioNarrow's
// `typeof window !== 'undefined'` guard correctly reports "not a phone". Setting it is how we ask
// for the other branch. The listener methods are stubs because renderToStaticMarkup never runs
// effects — they exist so the component would not throw if that ever changed.
const asPhone = (width = 390) => {
  globalThis.window = { innerWidth: width, addEventListener() {}, removeEventListener() {} };
};

afterEach(() => { delete globalThis.window; });

const render = (props) => renderToStaticMarkup(
  <StudioHeader title="Edible Print Studio" onClose={() => {}}
    actions={<><button>Save sheet</button><button>Download PDF</button></>} {...props} />,
);

describe('StudioHeader on a phone', () => {
  it('keeps the title on one line', () => {
    asPhone();
    // The title is the one thing telling a baker which tool they are in, so it is the last thing
    // that should be squeezed. nowrap is what stops the three-line stack.
    expect(render()).toContain('white-space:nowrap');
  });

  it('closes with a × rather than a "Close" button', () => {
    asPhone();
    const html = render();
    expect(html).toContain('aria-label="Close"');
    // Not merely "a × exists" — the word must be GONE. Dropping it from the button row is what
    // leaves the real actions enough width to sit side by side, so a stray text Close would mean
    // the row is still overcrowded even though the × is present.
    expect(html).not.toContain('>Close<');
  });

  it('gives the actions a row of their own, in equal columns', () => {
    asPhone();
    const html = render();
    expect(html).toContain('grid-auto-columns:1fr');
    expect(html).toContain('Save sheet');
    expect(html).toContain('Download PDF');
  });

  // The library hides its "New sheet" while the empty state is offering one, so no-actions is a
  // state that really happens. An empty row still costs its gap and leaves the title floating above
  // a band of nothing.
  it('draws no actions row at all when there are none', () => {
    asPhone();
    const html = render({ actions: null });
    expect(html).not.toContain('grid-auto-columns:1fr');
    expect(html).toContain('Edible Print Studio');
    expect(html).toContain('aria-label="Close"');
  });
});

describe('StudioHeader on a laptop', () => {
  // No window at all — the SSR case, and the default every other test renders under. It must not
  // throw, which is the whole reason useStudioNarrow guards `typeof window` in its initialiser
  // instead of importing settings/controls' useIsMobile (which reads innerWidth unguarded).
  it('renders without a window, and keeps the text Close', () => {
    expect(() => render()).not.toThrow();
    expect(render()).toContain('>Close<');
  });

  it('puts everything in one row', () => {
    globalThis.window = { innerWidth: 1440, addEventListener() {}, removeEventListener() {} };
    const html = render();
    expect(html).toContain('>Close<');
    expect(html).not.toContain('aria-label="Close"');
  });
});

// ── A Close that does nothing is worse than no Close ─────────────────────────────────────────────
// CutoutSheet rendered A4Sheet without an onClose, so this header drew a Close button wired to
// `undefined`. It looked exactly like a working one and swallowed every press — a baker pressing it
// concluded the app had frozen, which is a far worse impression than a header with no Close on a
// surface that is closed some other way.
//
// The prop being optional is what made it silent: nothing throws, nothing warns, and every existing
// test passed because they all supply one.
describe('StudioHeader without an onClose', () => {
  it('draws no Close button on a laptop rather than a dead one', () => {
    const html = renderToStaticMarkup(
      <StudioHeader title="Edible Print Studio" actions={<button>Download PDF</button>} />);
    expect(html).not.toContain('Close');
    expect(html).toContain('Download PDF');     // the rest of the header is unaffected
  });

  it('draws no × on a phone either', () => {
    asPhone();
    const html = renderToStaticMarkup(
      <StudioHeader title="Edible Print Studio" actions={<button>Download PDF</button>} />);
    expect(html).not.toContain('aria-label="Close"');
  });

  it('still draws Close when there IS something for it to do', () => {
    expect(render({ onClose: () => {} })).toContain('Close');
    asPhone();
    expect(render({ onClose: () => {} })).toContain('aria-label="Close"');
  });
});
