import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { useCakeDesign } from '../src/designer/hooks/useCakeDesign.js';
import { GLAZE_DEFAULTS } from '../src/designer/shared/glaze/glazeMaterial.js';
import { CakePreview } from '../src/designer/canvas/CakeCanvas.jsx';

/* ── PROTOTYPE: the cake builds itself as you scroll ─────────────────────────────────────────────
 *
 * The differentiated hero. Every competitor's storefront opens with a PHOTO of a finished cake;
 * only we own the pipeline that made it, so only we can open with the cake being MADE. It answers
 * "you design, we bake it" by doing it rather than claiming it, in about six seconds of scroll.
 *
 * ── WHY THIS AND NOT A VIDEO ────────────────────────────────────────────────────────────────────
 * A video of the same thing would be heavier, blurrier, and — the point — not the BAKER'S cake. Each
 * beat here is a real call into the designer's own state (addTier, setTierColor, setTierGlaze,
 * addText), so a baker's actual colours and actual name assemble, and every storefront's hero is a
 * different cake without anybody authoring anything.
 *
 * ── NOTHING HERE NEEDS THE CATALOGUE ────────────────────────────────────────────────────────────
 * Deliberately built from primitives the designer owns outright: tiers, tier colour, frosting style,
 * glaze/drip and text. No stickers, no nozzles, no elements — because a storefront hero cannot
 * depend on catalogue rows being fetched before it can draw its first frame.
 *
 * Prototype only: standalone page, not a registered hero, not wired into any template.
 */

// Each beat is one scroll step. `at` is the fraction of the scroll track where it lands.
const BEATS = [
  { at: 0.00, label: 'A bare tier',        note: 'Every cake starts here.' },
  { at: 0.22, label: 'Stack it',           note: 'Tiers, as many as the day needs.' },
  { at: 0.44, label: 'Your colour',        note: 'Their brand, not ours.' },
  { at: 0.64, label: 'Let it drip',        note: 'Ganache, poured.' },
  { at: 0.84, label: 'And their name',     note: 'Piped on, last.' },
];

