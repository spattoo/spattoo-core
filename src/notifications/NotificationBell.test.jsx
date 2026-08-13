import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import NotificationBell, { titleOf, relativeTime } from './NotificationBell.jsx';

// Header furniture must never be the reason a header looks broken — the rule CreditsPill already
// follows. So the states worth pinning are the empty and unwired ones, which is what every baker
// sees before anything has happened.

const api = { fetchNotifications: async () => ({ unread: 0, notifications: [] }) };

describe('NotificationBell renders', () => {
  it('before anything has loaded', () => {
    expect(() => renderToStaticMarkup(<NotificationBell apiClient={api} />)).not.toThrow();
  });

  // A host that has not wired the endpoint gets no bell at all, rather than one that does nothing
  // when tapped.
  it('nothing at all when the host has not wired fetchNotifications', () => {
    expect(renderToStaticMarkup(<NotificationBell apiClient={{}} />)).toBe('');
    expect(renderToStaticMarkup(<NotificationBell />)).toBe('');
  });

  // Effects do not run under renderToStaticMarkup, so this is the pre-fetch state: a bell with no
  // badge. A badge rendered before the count arrives would flash "0" or a stale number.
  it('shows no badge until a count has arrived', () => {
    const html = renderToStaticMarkup(<NotificationBell apiClient={api} />);
    expect(html).toContain('aria-label="Notifications"');
    expect(html).not.toContain('9+');
  });
});

// What a row SAYS. Derived from the payload rather than the type's registry label, because
// "Order placed — baker notification" is an admin entry, not a sentence a baker wants to read.
describe('titleOf', () => {
  it('names who a quote request came from', () => {
    expect(titleOf({ type: 'order_placed_baker', payload: { customerName: 'Priya' } }))
      .toBe('New quote request from Priya');
  });

  it('does not say "1 deliveries"', () => {
    expect(titleOf({ type: 'delivery_digest_baker', payload: { count: 1 } })).toBe('One delivery today');
    expect(titleOf({ type: 'delivery_digest_baker', payload: { count: 4 } })).toBe('4 deliveries today');
  });

  // Every field is optional somewhere — an order can reach here with no customer row attached.
  it('degrades to a phrase rather than to undefined', () => {
    const t = titleOf({ type: 'order_placed_baker', payload: {} });
    expect(t).toBe('New quote request from a customer');
    expect(t).not.toMatch(/undefined/);
  });

  // A type added to the API after this bundle shipped. Falls back to the registry label, which is
  // worse copy than a purpose-written line and far better than a blank row.
  it('falls back to the label for a type it has never heard of', () => {
    expect(titleOf({ type: 'brand_new_thing', label: 'Brand new thing' })).toBe('Brand new thing');
    expect(titleOf({})).toBe('Notification');
    expect(titleOf(undefined)).toBe('Notification');
  });
});

describe('relativeTime', () => {
  const NOW = Date.parse('2026-08-06T12:00:00Z');
  const ago = (ms) => relativeTime(new Date(NOW - ms).toISOString(), NOW);

  it('reads in minutes and hours, which is what a bell is scanned for', () => {
    expect(ago(30_000)).toBe('just now');
    expect(ago(5 * 60_000)).toBe('5m ago');
    expect(ago(3 * 3600_000)).toBe('3h ago');
  });

  it('says yesterday rather than "1 days ago"', () => {
    expect(ago(26 * 3600_000)).toBe('yesterday');
  });

  // A clock a few seconds ahead of the server must not produce "-1m ago", which reads as a bug in
  // precisely the place a baker is deciding what is new.
  it('does not go negative when the timestamp is slightly ahead', () => {
    expect(relativeTime(new Date(NOW + 5000).toISOString(), NOW)).toBe('just now');
  });

  it('renders nothing rather than NaN for a missing or broken date', () => {
    expect(relativeTime(undefined, NOW)).toBe('');
    expect(relativeTime('not a date', NOW)).toBe('');
  });
});
