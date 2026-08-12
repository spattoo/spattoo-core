import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { useCakeDesign } from '../src/designer/hooks/useCakeDesign.js';
import { GLAZE_DEFAULTS } from '../src/designer/shared/glaze/glazeMaterial.js';
import { CakePreview } from '../src/designer/canvas/CakeCanvas.jsx';

/* ── PROTOTYPE: the cake builds itself as you scroll ─────────────────────────────────────────────
 *
 * Every other bakery storefront opens with a PHOTO of a finished cake. Only we own the pipeline
 * that made it, so only we can open with the cake being MADE — "you design, we bake it" performed
 * rather than claimed. Each beat is a real call into the designer's own state, so a baker's actual
 * colours and actual name assemble, and no two storefronts open the same way.
 *
 * ── WHY THE SECOND PASS ─────────────────────────────────────────────────────────────────────────
 * The idea worked and the page looked like a test harness: a small cake floating on flat white, one
 * column of text jammed against the left edge, a hairline nobody would notice. Premium is not a
 * palette, it is composition — a stage the object sits IN, a grid the type obeys, and one thing
 * moving at a time. Hence:
 *
 *   · a warm paper ground with light pooling in the centre, and a horizon the cake stands ON. An
 *     object with no ground reads as a cut-out, which is most of why a 3D render looks like clip-art
 *   · a three-column grid — step copy left, cake centre and large, recipe index right
 *   · an index that doubles as the progress meter: a scroll-driven page with no sense of length
 *     feels endless, and a scrollbar is not part of the composition
 *   · one motion per beat, cross-faded. Everything moving at once is a screensaver
 *
 * Built only from primitives the designer owns outright — tiers, colour, frosting, glaze, writing.
 * No catalogue: a hero cannot wait on rows being fetched before it draws its first frame.
 *
 * Prototype: standalone dev page. Not a hero renderer, not registered, no template uses it.
 */

const BEATS = [
  { at: 0.00, n: 'Tier',    title: 'A bare tier',     note: 'Sponge, levelled and crumb-coated. Everything starts here.' },
  { at: 0.20, n: 'Stack',   title: 'Stacked',         note: 'As many tiers as the day asks for.' },
  { at: 0.38, n: 'Colour',  title: 'Their colour',    note: 'The bakery’s own palette — not a template’s.' },
  { at: 0.56, n: 'Ganache', title: 'Ganache, poured', note: 'Warmed, then left to find its own edge.' },
  { at: 0.72, n: 'Name',    title: 'And a name',      note: 'Piped by hand, last of all.' },
];

