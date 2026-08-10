import { describe, it, expect } from 'vitest';
import { demoPoses, demoTimeline, demoActions, canDemo } from './elementDemo.js';

// The real Lavender butterfly, copied from the dev library — three zones, three DIFFERENT poses,
// authored scale bounds, and gradient explicitly off. It is the element that proves the demo is
// derived rather than templated: nothing here is the same for two zones.
const butterfly = {
  name: 'Lavender butterfly',
  allowed_zones: ['top_surface', 'side', 'rim'],
  allowed_actions: { move: true, tilt: true, color: true, delete: true, resize: true, gradient: false, duplicate: true },
  placement_config: {
    r: 2, rim: 'verge', side: 'stand', top_surface: 'hug',
    scale: { min: 0.5, max: 4 }, foldable: true,
  },
};

describe('demoPoses', () => {
  it('reads the pose each zone actually declares, not one pose for the element', () => {
    const poses = demoPoses(butterfly);
    expect(poses.map(p => [p.zone, p.mode])).toEqual([
      ['top_surface', 'hug'],     // lies flat
      ['rim',         'verge'],   // leans out over the edge
      ['side',        'stand'],   // stands off the wall
    ]);
  });

  it('describes the cake, never the config — no customer knows what "verge" is', () => {
    const captions = demoPoses(butterfly).map(p => p.caption);
    expect(captions).toEqual([
      'lies flat on the top surface',
      'leans out over the rim',
      'stands on the side',
    ]);
    expect(captions.join(' ')).not.toMatch(/verge|hug|stand\b.*mode|placement_config/i);
  });

  it('shows only zones the element allows', () => {
    const topOnly = { allowed_zones: ['top_surface'], placement_config: {} };
    expect(demoPoses(topOnly).map(p => p.zone)).toEqual(['top_surface']);
  });

  it('orders coarse to fine regardless of how allowed_zones was authored', () => {
    const scrambled = { allowed_zones: ['board', 'side', 'top_surface'], placement_config: {} };
    expect(demoPoses(scrambled).map(p => p.zone)).toEqual(['top_surface', 'side', 'board']);
  });

  it('says when an element buries itself, because that is invisible once placed', () => {
    const pick = { allowed_zones: ['top_surface'], placement_config: { top_surface: { mode: 'stand', insert: { depth: 0.3 } } } };
    expect(demoPoses(pick)[0].caption).toBe('pushes into the top surface');
  });
});

describe('demoTimeline', () => {
  it('ends on the size range, staged on the last pose so nothing jumps across the cake', () => {
    const t = demoTimeline(butterfly);
    expect(t.at(-1)).toMatchObject({ kind: 'size', from: 0.5, to: 4, zone: 'side' });
    expect(t.filter(s => s.kind === 'pose')).toHaveLength(3);
  });

  it('omits the size step when the element authors no bounds', () => {
    // Rather than fall back to the global 0.25→8, which would promise a range nobody tuned.
    const unsized = { allowed_zones: ['side'], allowed_actions: { resize: true }, placement_config: {} };
    expect(demoTimeline(unsized).every(s => s.kind === 'pose')).toBe(true);
  });

  it('omits the size step when the element cannot be resized', () => {
    const fixed = { ...butterfly, allowed_actions: { ...butterfly.allowed_actions, resize: false } };
    expect(demoTimeline(fixed).some(s => s.kind === 'size')).toBe(false);
  });

  it('is empty for an element with nowhere to go, so nothing offers a demo that cannot play', () => {
    expect(demoTimeline({ allowed_zones: [], placement_config: {} })).toEqual([]);
    expect(demoTimeline(null)).toEqual([]);
    expect(canDemo({ allowed_zones: [] })).toBe(false);
  });
});

describe('demoActions', () => {
  it('offers only what this element actually allows', () => {
    expect(demoActions(butterfly).map(a => a.key)).toEqual(['move', 'resize', 'tilt', 'color', 'duplicate']);
  });

  it('treats a missing key as "not offered" rather than "allowed"', () => {
    // === true, not truthiness: an element never given the key must not advertise the capability.
    expect(demoActions({ allowed_actions: { move: undefined, resize: 1, tilt: 'yes' } })).toEqual([]);
  });

  it('never advertises delete — true on every element, and the loudest word in the row', () => {
    expect(demoActions(butterfly).map(a => a.key)).not.toContain('delete');
  });
});
