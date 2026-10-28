/* ── Appu ────────────────────────────────────────────────────────────────────────────────────────
 *
 * The assistant's face. He peeks over a line in the bottom-right corner, reacts to what the
 * assistant is doing, and says nothing — the words are the panel's job.
 *
 * ── TRACED FROM SANDEEP'S OWN REFERENCE ─────────────────────────────────────────────────────────
 * Six rounds of drawing this from the reference's "vocabulary" were rejected — *"they are not
 * same"*, *"somehow i did not like any of them"*, *"most of them are not showing real emotion"* —
 * before Sandeep said *"ok lets generate ourselves then, we are close. you can trace the sticker if
 * you want."* So the geometry below is traced from the reference he supplied, by MEASUREMENT rather
 * than by eye: see the note above HEAD. Everything here is still our own vector drawing — no image
 * is downloaded, bundled or shipped, and this file is the entire asset.
 *
 * ⚠️ THE HAIR IS THE SIGNATURE AND IT HAS RULES. Three SEPARATE strokes, each starting outside the
 * head on the left and sweeping up across the crown, never touching. The first draft drew them
 * short and overlapping and they merged into one dark lump that read as a cap. The gaps are the
 * whole effect.
 *
 * ⚠️ PROPORTION IS THE STYLE, as the storefront Appu's own file says: *"Cute is not a rendering
 * style, it is a ratio."* The head is most of him. The hands exist to be a SECOND axis — a floating
 * head can only change its face, where hands can scratch, shrug, wave or hold up a palm, and that
 * is what keeps nine states from collapsing into five.
 *
 * ── WHAT ANIMATES, AND WHAT DELIBERATELY DOES NOT ───────────────────────────────────────────────
 * ⚠️ ONLY THE STATES THAT ARE *ONGOING* LOOP. `thinking` and `thinking_long` repeat because work is
 * still happening and the loop is the message. Everything else plays ONCE on arrival and settles.
 * A character looping in the corner of a screen somebody is trying to work on becomes something to
 * resent within a day — the same reason the panel's wait animation only appears past 1200ms.
 *
 * ⚠️ AND IT ALL STOPS FOR `prefers-reduced-motion`. Not softened: stopped. Every pose is drawn to
 * read as a still, so the information survives with no motion at all.
 */
import { useId } from 'react';
import { ASSISTANT } from './assistantState.js';
import { INK } from './tokens.js';

const BLUSH = '#F6C9CE';
const SAGE = '#A8CFC4';
const CORAL = '#E8927C';

/* ── The geometry is MEASURED, not judged by eye ─────────────────────────────────────────────────
 * Every coordinate here comes from the sticker's own pixels, read by flood-filling its connected
 * dark and pink regions: eyes 20x38 at (153,293) and (248,247), mouth 62x70 at (215,336), blush
 * 31x36 at (129,345) and (284,271). Six rounds of drawing by eye got all three wrong in the same
 * direction — the mouth at half its true height, the blush at twice its true flatness — and no
 * amount of looking fixed it. The coordinate space is the sticker's own crop, so these numbers
 * stay checkable against it.
 *
 * ⚠️ THE HEAD IS AN EGG AND THE FACE IS OFF-CENTRE. Narrow at the crown, fat at the jaw, with the
 * right eye sitting higher than the left. That asymmetry is the tilt, baked in rather than applied
 * as a rotation — rotating the group moved the hands with it and tucked them behind the skull.
 *
 * ⚠️ THE HANDS ARE AT THE CHEEKS, elbows splayed down to the table. Not clasped in the middle:
 * chin-on-hands is what the pose actually is.
 */
const HEAD = 'M200 130 C276 138 330 216 330 294 C330 374 274 442 197 442 C121 442 66 374 66 294 C66 216 124 138 200 130 z';

