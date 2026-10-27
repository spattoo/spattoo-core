import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import HelpMarkdown, { blocksOf } from './helpMarkdown.jsx';

/* ── The help renderer, measured against the REAL articles ───────────────────────────────────────
 *
 * ⚠️ A RENDERER TESTED ONLY ON MARKDOWN THE TEST WROTE ITSELF IS A TEST OF THE TEST. The whole
 * reason this renderer handles a measured subset rather than all of markdown is that the corpus is
 * known, so the corpus is what it is checked against — and the failure that matters is silent: a
 * numbered step swallowed is a missing instruction, and nothing throws.
 */

const HELP_DIR = new URL('../../../spattoo-docs/help/', import.meta.url).pathname;
const corpus = existsSync(HELP_DIR)
  ? readdirSync(HELP_DIR).filter(f => f.endsWith('.md'))
      .map(f => ({ f, text: readFileSync(HELP_DIR + f, 'utf8') }))
      .filter(a => a.text.includes('audience: baker'))
  : [];

describe('the measured subset', () => {
  it('renders bold, italic and code as marks rather than as asterisks', () => {
    const html = renderToStaticMarkup(<HelpMarkdown md="Open **Tiers**, then *drag* the `dial`." />);
    expect(html).toContain('<strong');
    expect(html).toContain('<em');
    expect(html).toContain('<code');
    expect(html).not.toContain('**');
    expect(html).not.toContain('`');
  });

  it('keeps a numbered list numbered, and in order', () => {
    const blocks = blocksOf('1. Open it.\n2. Pick a colour.\n3. Press Save.');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('ol');
    expect(blocks[0].items).toEqual(['Open it.', 'Pick a colour.', 'Press Save.']);
  });

  it('joins a wrapped step to the step above rather than dropping it', () => {
    /* The articles are hard-wrapped at ~100 columns, so most multi-clause steps are two lines.
       Treating the second as a new block loses the half-sentence that says where to press. */
    const blocks = blocksOf('1. Open the tier and choose the cream you want,\n   then press Apply.\n2. Done.');
    expect(blocks[0].items[0]).toBe('Open the tier and choose the cream you want, then press Apply.');
    expect(blocks[0].items).toHaveLength(2);
  });

  it('renders a table as a table, with the separator row gone', () => {
    const html = renderToStaticMarkup(<HelpMarkdown md={'| Field | What it does |\n|---|---|\n| Name | Names it |'} />);
    expect(html).toContain('<table');
    expect(html).toContain('<th');
    expect(html).toContain('Names it');
    expect(html).not.toContain('---');
    expect(html).not.toContain('|');
  });

  it('does not promote an empty header row into a heading', () => {
    /* `| | |` is the term/explanation layout the articles use. Treating row one as a header there
       renders two blank cells above the content and shifts every pair down a row. */
    const blocks = blocksOf('| | |\n|---|---|\n| Tiers | How many layers |\n| Colour | The cream |');
    expect(blocks[0].header).toBeNull();
    expect(blocks[0].rows).toHaveLength(2);
    expect(blocks[0].rows[0]).toEqual(['Tiers', 'How many layers']);
  });

  it('shows a link as its label, and never as a dead href', () => {
    /* All 62 links in the corpus point at a sibling article, and nothing in the app opens one. */
    const html = renderToStaticMarkup(<HelpMarkdown md="See [placing a decoration](placing-a-decoration.md) for more." />);
    expect(html).toContain('placing a decoration');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('.md');
  });

  it('renders a horizontal rule as a rule, not as three dashes', () => {
    /* One per article, 58 in the corpus. They printed as literal text until the rendered panel was
       looked at. */
    const html = renderToStaticMarkup(<HelpMarkdown md={'Before.\n\n---\n\nAfter.'} />);
    expect(html).toContain('<hr');
    expect(html.replace(/<[^>]*>/g, '')).not.toContain('---');
    expect(html).toContain('Before.');
    expect(html).toContain('After.');
  });

  it('does not mistake a rule for a bullet, or swallow the paragraph after it', () => {
    const blocks = blocksOf('A line.\n---\nAnother line.');
    expect(blocks.map(b => b.kind)).toEqual(['p', 'hr', 'p']);
  });

  it('renders nothing for nothing, rather than throwing', () => {
    for (const md of [undefined, null, '', '   \n\n  ']) {
      expect(() => renderToStaticMarkup(<HelpMarkdown md={md} />)).not.toThrow();
    }
  });
});

describe('against every baker article', () => {
  it('finds the corpus', () => {
    /* Skipped rather than failed when spattoo-docs is not checked out beside this repo — but if it
       IS there and reports zero articles, the filter above is broken and every case below would
       pass vacuously. */
    if (!existsSync(HELP_DIR)) return;
    expect(corpus.length).toBeGreaterThan(40);
  });

  it('leaves no markup visible in the output', () => {
    const bad = [];
    for (const { f, text } of corpus) {
      const body = text.replace(/^---[\s\S]*?---\n/, '');
      const html = renderToStaticMarkup(<HelpMarkdown md={body} />);
      /* Entities are how react escapes a real ampersand or quote; the markup characters are not. */
      const plain = html.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, '');
      if (/\*\*/.test(plain)) bad.push(`${f}: ** survived`);
      if (/\|\s*-{3}/.test(plain)) bad.push(`${f}: a table separator survived`);
      if (/(^|\n)\s*-{3,}\s*(\n|$)/.test(plain)) bad.push(`${f}: a horizontal rule survived as text`);
      if (/\]\([^)]*\.md\)/.test(plain)) bad.push(`${f}: a dead link survived`);
    }
    expect(bad).toEqual([]);
  });

  it('loses no numbered step', () => {
    /* ⚠️ THE ONE THAT ACTUALLY MATTERS. The articles are written as numbered steps by house rule;
       a step the renderer silently drops is an instruction a baker never sees. */
    const bad = [];
    for (const { f, text } of corpus) {
      const body = text.replace(/^---[\s\S]*?---\n/, '');
      const written = body.split('\n').filter(l => /^\d+[.)]\s/.test(l.trim())).length;
      const rendered = blocksOf(body).filter(b => b.kind === 'ol').reduce((n, b) => n + b.items.length, 0);
      if (written !== rendered) bad.push(`${f}: ${written} steps written, ${rendered} rendered`);
    }
    expect(bad).toEqual([]);
  });

  it('loses no table row', () => {
    const bad = [];
    for (const { f, text } of corpus) {
      const body = text.replace(/^---[\s\S]*?---\n/, '');
      const written = body.split('\n')
        .filter(l => l.trim().startsWith('|') && !/^\|[\s|:-]+\|?$/.test(l.trim())).length;
      const rendered = blocksOf(body).filter(b => b.kind === 'table')
        .reduce((n, b) => n + b.rows.length + (b.header ? 1 : 0), 0);
      if (written !== rendered) bad.push(`${f}: ${written} rows written, ${rendered} rendered`);
    }
    expect(bad).toEqual([]);
  });
});
