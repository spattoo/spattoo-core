import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import EdiblePrintStudio from './EdiblePrintStudio.jsx';

// A render, for the reason every component test in this repo exists: a scope error in JSX is valid
// JavaScript, so it survives the build and every gate, and only appears when something actually
// renders the component (see UploadsPanel.test.jsx for the one that reached a user).
//
// The studio opens on the LIBRARY, not on a blank sheet — most visits are to something the baker
// already made. So this first paint is not an edge case, it is the only state guaranteed to happen.

const apiClient = { fetchUploads: async () => [], fetchPrintSheets: async () => [] };

describe('EdiblePrintStudio renders', () => {
  it('on open, before anything has loaded', () => {
    expect(() => renderToStaticMarkup(
      <EdiblePrintStudio apiClient={apiClient} onClose={() => {}} />,
    )).not.toThrow();
  });

  it('carries the studio’s name, the one the pricing page sells', () => {
    const html = renderToStaticMarkup(<EdiblePrintStudio apiClient={apiClient} onClose={() => {}} />);
    expect(html).toContain('Edible Print Studio');
  });

  // The library is the door, and "New sheet" is on it from the first paint — a baker with no saved
  // sheets must not have to wait for a fetch to find out how to start one.
  it('offers a new sheet immediately', () => {
    const html = renderToStaticMarkup(<EdiblePrintStudio apiClient={apiClient} onClose={() => {}} />);
    expect(html).toContain('New sheet');
  });

  // The A4 page is BEHIND the library, not underneath it. Rendering both would mean every open paid
  // for the sheet's setup to show a list.
  it('does not render the sheet until one is opened or started', () => {
    const html = renderToStaticMarkup(<EdiblePrintStudio apiClient={apiClient} onClose={() => {}} />);
    expect(html).not.toContain('Download PDF');
    expect(html).not.toContain('Add image');
  });

  // The picker is not mounted until asked for. Rendering it underneath from the start would fetch a
  // baker's whole upload library every time the studio opened, for a panel nobody asked to see.
  it('does not mount the image picker until the baker asks for one', () => {
    const html = renderToStaticMarkup(<EdiblePrintStudio apiClient={apiClient} onClose={() => {}} />);
    expect(html).not.toContain('Choose an image');
  });

  // A host that has not wired the print-sheet endpoints must not take the studio down with it — the
  // library reports it cannot load rather than throwing through the designer that opened it.
  it('survives an apiClient with no print-sheet methods', () => {
    expect(() => renderToStaticMarkup(
      <EdiblePrintStudio apiClient={{}} onClose={() => {}} />,
    )).not.toThrow();
  });
});

// ── One "New sheet", not two ─────────────────────────────────────────────────────────────────────
// The header and the empty state each offered one. On a laptop they sat at opposite ends of a wide
// window and read as a header action plus a call to action; on a phone the stacked header put them
// one above the other, two identical buttons a few pixels apart.
//
// This pins the FIRST paint, which is the loading state — effects do not run under
// renderToStaticMarkup, so `sheets` is still null here and the empty state has not rendered yet.
// That is exactly the state where the header's button must survive: it is the only one on screen.
// The mutual exclusion itself is StudioHeader's no-actions branch (studioChrome.test.jsx) driven by
// one derived `emptyState` in SheetLibrary, which is why it cannot show both.
it('offers exactly one New sheet, never two', () => {
  const html = renderToStaticMarkup(<EdiblePrintStudio apiClient={apiClient} onClose={() => {}} />);
  expect(html.match(/New sheet/g)).toHaveLength(1);
});