/* ⚠️ THE HAIR IS WHAT MAKES THE SILHOUETTE, AND IT STANDS CLEAR OF THE SKULL. Measured off the
   sticker, its outer sweep passes x=20 at y=394, where the head's own left edge is x=93 — about
   70px of white between them. Three attempts failed on exactly that gap: trimmed to the crown, the
   figure measured 281x348 against the sticker's 415x440, the same face inside a smaller, more
   timid shape; run full-height but tangent to the outline, the strokes fused with it into one
   thick edge; moved on TOP of the head to separate them, they became long hair over the cheek.
   ⚠️ The head's left edge runs (133,150) (88,200) (66,286) (93,380) — a stroke inside that line is
   painted over by the head's white fill and simply disappears, which is why only the innermost
   sweep may cross it, and only above the crown where there is no fill to hide it.
   ⚠️ The gaps ARE the effect — three separate strokes, never touching. */
const HAIR = (
  <>
    <path d="M28 404 C10 254 62 130 196 92" strokeWidth="10" />
    <path d="M62 392 C46 262 96 142 226 110" strokeWidth="9.5" />
    <path d="M98 358 C88 254 132 156 254 134" strokeWidth="9" />
  </>
);

const eye = (x, y, rx, ry) =>
  <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={INK} stroke="none" transform={`rotate(-12 ${x} ${y})`} />;

const EYES = {
  open:   <>{eye(153, 293, 10, 19)}{eye(248, 247, 10, 19)}</>,
  up:     <>{eye(153, 285, 10, 19)}{eye(248, 239, 10, 19)}</>,
  side:   <>{eye(160, 291, 9, 18)}{eye(255, 245, 9, 18)}</>,
  down:   <>{eye(153, 302, 10, 16)}{eye(248, 256, 10, 16)}</>,
  happy:  <><path d="M140 300 C147 286 160 286 167 299" strokeWidth="9" />
            <path d="M235 254 C242 240 255 240 262 253" strokeWidth="9" /></>,
  squint: <><path d="M139 294 C148 284 161 286 168 296" strokeWidth="8" />
            <path d="M234 248 C243 238 256 240 263 250" strokeWidth="8" />
            {eye(153, 282, 7, 9)}{eye(248, 236, 7, 9)}</>,
  wide:   <><circle cx="153" cy="293" r="19" fill="#fff" strokeWidth="7" />
            <circle cx="248" cy="247" r="19" fill="#fff" strokeWidth="7" />
            <circle cx="153" cy="295" r="9" fill={INK} stroke="none" />
            <circle cx="248" cy="249" r="9" fill={INK} stroke="none" /></>,
};

const BROW = {
  none: null,
  raised:  <><path d="M136 258 C146 248 164 250 172 258" strokeWidth="7" />
             <path d="M231 212 C241 202 259 204 267 212" strokeWidth="7" /></>,
  /* ⚠️ BOTH INNER CORNERS UP. One up and one down is the universal drawing of SLY. */
  worried: <><path d="M136 266 C146 254 164 256 172 266" strokeWidth="7" />
             <path d="M231 216 C241 228 259 226 267 216" strokeWidth="7" /></>,
  flat:    <><path d="M137 262 H171" strokeWidth="7" /><path d="M232 216 H266" strokeWidth="7" /></>,
};

/* 62 wide and 70 TALL — an open oval, not a shallow smile. The single biggest correction. */
const MOUTH = {
  smile:     <><path d="M186 312 C190 298 240 296 244 318 C248 348 232 370 214 369 C196 368 183 340 186 312 z" fill={INK} strokeWidth="5" />
               <path d="M199 349 C206 340 226 341 231 350 C224 360 206 359 199 349 z" fill="#fff" stroke="none" /></>,
  openSmile: <><path d="M182 308 C188 292 244 290 248 316 C252 350 234 374 214 373 C194 372 178 340 182 308 z" fill={INK} strokeWidth="5" />
               <path d="M197 351 C205 341 228 342 234 352 C226 364 205 363 197 351 z" fill="#fff" stroke="none" /></>,
  grin:      <><path d="M176 304 C184 286 250 284 254 314 C258 354 236 382 214 380 C192 378 172 340 176 304 z" fill={INK} strokeWidth="5" />
               <path d="M194 355 C204 344 230 345 237 356 C228 370 203 369 194 355 z" fill="#fff" stroke="none" /></>,
  flat:      <path d="M186 332 H244" strokeWidth="8" />,
  wavy:      <path d="M184 330 C196 314 208 346 218 330 C228 314 236 344 246 332" strokeWidth="8" />,
  oh:        <ellipse cx="215" cy="336" rx="22" ry="29" fill={INK} stroke="none" />,
};