function Assembling({ primary = '#E9B7C2', accent = '#A9CBD4', name = 'ARIA' }) {
  const { design, addTier, setTierColor, setTierGlaze, setTierFrostingType, addText, updateText, resetDesign } = useCakeDesign();
  const trackRef = useRef(null);
  const [p, setP] = useState(0);          // 0..1 through the scroll track
  const built = useRef(-1);               // highest beat applied, so each fires ONCE
  const textId = useRef(null);

  // Scroll → progress. rAF-throttled: a scroll handler that does layout work on every event is how
  // a "premium" hero becomes a stuttering one, and 60fps is the whole discipline here.
  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      setP(total <= 0 ? 0 : Math.min(1, Math.max(0, -r.top / total)));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => { resetDesign(); setTierColor(0, '#F3EDE6'); /* eslint-disable-line */ }, []);

  // Apply beats FORWARD only, once each. Scrolling back up leaves the cake built rather than
  // dismantling it: a customer who scrolls up to re-read the headline has not changed their mind
  // about wanting a cake, and un-building it would feel like the page undoing their progress.
  useEffect(() => {
    const beat = BEATS.reduce((acc, b, i) => (p >= b.at ? i : acc), 0);
    if (beat <= built.current) return;
    for (let i = built.current + 1; i <= beat; i++) {
      if (i === 1) { addTier(); }
      if (i === 2) { setTierColor(0, primary); setTierColor(1, accent); }
      if (i === 3) {
        // The glaze is a FROSTING TYPE, not a flag. The first attempt patched `{ on, coverage }`
        // onto tier.glaze — fields that do not exist (the real ones are colors/flow/warp/contrast/
        // streak/drip, and CakeTier only reaches for them when the frosting's `render` is 'glaze').
        // So the beat fired, the state changed, and the cake looked identical: the worst kind of
        // bug, because the code all "worked".
        setTierFrostingType(1, 'glaze');
        setTierGlaze(1, { ...GLAZE_DEFAULTS, colors: ['#5a3621'], drip: 0.42, flow: 3.1 });
      }
      if (i === 4) {
        const id = Date.now();
        textId.current = id;
        addText();
      }
    }
    built.current = beat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);

  // The last-added text gets the baker's name (addText mints its own id, so patch the newest).
  useEffect(() => {
    const t = design.texts?.[design.texts.length - 1];
    // theta faces the text AT the camera. The default is 0, which put the baker's name on the far
    // side of the cake — present in the state, invisible on screen, and indistinguishable from "the
    // beat did nothing".
    if (t && t.content === 'Your Text') updateText(t.id, { content: name, color: '#FFFFFF', fontSize: 0.34, theta: Math.PI });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design.texts?.length]);

  const beat = BEATS.reduce((acc, b, i) => (p >= b.at ? i : acc), 0);

  return (
    <div ref={trackRef} style={s.track}>
      <div style={s.sticky}>
        <div style={s.stage}>
          {/* The cake, centred and large. It is the only thing on screen that moves. */}
          <div style={s.cake}><CakePreview design={design} autoRotate={false} /></div>

          <div style={s.copy}>
            <div style={s.counter}>{String(beat + 1).padStart(2, '0')} / {String(BEATS.length).padStart(2, '0')}</div>
            <h2 key={beat} style={s.beatLabel}>{BEATS[beat].label}</h2>
            <p style={s.beatNote}>{BEATS[beat].note}</p>
          </div>

          {/* Progress as a hairline, not a scrollbar — it belongs to the composition. */}
          <div style={s.progress}><div style={{ ...s.progressFill, width: `${p * 100}%` }} /></div>

          {p > 0.92 && (
            <button style={s.cta}>Start yours →</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Harness() {
  const q = new URLSearchParams(location.search);
  return (
    <>
      <div style={s.intro}>
        <div style={s.mast}>{q.get('name') || 'ARIA'}</div>
        <p style={s.introNote}>Scroll ↓</p>
      </div>
      <Assembling primary={q.get('primary') || '#E9B7C2'} accent={q.get('accent') || '#A9CBD4'} name={q.get('name') || 'ARIA'} />
      <div style={s.after}>
        <p style={s.afterNote}>…and the rest of the storefront continues from here.</p>
      </div>
    </>
  );
}

const INK = '#1A1A18';
const s = {
  intro:  { height: '46vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 },
  mast:   { fontFamily: "'Montserrat',sans-serif", fontWeight: 800, textTransform: 'uppercase', letterSpacing: 6, fontSize: 'clamp(32px,7vw,84px)', color: INK },
  introNote: { fontFamily: "'Montserrat',sans-serif", fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: '#9a948c' },
  // 320vh of track = five beats with room to read each one before the next lands.
  track:  { height: '320vh', position: 'relative' },
  sticky: { position: 'sticky', top: 0, height: '100vh' },
  stage:  { position: 'relative', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  cake:   { width: 'min(70vw, 560px)', height: '70vh' },
  copy:   { position: 'absolute', left: '6vw', top: '50%', transform: 'translateY(-50%)', maxWidth: 300 },
  counter:{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: 2, color: '#9a948c', marginBottom: 12 },
  beatLabel: { fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 'clamp(28px,3.4vw,46px)', fontWeight: 500, color: INK, margin: '0 0 10px', lineHeight: 1.05,
               animation: 'beatIn 420ms ease-out' },
  beatNote:  { fontFamily: "'Montserrat',sans-serif", fontSize: 14, lineHeight: 1.7, color: '#6a655e', margin: 0 },
  progress:  { position: 'absolute', left: '6vw', right: '6vw', bottom: 46, height: 1, background: 'rgba(0,0,0,0.12)' },
  progressFill: { height: '100%', background: INK, transition: 'width 80ms linear' },
  cta:    { position: 'absolute', left: '6vw', bottom: 70, background: 'none', border: 'none', borderBottom: `1px solid ${INK}`,
            padding: '0 0 7px', fontFamily: "'Montserrat',sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: 1.6,
            textTransform: 'uppercase', color: INK, cursor: 'pointer', animation: 'beatIn 420ms ease-out' },
  after:  { height: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  afterNote: { fontFamily: "'Montserrat',sans-serif", fontSize: 13, color: '#9a948c' },
};

const css = document.createElement('style');
css.textContent = `
  @keyframes beatIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
`;
document.head.appendChild(css);

ReactDOM.createRoot(document.getElementById('root')).render(<Harness />);
