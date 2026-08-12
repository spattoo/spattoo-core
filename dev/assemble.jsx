import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { useCakeDesign } from '../src/designer/hooks/useCakeDesign.js';
import { GLAZE_DEFAULTS } from '../src/designer/shared/glaze/glazeMaterial.js';
import { CakePreview } from '../src/designer/canvas/CakeCanvas.jsx';
import { useNarrow } from '../src/shared/useNarrow.js';

/* ── PROTOTYPE: the cake builds itself, on one screen ────────────────────────────────────────────
 *
 * Every other bakery storefront opens with a PHOTO of a finished cake. Only we own the pipeline
 * that made it, so only we can open with the cake being MADE — "you design, we bake it" performed
 * rather than claimed. Each beat is a real call into the designer's own state, so a baker's actual
 * colours and actual name assemble, and no two storefronts open the same way.
 *
 * ── WHY THE THIRD PASS: THE SCROLL WENT ─────────────────────────────────────────────────────────
 * The first two passes told this as a 360vh scroll story — five beats, one per screen-height of
 * scrolling. It read well and it charged the visitor four screens of scrolling before they saw a
 * finished cake, on a page whose entire job is to get them into the designer. A hero that demands
 * work before it pays is a hero people leave.
 *
 * So the five beats moved into a rail across the TOP, the whole thing fits one screen, and it plays
 * ITSELF: the cake assembles on load without anyone touching anything. The rail is not decoration —
 * every step is a button, so you can jump to Ganache, go back to Stack, watch it rebuild. Autoplay
 * stops the moment someone taps, because taking the wheel and having the page keep driving is
 * infuriating.
 *
 * Same beats, same real designer calls. What changed is that watching is now free and steering is
 * optional, where before watching cost four flicks of the thumb.
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
 *   · an index that doubles as the progress meter — now the header rail, and now tappable
 *   · one motion per beat, cross-faded. Everything moving at once is a screensaver
 *
 * Built only from primitives the designer owns outright — tiers, colour, frosting, glaze, writing.
 * No catalogue: a hero cannot wait on rows being fetched before it draws its first frame.
 *
 * Prototype: standalone dev page. Not a hero renderer, not registered, no template uses it.
 */

const BEATS = [
  { n: 'Tier',    title: 'A bare tier',     note: 'Sponge, levelled and crumb-coated. Everything starts here.' },
  { n: 'Stack',   title: 'Stacked',         note: 'As many tiers as the day asks for.' },
  { n: 'Colour',  title: 'Their colour',    note: 'The bakery’s own palette — not a template’s.' },
  { n: 'Ganache', title: 'Ganache, poured', note: 'Warmed, then left to find its own edge.' },
  { n: 'Name',    title: 'And a name',      note: 'Piped by hand, last of all.' },
];

const DWELL = 1900;   // how long a finished beat holds before the next one starts
const REBUILD = 260;  // and how fast it replays when someone jumps several steps at once
const pad = i => String(i).padStart(2, '0');

