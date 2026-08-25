import { describe, it, expect } from 'vitest';
import {
  PHOTO_SHAPES, DEFAULT_SHAPE, shapeByKey, photoSize, clampToDevice, photoFilename, LONG_EDGE,
} from './photoShapes.js';

describe('the shapes on offer', () => {
  it('is the four places a cake picture actually goes', () => {
    expect(PHOTO_SHAPES.map(s => s.key)).toEqual(['portrait', 'square', 'tall', 'landscape']);
  });

  it('every shape carries a label, a usable aspect and a reason', () => {
    // The hint is what makes the row choosable by somebody who does not think in ratios. A shape
    // with no reason attached is a number the baker has to guess the purpose of.
    for (const s of PHOTO_SHAPES) {
      expect(s.label, s.key).toBeTruthy();
      expect(s.hint, s.key).toBeTruthy();
      expect(Number.isFinite(s.aspect) && s.aspect > 0, s.key).toBe(true);
    }
  });

  it('defaults to the Instagram feed shape', () => {
    // Where most of these are going, and the one shape that is actively wasted by picking square.
    expect(shapeByKey(DEFAULT_SHAPE).key).toBe('portrait');
  });

  it('falls back rather than returning undefined for an unknown key', () => {
    expect(shapeByKey('nonsense').key).toBe('portrait');
    expect(shapeByKey(undefined).key).toBe('portrait');
  });
});

describe('photoSize', () => {
  it('puts the long edge on the long side, whichever side that is', () => {
    expect(photoSize(4 / 5)).toEqual({ width: 1638, height: 2048 });
    expect(photoSize(4 / 3)).toEqual({ width: 2048, height: 1536 });
    expect(photoSize(1)).toEqual({ width: 2048, height: 2048 });
    expect(photoSize(9 / 16)).toEqual({ width: 1152, height: 2048 });
  });

  it('is bigger than a video frame, which is the point', () => {
    // A reel is capped by what a phone can encode 30 times a second. A photo is one render.
    expect(LONG_EDGE).toBeGreaterThan(1920);
  });

  it('⚠️ always lands on an EVEN grid', () => {
    // Odd dimensions are legal in a PNG, but any tool that re-encodes to a video codec (Instagram
    // does) meets chroma-subsampling maths that assumes even, and the symptom is a one-pixel
    // coloured seam down an edge.
    for (const a of [4 / 5, 1, 9 / 16, 4 / 3, 0.777, 1.333]) {
      const { width, height } = photoSize(a);
      expect(width % 2, `w for ${a}`).toBe(0);
      expect(height % 2, `h for ${a}`).toBe(0);
    }
  });

  it('survives junk instead of producing NaN×NaN', () => {
    expect(photoSize(0)).toEqual({ width: 2048, height: 2048 });
    expect(photoSize(undefined)).toEqual({ width: 2048, height: 2048 });
    expect(photoSize(-3)).toEqual({ width: 2048, height: 2048 });
  });
});

describe('clampToDevice', () => {
  it('leaves a size the device can hold alone', () => {
    expect(clampToDevice({ width: 1638, height: 2048 }, 4096))
      .toEqual({ width: 1638, height: 2048, clamped: false });
  });

  it('⚠️ keeps the SHAPE when it shrinks', () => {
    // A clamp that capped one edge would hand back a different aspect ratio from the preview the
    // baker approved — and the failure it guards against does not throw, so nothing else would
    // catch it.
    const { width, height, clamped } = clampToDevice({ width: 1638, height: 2048 }, 1024);
    expect(clamped).toBe(true);
    expect(Math.max(width, height)).toBeLessThanOrEqual(1024);
    expect(width / height).toBeCloseTo(1638 / 2048, 2);
  });

  it('stays on the even grid after shrinking', () => {
    const { width, height } = clampToDevice({ width: 2048, height: 1536 }, 1000);
    expect(width % 2).toBe(0);
    expect(height % 2).toBe(0);
  });

  it('treats an unknown limit as no limit rather than as zero', () => {
    // A context that will not answer the question must not produce a 2-pixel photo.
    expect(clampToDevice({ width: 1638, height: 2048 }, undefined).clamped).toBe(false);
    expect(clampToDevice({ width: 1638, height: 2048 }, 0).clamped).toBe(false);
  });
});

describe('photoFilename', () => {
  it('names the file for the cake and the shape', () => {
    // Six cakes photographed for one customer land in one folder; "spattoo-photo (3).png" says
    // nothing about which is which.
    expect(photoFilename("Ayaan's 5th Birthday", 'portrait')).toBe('ayaan-s-5th-birthday-portrait');
  });

  it('still produces something usable for an unnamed cake', () => {
    expect(photoFilename('', 'square')).toBe('cake-square');
    expect(photoFilename(undefined, undefined)).toBe('cake-photo');
    expect(photoFilename('!!!', 'tall')).toBe('cake-tall');
  });
});
