import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { initialStickerColor } from './useCakeDesign.js';

const src = readFileSync(new URL('./useCakeDesign.js', import.meta.url), 'utf8');

/* ── Every wholesale replacement announces itself ───────────────────────────────────────────────
 *
 * ⚠️ `loadGeneration` IS A PROMISE OTHER CODE RELIES ON, and `resetDesign` was quietly breaking it.
 * Only the authored-snapshot branch went through `loadDesign`; a plain round New Cake — most of
 * them — called `setDesign` and told nobody. Two listeners never ran: the GLB sweep kept the old
 * cake's models resident, and CakeDesigner's editing state kept pointing into a design that no
 * longer existed, so the pen stayed selected and the next tap on the cake DREW. Reported as a brush
 * stroke card that "is not cleared when new cake is added".
 *
 * A source assertion because the suite never mounts the hook, and because the failure is an
 * ABSENCE — a branch that forgets to bump a counter looks exactly like a branch that is finished. */
describe('resetDesign — a new cake is a wholesale replacement, whichever shape it is', () => {
  const body = src.slice(src.indexOf('function resetDesign'),
                         src.indexOf('function addStickerBatch'));

  it('bumps the load counter on BOTH branches, not only the authored one', () => {
    expect(body).toMatch(/if \(def\.design\) loadDesign\(design\);/);
    expect(body).toMatch(/setLoadGeneration\(n => n \+ 1\)/);
  });

  it('never replaces the design without saying so', () => {
    /* Each `setDesign(` in here must sit on a line that also bumps, or be the `loadDesign` call
       which bumps for it. A bare one is the bug this pins. */
    for (const line of body.split('\n')) {
      if (!/\bsetDesign\(/.test(line)) continue;
      expect(line, line.trim()).toMatch(/setLoadGeneration/);
    }
  });
});

// `recolor` means "the customer MAY change these colours", NOT "repaint this now". These cases pin that:
// a recolourable sticker renders its own artwork until either the author opts into an at-load repaint
// (recolor.default) or the customer picks a colour. Regressing this repaints artwork nobody asked to
// repaint — a palm tree whose trunk, leaves and flower all turned one shade of green.
const el = (over = {}) => ({ default_color: null, placement_config: {}, ...over });

describe('initialStickerColor — a recolourable sticker starts from its artwork', () => {
  it('recolor with no default → null, so the renderer draws the image as-is', () => {
    expect(initialStickerColor(el({ placement_config: { recolor: { method: 'opaque' } } }))).toBeNull();
  });

  it('a default_color on the ROW must not repaint a recolourable sticker', () => {
    // The exact palm-tree bug: opaque + a green default_color repainted every pixel.
    const tree = el({ default_color: '#73ab0c', placement_config: { recolor: { method: 'opaque' } } });
    expect(initialStickerColor(tree)).toBeNull();
  });

  it('recolor.default IS the explicit opt-in to an at-load repaint (Cream layer)', () => {
    const cream = el({ default_color: '#ffffff', placement_config: { recolor: { method: 'opaque', default: '#F0DEB8' } } });
    expect(initialStickerColor(cream)).toBe('#F0DEB8');
  });

  it('holds for every method, not just opaque', () => {
    for (const method of ['opaque', 'saturated', 'blue_gt_green', 'hue_regions']) {
      expect(initialStickerColor(el({ default_color: '#F0DEB8', placement_config: { recolor: { method } } }))).toBeNull();
    }
  });
});

describe('initialStickerColor — default_color keeps its other jobs', () => {
  it('no recolor descriptor → seed from default_color (GLB tint, photo-frame border)', () => {
    expect(initialStickerColor(el({ default_color: '#D4AF37' }))).toBe('#D4AF37');
  });

  it('no recolor and no default_color → null', () => {
    expect(initialStickerColor(el())).toBeNull();
  });

  it('an explicit choice wins over everything (re-pack, clone, saved design)', () => {
    const cream = el({ placement_config: { recolor: { method: 'opaque', default: '#F0DEB8' } } });
    expect(initialStickerColor(cream, { color: '#ff0000' })).toBe('#ff0000');
    expect(initialStickerColor(el({ default_color: '#D4AF37' }), { color: '#ff0000' })).toBe('#ff0000');
  });

  it('tolerates a missing element / placement_config', () => {
    expect(initialStickerColor(undefined)).toBeNull();
    expect(initialStickerColor({})).toBeNull();
  });
});
