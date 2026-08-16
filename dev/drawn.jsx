import React from 'react';
import ReactDOM from 'react-dom/client';
import CakeLine from './CakeLine.jsx';

const SANS  = "'Montserrat', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";

/* Prototype page for the drawn hero. Four palettes at once, because the drawing has to survive
 * being handed a baker's colours rather than only looking good in the one pair it was drawn in. */

// Ink on paper leads: it is the palette this theme will DEFAULT to. The others stay on the page as
// the proof that the drawing survives a baker's own colours rather than only working in the one
// pair it was drawn in.
const SETS = [
  { name: 'AARAVI',    ink: '#2E3A46', ground: '#EFE7DA' },   // ← the default
  { name: 'FEELINGS',  ink: '#A9803C', ground: '#A7D7D3' },
  { name: 'SUGARHOUSE',ink: '#8C3B4A', ground: '#F6E7E4' },
  { name: 'MITHAI CO', ink: '#5B4A2F', ground: '#E8DCC3' },
];

// The storefront's own default (CustomerStorefront's `designLabel`), not a new string invented for
// a hero. It is a prop there, so a baker who has renamed their button keeps that name here too —
// which is exactly why the hero must not hard-code a different one.
const CTA = 'Let\u2019s make your cake';

// ── THE WORDMARK ────────────────────────────────────────────────────────────────────────────────
// Cormorant Garamond 600, widely tracked. Chosen over two alternatives that were on the page for
// comparison: the same face at 700 set tight and large (more presence, less air), and Montserrat
// dropped to 400 and tracked very wide (keeps the geometric sans, but a compromise rather than a
// match). A high-contrast serif wins because its hairlines are close to the DRAWING'S own line —
// the mark and the illustration read as one hand.
//
// What it replaced was Montserrat 800: a stroke roughly ten times the weight of the art beside it,
// so the two read as unrelated objects sharing a page.
//
// ⚠️ 600 is not a taste decision, it is the lightest weight the HOST loads (spattoo-web
// layout.tsx: Cormorant Garamond 600/700). Asking for 300 here does not produce a light serif — it
// produces a faux-light or a snap to 600 — and on a machine with the font installed locally that
// difference is invisible, which is how that bug reaches production. Anything lighter means adding
// the weight in the host first.
const MAST = { fontFamily: SERIF, fontWeight: 600, letterSpacing: '0.16em',
               fontSize: 'clamp(34px, 5vw, 74px)' };

function Hero({ name, ink, ground }) {
  return (
    <section style={{ ...s.hero, background: ground }}>
      <div style={s.copy}>
        <div style={{ ...s.kicker, color: ink }}>Custom cakes · made to order</div>
        <h1 style={{ ...s.mast, ...MAST, color: ink }}>{name}</h1>
        <p style={{ ...s.promise, color: ink }}>You design it. {name} bakes it.</p>
        <button style={{ ...s.cta, background: ink, color: ground }}>{CTA} <span aria-hidden="true">→</span></button>
      </div>
      <CakeLine ink={ink} ground={ground} style={s.art} />
    </section>
  );
}

const s = {
  hero: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'clamp(16px,4vw,64px)',
          padding: 'clamp(28px,5vw,72px)', minHeight: '78vh', flexWrap: 'wrap' },
  copy: { flex: '1 1 320px', minWidth: 0 },
  kicker: { fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: 2.6, textTransform: 'uppercase', opacity: 0.7 },
  mast: { textTransform: 'uppercase', lineHeight: 1.0, margin: '10px 0 0', overflowWrap: 'break-word' },
  promise: { fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(17px,1.7vw,24px)', margin: '12px 0 26px', opacity: 0.9 },
  cta: { border: 'none', padding: '15px 26px', fontFamily: SANS, fontSize: 12.5, fontWeight: 700,
         letterSpacing: 1.6, textTransform: 'uppercase', cursor: 'pointer' },
  art: { flex: '0 1 460px', width: 'min(100%, 460px)', height: 'auto', alignSelf: 'center' },
};

const css = document.createElement('style');
css.textContent = `body { margin: 0; } * { box-sizing: border-box; }`;
document.head.appendChild(css);

ReactDOM.createRoot(document.getElementById('root'))
  .render(<>{SETS.map(p => <Hero key={p.name} {...p} />)}</>);
