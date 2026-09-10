import { describe, it, expect } from 'vitest';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { topperContours, topperSheets, topperBox, topperStick } from './topperPiece.js';

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

  /* ⚠️ A SHAPE GETS A BAND TOO. This was text-only, and the gap was invisible: nothing failed, a
   * heart simply had no way to carry an outline and the control was not offered for one. */
  it('gives a shape its own offset band, behind it', () => {
    const sheets = topperSheets({ objects: [shape({ offset: 0.1, offsetColour: '#FFFFFF' })] }, fontOf);
    expect(sheets).toHaveLength(2);                       // the band, then the shape
    const [band, face] = sheets;
    expect(band.colour).toBe('#FFFFFF');
    expect(face.layer).toBeGreaterThan(band.layer);       // the band never covers its own shape
  });

  it('leaves a shape alone when it has no offset', () => {
    // Every shape saved before offsets existed carries no `offset` key at all.
    expect(topperSheets({ objects: [shape()] }, fontOf)).toHaveLength(1);
    expect(topperSheets({ objects: [shape({ offset: 0 })] }, fontOf)).toHaveLength(1);
  });

  /* ⚠️ A BAND SITS ON ITS OWN PIECE, NOT AT THE ORIGIN. It used to take the default (0, 0) while the
   * face carried the object's position, so an outline detached and slid to the middle of the topper.
   * Invisible while everything with an offset happened to be centred. */
  it('puts the offset band at its own object\'s position', () => {
    const sheets = topperSheets({ objects: [
      text({ id: 1, offset: 0.1, x: -0.58, y: 0.2 }),
      shape({ id: 2, offset: 0.1, x: 0.58, y: -0.2 }),
    ] }, fontOf);
    expect(sheets).toHaveLength(4);
    for (const sh of sheets) {
      // Each pair — band then face — shares one position.
      expect(Math.abs(sh.x)).toBeCloseTo(0.58, 5);
      expect(Math.abs(sh.y)).toBeCloseTo(0.2, 5);
    }
    expect(sheets[0].x).toBe(sheets[1].x);   // the word's band sits on the word
    expect(sheets[2].x).toBe(sheets[3].x);   // the shape's band sits on the shape
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

describe('topperStick', () => {
  const box = { w: 2, h: 1, cx: 0, cy: 0 };

  it('is nothing at all unless there is a stick', () => {
    expect(topperStick(box, null)).toBeNull();
    expect(topperStick(box, { on: false, bury: 0.5 })).toBeNull();
    expect(topperStick(null, { on: true })).toBeNull();
  });

  /* ⚠️ A stick that stops at the card's bottom edge hangs off it with daylight between the two, and
   * reads as a card floating above a rod. The tuck is the attachment. */
  it('runs UP behind the card as well as down below it', () => {
    const s = topperStick(box, { on: true, bury: 0.5 });
    expect(s.topY).toBeGreaterThan(box.cy - box.h / 2);   // above the card's bottom edge
    expect(s.bottomY).toBeLessThan(box.cy - box.h / 2);   // and below it
  });

  /* ⚠️ `bury` is a FRACTION, so the stick can never be the thing that runs out and nothing has to be
   * re-measured when the topper is resized. */
  it('buries a fraction of the hanging part, clamped', () => {
    expect(topperStick(box, { on: true, bury: 0.5 }).buried).toBeCloseTo(topperStick(box, { on: true }).len * 0.5, 6);
    expect(topperStick(box, { on: true, bury: 5 }).bury).toBe(1);
    expect(topperStick(box, { on: true, bury: -3 }).bury).toBe(0);
    expect(topperStick(box, { on: true, bury: undefined }).bury).toBe(0.5);
  });

  it('scales with the card, so a resized topper keeps its proportions', () => {
    const small = topperStick({ ...box, h: 1 }, { on: true, bury: 0.5 });
    const big   = topperStick({ ...box, h: 2 }, { on: true, bury: 0.5 });
    expect(big.len / small.len).toBeCloseTo(2, 6);
    expect(big.tuck / small.tuck).toBeCloseTo(2, 6);
  });

  /* ⚠️ THE STICK IS NOT A SHEET. If it ever entered topperSheets/topperBox the card would shrink to
   * fit a box that is mostly rod, and the print sheet would print a picture of a stick. */
  it('never reaches the sheets or the measured box', () => {
    const withStick = { v: 1, objects: [text()], stick: { on: true, bury: 0.5 } };
    const without   = { v: 1, objects: [text()] };
    expect(topperSheets(withStick, fontOf)).toHaveLength(topperSheets(without, fontOf).length);
    expect(topperBox(withStick, fontOf)).toEqual(topperBox(without, fontOf));
  });
});
