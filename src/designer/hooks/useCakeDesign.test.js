import { describe, it, expect } from 'vitest';
import { initialStickerColor } from './useCakeDesign.js';

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