/* The left hand rests at the cheek in every pose; only the right one acts. */
const HandBlob = ({ x, y, flip = false }) => (
  <path
    transform={`translate(${x} ${y}) scale(${flip ? -1.3 : 1.3} 1.3)`}
    d="M0 0 C-21 6 -23 36 -5 44 C15 52 29 30 21 12 C17 2 9 -3 0 0 z"
    fill="#fff" strokeWidth="7"
  />
);

const LEFT_HAND = <><HandBlob x={104} y={366} /><path d="M86 432 C70 448 56 462 44 470" strokeWidth="9" /></>;

const HANDS = {
  rest:    <><HandBlob x={281} y={344} flip /><path d="M296 414 C312 432 324 452 334 468" strokeWidth="9" /></>,
  chin:    <g className="appu-act"><HandBlob x={286} y={330} flip /><path d="M300 402 C316 424 328 446 338 466" strokeWidth="9" /></g>,
  scratch: <g className="appu-act"><HandBlob x={300} y={176} flip /><path d="M304 220 C322 290 330 380 336 466" strokeWidth="9" /></g>,
  wave:    <g className="appu-act"><HandBlob x={306} y={196} flip /><path d="M308 240 C324 300 332 384 338 466" strokeWidth="9" /></g>,
  shrug:   <g className="appu-act"><HandBlob x={310} y={318} flip /><path d="M310 378 C322 406 332 438 338 466" strokeWidth="9" /></g>,
  palm:    <g className="appu-act">
             <path d="M292 352 C274 352 268 372 268 392 L268 418 C268 432 282 440 296 440 C312 440 324 430 324 416 L324 384 C324 364 310 352 292 352 z" fill="#fff" strokeWidth="8" />
             <path d="M280 362 V388 M296 356 V388 M312 364 V390" strokeWidth="6" />
             <path d="M300 440 C314 450 326 458 336 466" strokeWidth="9" /></g>,
  point:   <g className="appu-act"><HandBlob x={300} y={300} flip /><path d="M330 300 L372 268" strokeWidth="8" />
             <path d="M300 346 C316 382 328 426 336 466" strokeWidth="9" /></g>,
};

/* Shrug lifts BOTH hands — the one gesture that is symmetrical. A one-armed shrug reads as a wave. */
const SHRUG_LEFT = <g className="appu-act"><HandBlob x={78} y={318} /><path d="M72 378 C60 406 50 438 44 466" strokeWidth="9" /></g>;

const MARKS = {
  [ASSISTANT.THINKING]:      <g className="appu-dots"><circle cx="66" cy="150" r="9" fill={SAGE} /><circle cx="42" cy="118" r="14" fill={SAGE} /></g>,
  [ASSISTANT.THINKING_LONG]: <g className="appu-dots"><circle cx="66" cy="150" r="9" fill={SAGE} /><circle cx="42" cy="118" r="14" fill={SAGE} /></g>,
  [ASSISTANT.ANSWERED]:      <g className="appu-marks"><path d="M344 150 L358 120" stroke={SAGE} strokeWidth="9" /><path d="M372 182 L404 168" stroke={SAGE} strokeWidth="9" /></g>,
  [ASSISTANT.FAILED]:        <g className="appu-marks"><path d="M66 128 L48 104" stroke={CORAL} strokeWidth="9" /><path d="M96 96 L90 66" stroke={CORAL} strokeWidth="9" /></g>,
  [ASSISTANT.ESCALATED]:     <g className="appu-marks"><path d="M352 248 h54 l-27 22 z" fill={SAGE} stroke="none" /></g>,
  [ASSISTANT.DECLINED]:      <g className="appu-marks"><path d="M58 196 C40 186 36 168 40 150" stroke={SAGE} strokeWidth="7" /><path d="M48 240 C28 236 20 218 22 200" stroke={SAGE} strokeWidth="7" /></g>,
};