function Assembling({ primary, accent, name }) {
  const { design, addTier, setTierColor, setTierGlaze, setTierFrostingType, setWriting, resetDesign } = useCakeDesign();
  const trackRef = useRef(null);
  const [p, setP] = useState(0);
  const built = useRef(-1);

  // rAF-throttled. A scroll handler doing layout work on every event is exactly how a "premium" hero
  // becomes a stuttering one, and 60fps is the whole discipline here.
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

  useEffect(() => { resetDesign(); setTierColor(0, '#F1EAE0'); /* eslint-disable-line */ }, []);

  // Forward only, once each. Scrolling back up leaves the cake built: someone re-reading the
  // headline has not changed their mind about wanting a cake, and dismantling it would feel like
  // the page undoing their progress.
  useEffect(() => {
    const beat = BEATS.reduce((acc, b, i) => (p >= b.at ? i : acc), 0);
    if (beat <= built.current) return;
    for (let i = built.current + 1; i <= beat; i++) {
      if (i === 1) addTier();
      if (i === 2) { setTierColor(0, primary); setTierColor(1, accent); }
      if (i === 3) {
        // Glaze is a frosting TYPE, not a flag. The first pass patched `{ on, coverage }` onto
        // tier.glaze — fields that do not exist (the real ones are colors/flow/warp/contrast/streak/
        // drip) and which CakeTier reads only when the frosting's `render` is 'glaze'. The beat
        // fired, the state changed, the cake looked identical: the worst kind of bug, because
        // nothing errored.
        setTierFrostingType(1, 'glaze');
        setTierGlaze(1, { ...GLAZE_DEFAULTS, colors: ['#4A2E1C'], drip: 0.46, flow: 3.2 });
      }
      if (i === 4) {
        // WRITING, not a text element. CakeThumbnailScene — the scene CakePreview mounts — reads
        // only { tiers, stickers, writing, piping }: it has no code path for `texts` at all, so the
        // earlier beat added something the preview could never draw. The preview scene is a SUBSET
        // of the editor's, and that is invisible from either call site. Writing is also the right
        // answer semantically: it IS the piped message.
        setWriting({ text: name, surface: 'side', color: '#FFFFFF', fit: 0.7, thickness: 0.035, softness: 0.75 });
      }
    }
    built.current = beat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);

  const beat = BEATS.reduce((acc, b, i) => (p >= b.at ? i : acc), 0);
  const done = p > 0.80;

  return (
    <div ref={trackRef} style={s.track}>
      <div style={s.sticky}>
        <div style={s.stage}>
          <div style={s.vignette} aria-hidden="true" />
          <div style={s.horizon} aria-hidden="true" />

          <div style={s.grid}>
            {/* LEFT — the step being performed. */}
            <div style={s.copy}>
              <div style={s.step}>Step {String(beat + 1).padStart(2, '0')} / {String(BEATS.length).padStart(2, '0')}</div>
              <h2 key={`t${beat}`} style={s.title}>{BEATS[beat].title}</h2>
              <p key={`n${beat}`} style={s.note}>{BEATS[beat].note}</p>
              <div style={{ ...s.ctaWrap, opacity: done ? 1 : 0, transform: done ? 'none' : 'translateY(8px)' }}>
                <button style={s.cta}>Design yours<span style={s.arrow}>→</span></button>
              </div>
            </div>

            {/* CENTRE — the only thing on screen that moves. */}
            <div style={s.cakeWrap}>
              <div style={s.cake}><CakePreview design={design} autoRotate={false} /></div>
            </div>

            {/* RIGHT — the recipe, doubling as the progress meter. */}
            <ol style={s.index}>
              {BEATS.map((b, i) => (
                <li key={b.n} style={{ ...s.indexItem, ...(i === beat ? s.indexOn : i < beat ? s.indexDone : {}) }}>
                  <span style={s.indexNum}>{String(i + 1).padStart(2, '0')}</span>
                  <span>{b.n}</span>
                  <span style={{ ...s.indexRule, ...(i <= beat ? s.indexRuleOn : {}) }} />
                </li>
              ))}
            </ol>
          </div>

          <div style={s.bar}><div style={{ ...s.barFill, transform: `scaleX(${p})` }} /></div>
        </div>
      </div>
    </div>
  );
}

// ── Start at the top, always ────────────────────────────────────────────────────────────────────
// Browsers restore scroll position on reload, which for an ordinary page is a courtesy and for a
// scroll-told one is fatal: come back at 70% depth and every beat has already fired, so the page
// opens on a FINISHED cake and the whole premise — watching it be made — is silently gone. It looks
// exactly like the assembly is broken, and nothing in the console says otherwise.
//
// Anchored at module scope so it applies before React mounts and the first progress read happens.
if (typeof history !== 'undefined' && 'scrollRestoration' in history) history.scrollRestoration = 'manual';
if (typeof window !== 'undefined') window.scrollTo(0, 0);

function Page() {
  const q = new URLSearchParams(location.search);
  const name = q.get('name') || 'ARIA';
  return (
    <>
      {/* Full screen, and the content pushed to its EDGES. The first pass centred everything in a
          78vh block, which left a band of dead space above and below and made the name look timid in
          the middle of it. Space at the margins reads as composure; space around a centred cluster
          reads as a page that has not loaded yet. */}
      <header style={s.intro}>
        <div style={s.kicker}>Custom cakes · made to order</div>
        <div style={s.introMid}>
          <h1 style={s.mast}>{name}</h1>
          <div style={s.introRule} />
        </div>
        <p style={s.scrollHint}>Scroll to watch one being made</p>
      </header>
      <Assembling primary={q.get('primary') || '#E7B4C0'} accent={q.get('accent') || '#EBD9C4'} name={name} />
      <section style={s.after}><p style={s.afterNote}>…and the storefront continues from here.</p></section>
    </>
  );
}

const INK = '#16150F', PAPER = '#F6F3EE', MUTED = '#8C877C';
const SANS = "'Montserrat', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";

const s = {
  intro: { minHeight: '100svh', display: 'flex', flexDirection: 'column', alignItems: 'center',
           justifyContent: 'space-between', padding: 'clamp(28px, 6vh, 64px) clamp(18px, 5vw, 56px)',
           background: PAPER, boxSizing: 'border-box' },
  introMid: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'clamp(14px, 2.5vh, 26px)', width: '100%' },
  kicker: { fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: 2.6, textTransform: 'uppercase', color: MUTED },
  // Fills the measure rather than sitting politely inside it — 8vw left a short name adrift in the
  // middle of an empty screen. Tracking TIGHTENS as the size grows (0.06em at 34px would be a gap at
  // 190px), and it wraps rather than overflowing, because a bakery called "The Little Cake Company
  // of Hyderabad" is not a special case, it is Tuesday.
  mast:  { fontFamily: SANS, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.01em',
           fontSize: 'clamp(44px, 15vw, 190px)', color: INK, margin: 0, lineHeight: 0.88,
           textAlign: 'center', width: '100%', overflowWrap: 'break-word' },
  introRule: { width: '100%', maxWidth: 1200, height: 1, background: INK, opacity: 0.4 },
  scrollHint: { fontFamily: SERIF, fontSize: 'clamp(15px, 1.5vw, 19px)', fontStyle: 'italic', color: MUTED, margin: 0 },

  // 360vh, last beat at 0.72: the finished cake then HOLDS for the final quarter instead of sliding
  // out of the sticky frame the moment it is done. The payoff needs longer on screen than any of the
  // steps that built it.
  track:  { height: '360vh', position: 'relative', background: PAPER },
  sticky: { position: 'sticky', top: 0, height: '100vh' },
  stage:  { position: 'relative', height: '100%', overflow: 'hidden' },
  // Light pooling in the centre. A flat ground makes any 3D object look pasted on.
  vignette: { position: 'absolute', inset: 0,
              background: `radial-gradient(118% 76% at 50% 42%, #FFFFFF 0%, ${PAPER} 46%, #EBE5DB 100%)` },
  // The surface the cake stands on. Without it the cake floats — the single biggest reason a render
  // reads as a sticker rather than a photograph.
  horizon: { position: 'absolute', left: 0, right: 0, top: '73%', height: 1, background: INK, opacity: 0.10 },

  grid:   { position: 'relative', height: '100%', maxWidth: 1440, margin: '0 auto',
            padding: '0 clamp(20px, 4vw, 64px)', display: 'grid',
            gridTemplateColumns: 'minmax(210px, 1fr) minmax(0, 1.6fr) auto',
            alignItems: 'center', gap: 'clamp(14px, 3vw, 56px)' },

  copy:   { maxWidth: 330 },
  step:   { fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: 2.4, textTransform: 'uppercase',
            color: MUTED, marginBottom: 14, fontVariantNumeric: 'tabular-nums' },
  title:  { fontFamily: SERIF, fontSize: 'clamp(30px, 3.4vw, 54px)', fontWeight: 500, color: INK,
            margin: '0 0 14px', lineHeight: 1.04, animation: 'beatIn 460ms cubic-bezier(.2,.7,.2,1)' },
  note:   { fontFamily: SANS, fontSize: 14, lineHeight: 1.8, color: '#5D584F', margin: 0, maxWidth: 300,
            animation: 'beatIn 460ms 60ms backwards cubic-bezier(.2,.7,.2,1)' },
  ctaWrap:{ marginTop: 30, transition: 'opacity 420ms ease, transform 420ms cubic-bezier(.2,.7,.2,1)' },
  cta:    { display: 'inline-flex', alignItems: 'center', gap: 12, background: INK, color: PAPER, border: 'none',
            padding: '15px 26px', fontFamily: SANS, fontSize: 12.5, fontWeight: 700, letterSpacing: 1.6,
            textTransform: 'uppercase', cursor: 'pointer' },
  arrow:  { fontSize: 15, lineHeight: 1 },

  cakeWrap: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' },
  cake:   { width: '100%', maxWidth: 720, height: 'min(78vh, 740px)' },

  index:  { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 15, minWidth: 128 },
  indexItem: { display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'center', columnGap: 10,
               fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
               color: '#C6C0B5', transition: 'color 360ms ease' },
  indexOn:   { color: INK },
  indexDone: { color: MUTED },
  indexNum:  { fontVariantNumeric: 'tabular-nums', opacity: 0.55 },
  indexRule: { gridColumn: '1 / -1', height: 1, background: INK, opacity: 0.12, transformOrigin: 'left',
               transform: 'scaleX(0.32)', transition: 'transform 460ms cubic-bezier(.2,.7,.2,1), opacity 360ms ease' },
  indexRuleOn: { transform: 'scaleX(1)', opacity: 0.38 },

  bar:     { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: 'rgba(22,21,15,0.08)' },
  barFill: { height: '100%', background: INK, transformOrigin: 'left', transform: 'scaleX(0)', willChange: 'transform' },

  after:   { minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: PAPER },
  afterNote: { fontFamily: SANS, fontSize: 13, color: MUTED },
};

const css = document.createElement('style');
css.textContent = `
  body { margin: 0; background: ${PAPER}; }
  @keyframes beatIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { *, *::before { animation: none !important; transition: none !important; } }
`;
document.head.appendChild(css);

ReactDOM.createRoot(document.getElementById('root')).render(<Page />);
