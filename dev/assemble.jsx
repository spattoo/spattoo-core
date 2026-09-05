import React, { useEffect, useMemo, useRef, useState } from 'react';
import './scene.js';   // light it the way production does — see the file
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
 * So the whole thing fits one screen and plays ITSELF: the cake assembles on load without anyone
 * touching anything, narrated by Appu. Four dots by the button carry what the step rail used to —
 * how long this is, how far in we are, and a way back into any step. Autoplay stops the moment
 * someone taps, because taking the wheel and having the page keep driving is infuriating.
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
 *   · a progress meter that is four dots and no words — the cake is the only thing worth reading
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
// `pose` is part of the beat, not a lookup somewhere else: the sentence and the gesture are the
// same authoring decision, and a beat that describes the top tier while the hand points at the
// board is worse than no gesture at all.
const beatsFor = name => [
  { n: 'Start',  pose: 'point',    title: 'Start with a cake',  note: 'Round, heart or square, from six inches up. Your call.' },
  { n: 'Tiers',  pose: 'pointUp',  title: 'Add your tiers',     note: 'One, two, three — as many as the day asks for.' },
  { n: 'Colour', pose: 'point',    title: 'Pick your colours',  note: `Every shade ${name} bakes in, on any part of the cake.` },
  { n: 'Name',   pose: 'pipe',     title: 'Add their name',     note: 'Piped by hand, exactly as you type it.' },
];

// Appu introduces himself before he introduces anything else. A stranger's storefront that opens
// with a character who is not named is a mascot; one who says who he is, is a host.
const greetingFor = name => ({
  title: 'Hi — I\'m Appu',
  // Kept to two lines on a phone. A third line grows the bubble downward onto the cake, and the
  // bubble is anchored to his head so it cannot simply move — the copy has to do the fitting.
  note: `Every part of it, your way. ${name} bakes it.`,
});

const PAYOFF = { title: 'Now make yours', note: 'Four steps. About two minutes.' };

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

// ── THE CAMERA IS A CHARACTER TOO ───────────────────────────────────────────────────────────────
// Sixteen seconds from one fixed viewpoint reads as a diagram. It opens wide on an empty stage,
// pushes IN as the cake gains detail — which is exactly when detail is worth seeing — and swings a
// little off-axis at the payoff so the finished cake turns to face the visitor. Nothing dramatic:
// the object still has to be legible, and a hero that swoops is a hero that is showing off.
const CAM = {
  wide:  { pos: [0.0, 4.9, 7.1], look: 2.0 },
  mid:   { pos: [0.0, 4.4, 6.3], look: 1.95 },
  close: { pos: [0.0, 4.0, 5.6], look: 1.9 },
  hero:  { pos: [1.5, 4.1, 5.6], look: 1.9 },
};
const CAM_FOR = ['wide', 'mid', 'close', 'close'];
const CAM_MS = 1100;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ── NO MORE JUMP CUTS ───────────────────────────────────────────────────────────────────────────
// Every change used to be instant: cream, then gold. Absent, then present. In a demo like this the
// TRANSITION is the product — it is the only thing on the page that proves a cake is being made
// rather than swapped. Two of the three beats can be animated honestly, through the real renderer:
//
//   COLOUR — lerp the tier colour frame by frame, so it washes up the buttercream instead of
//            switching. It is the same setTierColor the designer calls; only the timing is ours.
//   NAME   — setWriting with a growing SLICE of the name. The renderer pipes each new letter as it
//            arrives, which is the actual thing the last beat is selling: you type, a cake gets it.
//
// A tier cannot be animated the same way — geometry arrives whole — so it lands with a small settle
// on the container instead, which reads as weight rather than as a cut.
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const mixHex = (a, b, k) => rgb2hex(hex2rgb(a).map((v, i) => v + (hex2rgb(b)[i] - v) * k));

const COLOUR_MS = 850;
const LETTER_MS = 95;

