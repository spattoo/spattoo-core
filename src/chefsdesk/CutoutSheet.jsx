import { useEffect, useMemo, useState } from 'react';
import A4Sheet from './a4/A4Sheet.jsx';
import { elementSources } from './a4/cutoutSource.js';

// ── Printing a cake's decorations ────────────────────────────────────────────────────────────────
//
// Every decoration on the design, offered two ways: the artwork itself for edible paper, and its
// outline as a template to cut fondant around. The baker drags what they want onto a to-scale A4,
// sizes it, and prints.
//
// ── Why they size it, and we do not ─────────────────────────────────────────────────────────────
// The obvious thing is to print each shape at the size it appears on the 3D cake. Nothing in a
// saved design records a real-world size — cake_shapes has no inch column, tier geometry is world
// units with no stated scale — so any number we produced would be a guess wearing a decimal point.
// Asking the baker for the tier size instead just moves the guess to them.
//
// A to-scale A4 asks a question they can answer by eye, and it is the same question the Edible
// Print Studio already asks, so the screen needs no learning.
//
// ── No Save ─────────────────────────────────────────────────────────────────────────────────────
// The Edible Print Studio saves layouts because a sheet there is a document a baker returns to.
// This is not: it is a way of printing THIS cake's shapes, once. A Save here would have to answer
// "save to where?", which is the same reason the order photo sheet does not offer one either.

const s = {
  wrap:  { padding: 16 },
  head:  { fontSize: 18, fontWeight: 800, color: '#2C4433', margin: '0 0 2px' },
  sub:   { fontSize: 12.5, color: '#6B8C74', margin: '0 0 14px', lineHeight: 1.5 },
  state: { padding: 32, textAlign: 'center', fontSize: 13, color: '#6B8C74', fontWeight: 600 },
};

/**
 * @param {object[]} elements   the design's decorations — anything with an image. A GLB-only topper
 *                              is skipped by elementSources, which returns nothing for it.
 * @param {string}   [title]    used for the file name, so a downloaded PDF says which cake it is.
 */
export default function CutoutSheet({ elements = [], title = 'cake' }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');

  // Identity by id, so a parent re-render with an equal-but-new array does not re-trace every
  // decoration — tracing reads the pixels of each image and is much too expensive to repeat casually.
  const key = useMemo(() => elements.map(e => e.id).join(','), [elements]);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr('');

    Promise.all(elements.map(el =>
      // One decoration that will not load must not empty the sheet. It is dropped, and the count in
      // the subtitle is what tells the baker something is missing — silently showing five cards for
      // six decorations would be worse than saying so.
      elementSources(el).catch(() => [])
    ))
      .then(lists => {
        if (!alive) return;
        const flat = lists.flat();
        setSources(flat);
        const missing = elements.length - lists.filter(l => l.length).length;
        if (missing > 0) setErr(`${missing} decoration${missing === 1 ? '' : 's'} could not be prepared — a 3D model or an image that failed to load.`);
      })
      .catch(e => { if (alive) setErr(e?.message || 'Could not prepare these decorations.'); })
      .finally(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div style={s.state}>Tracing the decorations…</div>;

  if (!sources.length) {
    return (
      <div style={s.state}>
        Nothing on this cake can be printed.<br />
        Flat decorations give you a sticker and a cut-out template; 3D models do not.
      </div>
    );
  }

  const cutouts = sources.filter(x => x.kind === 'cutout').length;

  return (
    <div style={s.wrap}>
      <h2 style={s.head}>Print &amp; cut-outs</h2>
      <p style={s.sub}>
        Drag what you need onto the sheet and size it there — the page is to scale, so what you see is
        what prints. Each decoration is offered twice: the <strong>print</strong> for edible paper, and
        the <strong>cut-out</strong> outline as a template for fondant.
        {cutouts > 0 && <> A dashed line inside a shape is a marking, not a cut.</>}
      </p>

      <A4Sheet
        sources={sources}
        // The baker chooses what goes on. Auto-placing the first decoration would be undoing their
        // first act, which is the same reason the Edible Print Studio does not either.
        autoPlaceFirst={false}
        paletteTitle="This cake's decorations"
        emptyHint="Drag a decoration onto the sheet to start."
        error={err}
        // Measured square in the corner. This sheet's whole purpose is a real SIZE, so a printer
        // quietly applying "Fit to page" would ruin it with nothing on screen to say so.
        calibration
        fileName={`${String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cake'}-cutouts.pdf`}
      />
    </div>
  );
}
