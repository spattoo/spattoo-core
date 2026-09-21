import { describe, it, expect } from 'vitest';
import { MOBILE_PRIMARY, MOBILE_SLOTS, splitMobileNav, strandedMenus } from './mobileNav.js';

// WHY THIS EXISTS. The phone bar and the desktop rail used to keep separate copies of the item list.
// They drifted, Uploads reached the rail and never reached the phone, and a baker had no route to
// their own images. Nothing failed — an absent nav item is indistinguishable from one that was never
// added. These tests assert the property that would have caught it: every item the baker is entitled
// to lands in exactly one of the two halves.

/** Mirrors railItems' real shape and order, including the one item that carries a submenu. */
const RAIL = [
  { id: 'new',       label: 'New Cake',        short: 'New' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'templates', label: 'Templates' },
  { id: 'elements',  label: 'Decorations' },
  { id: 'uploads',   label: 'Uploads' },
  { id: 'orders',    label: 'Orders',          menu: [{ id: 'orders-list', label: 'Orders' }] },
  { id: 'customers', label: 'Customers' },
  { id: 'share',     label: 'Share' },
];

describe('splitMobileNav', () => {
  it('loses nothing — every rail item lands in exactly one half', () => {
    const { primary, secondary } = splitMobileNav(RAIL);
    const landed = [...primary, ...secondary].map(i => i.id).sort();
    expect(landed).toEqual(RAIL.map(i => i.id).sort());
    expect(new Set(landed).size).toBe(RAIL.length);   // and none of them twice
  });

  it('orders the strip by MOBILE_PRIMARY, not by the rail', () => {
    const shuffled = [...RAIL].reverse();
    expect(splitMobileNav(shuffled).primary.map(i => i.id)).toEqual(MOBILE_PRIMARY);
  });

  /* ⚠️ PINNED AT A SIZE THAT STILL OVERFLOWS. This case guards `.filter(Boolean)`: with a primary id
     missing from railItems, `MOBILE_PRIMARY.map(find)` yields undefined and the strip would render a
     hole. It used to use a SIX-item rail, which now fits the strip whole (see the absorb case below),
     so the split it was written to observe no longer happened and it was asserting the wrong thing.
     Kept at seven so the original guard is still the thing being tested. */
  it('drops a primary item the baker has no capability for, without leaving a hole', () => {
    // order:view withheld — Dashboard and Orders never reach railItems at all.
    const limited = [...RAIL.filter(i => i.id !== 'dashboard' && i.id !== 'orders'),
                     { id: 'invite', label: 'Invite' }];
    expect(limited.length).toBeGreaterThan(MOBILE_SLOTS);   // so More is still in play
    const { primary } = splitMobileNav(limited);
    expect(primary.map(i => i.id)).toEqual(['new', 'templates', 'elements']);
    expect(primary.every(Boolean)).toBe(true);
  });

  // A CUSTOMER's rail: design:create + element:manage only. Five items, six slots — More would have
  // hidden Uploads and Share behind a tap while three slots sat beside them.
  const CUSTOMER = RAIL.filter(i => ['new', 'templates', 'elements', 'uploads', 'share'].includes(i.id));

  it('puts everything in the strip when it fits, and leaves nothing behind More', () => {
    const { primary, secondary } = splitMobileNav(CUSTOMER);
    expect(primary.map(i => i.id)).toEqual(['new', 'templates', 'elements', 'uploads', 'share']);
    expect(secondary).toEqual([]);           // the render draws More only when this is non-empty
    expect(primary.length).toBeLessThanOrEqual(MOBILE_SLOTS);
  });

  it('still overflows into More when the rail is bigger than the strip', () => {
    expect(RAIL.length).toBeGreaterThan(MOBILE_SLOTS);
    const { primary, secondary } = splitMobileNav(RAIL);
    expect(primary.map(i => i.id)).toEqual(MOBILE_PRIMARY);
    expect(secondary.map(i => i.id)).toEqual(['uploads', 'customers', 'share']);
  });

  it('loses nothing either way', () => {
    for (const rail of [RAIL, CUSTOMER]) {
      const { primary, secondary } = splitMobileNav(rail);
      expect([...primary, ...secondary].map(i => i.id).sort()).toEqual(rail.map(i => i.id).sort());
    }
  });

  it('survives an empty rail', () => {
    expect(splitMobileNav([])).toEqual({ primary: [], secondary: [] });
    expect(splitMobileNav()).toEqual({ primary: [], secondary: [] });
  });
});

describe('strandedMenus', () => {
  it('is empty for the real rail — Orders carries the only submenu, and it is primary', () => {
    expect(strandedMenus(RAIL)).toEqual([]);
    expect(MOBILE_PRIMARY).toContain('orders');
  });

  it('names an item whose submenu would be unreachable in the More sheet', () => {
    const withDrift = [...RAIL, { id: 'reports', label: 'Reports', menu: [{ id: 'r1', label: 'Weekly' }] }];
    expect(strandedMenus(withDrift)).toEqual(['reports']);
  });
});