// Which camera this moment wants. Split out so the lerp effect depends on a single stable object
// identity rather than on three pieces of state it would have to re-derive.
function greetingOrPayoffCam(stage, payoff, beat) {
  if (stage === 'greet') return CAM.wide;
  if (payoff) return CAM.hero;
  return CAM[CAM_FOR[Math.min(beat, CAM_FOR.length - 1)]];
}

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

  // A rAF ramp any beat can borrow. Registered in a ref so a jump mid-animation cancels it rather
  // than leaving two ramps fighting over the same tier.
  const ramp = useRef(0);
  const animate = (ms, onFrame, curve = ease) => {
    cancelAnimationFrame(ramp.current);
    let t0 = 0;
    const tick = ts => {
      if (!t0) t0 = ts;
      const k = Math.min(1, (ts - t0) / ms);
      onFrame(curve(k));
      if (k < 1) ramp.current = requestAnimationFrame(tick);
    };
    ramp.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(ramp.current), []);

  // A REAL buttercream wall, not a matte cylinder. FROSTINGS.buttercream carries wave/swirl/rustic
  // styles that are pure shader and geometry — no catalogue row, no fetch, so the hero still draws
  // its first frame without waiting on anything. The old default read as moulded plastic, which is
  // a strange thing to put at the centre of a page selling cake.
  const dress = (a, i) => {
    a.setTierColor(i, '#F1EAE0');
    a.setTierFrostingType(i, 'buttercream');
    a.setTierFrostingStyle(i, 'rustic');
  };

  // One beat's worth of mutation, and nothing else. -1 is the empty stage: the demo now opens with
  // no cake at all, so that "start with a cake" has something to actually DO.
  function apply(i) {
    const a = apiRef.current;
    if (i === -1) { a.resetDesign(); dress(a, 0); setHasCake(false); return; }
    if (i === 0) { a.resetDesign(); dress(a, 0); setHasCake(true); return; }
    if (i === 1) { a.addTier(); dress(a, 1); }
    if (i === 2) {
      // Washed on, not switched. Both tiers travel together from the bare cream they were dressed
      // in, so the whole cake changes as one gesture.
      animate(COLOUR_MS, k => {
        a.setTierColor(0, mixHex('#F1EAE0', primary, k));
        a.setTierColor(1, mixHex('#F1EAE0', accent, k));
      });
    }
    if (i === 3) {
      // WRITING, not a text element. CakeThumbnailScene — the scene CakePreview mounts — reads only
      // { tiers, stickers, writing, piping }: it has no code path for `texts` at all, so an earlier
      // pass added something the preview could never draw. The preview scene is a SUBSET of the
      // editor's, and that is invisible from either call site. Writing is also right semantically:
      // it IS the piped message.
      // Piped, letter by letter, in step with the hand holding the bag. `fit` is held at the FULL
      // name's value so the letters do not resize as more of them arrive — sizing to the slice would
      // make the first letter enormous and shrink it as the word grew.
      const write = t => a.setWriting({ text: t, surface: 'side', color: '#FFFFFF', fit: 0.7, thickness: 0.035, softness: 0.75 });
      // LINEAR, unlike the colour wash: an eased ramp back-loads the letters, so the first half of
      // the word arrives in a rush at the end. Piping happens at a steady hand speed.
      animate(name.length * LETTER_MS, k => write(name.slice(0, Math.max(1, Math.ceil(k * name.length)))), k => k);
    }
  }

  // Lerped in a ref and mirrored into state once per frame: CameraRig reads the position from its
  // props, so the only way to MOVE it is to re-render with new numbers. Cheap here because the scene
  // config is memoised on `design` and does not rebuild.
  const wantCam = greetingOrPayoffCam(stage, payoff, beat);
  const [cam, setCam] = useState(CAM.wide);
  const camFrom = useRef(CAM.wide);
  useEffect(() => {
    const from = camFrom.current, to = wantCam;
    if (from === to) return;
    let raf = 0, t0 = 0;
    const tick = ts => {
      if (!t0) t0 = ts;
      const k = ease(Math.min(1, (ts - t0) / CAM_MS));
      setCam({
        pos: from.pos.map((v, i) => v + (to.pos[i] - v) * k),
        look: from.look + (to.look - from.look) * k,
      });
      if (k < 1) raf = requestAnimationFrame(tick); else camFrom.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [wantCam]);

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
  const pose = greeting || payoff ? 'wave' : BEATS[beat].pose;

  

  return (
    <div style={s.stage}>
      <div style={s.vignette} aria-hidden="true" />

      <div style={s.frame}>
        {/* Just the shop's name. The step rail that lived here — "HOW IT WORKS", then 01 START,
            02 TIERS… — was captioning something Appu now says out loud, and five tracked labels
            above the cake is documentation furniture on a page whose one job is to make a cake look
            worth ordering. What it also did, quietly, was tell the visitor this was a SEQUENCE with
            an end and offer a way back into it; that job survives as the dots by the button. */}
        <header style={s.head}>
          <div style={s.brand}><div style={s.wordmark}>{name}</div></div>
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
            {/* On a phone the camera AIMS LOWER and stands FURTHER BACK: aiming lifts the cake in
                the frame so Appu's bubble stops covering the piped name, and the extra distance
                keeps the whole cake between the rail above and the bubble below. Aiming is the right
                lever — shrinking the canvas width crops the render, and shrinking its height just
                shrinks the cake without moving it. */}
            <CakePreview design={api.design} autoRotate={payoff}
                         cameraPosition={narrow ? [cam.pos[0], cam.pos[1], cam.pos[2] * 1.08] : cam.pos} target={[0, cam.look - (narrow ? 0.95 : 0), 0]} />
          </div>

          {/* Appu stands ON the horizon, not under the stage in a caption bar. Same ground line as
              the cake, same scene — a narrator parked below the frame is commentary; one standing
              next to the thing he is describing is in the story. His bubble sits ABOVE him, in the
              upper-left air the cake never uses. */}
          {/* The bubble is stacked directly over his head at EVERY size. Parking it at the top of a
              phone screen split the character from his own line — two objects with nothing joining
              them, and the tail could not reach. What makes it fit instead is making him TALLER on a
              phone: his head rises, the bubble rides up with it, and it clears the band where the
              name is piped, which is the one thing the last beat exists to show. */}
          {/* Stacked over his head on a desktop, where there is height to spare. BESIDE him on a
              phone, where there is not: bubble-above-character is a block ~280px tall and no amount
              of camera lifting keeps a 780px screen clear of it. Beside him the same block is ~110px
              and the collision stops being possible rather than being managed. The tail turns to
              match — it always points at whoever is talking. */}
          <div style={narrow ? { ...s.narrator, ...s.narratorRow } : s.narrator}>
            <Appu pose={pose} apron={primary}
                  style={narrow ? { ...s.doodle, ...s.doodleNarrow } : s.doodle} />
            <div key={line.title} style={narrow ? { ...s.bubble, ...s.bubbleSide } : s.bubble}>
              <h2 style={s.title}>{line.title}</h2>
              <p style={s.note}>{line.note}</p>
              <span style={narrow ? s.tailInkSide : s.tailInk} aria-hidden="true" />
              <span style={narrow ? s.tailFillSide : s.tailFill} aria-hidden="true" />
            </div>
          </div>
        </div>

        <footer style={s.foot}>
          {/* Four dots: how long this is, how far in we are, and the only way to see it again.
              Filled behind, ringed ahead — no numbers, no labels, nothing to read. */}
          <nav style={s.dots} aria-label="Steps">
            {BEATS.map((b, i) => (
              // The BUTTON is the touch target and the SPAN is the dot. Styling the ring onto the
              // button drew a 30px circle round a 10px mark; the visual has to be its own element.
              <button key={b.n} onClick={() => pick(i)} aria-label={`Step ${pad(i + 1)}: ${b.n}`}
                      aria-current={i === beat} style={s.dotHit}>
                <span style={{ ...s.dot, ...(i === beat ? s.dotOn : i < beat ? s.dotDone : {}) }} />
              </button>
            ))}
          </nav>
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

  head:   { flex: '0 0 auto' },
  brand:  { minWidth: 0 },

  wordmark: { fontFamily: SANS, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em',
              fontSize: 'clamp(24px, 4.4vw, 52px)', color: INK, lineHeight: 1, overflowWrap: 'break-word' },

  // A dot is 10px and says everything the rail said except the words. Sized to the TOUCH target
  // via padding, not to the ink: a 10px control is a control only a mouse can hit.
  dots:   { display: 'flex', alignItems: 'center', gap: 4 },
  dotHit: { width: 30, height: 30, display: 'grid', placeItems: 'center', padding: 0, border: 'none',
            background: 'none', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' },
  dot:    { width: 8, height: 8, borderRadius: '50%', boxShadow: `inset 0 0 0 1.5px ${INK}`,
            opacity: 0.3, transition: 'opacity 300ms ease, background-color 300ms ease' },
  dotDone: { backgroundColor: INK, opacity: 0.35 },
  dotOn:   { backgroundColor: INK, opacity: 1, transform: 'scale(1.25)' },

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

  foot:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flex: '0 0 auto' },
  // He walks on from the left; the bubble opens once he has arrived. Both are one-shot — nothing
  // loops, because a mascot bobbing beside a rotating cake is a screensaver.
  narrator: { position: 'absolute', left: 0, right: 0, bottom: '1%', display: 'flex',
              flexDirection: 'column-reverse', alignItems: 'flex-start', gap: 10,
              maxWidth: 'min(52%, 470px)', pointerEvents: 'none',
              animation: 'walkOn 760ms cubic-bezier(.2,.8,.3,1) both' },
  narratorRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, width: '100%', maxWidth: 'none' },
  bubbleSide: { marginLeft: 0, marginBottom: 'clamp(10px, 2vh, 26px)', flex: '1 1 auto', minWidth: 0 },
  tailInkSide:  { position: 'absolute', left: -16, bottom: 18, width: 0, height: 0,
                  borderTop: '9px solid transparent', borderBottom: '12px solid transparent',
                  borderRight: `16px solid ${INK}` },
  tailFillSide: { position: 'absolute', left: -12, bottom: 20, width: 0, height: 0,
                  borderTop: '7px solid transparent', borderBottom: '9px solid transparent',
                  borderRight: '12px solid #fff' },
  doodle:  { height: 'clamp(122px, 22vh, 212px)', width: 'auto', flex: '0 0 auto', overflow: 'visible' },
  doodleNarrow: { height: 'clamp(104px, 15vh, 140px)' },
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
  @keyframes settle { from { transform: translateY(-14px) scale(.985); } to { transform: none; } }
  @keyframes popOn  { from { opacity: 0; transform: scale(.86) translateY(6px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { *, *::before { animation: none !important; transition: none !important; } }
`;
document.head.appendChild(css);

ReactDOM.createRoot(document.getElementById('root')).render(<Page />);
