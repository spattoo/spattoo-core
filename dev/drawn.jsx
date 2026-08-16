import React from 'react';
import ReactDOM from 'react-dom/client';
import CakeLine from './CakeLine.jsx';

/* Prototype page for the drawn hero. Four palettes at once, because the drawing has to survive
 * being handed a baker's colours rather than only looking good in the one pair it was drawn in. */

const SETS = [
  { name: 'FEELINGS',  ink: '#A9803C', ground: '#A7D7D3' },   // the reference's own feel
  { name: 'AARAVI',    ink: '#2E3A46', ground: '#EFE7DA' },   // ink on paper
  { name: 'SUGARHOUSE',ink: '#8C3B4A', ground: '#F6E7E4' },   // berry on blush
  { name: 'MITHAI CO', ink: '#5B4A2F', ground: '#E8DCC3' },   // bronze on wheat
];

function Hero({ name, ink, ground }) {
  return (
    <section style={{ ...s.hero, background: ground }}>
      <div style={s.copy}>
        <div style={{ ...s.kicker, color: ink }}>Custom cakes · made to order</div>
        <h1 style={{ ...s.mast, color: ink }}>{name}</h1>
        <p style={{ ...s.promise, color: ink }}>You design it. {name} bakes it.</p>
        <button style={{ ...s.cta, background: ink, color: ground }}>Design yours →</button>
      </div>
      <CakeLine ink={ink} ground={ground} style={s.art} />
    </section>
  );
}

const SANS  = "'Montserrat', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";
const s = {
  hero: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'clamp(16px,4vw,64px)',
          padding: 'clamp(28px,5vw,72px)', minHeight: '78vh', flexWrap: 'wrap' },
  copy: { flex: '1 1 320px', minWidth: 0 },
  kicker: { fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: 2.6, textTransform: 'uppercase', opacity: 0.7 },
  mast: { fontFamily: SANS, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.01em',
          fontSize: 'clamp(38px, 6vw, 86px)', lineHeight: 0.92, margin: '10px 0 0', overflowWrap: 'break-word' },
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
