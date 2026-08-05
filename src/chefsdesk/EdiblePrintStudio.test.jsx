import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import EdiblePrintStudio from './EdiblePrintStudio.jsx';

// A render, for the reason every component test in this repo exists: a scope error in JSX is valid
// JavaScript, so it survives the build and every gate, and only appears when something actually
// renders the component (see UploadsPanel.test.jsx for the one that reached a user).
//
// The studio opens EMPTY by definition — the baker has chosen nothing yet — so this first paint is
// not an edge case, it is the only state that is guaranteed to happen.

const apiClient = { fetchUploads: async () => [] };

describe('EdiblePrintStudio renders', () => {
  it('on open, with nothing chosen yet', () => {
    expect(() => renderToStaticMarkup(
      <EdiblePrintStudio apiClient={apiClient} onClose={() => {}} />,
    )).not.toThrow();
  });

  it('invites the baker to add something rather than showing a bare empty page', () => {
    const html = renderToStaticMarkup(<EdiblePrintStudio apiClient={apiClient} onClose={() => {}} />);
    expect(html).toContain('Add image');
    expect(html).toContain('Add an image to start laying out your sheet.');
  });

  it('carries the studio’s name, the one the pricing page sells', () => {
    const html = renderToStaticMarkup(<EdiblePrintStudio apiClient={apiClient} onClose={() => {}} />);
    expect(html).toContain('Edible Print Studio');
  });

  // The picker is not mounted until asked for. Rendering it underneath from the start would fetch a
  // baker's whole upload library every time the studio opened, for a panel nobody had asked to see.
  it('does not mount the image picker until the baker asks for one', () => {
    const html = renderToStaticMarkup(<EdiblePrintStudio apiClient={apiClient} onClose={() => {}} />);
    expect(html).not.toContain('Choose an image');
  });

  // Download is the one action that can waste a physical sheet, so it stays disabled until there is
  // something on the page to print.
  //
  // The `disabled` must be matched ON THE DOWNLOAD BUTTON, not anywhere in the document: an earlier
  // version of this assertion allowed either, which made it pass whatever the button did.
  it('cannot download an empty sheet', () => {
    const html = renderToStaticMarkup(<EdiblePrintStudio apiClient={apiClient} onClose={() => {}} />);
    expect(html).toMatch(/disabled=""[^>]*>Download PDF<\/button>/);
  });
});
