import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import A4Sheet from './A4Sheet.jsx';
import PhotoSheet from '../../orders/PhotoSheet.jsx';

// WHY THIS EXISTS. The sheet used to read an order directly; it now takes sources and is shared by
// two callers. A render is the cheapest guard that the split did not leave one of them broken —
// which is the failure a build and a type-free codebase both let through (see UploadsPanel.test.jsx
// for the ReferenceError that motivated rendering components at all).
//
// The EMPTY render matters as much as the populated one. Sources arrive asynchronously, so the first
// paint of both callers has none — and the standalone tool opens with none by definition. A sheet
// that only survives once its images have loaded is broken for every user's first frame.

const src = (id) => ({
  id,
  name: `Image ${id}`,
  preview: `data:image/png;base64,${id}`,
  draw: () => {},
});

describe('A4Sheet renders', () => {
  it('with sources, without throwing', () => {
    expect(() => renderToStaticMarkup(
      <A4Sheet sources={[src('a'), src('b')]} onClose={() => {}} />,
    )).not.toThrow();
  });

  it('with no sources at all — the standalone tool opens this way', () => {
    expect(() => renderToStaticMarkup(
      <A4Sheet sources={[]} onClose={() => {}} />,
    )).not.toThrow();
  });

  it('shows one palette thumbnail per source', () => {
    const html = renderToStaticMarkup(<A4Sheet sources={[src('a'), src('b')]} onClose={() => {}} />);
    expect(html).toContain('data:image/png;base64,a');
    expect(html).toContain('data:image/png;base64,b');
  });

  // The count in the palette title is a readout of what the caller handed over. It reads "(2)", not
  // "(0)", when sources are present — a heading that disagrees with the strip below it is how a
  // loading bug gets mistaken for an empty library.
  it('counts the sources in the palette title', () => {
    const html = renderToStaticMarkup(
      <A4Sheet sources={[src('a'), src('b')]} paletteTitle="Uploaded photos" onClose={() => {}} />,
    );
    expect(html).toContain('Uploaded photos (2)');
  });

  it('shows the caller’s empty hint when there is nothing to place', () => {
    const html = renderToStaticMarkup(
      <A4Sheet sources={[]} emptyHint="No customer photos in this order." onClose={() => {}} />,
    );
    expect(html).toContain('No customer photos in this order.');
  });

  // A source that has not finished rendering its preview must not be addable — clicking it would put
  // an invisible item on the sheet and export a blank rectangle to an edible sheet.
  //
  // Asserted on the TITLE, not on `disabled`: the Download button is also disabled while the sheet is
  // empty, so a bare `toContain('disabled')` passes whatever the thumbnail does. A test that cannot
  // fail is worse than no test — it reports coverage it does not have.
  it('marks a source whose preview is not ready as loading, not addable', () => {
    const pending = renderToStaticMarkup(
      <A4Sheet sources={[{ id: 'a', name: 'A', preview: null, draw: () => {} }]} onClose={() => {}} />,
    );
    expect(pending).toContain('Loading…');
    expect(pending).not.toContain('Add to sheet');

    const ready = renderToStaticMarkup(<A4Sheet sources={[src('a')]} onClose={() => {}} />);
    expect(ready).toContain('Add to sheet');
    expect(ready).not.toContain('Loading…');
  });
});

// The adapter, rendered the way a baker meets it: an order whose photos have not loaded yet.
describe('PhotoSheet (order adapter) renders', () => {
  const order = {
    id: 'o1',
    design_snapshot: {
      stickers: [
        { id: 's1', name: 'Her photo', photoUrl: 'https://x/1.png', photoMask: 'https://x/heart.png' },
        { id: 's2', name: 'No mask, not a frame', photoUrl: 'https://x/2.png' },
      ],
    },
  };

  it('without throwing', () => {
    expect(() => renderToStaticMarkup(<PhotoSheet order={order} onClose={() => {}} />)).not.toThrow();
  });

  // THE FIRST PAINT, before any image has loaded — which is what every baker actually sees first.
  //
  // The frames are fields on a design already in memory; only their pixels are remote. So the count
  // is right immediately and the empty-state must NOT appear. Deriving the palette from what had
  // loaded (the shape this refactor briefly had) put "No customer photos in this order." on screen
  // for an order that has one, at the moment the baker is judging whether the tool works.
  it('shows the frame count immediately, before the images load', () => {
    const html = renderToStaticMarkup(<PhotoSheet order={order} onClose={() => {}} />);
    expect(html).toContain('Uploaded photos (1)');            // the masked sticker, not the bare one
    expect(html).not.toContain('No customer photos in this order.');
    expect(html).toContain('Loading…');                        // its thumbnail, not yet addable
  });

  it('shows the empty state only when the order genuinely has no frames', () => {
    const html = renderToStaticMarkup(
      <PhotoSheet order={{ id: 'o4', design_snapshot: { stickers: [] } }} onClose={() => {}} />,
    );
    expect(html).toContain('No customer photos in this order.');
  });

  it('for an order with no photo frames at all', () => {
    expect(() => renderToStaticMarkup(
      <PhotoSheet order={{ id: 'o2', design_snapshot: { stickers: [] } }} onClose={() => {}} />,
    )).not.toThrow();
  });

  // An order can reach here with no design at all (a photo-only order). `framesOf` reads through two
  // optional levels to allow it; a crash here would take out the whole order detail pane.
  it('for an order with no design snapshot', () => {
    expect(() => renderToStaticMarkup(<PhotoSheet order={{ id: 'o3' }} onClose={() => {}} />)).not.toThrow();
  });
});
