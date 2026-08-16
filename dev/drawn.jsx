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

// ── WORDMARK CANDIDATES ─────────────────────────────────────────────────────────────────────────
// Montserrat 800 is a stroke roughly TEN TIMES the weight of the drawing's hairline, so the two read
// as unrelated objects that happen to share a page. Matching line weight is what makes a wordmark
// and an illustration look designed together.
//
// ⚠️ Every weight here is one the HOST actually loads (spattoo-web layout.tsx): Cormorant Garamond
// at 600/700, Lora at 400/600, Montserrat variable. Asking for Cormorant 300 would not give a light
// serif — it would give a faux-light or a snap to 600, and the difference is invisible on a machine
// with the font installed locally, which is exactly how this bug ships.
const MASTS = {
  a: { label: 'A · Cormorant 600, wide',  style: { fontFamily: SERIF, fontWeight: 600, letterSpacing: '0.16em',
                                                  fontSize: 'clamp(34px, 5vw, 74px)' } },
  b: { label: 'B · Cormorant 700, tight', style: { fontFamily: SERIF, fontWeight: 700, letterSpacing: '0.01em',
                                                  fontSize: 'clamp(40px, 6.2vw, 92px)' } },
  c: { label: 'C · Montserrat 400, wide', style: { fontFamily: SANS,  fontWeight: 400, letterSpacing: '0.28em',
                                                  fontSize: 'clamp(26px, 3.4vw, 46px)' } },
};

function Hero({ name, ink, ground, mast = 'a', label }) {
  return (
    <section style={{ ...s.hero, background: ground }}>
      <div style={s.copy}>
        {label && <div style={{ ...s.tag, color: ink }}>{label}</div>}
        <div style={{ ...s.kicker, color: ink }}>Custom cakes · made to order</div>
        <h1 style={{ ...s.mast, ...MASTS[mast].style, color: ink }}>{name}</h1>
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
  // Everything except the FACE, WEIGHT, SIZE and TRACKING, which are what the candidates vary.
  mast: { textTransform: 'uppercase', lineHeight: 1.0, margin: '10px 0 0', overflowWrap: 'break-word' },
  tag:  { fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: 1.8, textTransform: 'uppercase',
          opacity: 0.45, marginBottom: 14 },
  promise: { fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(17px,1.7vw,24px)', margin: '12px 0 26px', opacity: 0.9 },
  cta: { border: 'none', padding: '15px 26px', fontFamily: SANS, fontSize: 12.5, fontWeight: 700,
         letterSpacing: 1.6, textTransform: 'uppercase', cursor: 'pointer' },
  art: { flex: '0 1 460px', width: 'min(100%, 460px)', height: 'auto', alignSelf: 'center' },
};

const css = document.createElement('style');
css.textContent = `body { margin: 0; } * { box-sizing: border-box; }`;
document.head.appendChild(css);

// Aaravi three times, one per candidate, then the palette proof below it.
const A = SETS[0];
ReactDOM.createRoot(document.getElementById('root')).render(
  <>
    {Object.keys(MASTS).map(k => <Hero key={k} {...A} mast={k} label={MASTS[k].label} />)}
    {SETS.slice(1).map(p => <Hero key={p.name} {...p} mast="a" />)}
  </>,
);
