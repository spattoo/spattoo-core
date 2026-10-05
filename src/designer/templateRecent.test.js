import { describe, it, expect } from 'vitest';
import { splitRecent, RECENT_DAYS } from './templateFilter.js';

/* ── "show the last 7 days" ──────────────────────────────────────────────────────────────────────
 *
 * Sandeep: *"in the templates library. we should always show recent 5 templates on the top under
 * the section recent. or i think the best way is show the last 7 days."*
 *
 * A window rather than a count, and these pin the consequences of that choice — the ones a later
 * "make it always show five" would quietly undo.
 */

// A fixed instant. A test that builds fixtures off the real clock passes at 23:59 and fails at 00:01.
const NOW = Date.parse('2026-10-05T12:00:00.000Z');
const ago = (days) => new Date(NOW - days * 86400000).toISOString();
const t = (id, days) => ({ id, created_at: days == null ? undefined : ago(days) });

describe('what counts as recent', () => {
  it('keeps the last seven days and leaves the rest alone', () => {
    const { recent, rest } = splitRecent(
      [t('old', 30), t('yesterday', 1), t('ancient', 8), t('today', 0.1)], { now: NOW });
    expect(recent.map(r => r.id)).toEqual(['today', 'yesterday']);
    expect(rest.map(r => r.id)).toEqual(['old', 'ancient']);
  });

  it('is seven days, not six or eight', () => {
    expect(RECENT_DAYS).toBe(7);
    expect(splitRecent([t('just-in', 6.99)], { now: NOW }).recent).toHaveLength(1);
    expect(splitRecent([t('just-out', 7.01)], { now: NOW }).recent).toHaveLength(0);
  });

  /* ⚠️ NEWEST FIRST INSIDE THE SECTION ONLY. `rest` keeps the server's `sort_order, name` browsing
     order — re-sorting it by date would replace the shelf's organisation with a changelog, which is
     not what was asked for and is much harder to notice than a wrong heading. */
  it('orders the section newest first and does not reorder the shelf', () => {
    const { recent, rest } = splitRecent(
      [t('a', 5), t('b', 1), t('c', 3), t('x', 40), t('y', 20)], { now: NOW });
    expect(recent.map(r => r.id)).toEqual(['b', 'c', 'a']);
    expect(rest.map(r => r.id)).toEqual(['x', 'y']);      // input order, untouched
  });

  /* ⚠️ THE EMPTY WEEK IS THE POINT OF A WINDOW. "The most recent 5" always fills, which sounds
     safer and is worse: on a shelf nobody has added to since August it puts five August cakes under
     a heading that says Recent, and a heading that lies on a quiet week teaches a baker to ignore
     it on the week it is true. The caller draws no section when this is empty. */
  it('comes back empty on a quiet week rather than reaching further back', () => {
    const { recent, rest } = splitRecent([t('a', 20), t('b', 44), t('c', 300)], { now: NOW });
    expect(recent).toEqual([]);
    expect(rest).toHaveLength(3);
  });

  /* ⚠️ NOT CAPPED. If fifteen landed this week then fifteen are what is new; trimming to five would
     hide ten behind a heading that just told the baker where new things go. */
  it('does not trim a busy week to five', () => {
    const many = Array.from({ length: 15 }, (_, i) => t(`n${i}`, i * 0.4));
    expect(splitRecent(many, { now: NOW }).recent).toHaveLength(15);
  });

  /* ⚠️ NO DATE → NOT RECENT, never the other way round. An older API does not send `created_at`
     (it was added for this), and a shelf where everything is new is a shelf with no Recent section
     — which is what a host that cannot answer the question should show. */
  it('treats a missing or unparseable date as not recent', () => {
    for (const bad of [undefined, null, '', 'yesterday', {}]) {
      const { recent, rest } = splitRecent([{ id: 'x', created_at: bad }], { now: NOW });
      expect(recent).toEqual([]);
      expect(rest).toHaveLength(1);
    }
  });

  it('survives nothing at all', () => {
    for (const bad of [null, undefined, []]) {
      expect(splitRecent(bad, { now: NOW })).toEqual({ recent: [], rest: [] });
    }
  });
});

describe('the panel only sections when there is something to section', () => {
  const src = () => import('node:fs').then(fs =>
    fs.readFileSync(new URL('../settings/LibraryPanel.jsx', import.meta.url), 'utf8'));

  it('draws no Recent heading on a quiet week, and none while searching', async () => {
    const code = (await src()).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).toMatch(/const sectioned = !searching && recent\.length > 0;/);
    expect(code).toMatch(/templates=\{sectioned \? rest : shown\}/);
  });

  /* ⚠️ ONE overlay for both grids. The Recent section is a second TemplateGrid, and pasting the
     overlay into it is how two buttons that drift get committed (root CLAUDE.md rule 1). */
  it('hands both grids the same overlay', async () => {
    const code = (await src()).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code.match(/overlay=\{tileOverlay\}/g) ?? []).toHaveLength(2);
    expect(code).not.toMatch(/overlay=\{\(t\) =>/);
  });
});