const POSE = {
  /* ⚠️ IDLE IS CHIN-ON-HANDS, WAITING. Sandeep, of the reference: *"this is the ideal one. waiting
     if someone asks something. hands near chin"*. It is the pose a baker sees most, so it is the
     one that has to be warm rather than merely neutral. */
  [ASSISTANT.IDLE]:          { eyes: 'open',   brow: 'none',    mouth: 'smile',     hands: 'rest' },
  [ASSISTANT.LISTENING]:     { eyes: 'up',     brow: 'raised',  mouth: 'openSmile', hands: 'rest' },
  [ASSISTANT.THINKING]:      { eyes: 'side',   brow: 'raised',  mouth: 'flat',      hands: 'chin' },
  [ASSISTANT.THINKING_LONG]: { eyes: 'squint', brow: 'none',    mouth: 'wavy',      hands: 'scratch' },
  [ASSISTANT.ANSWERED]:      { eyes: 'happy',  brow: 'none',    mouth: 'grin',      hands: 'wave' },
  [ASSISTANT.EMPTY]:         { eyes: 'down',   brow: 'worried', mouth: 'wavy',      hands: 'shrug' },
  [ASSISTANT.DECLINED]:      { eyes: 'open',   brow: 'flat',    mouth: 'flat',      hands: 'palm' },
  [ASSISTANT.FAILED]:        { eyes: 'wide',   brow: 'worried', mouth: 'oh',        hands: 'shrug' },
  [ASSISTANT.ESCALATED]:     { eyes: 'happy',  brow: 'none',    mouth: 'openSmile', hands: 'point' },
};

const CSS = `
/* ⚠️ EVERY ANIMATION IS NAMESPACED. These keyframes live in whatever document the host mounts us
   into, beside a storefront's own CSS and admin's — a name like "bob" would collide eventually. */
@keyframes appuBlink   { 0%,92%,100% { transform: scaleY(1) } 95% { transform: scaleY(0.08) } }
@keyframes appuBreathe { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-5px) } }
@keyframes appuRise    { from { transform: translateY(90px); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes appuScratch { 0%,100% { transform: rotate(0deg) } 50% { transform: rotate(-9deg) } }
@keyframes appuTap     { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-11px) } }
@keyframes appuWave    { 0%,100% { transform: rotate(0deg) } 25% { transform: rotate(-15deg) } 75% { transform: rotate(11deg) } }
@keyframes appuShrug   { 0% { transform: translateY(16px) } 60% { transform: translateY(-5px) } 100% { transform: none } }
@keyframes appuNo      { 0%,100% { transform: rotate(0deg) } 30% { transform: rotate(-11deg) } 70% { transform: rotate(11deg) } }
@keyframes appuShake   { 0%,100% { transform: translateX(0) } 20% { transform: translateX(-11px) } 60% { transform: translateX(11px) } }
@keyframes appuPush    { 0% { transform: none } 50% { transform: translate(22px,-10px) } 100% { transform: none } }
@keyframes appuPop     { from { transform: scale(0.4); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes appuThink   { 0%,100% { opacity: .25; transform: translateY(6px) } 50% { opacity: 1; transform: none } }

.appu-root  { animation: appuRise 420ms cubic-bezier(.34,1.3,.5,1) both; }
.appu-body  { animation: appuBreathe 3.6s ease-in-out infinite; transform-origin: 200px 440px; }
.appu-eyes  { animation: appuBlink 5.2s infinite; transform-origin: 200px 270px; }

/* ⚠️ ONLY THESE TWO LOOP. Work is still happening and the loop is the message; everything else
   plays once and settles, because a character churning in the corner of a screen somebody is
   working on becomes something to resent within a day. */
.appu-thinking .appu-act      { animation: appuTap 1.1s ease-in-out infinite; transform-origin: 300px 420px; }
.appu-thinking_long .appu-act { animation: appuScratch 620ms ease-in-out infinite; transform-origin: 320px 440px; }
.appu-thinking .appu-dots circle,
.appu-thinking_long .appu-dots circle { animation: appuThink 1.4s ease-in-out infinite; }
.appu-thinking .appu-dots circle:last-child,
.appu-thinking_long .appu-dots circle:last-child { animation-delay: .35s; }

.appu-answered  .appu-act { animation: appuWave 760ms ease-in-out 2; transform-origin: 320px 440px; }
.appu-empty     .appu-act { animation: appuShrug 520ms ease-out both; }
.appu-declined  .appu-act { animation: appuNo 620ms ease-in-out 1; transform-origin: 300px 450px; }
/* ⚠️ BOTH ANIMATIONS, COMMA-SEPARATED. A second animation declaration on .appu-body REPLACES the
   breathing, so a shake alone left him frozen the moment it finished — permanently still, in the
   one state where looking inert is worst. */
.appu-failed    .appu-body { animation: appuShake 420ms ease-in-out 2, appuBreathe 3.6s ease-in-out infinite; }
.appu-escalated .appu-act { animation: appuPush 620ms ease-out 1; }
.appu-marks               { animation: appuPop 360ms cubic-bezier(.34,1.5,.5,1) both; }

/* ⚠️ STOPPED, NOT SOFTENED. Every pose is drawn to read as a still. */
@media (prefers-reduced-motion: reduce) {
  .appu-root, .appu-body, .appu-eyes, .appu-act, .appu-marks, .appu-dots circle { animation: none !important; }
}`;

