import { describe, it, expect, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import PastDueBanner from './PastDueBanner.jsx';

// ── The warning that only exists in one state ────────────────────────────────────────────────────
// Worth testing because every assertion here is about a branch nobody looks at. `past_due` is rare,
// lasts about three days, and the cost of getting it wrong is asymmetric in both directions: shown
// when it shouldn't be, it tells a paying baker their account is closing; not shown when it should
// be, they lose the bakery with no warning beyond an email they missed.
//
// Rendering at all also matters — a scope error in JSX is valid JavaScript, survives the build and
// every gate, and only appears when something renders the component (see UploadsPanel.test.jsx for
// the one that reached a user). Nothing else renders this.

const render = (props) =>
  renderToStaticMarkup(<PastDueBanner status="past_due" onOpenBilling={() => {}} {...props} />);

// These tests run in node, where useEffect never fires under renderToStaticMarkup — so the default
// is the wide layout. Stubbing window is how the narrow branch is reached, matching studioChrome's
// tests. The listener methods are stubs for the same reason: effects don't run, but the component
// must not throw if that ever changes.
const asPhone = (width = 390) => {
  globalThis.window = { innerWidth: width, addEventListener() {}, removeEventListener() {} };
};
afterEach(() => { delete globalThis.window; });

describe('PastDueBanner shows only for past_due', () => {
  it('renders the warning when the charge has failed', () => {
    const html = render();
    expect(html).toContain('couldn’t take this month’s payment');
    expect(html).toContain('Update payment');
  });

  // Every other status must be silent. `pending` is the trap: it SOUNDS like this state and is a
  // different one — a subscription awaiting its first authorisation, where nothing has failed.
  // `active` is the one that would be seen by everybody if the check were ever loosened.
  it.each(['active', 'pending', 'paused', 'expired', 'cancelled', 'no_subscription', undefined, null])(
    'renders nothing for %s', (status) => {
      expect(render({ status })).toBe('');
    },
  );

  // The lapsed states have their OWN full-screen gate in CakeDesigner. A banner on top of it would
  // offer a second, quieter route out of a screen that already asks for exactly one thing.
  it('stays out of the way of the lock screen', () => {
    expect(render({ status: 'expired' })).toBe('');
    expect(render({ status: 'cancelled' })).toBe('');
  });
});

describe('PastDueBanner on a phone', () => {
  it('gives the button a row of its own, full width', () => {
    asPhone();
    const html = render();
    expect(html).toContain('flex-direction:column');
    expect(html).toContain('width:100%');
  });

  it('keeps the sentence and the button', () => {
    asPhone();
    const html = render();
    expect(html).toContain('couldn’t take this month’s payment');
    expect(html).toContain('Update payment');
  });
});

describe('PastDueBanner on a laptop', () => {
  // No window at all — the SSR case, and the default every other test renders under. It must not
  // throw: the width is read in an effect, never during render.
  it('renders without a window, in one row', () => {
    expect(() => render()).not.toThrow();
    expect(render()).not.toContain('flex-direction:column');
  });
});
