import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { useCakeDesign } from '../src/designer/hooks/useCakeDesign.js';
import { GLAZE_DEFAULTS } from '../src/designer/shared/glaze/glazeMaterial.js';
import { CakePreview } from '../src/designer/canvas/CakeCanvas.jsx';
import { useNarrow } from '../src/shared/useNarrow.js';
import Appu from './Appu.jsx';

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

// ── WHAT THE STEPS SAY ──────────────────────────────────────────────────────────────────────────
// These were the KITCHEN'S process — "sponge, levelled and crumb-coated", "warmed, then left to
// find its own edge". Lovely writing about work the visitor will never do, narrated at someone who
// has just landed on a stranger's page and does not yet know what they are looking at.
//
// They are the visitor's CHOICES now, in second person, in the order the designer asks for them.
// The baker's name goes INTO the colour step: "every shade FEELINGS bakes in" says the palette
// belongs to this shop and not to a template, which is the one claim this hero can make that a
// stock photo cannot.
//
// GANACHE IS GONE. A poured chocolate glaze is a gorgeous piece of rendering and it did not belong
// to this theme — glossy and photographic next to a hand-drawn narrator, and it read as a lid
// rather than a drip. It was also quietly destroying the step before it: the glaze covered the tier
// that had just been given the baker's accent colour, so "pick your colours" showed one of the two
// colours it had just promised. Cutting it fixes the beat and the palette in one go.
const beatsFor = name => [
  { n: 'Start',  title: 'Start with a cake',  note: 'Round, heart or square, from six inches up. Your call.' },
  { n: 'Tiers',  title: 'Add your tiers',     note: 'One, two, three — as many as the day asks for.' },
  { n: 'Colour', title: 'Pick your colours',  note: `Every shade ${name} bakes in, on any part of the cake.` },
  { n: 'Name',   title: 'Add their name',     note: 'Piped by hand, exactly as you type it.' },
];

// Appu introduces himself before he introduces anything else. A stranger's storefront that opens
// with a character who is not named is a mascot; one who says who he is, is a host.
const greetingFor = name => ({
  title: 'Hi — I\'m Appu',
  note: `You can design your own cake here. Every part of it. ${name} bakes it.`,
});

const PAYOFF = { title: 'Now make yours', note: 'The same four steps, in your hands. About two minutes.' };

// ── SAY, THEN DO ────────────────────────────────────────────────────────────────────────────────
// The first cut fired the line and the mutation on the same frame, so the visitor had to read a
// sentence and watch a cake change at once and did neither. Every beat is two moments now: Appu
// SAYS what is about to happen, and only then does the cake do it. The pause between them is not
// dead time, it is the whole reason the demo is comprehensible.
const GREET_MS = 3000;   // he arrives on an EMPTY stage and introduces himself; nothing is built yet
const SAY_MS   = 1900;   // the line is up and the cake has not moved
const DO_MS    = 1400;   // the change has landed and is allowed to be looked at
const REBUILD  = 220;    // replay speed when someone jumps back and the cake rebuilds
const PAYOFF_IN = 1500;
const pad = i => String(i).padStart(2, '0');

