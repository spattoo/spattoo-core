import { describe, it, expect } from 'vitest';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { topperLayers, toppersToSvg, DEFAULT_WIDTH_MM } from './topperSvg.js';

const font = new FontLoader().parse(helvetikerBold);
const fontOf = () => font;

const text = (over = {}) => ({
  id: 1, kind: 'text', text: 'Mia', size: 1, x: 0, y: 0,
  colour: '#4A2C1B', offset: 0, offsetColour: '#FFFFFF', face: '__block', ...over,
});
const shape = (over = {}) => ({
  id: 2, kind: 'shape', family: 'heart', size: 1, x: 0, y: 0, colour: '#D94F6E', offset: 0, ...over,
});
const pay = (objects, extra = {}) => ({ v: 1, objects, ...extra });

describe('topperLayers', () => {
  it('gives nothing to cut for an empty topper', () => {
    expect(topperLayers(pay([]), fontOf)).toBeNull();
    expect(topperLayers(pay([text({ text: '' })]), fontOf)).toBeNull();
  });

  /* ⚠️ ONE LAYER PER COLOUR — the opposite of the print sheet, and deliberately. A machine cuts each
   * colour from a DIFFERENT sheet of card; a printer does not. */
  it('gives one layer per colour, not one per piece', () => {
    // Two words in one colour are cut from one sheet of card, so they must arrive as one layer.
    const two = topperLayers(pay([text({ id: 1, x: -1 }), text({ id: 2, x: 1 })]), fontOf);
    expect(two.layers).toHaveLength(1);
    const banded = topperLayers(pay([text({ offset: 0.1, offsetColour: '#FFFFFF' })]), fontOf);
    expect(banded.layers.map(l => l.colour)).toEqual(['#FFFFFF', '#4A2C1B']);
  });

  it('keeps the back layer at the back', () => {
    const l = topperLayers(pay([shape(), text()]), fontOf);
    expect(l.layers[0].colour).toBe('#D94F6E');     // the heart is cut as the bottom sheet
  });

  /* ⚠️ The width is asked for and the height follows the shape — a topper written to a square would
   * be cut distorted, and no resizing in the machine's software recovers it. */
  it('honours the asked width and keeps the proportions', () => {
    const l = topperLayers(pay([shape()]), fontOf, { widthMm: 60 });
    expect(l.widthMm).toBe(60);
    const wide = topperLayers(pay([shape({ family: 'rect', ratio: 3 })]), fontOf, { widthMm: 60 });
    expect(wide.heightMm).toBeLessThan(l.heightMm);
  });

  /* ⚠️ A stick is taped on, never cut from card. */
  it('never writes the stick', () => {
    const withStick = topperLayers(pay([text()], { stick: { on: true, bury: 0.5 } }), fontOf);
    const without = topperLayers(pay([text()]), fontOf);
    expect(withStick.heightMm).toBeCloseTo(without.heightMm, 6);
    expect(withStick.layers).toHaveLength(without.layers.length);
  });
});

describe('toppersToSvg', () => {
  const one = { id: 't1', name: 'Mia on a heart', payload: pay([shape(), text()]) };

  it('is nothing when there is nothing to cut', () => {
    expect(toppersToSvg([], fontOf)).toBeNull();
    expect(toppersToSvg([{ id: 'x', payload: pay([]) }], fontOf)).toBeNull();
  });

  /* ⚠️ Cutting software assumes 96 dpi for a unitless SVG and imports at the wrong scale. Stating mm
   * on width/height AND a matching viewBox is what makes the file open at the size it claims. */
  it('states millimetres, with a viewBox that matches', () => {
    const svg = toppersToSvg([one], fontOf, { widthMm: 80 });
    expect(svg).toMatch(/width="80mm"/);
    const [, w, h] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    expect(Number(w)).toBeCloseTo(80, 3);
    expect(svg).toMatch(new RegExp(`height="${h}mm"`));
  });

  it('writes each colour as its own path, even-odd so counters stay holes', () => {
    const svg = toppersToSvg([one], fontOf);
    const paths = svg.match(/<path /g) ?? [];
    expect(paths).toHaveLength(2);                       // heart, then word
    expect(svg.match(/fill-rule="evenodd"/g)).toHaveLength(2);
  });

  /* ⚠️ ONE FILE, NOT ONE PER TOPPER — a cake with two toppers is one job. Each is its own group so a
   * machine can still separate them, and they must not be written on top of one another. */
  it('lays several toppers side by side in one file', () => {
    const svg = toppersToSvg([one, { ...one, id: 't2', name: 'Second' }], fontOf, { widthMm: 50 });
    expect(svg.match(/<g transform/g)).toHaveLength(2);
    const xs = [...svg.matchAll(/translate\(([\d.]+) 0\)/g)].map(m => Number(m[1]));
    expect(xs[0]).toBe(0);
    expect(xs[1]).toBeGreaterThanOrEqual(50);            // clear of the first, plus a gap
    expect(Number(svg.match(/viewBox="0 0 ([\d.]+)/)[1])).toBeGreaterThan(100);
  });

  it('leaves out a topper that cannot be cut rather than writing a blank group', () => {
    const svg = toppersToSvg([one, { id: 't3', name: 'empty', payload: pay([]) }], fontOf);
    expect(svg.match(/<g transform/g)).toHaveLength(1);
  });

  it('names each topper, escaped, so a machine lists them', () => {
    const svg = toppersToSvg([{ ...one, name: 'Ben & "Amy"' }], fontOf);
    expect(svg).toContain('<title>Ben &amp; &quot;Amy&quot;</title>');
  });

  it('defaults to a stated starting width', () => {
    expect(toppersToSvg([one], fontOf)).toMatch(new RegExp(`viewBox="0 0 ${DEFAULT_WIDTH_MM}`));
  });
});