/* ⚠️ A FULL FIGURE NEEDS ~96px. Measured: below that the arms, the line and the hair gaps turn to
   mush and all nine states look alike. The head alone still reads at 26, so a small mount gets the
   head CROP of the same drawing rather than a second, simpler drawing of him — one geometry, two
   framings, so a change to his face cannot reach one size and miss the other. */
const FRAME = {
  full: { box: '0 55 420 445', w: 420, h: 445 },
  head: { box: '48 112 302 346', w: 302, h: 346 },
};

/**
 * @param state  one of ASSISTANT (see assistantState.js)
 * @param size   rendered height in px. Measured: the full figure stops reading below ~96.
 * @param crop   'full' (default) or 'head' — use 'head' under ~96px. See FRAME.
 * @param apron  the collar under his chin. The baker's own primary where a host has one.
 */
export default function Appu({ state = ASSISTANT.IDLE, size = 64, crop = 'full', apron = SAGE }) {
  const pose = POSE[state] ?? POSE[ASSISTANT.IDLE];
  const frame = FRAME[crop] ?? FRAME.full;
  const id = useId();
  return (
    <svg viewBox={frame.box} height={size} width={size * frame.w / frame.h} aria-hidden="true"
         focusable="false" className={`appu-root appu-${state}`} fill="none" stroke={INK}
         strokeLinecap="round" strokeLinejoin="round" key={`${id}-${state}`}>
      <style>{CSS}</style>
      <g className="appu-body">
        {HAIR}
        <path d={HEAD} fill="#fff" strokeWidth="10" />
        <path d="M221 180 C228 166 242 166 248 178" strokeWidth="7" />
        <ellipse cx="129" cy="345" rx="16" ry="18" fill={BLUSH} stroke="none" />
        <ellipse cx="284" cy="271" rx="16" ry="18" fill={BLUSH} stroke="none" />
        {BROW[pose.brow]}
        <g className="appu-eyes">{EYES[pose.eyes]}</g>
        {MOUTH[pose.mouth]}
        {pose.hands === 'shrug' ? SHRUG_LEFT : LEFT_HAND}
        {HANDS[pose.hands]}
      </g>
      <path d="M124 452 C170 462 228 458 268 446" stroke={apron} strokeWidth="9" />
      <path d="M24 476 H416" strokeWidth="11" />
      {MARKS[state] ?? null}
    </svg>
  );
}
