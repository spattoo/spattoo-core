import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import CutoutSheet from './CutoutSheet.jsx';

// A render, for the reason every component test here exists: a scope error in JSX is valid
// JavaScript, so it survives the build and every gate and only shows when something renders.
//
// The first paint is the TRACING state, not the sheet — every decoration's pixels have to be read
// before a card can be drawn. So this is not an edge case, it is the state every visit starts in,
// and it renders on a server where there is no canvas at all.

describe('CutoutSheet renders', () => {
  it('on open, while the decorations are still being traced', () => {
    expect(() => renderToStaticMarkup(
      <CutoutSheet elements={[{ id: 'a', name: 'Lion', image_url: 'https://example.test/lion.png' }]} />,
    )).not.toThrow();
  });

  it('says what it is doing rather than showing an empty page', () => {
    const html = renderToStaticMarkup(
      <CutoutSheet elements={[{ id: 'a', name: 'Lion', image_url: 'https://example.test/lion.png' }]} />,
    );
    expect(html).toContain('Tracing');
  });

  // A cake of nothing but GLB toppers is a real design, and the answer "nothing here can be printed"
  // has to be a sentence rather than a blank panel the baker has to interpret.
  it('explains an empty result instead of showing a bare sheet', () => {
    const html = renderToStaticMarkup(<CutoutSheet elements={[]} />);
    expect(html).toMatch(/Tracing|cannot be printed/);
  });
});