function Assembling({ primary, accent, name }) {
  const api = useCakeDesign();
  const apiRef = useRef(api);
  apiRef.current = api;                     // the setters are read at fire time, never closed over

  const BEATS = useMemo(() => beatsFor(name), [name]);
  const GREETING = useMemo(() => greetingFor(name), [name]);
  const [beat, setBeat] = useState(0);
  const [auto, setAuto] = useState(true);
  const [stage, setStage] = useState('greet');   // 'greet' → an empty stage and an introduction
  const [acted, setActed] = useState(false);     // has THIS beat's change landed yet
  const [hasCake, setHasCake] = useState(false);
  const [payoff, setPayoff] = useState(false);
  const applied = useRef(-1);                    // the last beat whose mutation has run; -1 is an empty stage
  const narrow = useNarrow(860);

  // One beat's worth of mutation, and nothing else. -1 is the empty stage: the demo now opens with
  // no cake at all, so that "start with a cake" has something to actually DO.
  function apply(i) {
    const a = apiRef.current;
    if (i === -1) { a.resetDesign(); a.setTierColor(0, '#F1EAE0'); setHasCake(false); return; }
    if (i === 0) { a.resetDesign(); a.setTierColor(0, '#F1EAE0'); setHasCake(true); return; }
    if (i === 1) a.addTier();
    if (i === 2) { a.setTierColor(0, primary); a.setTierColor(1, accent); }
    if (i === 3) {
      // WRITING, not a text element. CakeThumbnailScene — the scene CakePreview mounts — reads only
      // { tiers, stickers, writing, piping }: it has no code path for `texts` at all, so an earlier
      // pass added something the preview could never draw. The preview scene is a SUBSET of the
      // editor's, and that is invisible from either call site. Writing is also right semantically:
      // it IS the piped message.
      a.setWriting({ text: name, surface: 'side', color: '#FFFFFF', fit: 0.7, thickness: 0.035, softness: 0.75 });
    }
  }

  // He arrives, introduces himself, and only then does anything get built.
  useEffect(() => {
    if (stage !== 'greet') return;
    const t = setTimeout(() => setStage('run'), GREET_MS);
    return () => clearTimeout(t);
  }, [stage]);

  // The beat's two moments. Catch the cake up to the state BEFORE this beat (instantly, silently,
  // if someone has jumped), hold there while the line is read, then perform the change.
  useEffect(() => {
    if (stage !== 'run') return;
    let dead = false; const timers = [];
    setActed(false);
    if (applied.current >= beat) { apply(-1); applied.current = -1; }   // jumped back: start over
    const chain = () => {
      if (dead) return;
      if (applied.current < beat - 1) {          // silent catch-up, no narration for skipped steps
        applied.current += 1; apply(applied.current);
        timers.push(setTimeout(chain, REBUILD));
        return;
      }
      timers.push(setTimeout(() => {             // ← the pause. He has spoken; now it happens.
        if (dead) return;
        applied.current = beat; apply(beat); setActed(true);
      }, SAY_MS));
    };
    chain();
    return () => { dead = true; timers.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, beat]);

  // Autoplay advances only once the change has LANDED and been held. Driving off a fixed clock
  // would let the next line arrive while the last one was still happening, which is the bug this
  // whole rewrite exists to fix.
  useEffect(() => {
    if (!auto || !acted || beat >= BEATS.length - 1) return;
    const t = setTimeout(() => setBeat(b => b + 1), DO_MS);
    return () => clearTimeout(t);
  }, [auto, acted, beat, BEATS.length]);

  useEffect(() => {
    setPayoff(false);
    if (!acted || beat !== BEATS.length - 1) return;
    const t = setTimeout(() => setPayoff(true), PAYOFF_IN);
    return () => clearTimeout(t);
  }, [acted, beat, BEATS.length]);

  // Taking the wheel stops the autopilot. A page that keeps advancing after you have chosen a step
  // is arguing with you.
  const pick = i => { setAuto(false); setStage('run'); setBeat(i); };

  // One line, one pose. Everything the character says and does is derived here rather than being
  // threaded through the markup, so "what is he doing on the colour step" has exactly one answer.
  const greeting = stage === 'greet';
  const line = greeting ? GREETING : payoff ? PAYOFF : BEATS[beat];
  const pose = greeting || payoff ? 'wave' : beat === BEATS.length - 1 ? 'pipe' : 'point';

  

  return (
    <div style={s.stage}>
      <div style={s.vignette} aria-hidden="true" />

      <div style={s.frame}>
        {/* HEADER — identity, then the five steps. The rail is the recipe, the progress meter and
            the navigation all at once; three jobs, one row, no extra furniture. */}
        <header style={s.head}>
          {/* The promise that used to sit here in small italics is gone: correct, unmissable in a
              code review, and invisible on a page where a 3D cake is turning six inches away. The
              character says it out loud instead. */}
          <div style={s.brand}><div style={s.wordmark}>{name}</div></div>
          <div style={s.railWrap}>
            {/* Five numbers with no heading are a puzzle. Two words turn them into a table of
                contents for something the visitor is about to be asked to do. */}
            <div style={s.railLabel}>How it works</div>
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
          </div>
        </header>

        {/* The only thing on screen that moves. */}
        <div style={s.cakeWrap}>
          {/* The surface the cake stands on. Without it the cake floats — the single biggest reason
              a render reads as a sticker rather than a photograph. */}
          <div style={s.horizon} aria-hidden="true" />
          {/* Pulled IN. The default camera is framed for a thumbnail in a grid, where a margin of
              air around the cake is what keeps a wall of them legible. Alone on a hero it just reads
              as a small cake on a large page, and the whole point of this section is the object. */}
          <div style={{ ...s.cake, opacity: hasCake ? 1 : 0 }}>
            {/* eslint-disable-next-line */}
            <CakePreview design={api.design} autoRotate={false}
                         cameraPosition={[0, 4.2, 5.9]} target={[0, 1.9, 0]} />
          </div>

          {/* Appu stands ON the horizon, not under the stage in a caption bar. Same ground line as
              the cake, same scene — a narrator parked below the frame is commentary; one standing
              next to the thing he is describing is in the story. His bubble sits ABOVE him, in the
              upper-left air the cake never uses. */}
          {/* Desktop: bubble stacked directly over his head, tail pointing down at him.
              Phone: there is no lane wide enough for both, and narrowing the canvas CROPS the cake
              rather than moving it (the render is fit to height). So the bubble goes to the dead air
              at the top of the stage and Appu keeps the floor — no tail, because he is the only
              character on the page and nothing else could be speaking. */}
          <div style={narrow ? s.narratorNarrow : s.narrator}>
            <div key={line.title} style={narrow ? { ...s.bubble, ...s.bubbleNarrow } : s.bubble}>
              <h2 style={s.title}>{line.title}</h2>
              <p style={s.note}>{line.note}</p>
              {!narrow && <><span style={s.tailInk} aria-hidden="true" /><span style={s.tailFill} aria-hidden="true" /></>}
            </div>
            <Appu pose={pose} apron={primary}
                  style={narrow ? { ...s.doodle, ...s.doodleNarrow } : s.doodle} />
          </div>
        </div>

        <footer style={s.foot}>
          {/* Live from the first frame. The scroll version earned the CTA at the end, which is
              defensible in a story and indefensible on a storefront: someone who already knows what
              they want should never have to wait out a demo to find the button. */}
          <button style={{ ...s.cta, ...(payoff ? s.ctaDone : {}) }}>Design yours<span style={s.arrow}>→</span></button>
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

  head:   { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between',
            gap: 'clamp(10px, 2vw, 28px)', flex: '0 0 auto' },
  brand:  { minWidth: 0 },

  railWrap: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 9, flex: '1 1 260px' },
  railLabel: { fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: 2.2, textTransform: 'uppercase',
               color: MUTED },
  wordmark: { fontFamily: SANS, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em',
              fontSize: 'clamp(24px, 4.4vw, 52px)', color: INK, lineHeight: 1, overflowWrap: 'break-word' },

  // Buttons, not labels — the rail IS the navigation. Sized to the touch target, not to the type:
  // 11px text with 4px of padding is a control only a mouse can hit.
  rail:   { display: 'flex', alignItems: 'flex-end', gap: 'clamp(8px, 1.6vw, 22px)', width: '100%',
            justifyContent: 'flex-end' },
  // On a phone the rail wraps to its own line, where right-aligning it under a left-aligned
  // wordmark leaves a hole in the middle. Spread it edge to edge instead.
  railNarrow: { justifyContent: 'space-between' },
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
  // Fades in on the first beat rather than being there from the start — "start with a cake" has to
  // have something to do, and a cake already present makes the opening line a lie.
  cake:   { width: '100%', height: '100%', maxWidth: 760, transition: 'opacity 700ms ease' },
  // 99%, not 95%: the preview scene RE-FRAMES as the cake grows, so the base sits lower with two
  // tiers than with one and a single line cannot meet both. Aligned to the two-tier state, which is
  // what is on screen for most of the demo.
  horizon: { position: 'absolute', left: '-50vw', right: '-50vw', top: '99%', height: 1, background: INK, opacity: 0.10 },

  foot:   { display: 'flex', justifyContent: 'flex-end', flex: '0 0 auto' },
  // He walks on from the left; the bubble opens once he has arrived. Both are one-shot — nothing
  // loops, because a mascot bobbing beside a rotating cake is a screensaver.
  narrator: { position: 'absolute', left: 0, bottom: '1%', display: 'flex', flexDirection: 'column',
              alignItems: 'flex-start', gap: 10, maxWidth: 'min(52%, 470px)', pointerEvents: 'none',
              animation: 'walkOn 760ms cubic-bezier(.2,.8,.3,1) both' },
  narratorNarrow: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    justifyContent: 'space-between', alignItems: 'flex-start', pointerEvents: 'none',
                    animation: 'walkOn 760ms cubic-bezier(.2,.8,.3,1) both' },
  bubbleNarrow: { marginLeft: 0, width: '100%', boxSizing: 'border-box' },
  doodle:  { height: 'clamp(122px, 22vh, 212px)', width: 'auto', flex: '0 0 auto', overflow: 'visible' },
  doodleNarrow: { height: 'clamp(96px, 16vh, 132px)' },
  bubble:  { position: 'relative', background: '#fff', border: `2.4px solid ${INK}`, borderRadius: 20,
             padding: 'clamp(12px, 1.5vw, 19px) clamp(14px, 1.9vw, 23px)', marginLeft: 'clamp(6px, 1vw, 18px)',
             animation: 'popOn 380ms cubic-bezier(.34,1.5,.5,1) both' },
  // Two triangles, ink then fill, the fill inset by the border width — a single triangle would have
  // no outline, and a bordered pseudo-element cannot make a diagonal.
  tailInk:  { position: 'absolute', left: 30, bottom: -16, width: 0, height: 0,
              borderLeft: '10px solid transparent', borderRight: '13px solid transparent',
              borderTop: `16px solid ${INK}` },
  tailFill: { position: 'absolute', left: 33, bottom: -11, width: 0, height: 0,
              borderLeft: '7px solid transparent', borderRight: '9px solid transparent',
              borderTop: '12px solid #fff' },
  title:  { fontFamily: SERIF, fontSize: 'clamp(22px, 2.4vw, 36px)', fontWeight: 500, color: INK,
            margin: '0 0 5px', lineHeight: 1.08, animation: 'beatIn 460ms cubic-bezier(.2,.7,.2,1)' },
  note:   { fontFamily: SANS, fontSize: 13, lineHeight: 1.65, color: '#5D584F', margin: 0,
            animation: 'beatIn 460ms 60ms backwards cubic-bezier(.2,.7,.2,1)' },
  cta:    { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 12, pointerEvents: 'auto', background: INK,
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
  @keyframes walkOn { from { opacity: 0; transform: translateX(-34px); } to { opacity: 1; transform: none; } }
  @keyframes popOn  { from { opacity: 0; transform: scale(.86) translateY(6px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { *, *::before { animation: none !important; transition: none !important; } }
`;
document.head.appendChild(css);

ReactDOM.createRoot(document.getElementById('root')).render(<Page />);
