import { describe, it, expect } from 'vitest';
import { parseNotificationLink, withoutLinkParams } from './notificationLink.js';

// The same link is read by a tap in the bell and by the page loading from a WhatsApp button or a push.
// These pin what each shape of link opens, so the two cannot come to disagree.

describe('parseNotificationLink', () => {
  it('opens the orders list for ?panel=orders — the WhatsApp "View Orders" button', () => {
    expect(parseNotificationLink('/?panel=orders')).toEqual({ open: 'orders', orderId: null });
    expect(parseNotificationLink('https://app.spattoo.com/?panel=orders')).toEqual({ open: 'orders', orderId: null });
    expect(parseNotificationLink('?panel=orders')).toEqual({ open: 'orders', orderId: null });
  });

  it('opens one order for ?order=<id>, whatever else is in the address', () => {
    expect(parseNotificationLink('/?order=abc-123')).toEqual({ open: 'orders', orderId: 'abc-123' });
    expect(parseNotificationLink('/?session=s1&order=abc-123')).toEqual({ open: 'orders', orderId: 'abc-123' });
    expect(parseNotificationLink('/?order=abc-123#top')).toEqual({ open: 'orders', orderId: 'abc-123' });
  });

  it('opens billing for ?panel=billing', () => {
    expect(parseNotificationLink('/?panel=billing')).toEqual({ open: 'billing', orderId: null });
  });

  it('opens the cake templates for ?panel=templates — the welcome WhatsApp button', () => {
    expect(parseNotificationLink('https://app.spattoo.com/?panel=templates')).toEqual({ open: 'templates', orderId: null });
  });

  // ?order= names one order, so it wins over any panel named beside it.
  it('an order id wins over a panel', () => {
    expect(parseNotificationLink('/?panel=templates&order=o1')).toEqual({ open: 'orders', orderId: 'o1' });
  });

  // An unknown panel is a newer API than this bundle; a plain address is not a notification link at all.
  it('asks for nothing when the link names nothing this app knows', () => {
    expect(parseNotificationLink('/?panel=somethingNew')).toBeNull();
    expect(parseNotificationLink('/')).toBeNull();
    expect(parseNotificationLink('/?session=s1')).toBeNull();
    expect(parseNotificationLink('')).toBeNull();
    expect(parseNotificationLink(null)).toBeNull();
  });
});

describe('withoutLinkParams', () => {
  it('removes order and panel so a refresh does not reopen the panel', () => {
    expect(withoutLinkParams('/', '?panel=orders')).toBe('/');
    expect(withoutLinkParams('/', '?order=abc-123')).toBe('/');
  });

  it('leaves everything else in the address alone', () => {
    expect(withoutLinkParams('/', '?session=s1&panel=orders')).toBe('/?session=s1');
    expect(withoutLinkParams('/', '?panel=orders&signup=1', '#top')).toBe('/?signup=1#top');
    expect(withoutLinkParams('/', '')).toBe('/');
  });
});
