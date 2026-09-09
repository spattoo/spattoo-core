import { describe, it, expect } from 'vitest';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { topperContours, topperSheets, topperBox } from './topperPiece.js';

const font = new FontLoader().parse(helvetikerBold);
const fontOf = () => font;

const text = (over = {}) => ({
  id: 1, kind: 'text', text: 'TEST', size: 1, x: 0, y: 0,
  colour: '#F2AEC4', offset: 0, offsetColour: '#FFFFFF', face: '__block', ...over,
});
const shape = (over = {}) => ({ id: 2, kind: 'shape', family: 'circle', size: 1, x: 0, y: 0, colour: '#EEE', ...over });

describe('topperContours', () => {
  it('cuts a word', () => {
    const parts = topperContours(text(), font);
    expect(parts?.length).toBeGreaterThan(0);
  });

  it('gives nothing for empty or whitespace text, rather than a zero-sized shape', () => {
    // A blank word must not become a degenerate contour the renderer then has to guard against.
    expect(topperContours(text({ text: '' }), font)).toBeNull();
    expect(topperContours(text({ text: '   ' }), font)).toBeNull();
  });

  it('gives nothing when the face has not loaded yet', () => {
    // Faces resolve asynchronously; a cake mid-render must draw what it has, not throw.
    expect(topperContours(text(), null)).toBeNull();
  });

  it('builds each shape family', () => {
    for (const family of ['circle', 'rect', 'heart']) {
      expect(topperContours(shape({ family }), null), family).toHaveLength(1);
    }
  });
});

describe('topperSheets', () => {
  it('is empty for an empty payload', () => {
    expect(topperSheets({ objects: [] }, fontOf)).toEqual([]);
    expect(topperSheets(null, fontOf)).toEqual([]);
  });

  /* ⚠️ The order IS the stacking, and coplanar extrusions do not stack — a word laid on a disc at
   * the same depth has half its letters inside it. If this ever stops being back-to-front, letters
   * show through the shape they are sitting on. */
  it('puts a shape behind a word added after it', () => {
    const sheets = topperSheets({ objects: [shape(), text()] }, fontOf);
    const shapeLayer = sheets[0].layer;
    const textLayer = sheets[sheets.length - 1].layer;
    expect(textLayer).toBeGreaterThan(shapeLayer);
  });

  it('puts a band behind its own word and in front of what is below', () => {
    const sheets = topperSheets({ objects: [shape(), text({ offset: 0.08 })] }, fontOf);
    expect(sheets).toHaveLength(3);                       // shape, band, word
    const [plate, band, word] = sheets;
    expect(band.layer).toBeGreaterThan(plate.layer);      // the band never falls behind the plate
    expect(word.layer).toBeGreaterThan(band.layer);       // and never in front of its own word
    expect(band.colour).toBe('#FFFFFF');
  });

  it('leaves out a word that cannot be cut', () => {
    expect(topperSheets({ objects: [text({ text: '' })] }, fontOf)).toEqual([]);
  });
});

describe('topperBox', () => {
  it('measures what the topper OCCUPIES, not the sizes added up', () => {
    const one = topperBox({ objects: [shape({ size: 1 })] }, fontOf);
    const two = topperBox({ objects: [shape({ size: 1 }), shape({ id: 3, size: 1, x: 3 })] }, fontOf);
    // Two 1-wide shapes 3 apart span about 4, never 2.
    expect(two.w).toBeGreaterThan(one.w * 2);
    expect(two.cx).toBeGreaterThan(one.cx);
  });

  it('grows with the offset band, because the band is part of the piece', () => {
    const bare = topperBox({ objects: [text({ offset: 0 })] }, fontOf);
    const band = topperBox({ objects: [text({ offset: 0.1 })] }, fontOf);
    expect(band.w).toBeGreaterThan(bare.w);
    expect(band.h).toBeGreaterThan(bare.h);
  });

  it('is null when there is nothing on it', () => {
    expect(topperBox({ objects: [] }, fontOf)).toBeNull();
  });
});
