/* ── Rendering a help article's own words ────────────────────────────────────────────────────────
 *
 * The help assistant answers with the text of an article, and those articles are markdown. There is
 * no markdown dependency in this project and this is not the place to add one: a renderer for
 * arbitrary markdown has to care about nesting, reference links, html passthrough and sanitising,
 * and none of that is in the corpus.
 *
 * ⚠️ SO THE SUBSET IS MEASURED, NOT GUESSED. Counted across the 58 baker articles, 2026-10-27:
 *
 *   1572 paragraphs · 1143 **bold** · 435 numbered steps · 386 headings · 329 TABLE ROWS
 *    104 bullets · 62 links · 57 *italics* · 17 blockquotes · 3 `code`
 *
 * The tables are the reason this file exists rather than a regex for bold. 329 rows is a third as
 * much content as the paragraphs, and a table rendered as raw pipes does not read as a table that
 * needs work — it reads as the app being broken.
 *
 * ⚠️ ANYTHING NOT IN THAT LIST RENDERS AS PLAIN TEXT, DELIBERATELY. Unsupported markup appearing
 * verbatim is a visible, reportable fault. Unsupported markup silently dropped is a missing step in
 * an instruction, which is the one failure this whole feature is built to avoid.
 */
import { Fragment } from 'react';
import { PANEL } from './Panel.jsx';

/* Inline: bold, italic, code, link. Ordered so `**` is consumed before `*`.
 *
 * ⚠️ A LINK RENDERS AS ITS LABEL, NOT AS A LINK. All 62 links in the corpus point at a sibling
 * article (`placing-a-decoration.md`), and nothing in the app can open one yet — there is no help
 * reader and no route that serves an article by slug. An <a> to a path that 404s is worse than the
 * words alone, so the label stays and the href is dropped until that route exists.
 */
