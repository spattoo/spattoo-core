import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SheetLibrary, { relativeDate } from './SheetLibrary.jsx';

const noop = () => {};
const api = { fetchPrintSheets: async () => [] };

describe('SheetLibrary renders', () => {
  it('while the list is still loading', () => {
    expect(() => renderToStaticMarkup(
      <SheetLibrary apiClient={api} onOpen={noop} onNew={noop} onClose={noop} />,
    )).not.toThrow();
  });

  // Effects do not run under renderToStaticMarkup, so this is the loading state — which is exactly
  // the one worth pinning: it must not claim the baker has no sheets before it knows.
  it('does not claim an empty library before the list has arrived', () => {
    const html = renderToStaticMarkup(
      <SheetLibrary apiClient={api} onOpen={noop} onNew={noop} onClose={noop} />,
    );
    expect(html).toContain('Loading your sheets…');
    expect(html).not.toContain('No saved sheets yet');
  });

  it('offers a new sheet from the header, whatever the list is doing', () => {
    const html = renderToStaticMarkup(
      <SheetLibrary apiClient={api} onOpen={noop} onNew={noop} onClose={noop} />,
    );
    expect(html).toContain('New sheet');
  });

  it('survives a host that has not wired the endpoints', () => {
    expect(() => renderToStaticMarkup(
      <SheetLibrary apiClient={{}} onOpen={noop} onNew={noop} onClose={noop} />,
    )).not.toThrow();
  });
});

// "Which one was I working on" is the question a baker is answering while scanning the library, and
// recency answers it faster than a calendar date does.
describe('relativeDate', () => {
  const NOW = Date.parse('2026-08-05T12:00:00Z');
  const ago = (ms) => relativeDate(new Date(NOW - ms).toISOString(), NOW);
  const DAY = 86400000;

  it('says today for something edited hours ago', () => {
    expect(ago(3 * 3600000)).toBe('today');
  });

  it('says yesterday, not "1 days ago"', () => {
    expect(ago(DAY)).toBe('yesterday');
  });

  it('counts days up to a month', () => {
    expect(ago(3 * DAY)).toBe('3 days ago');
    expect(ago(29 * DAY)).toBe('29 days ago');
  });

  it('switches to months, singular where it should be', () => {
    expect(ago(30 * DAY)).toBe('a month ago');
    expect(ago(90 * DAY)).toBe('3 months ago');
  });

  it('switches to years', () => {
    expect(ago(365 * DAY)).toBe('a year ago');
  });

  // A clock skewed a few seconds forward would otherwise produce "-1 days ago" or "in the future",
  // which reads as a bug in the exact place a baker is deciding which sheet is the current one.
  it('does not go negative when the timestamp is slightly ahead of the clock', () => {
    expect(relativeDate(new Date(NOW + 5000).toISOString(), NOW)).toBe('today');
  });

  // Never render "Invalid Date" at a baker.
  it('degrades to a vague word rather than NaN', () => {
    expect(relativeDate(undefined, NOW)).toBe('recently');
    expect(relativeDate('not a date', NOW)).toBe('recently');
    expect(relativeDate(null, NOW)).toBe('recently');
  });
});
