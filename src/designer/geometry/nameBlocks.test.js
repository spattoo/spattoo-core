import { describe, it, expect } from 'vitest';
import { nameBlockLayout, boardRunRadius, NAME_BLOCK_DEFAULTS } from './nameBlocks.js';

// ── What is worth asserting about a name in blocks ──────────────────────────────────────────────
// Not whether a cube reads as fondant — that is what the studio is for. What a test CAN pin is the
// layout, and specifically the things that would be wrong in a way nobody notices until a customer
// sees their child's name backwards or bunched up.

describe('nameBlockLayout', () => {
  const size = 0.3, gap = 0.04, radius = 1.5;

  it('gives one block per letter, in reading order', () => {
    const out = nameBlockLayout({ text: 'EMILY', radius, size, gap });
    expect(out.map(b => b.char).join('')).toBe('EMILY');
  });

  it('uppercases, because a fondant cutter has one case', () => {
    expect(nameBlockLayout({ text: 'Grace', radius, size, gap }).map(b => b.char).join('')).toBe('GRACE');
  });

  // A space must hold its place, not close up: "A B" is two blocks with a gap between them, and
  // filtering spaces out before laying out would silently turn it into "AB".
  it('a space leaves a gap and draws nothing', () => {
    const out = nameBlockLayout({ text: 'A B', zone: 'top', size, gap });
    expect(out.map(b => b.char).join('')).toBe('AB');
    expect(Math.abs(out[1].x - out[0].x)).toBeCloseTo(2 * (size + gap), 6);
  });

  it('is empty for an empty name', () => {
    expect(nameBlockLayout({ text: '' })).toEqual([]);
    expect(nameBlockLayout({ text: '   ' })).toEqual([]);
  });

  describe('on the board', () => {
    it('arcs the run around the cake at the given radius', () => {
      const out = nameBlockLayout({ text: 'JOSHUA', radius, size, gap });
      expect(out.every(b => Math.abs(Math.hypot(b.x, b.z) - radius) < 1e-9)).toBe(true);
    });

    // The lettered face is the block's +Z, so a yaw equal to the block's own angle turns it to look
    // radially outward. Get this wrong and every name faces into the cake.
    it('turns each block to face outward', () => {
      for (const b of nameBlockLayout({ text: 'ABC', radius, size, gap, angle: 0.7 })) {
        expect(Math.sin(b.yaw)).toBeCloseTo(b.x / radius, 6);
        expect(Math.cos(b.yaw)).toBeCloseTo(b.z / radius, 6);
      }
    });

    it('centres the run on the angle it is given', () => {
      const out = nameBlockLayout({ text: 'ABCDE', radius, size, gap, angle: 1.2 });
      expect(out[2].yaw).toBeCloseTo(1.2, 6);   // odd count → the middle block sits on the angle
    });

    // The angular pitch is linear pitch ÷ radius, so blocks keep a constant real-world gap and a
    // small cake simply wraps further round. A fixed angular step would space them out on a big
    // cake and overlap them on a little one.
    it('keeps the spacing constant in real terms, whatever the cake size', () => {
      const near = nameBlockLayout({ text: 'AB', radius: 1.0, size, gap });
      const far  = nameBlockLayout({ text: 'AB', radius: 2.5, size, gap });
      const sep = o => Math.hypot(o[1].x - o[0].x, o[1].z - o[0].z);
      expect(sep(near)).toBeCloseTo(sep(far), 2);
    });
  });

  describe('on top', () => {
    it('lays a straight row, centred, all facing front', () => {
      const out = nameBlockLayout({ text: 'ABCD', zone: 'top', size, gap });
      expect(out.every(b => b.z === 0 && b.yaw === 0)).toBe(true);
      expect(out[0].x + out[3].x).toBeCloseTo(0, 9);   // symmetric about the centre
    });

    it('respects an offset', () => {
      const out = nameBlockLayout({ text: 'AB', zone: 'top', size, gap, offsetX: 0.5, offsetZ: -0.2 });
      expect(out[0].x + out[1].x).toBeCloseTo(1.0, 9);
      expect(out.every(b => b.z === -0.2)).toBe(true);
    });
  });
});

describe('boardRunRadius', () => {
  // Clear of the wall by half a block or so: cubes stand AGAINST the cake, not buried under the
  // overhang and not adrift in the middle of the board.
  it('clears the cake by roughly half a block', () => {
    const r = boardRunRadius(1.2, 0.3);
    expect(r).toBeGreaterThan(1.2);
    expect(r).toBeLessThan(1.2 + 0.3);
  });

  it('scales with the block, not the cake', () => {
    expect(boardRunRadius(1.2, 0.5) - 1.2).toBeGreaterThan(boardRunRadius(1.2, 0.2) - 1.2);
  });

  it('defaults to the standard block size', () => {
    expect(boardRunRadius(1.2)).toBeCloseTo(1.2 + NAME_BLOCK_DEFAULTS.size * 0.62, 9);
  });
});
