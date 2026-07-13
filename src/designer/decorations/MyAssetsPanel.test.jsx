import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import MyAssetsPanel from './MyAssetsPanel.jsx';

// WHY THIS EXISTS. The Decorations panel shipped with `ReferenceError: filterEl is not defined` — a
// binding that was out of scope for one of its two callers. The build passed. 140 unit tests passed.
// Three quality gates passed. Nothing caught it, because nothing we run actually RENDERS a panel, and
// a scope error in JSX exists only at render.
//
// So: render it. This does not assert on how it looks — it asserts that it does not THROW, which is
// the failure that reached a user. Cheap, and it covers the exact class of bug the merge introduced.

const uploads = [
  { id: 1, name: 'Butterfly',  url: 'https://x/1.png', uploadedBy: 'baker',    promoted: false },
  { id: 2, name: 'Her photo',  url: 'https://x/2.png', uploadedBy: 'customer', promoted: false },
  { id: 3, name: 'Logo',       url: 'https://x/3.png', uploadedBy: 'baker',    promoted: true  },
];
const apiClient = { fetchUploads: async () => uploads };
const elementTypes = [
  { id: 't1', name: 'Image topper', default_for_uploads: true, baker_uploadable: true,
    placement_rules: { zones: ['top_surface'], placement: { top_surface: 'stand' } } },
];

describe('MyAssetsPanel renders', () => {
  it('as a baker, without throwing', () => {
    expect(() => renderToStaticMarkup(
      <MyAssetsPanel apiClient={apiClient} elementTypes={elementTypes} canPromote />,
    )).not.toThrow();
  });

  it('as a customer (no promote controls), without throwing', () => {
    expect(() => renderToStaticMarkup(
      <MyAssetsPanel apiClient={apiClient} elementTypes={elementTypes} canPromote={false} />,
    )).not.toThrow();
  });

  // The photo-frame path: the panel is opened to CHOOSE an image, not to manage the library.
  it('in selectMode, without throwing', () => {
    expect(() => renderToStaticMarkup(
      <MyAssetsPanel apiClient={apiClient} elementTypes={elementTypes} selectMode onSelect={() => {}} />,
    )).not.toThrow();
  });

  // No type flagged default_for_uploads: placement has no rules to inherit. It must still RENDER —
  // the failure belongs at the moment of placing, with a message, not as a blank screen.
  it('with no default upload type configured, without throwing', () => {
    expect(() => renderToStaticMarkup(
      <MyAssetsPanel apiClient={apiClient} elementTypes={[]} canPromote />,
    )).not.toThrow();
  });
});

// The promote studio: only ever reached WITH an upload (My images → "Show in my decorations").
// Rendering it is the cheap guard against the class of bug that shipped last time.
import MyDecorationStudio from './MyDecorationStudio.jsx';

describe('MyDecorationStudio renders', () => {
  const upload = { id: 7, name: 'Gold butterfly', url: 'https://x/7.png', uploadedBy: 'baker' };

  it('in promote mode, without throwing', () => {
    expect(() => renderToStaticMarkup(
      <MyDecorationStudio apiClient={apiClient} tiers={[]} elementTypes={elementTypes} upload={upload} />,
    )).not.toThrow();
  });

  it('with no uploadable kinds configured, without throwing', () => {
    expect(() => renderToStaticMarkup(
      <MyDecorationStudio apiClient={apiClient} tiers={[]} elementTypes={[]} upload={upload} />,
    )).not.toThrow();
  });
});