function Assembling({ primary, accent, name }) {
  const api = useCakeDesign();
  const apiRef = useRef(api);
  apiRef.current = api;                     // the setters are read at fire time, never closed over

  const [beat, setBeat] = useState(0);
  const [auto, setAuto] = useState(true);
  const built = useRef(-1);                 // which beat the CAKE is at, which trails `beat` while it catches up
  const narrow = useNarrow(860);

  // One beat's worth of mutation. Nothing here knows about scrolling, autoplay or the rail — it is
  // the recipe, and everything else just decides when to call it.
  function apply(i) {
    const a = apiRef.current;
    if (i === 0) { a.resetDesign(); a.setTierColor(0, '#F1EAE0'); return; }
    if (i === 1) a.addTier();
    if (i === 2) { a.setTierColor(0, primary); a.setTierColor(1, accent); }
    if (i === 3) {
      // Glaze is a frosting TYPE, not a flag. The first pass patched `{ on, coverage }` onto
      // tier.glaze — fields that do not exist (the real ones are colors/flow/warp/contrast/streak/
      // drip) and which CakeTier reads only when the frosting's `render` is 'glaze'. The beat fired,
      // the state changed, the cake looked identical: the worst kind of bug, because nothing errored.
      a.setTierFrostingType(1, 'glaze');
      a.setTierGlaze(1, { ...GLAZE_DEFAULTS, colors: ['#4A2E1C'], drip: 0.46, flow: 3.2 });
    }
    if (i === 4) {
      // WRITING, not a text element. CakeThumbnailScene — the scene CakePreview mounts — reads only
      // { tiers, stickers, writing, piping }: it has no code path for `texts` at all, so the earlier
      // beat added something the preview could never draw. The preview scene is a SUBSET of the
      // editor's, and that is invisible from either call site. Writing is also right semantically:
      // it IS the piped message.
      a.setWriting({ text: name, surface: 'side', color: '#FFFFFF', fit: 0.7, thickness: 0.035, softness: 0.75 });
    }
  }

  // Walk the cake TOWARDS the selected beat, one step per timer, rather than snapping to it. Jumping
  // from Tier to Name still plays all four steps — the assembly is the product demo, so skipping it
  // to arrive at a finished cake would throw away the only thing this hero has that a photo doesn't.
  //
  // Going backwards has to rebuild from nothing: the beats are additive (a tier, a colour, a glaze)
  // and none of them has an inverse. Cheap, because the whole recipe is five calls.
  useEffect(() => {
    let timer = 0, dead = false;
    const step = () => {
      if (dead) return;
      if (built.current > beat) { apply(0); built.current = 0; }
      else if (built.current < beat) { built.current += 1; apply(built.current); }
      else return;
      if (built.current !== beat) timer = setTimeout(step, REBUILD);
    };
    step();
    return () => { dead = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat]);

  // It plays itself. Nobody arrives at a storefront intending to operate it.
  useEffect(() => {
    if (!auto || beat >= BEATS.length - 1) return;
    const t = setTimeout(() => setBeat(b => b + 1), beat === 0 ? 1200 : DWELL);
    return () => clearTimeout(t);
  }, [auto, beat]);

  // Taking the wheel stops the autopilot. A page that keeps advancing after you have chosen a step
  // is arguing with you.
  const pick = i => { setAuto(false); setBeat(i); };

  const done = beat === BEATS.length - 1;

  return (
    <div style={s.stage}>
      <div style={s.vignette} aria-hidden="true" />

      <div style={s.frame}>
        {/* HEADER — identity, then the five steps. The rail is the recipe, the progress meter and
            the navigation all at once; three jobs, one row, no extra furniture. */}
        <header style={s.head}>
          <div style={s.wordmark}>{name}</div>
          <nav style={narrow ? { ...s.rail, ...s.railNarrow } : s.rail} aria-label="Steps">
            {BEATS.map((b, i) => (
              <button key={b.n} onClick={() => pick(i)} aria-current={i === beat}
                      style={{ ...s.railItem, ...(i === beat ? s.railOn : i < beat ? s.railDone : {}) }}>
                <span style={s.railTop}>
                  <span style={s.railNum}>{pad(i + 1)}</span>
                  {/* On a phone five labels do not fit, so only the live one is spelled out. The
                      numbers still carry the sequence, and the title below says which step it is. */}
                  {(!narrow || i === beat) && <span style={s.railName}>{b.n}</span>}
                </span>
                <span style={{ ...s.railRule, ...(i <= beat ? s.railRuleOn : {}) }} />
              </button>
            ))}
          </nav>
        </header>

        {/* The only thing on screen that moves. */}
        <div style={s.cakeWrap}>
          {/* The surface the cake stands on. Without it the cake floats — the single biggest reason
              a render reads as a sticker rather than a photograph. */}
          <div style={s.horizon} aria-hidden="true" />
          {/* Pulled IN. The default camera is framed for a thumbnail in a grid, where a margin of
              air around the cake is what keeps a wall of them legible. Alone on a hero it just reads
              as a small cake on a large page, and the whole point of this section is the object. */}
          <div style={s.cake}>
            <CakePreview design={api.design} autoRotate={false}
                         cameraPosition={[0, 4.2, 5.9]} target={[0, 1.9, 0]} />
          </div>
        </div>

        <footer style={narrow ? { ...s.foot, ...s.footNarrow } : s.foot}>
          <div style={s.copy}>
            <div style={s.step}>Step {pad(beat + 1)} / {pad(BEATS.length)}</div>
            <h2 key={`t${beat}`} style={s.title}>{BEATS[beat].title}</h2>
            <p key={`n${beat}`} style={s.note}>{BEATS[beat].note}</p>
          </div>
          {/* Live from the first frame. The scroll version earned the CTA at the end, which is
              defensible in a story and indefensible on a storefront: someone who already knows what
              they want should never have to wait out a demo to find the button. */}
          <button style={{ ...s.cta, ...(done ? s.ctaDone : {}) }}>Design yours<span style={s.arrow}>→</span></button>
        </footer>
      </div>
    </div>
  );
}

function Page() {
  const q = new URLSearchParams(location.search);
  const name = q.get('name') || 'ARIA';
  return (
    <>
      {/* The full-screen masthead that used to open this page is gone with the scroll it belonged
          to. It was a beautiful screen whose only content was a name, and it stood between the
          visitor and the one thing here worth seeing. The name now heads the hero itself. */}
      <Assembling primary={q.get('primary') || '#E7B4C0'} accent={q.get('accent') || '#EBD9C4'} name={name} />
      <section style={s.after}><p style={s.afterNote}>…and the storefront continues from here.</p></section>
    </>
  );
}

const INK = '#16150F', PAPER = '#F6F3EE', MUTED = '#8C877C';
const SANS = "'Montserrat', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";

const s = {
  // One screen. svh, not vh: on mobile Safari 100vh is the height the viewport reaches once the
  // address bar has scrolled away, which is not the height it opens at — so a 100vh hero puts its
  // own footer under the browser chrome on first paint.
  stage:  { position: 'relative', height: '100svh', overflow: 'hidden', background: PAPER },
  // Light pooling in the centre. A flat ground makes any 3D object look pasted on.
  vignette: { position: 'absolute', inset: 0,
              background: `radial-gradient(118% 76% at 50% 42%, #FFFFFF 0%, ${PAPER} 46%, #EBE5DB 100%)` },
  frame:  { position: 'relative', height: '100%', maxWidth: 1440, margin: '0 auto', boxSizing: 'border-box',
            padding: 'clamp(16px, 3vh, 30px) clamp(20px, 4vw, 64px) clamp(20px, 4vh, 40px)',
            display: 'flex', flexDirection: 'column', gap: 'clamp(10px, 2vh, 22px)' },

  head:   { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between',
            gap: 'clamp(10px, 2vw, 28px)', flex: '0 0 auto' },
  wordmark: { fontFamily: SANS, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em',
              fontSize: 'clamp(24px, 4.4vw, 52px)', color: INK, lineHeight: 1, overflowWrap: 'break-word' },

  // Buttons, not labels — the rail IS the navigation. Sized to the touch target, not to the type:
  // 11px text with 4px of padding is a control only a mouse can hit.
  rail:   { display: 'flex', alignItems: 'flex-end', gap: 'clamp(8px, 1.6vw, 22px)', flex: '1 1 260px',
            justifyContent: 'flex-end' },
  // On a phone the rail wraps to its own line, where right-aligning it under a left-aligned
  // wordmark leaves a hole in the middle. Spread it edge to edge instead.
  railNarrow: { justifyContent: 'space-between', flex: '1 1 100%' },
  railItem: { display: 'flex', flexDirection: 'column', gap: 7, background: 'none', border: 'none',
              padding: '8px 0 0', cursor: 'pointer', color: '#C2BCB0', font: 'inherit',
              transition: 'color 300ms ease', minWidth: 0, WebkitTapHighlightColor: 'transparent' },
  railTop: { display: 'flex', alignItems: 'baseline', gap: 7, whiteSpace: 'nowrap' },
  railNum: { fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: 1.4, opacity: 0.6,
             fontVariantNumeric: 'tabular-nums' },
  railName:{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' },
  railOn:   { color: INK },
  railDone: { color: MUTED },
  railRule: { display: 'block', height: 1, background: INK, opacity: 0.12, transformOrigin: 'left',
              transform: 'scaleX(0.3)', transition: 'transform 460ms cubic-bezier(.2,.7,.2,1), opacity 360ms ease' },
  railRuleOn: { transform: 'scaleX(1)', opacity: 0.38 },

  // flex:1 with minHeight:0 — without the minHeight a flex child refuses to shrink below its content
  // and the cake pushes the footer off the bottom of a short phone.
  cakeWrap: { position: 'relative', flex: '1 1 auto', minHeight: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center' },
  cake:   { width: '100%', height: '100%', maxWidth: 760 },
  horizon: { position: 'absolute', left: '-50vw', right: '-50vw', top: '95%', height: 1, background: INK, opacity: 0.10 },

  foot:   { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
            gap: 'clamp(14px, 3vw, 40px)', flex: '0 0 auto' },
  footNarrow: { flexDirection: 'column', alignItems: 'stretch' },
  copy:   { maxWidth: 420 },
  step:   { fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: 2.4, textTransform: 'uppercase',
            color: MUTED, marginBottom: 10, fontVariantNumeric: 'tabular-nums' },
  title:  { fontFamily: SERIF, fontSize: 'clamp(28px, 3.4vw, 52px)', fontWeight: 500, color: INK,
            margin: '0 0 8px', lineHeight: 1.04, animation: 'beatIn 460ms cubic-bezier(.2,.7,.2,1)' },
  note:   { fontFamily: SANS, fontSize: 13.5, lineHeight: 1.7, color: '#5D584F', margin: 0, maxWidth: 380,
            animation: 'beatIn 460ms 60ms backwards cubic-bezier(.2,.7,.2,1)' },
  cta:    { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 12, background: INK,
            color: PAPER, border: 'none', padding: '15px 26px', fontFamily: SANS, fontSize: 12.5,
            fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase', cursor: 'pointer',
            flex: '0 0 auto', transition: 'transform 420ms cubic-bezier(.2,.7,.2,1)' },
  ctaDone:{ transform: 'scale(1.04)' },
  arrow:  { fontSize: 15, lineHeight: 1 },

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
