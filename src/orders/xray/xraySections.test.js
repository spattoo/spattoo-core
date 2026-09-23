import { describe, it, expect } from 'vitest';
import { sectionNumbers } from './XraySection.jsx';

/* The bug these pin: the sheet read "Checklist 1" then "Decorations 4". Sections are not all in one
   component — decorations and edible prints hold their own state — so each re-render claimed a
   fresh number from a shared counter. A number derived from data cannot drift. */

describe('sectionNumbers', () => {
  it('numbers what is present, with no gaps', () => {
    const n = sectionNumbers(['checklist', 'decorations', 'prints']);
    expect([n('checklist'), n('decorations'), n('prints')]).toEqual([1, 2, 3]);
  });

  it('drops absent sections rather than leaving a hole', () => {
    // No garnishes, no tins, no colours, no piping — the photo order that was reported.
    const n = sectionNumbers([
      true && 'checklist',
      false && 'garnishes',
      true && 'decorations',
      true && 'prints',
      false && 'tins',
    ]);
    expect(n('checklist')).toBe(1);
    expect(n('decorations')).toBe(2);
    expect(n('prints')).toBe(3);
  });

  it('gives the SAME number however many times it is asked — the whole point', () => {
    const n = sectionNumbers(['checklist', 'decorations']);
    const asked = Array.from({ length: 5 }, () => n('decorations'));
    expect(asked).toEqual([2, 2, 2, 2, 2]);
  });

  it('answers null for a section that is not on the page', () => {
    expect(sectionNumbers(['checklist'])('piping')).toBe(null);
  });

  it('survives being handed nothing', () => {
    expect(sectionNumbers()('checklist')).toBe(null);
    expect(sectionNumbers([])('checklist')).toBe(null);
  });
});
