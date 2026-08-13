import { describe, it, expect } from 'vitest';
import { MOBILE_PRIMARY, splitMobileNav, strandedMenus } from './mobileNav.js';

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

  it('drops a primary item the baker has no capability for, without leaving a hole', () => {
    // order:view withheld — Dashboard and Orders never reach railItems at all.
    const limited = RAIL.filter(i => i.id !== 'dashboard' && i.id !== 'orders');
    const { primary } = splitMobileNav(limited);
    expect(primary.map(i => i.id)).toEqual(['new', 'elements']);
    expect(primary.every(Boolean)).toBe(true);
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
