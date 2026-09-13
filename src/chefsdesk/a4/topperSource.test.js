import { describe, it, expect } from 'vitest';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { topperPlan, fillTopper } from './topperSource.js';

const font = new FontLoader().parse(helvetikerBold);
const fontOf = () => font;

const text = (over = {}) => ({
  id: 1, kind: 'text', text: 'Mia', size: 1, x: 0, y: 0,
  colour: '#4A2C1B', offset: 0, offsetColour: '#FFFFFF', face: '__block', ...over,
});
const shape = (over = {}) => ({
  id: 2, kind: 'shape', family: 'heart', size: 1, x: 0, y: 0, colour: '#D94F6E', offset: 0, ...over,
});
const payload = (objects) => ({ v: 1, objects });

describe('topperPlan', () => {
  it('gives nothing for an empty topper, rather than a zero-sized item', () => {
    expect(topperPlan(payload([]), fontOf)).toBeNull();
    expect(topperPlan(payload([text({ text: '' })]), fontOf)).toBeNull();
  });

  /* ⚠️ The aspect is what stops a printed topper being born distorted — `imageSource` says the same
   * of its own: get it wrong and no careful resizing on the sheet recovers it. */
  it('takes its aspect from what the topper OCCUPIES', () => {
    const plan = topperPlan(payload([shape(), text()]), fontOf);
    expect(plan.aspect).toBeCloseTo(plan.box.w / plan.box.h, 6);
    expect(plan.aspect).toBeGreaterThan(0);
  });

  /* ⚠️ THE BAND IS PART OF THE PRINT, not a second item. A baker who chose print gets the topper as
   * it looks — bands and all — and cuts round the outside. */
  it('bakes the offset band into the same print, behind its own piece', () => {
    const plan = topperPlan(payload([text({ offset: 0.1, offsetColour: '#FFFFFF' })]), fontOf);
    expect(plan.sheets).toHaveLength(2);
    const [band, face] = plan.sheets;
    expect(band.colour).toBe('#FFFFFF');
    expect(face.layer).toBeGreaterThan(band.layer);
  });

  it('grows the printed piece when a band is added, because the band is cut too', () => {
    const bare = topperPlan(payload([text({ offset: 0 })]), fontOf);
    const band = topperPlan(payload([text({ offset: 0.12 })]), fontOf);
    expect(band.box.w).toBeGreaterThan(bare.box.w);
  });
});

describe('fillTopper', () => {
  /* A recording context: the sheet's preview and its PDF share this one drawing routine, so what it
   * emits is worth asserting directly rather than through pixels. */
  const recorder = () => {
    const calls = [];
    const ctx = {
      save: () => calls.push(['save']), restore: () => calls.push(['restore']),
      beginPath: () => calls.push(['beginPath']), closePath: () => calls.push(['closePath']),
      moveTo: (x, y) => calls.push(['moveTo', x, y]), lineTo: (x, y) => calls.push(['lineTo', x, y]),
      fill: (rule) => calls.push(['fill', rule]),
      set fillStyle(v) { calls.push(['fillStyle', v]); },
    };
    return { ctx, calls };
  };

  it('fills every sheet, even-odd so a letter keeps its counter', () => {
    const plan = topperPlan(payload([text({ text: 'O', offset: 0.08 })]), fontOf);
    const { ctx, calls } = recorder();
    fillTopper(ctx, plan, 0, 0, 100, 100);
    const fills = calls.filter(c => c[0] === 'fill');
    expect(fills).toHaveLength(plan.sheets.length);
    for (const f of fills) expect(f[1]).toBe('evenodd');
  });

  it('draws the band BEFORE the face, so the outline sits behind it', () => {
    const plan = topperPlan(payload([text({ offset: 0.1, offsetColour: '#FFFFFF' })]), fontOf);
    const { ctx, calls } = recorder();
    fillTopper(ctx, plan, 0, 0, 100, 100);
    const colours = calls.filter(c => c[0] === 'fillStyle').map(c => c[1]);
    expect(colours[0]).toBe('#FFFFFF');          // the band
    expect(colours[1]).toBe('#4A2C1B');          // its word, on top
  });

  /* ⚠️ Canvas y grows DOWNWARD and the composer's grows up. Getting this wrong does not throw — it
   * prints the topper upside down, and only on paper. */
  it('flips y, and keeps every point inside the box it was given', () => {
    const plan = topperPlan(payload([shape(), text()]), fontOf);
    const { ctx, calls } = recorder();
    fillTopper(ctx, plan, 10, 20, 100, 60);
    const pts = calls.filter(c => c[0] === 'moveTo' || c[0] === 'lineTo');
    expect(pts.length).toBeGreaterThan(10);
    for (const [, x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(10 - 1e-6);
      expect(x).toBeLessThanOrEqual(110 + 1e-6);
      expect(y).toBeGreaterThanOrEqual(20 - 1e-6);
      expect(y).toBeLessThanOrEqual(80 + 1e-6);
    }
    // The TOP of the composition must land at the top of the box, not the bottom.
    const top = Math.min(...pts.map(p => p[2]));
    expect(top).toBeLessThan(20 + 2);
  });
});