const INLINE = /(\*\*[^*]+\*\*|(?<!\*)\*[^*\n]+\*(?!\*)|`[^`\n]+`|\[[^\]]+\]\([^)]*\))/g;

export function inlineNodes(text, keyBase = 'i') {
  const out = [];
  String(text ?? '').split(INLINE).forEach((part, i) => {
    if (!part) return;
    const key = `${keyBase}${i}`;
    /* ⚠️ THE MARK RECURSES INTO ITS OWN CONTENTS. The corpus has `**[Gold leaf](gold-leaf.md)**`
       — a link inside bold — and taking the inner text verbatim printed the link markup on screen.
       Found by running this over the real articles, not by writing a case for it. */
    if (part.startsWith('**') && part.endsWith('**')) {
      out.push(<strong key={key} style={{ fontWeight: 700 }}>{inlineNodes(part.slice(2, -2), `${key}b`)}</strong>);
    } else if (part.startsWith('`') && part.endsWith('`')) {
      out.push(<code key={key} style={S.code}>{part.slice(1, -1)}</code>);
    } else if (part.startsWith('[')) {
      out.push(<em key={key} style={{ fontStyle: 'normal', fontWeight: 600 }}>{part.slice(1, part.indexOf(']'))}</em>);
    } else if (part.startsWith('*') && part.endsWith('*')) {
      out.push(<em key={key}>{inlineNodes(part.slice(1, -1), `${key}i`)}</em>);
    } else {
      out.push(<Fragment key={key}>{part}</Fragment>);
    }
  });
  return out;
}

/* Block level. A hand-rolled line walker rather than a grammar, because the corpus has no nesting:
   measured, every list item and every table row starts at column zero. */
function blocksOf(md) {
  const lines = String(md ?? '').split('\n');
  const blocks = [];
  let i = 0;
  const isTable = (l) => l.trim().startsWith('|');
  /* ⚠️ A SEPARATOR MUST CONTAIN A DASH. Without that, `| | |` — the articles' EMPTY header row —
     reads as a separator too, gets dropped, and the first row of real content is promoted into a
     heading. Measured: it happens on every term/explanation table in the corpus. */
  const isRule  = (l) => /^\|[\s|:-]*-[\s|:-]*\|?$/.test(l.trim());

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (!t) { i++; continue; }

    if (isTable(line)) {
      const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      const rows = [];
      let ruleAfterFirst = false;
      while (i < lines.length && isTable(lines[i])) {
        if (isRule(lines[i])) { if (rows.length === 1) ruleAfterFirst = true; }
        else rows.push(cells(lines[i]));
        i++;
      }
      /* ⚠️ MARKDOWN'S OWN RULE: the first row is a header only when a separator follows it. The
         heuristic that replaced it — "a first row with content is a header" — was wrong on every
         term/explanation table here, because the articles write those with an EMPTY header row
         (`| | |`) and so the first row of real content would be promoted into a heading.
         An empty header is then dropped rather than rendered as two blank cells. */
      const head = ruleAfterFirst && rows.length ? rows[0] : null;
      const header = head && head.some(c => c !== '') ? head : null;
      const body = ruleAfterFirst ? rows.slice(1) : rows;
      if (body.length || header) blocks.push({ kind: 'table', header, rows: body });
      continue;
    }

    if (/^\d+[.)]\s/.test(t) || /^[-*]\s/.test(t)) {
      const ordered = /^\d+[.)]\s/.test(t);
      const items = [];
      while (i < lines.length) {
        const s = lines[i].trim();
        const starts = ordered ? /^\d+[.)]\s/.test(s) : /^[-*]\s/.test(s);
        if (starts) { items.push(s.replace(/^(\d+[.)]|[-*])\s+/, '')); i++; continue; }
        /* A wrapped continuation line belongs to the item above it — dropping it loses half a
           step. A blank line, or anything that starts a different block, ends the list. */
        if (s && !isTable(lines[i]) && !s.startsWith('#') && !s.startsWith('>') && items.length
            && !(ordered ? /^[-*]\s/.test(s) : /^\d+[.)]\s/.test(s))) {
          items[items.length - 1] += ` ${s}`; i++; continue;
        }
        break;
      }
      blocks.push({ kind: ordered ? 'ol' : 'ul', items });
      continue;
    }

    if (t.startsWith('>')) {
      const quote = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quote.push(lines[i].trim().replace(/^>\s?/, '')); i++;
      }
      blocks.push({ kind: 'quote', text: quote.join(' ') });
      continue;
    }

    if (t.startsWith('#')) { blocks.push({ kind: 'h', text: t.replace(/^#+\s*/, '') }); i++; continue; }

    /* ⚠️ 58 OF THESE IN THE CORPUS, ONE PER ARTICLE. Left unhandled they printed `---` on screen
       as literal text — found in the rendered panel, not in the files. */
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { blocks.push({ kind: 'hr' }); i++; continue; }

    const para = [];
    while (i < lines.length) {
      const s = lines[i].trim();
      if (!s || isTable(lines[i]) || s.startsWith('#') || s.startsWith('>')
          || /^(-{3,}|\*{3,}|_{3,})$/.test(s)
          || /^\d+[.)]\s/.test(s) || /^[-*]\s/.test(s)) break;
      para.push(s); i++;
    }
    blocks.push({ kind: 'p', text: para.join(' ') });
  }
  return blocks;
}

/** The article's text, laid out. `md` is one help section's body. */
export default function HelpMarkdown({ md, style }) {
  const blocks = blocksOf(md);
  return (
    <div style={{ ...S.root, ...style }}>
      {blocks.map((b, n) => {
        if (b.kind === 'h') return <div key={n} style={S.h}>{inlineNodes(b.text, `h${n}`)}</div>;
        if (b.kind === 'hr') return <hr key={n} style={S.hr} />;
        if (b.kind === 'p') return <p key={n} style={S.p}>{inlineNodes(b.text, `p${n}`)}</p>;
        if (b.kind === 'quote') return <div key={n} style={S.quote}>{inlineNodes(b.text, `q${n}`)}</div>;
        if (b.kind === 'ol' || b.kind === 'ul') {
          const Tag = b.kind === 'ol' ? 'ol' : 'ul';
          return (
            <Tag key={n} style={S.list}>
              {b.items.map((it, m) => <li key={m} style={S.li}>{inlineNodes(it, `l${n}_${m}`)}</li>)}
            </Tag>
          );
        }
        /* ⚠️ THE TABLE SCROLLS SIDEWAYS INSTEAD OF SQUEEZING. A baker's screen is 375px and a
           three-column table of sentences cannot fit; wrapping every cell to four lines each makes
           it unreadable in a different way. */
        return (
          <div key={n} style={S.tableWrap}>
            <table style={S.table}>
              {b.header && (
                <thead><tr>{b.header.map((c, m) => <th key={m} style={S.th}>{inlineNodes(c, `th${n}_${m}`)}</th>)}</tr></thead>
              )}
              <tbody>
                {b.rows.map((r, m) => (
                  <tr key={m}>{r.map((c, k) => <td key={k} style={S.td}>{inlineNodes(c, `td${n}_${m}_${k}`)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

export { blocksOf };

const S = {
  root: { fontSize: 13.5, lineHeight: 1.55, color: PANEL.body },
  p: { margin: '0 0 9px' },
  hr: { border: 0, borderTop: `1px solid ${PANEL.line}`, margin: '11px 0' },
  h: { fontSize: 13, fontWeight: 700, color: PANEL.ink, margin: '12px 0 6px' },
  list: { margin: '0 0 9px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 5 },
  li: { margin: 0 },
  quote: {
    margin: '0 0 9px', padding: '7px 11px', borderLeft: `3px solid ${PANEL.line}`,
    background: PANEL.tint, borderRadius: '0 7px 7px 0', color: PANEL.body,
  },
  code: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, background: PANEL.tint, padding: '1px 4px', borderRadius: 4 },
  tableWrap: { overflowX: 'auto', margin: '0 0 10px', WebkitOverflowScrolling: 'touch' },
  table: { borderCollapse: 'collapse', fontSize: 13, minWidth: '100%' },
  th: { textAlign: 'left', fontWeight: 700, color: PANEL.ink, padding: '5px 10px 5px 0', borderBottom: `1px solid ${PANEL.line}`, verticalAlign: 'top' },
  td: { padding: '6px 10px 6px 0', borderBottom: `1px solid ${PANEL.hair}`, verticalAlign: 'top' },
};
