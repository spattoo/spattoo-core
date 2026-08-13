import { useEffect, useMemo, useRef, useState } from 'react';

// ── The flavour wheel ───────────────────────────────────────────────────────────────────────────
// The second way to answer "I can't decide — help me pick". The first is the rules engine, which
// argues from the occasion and the audience. This one does not argue at all, and that is the point:
// somebody the reasoning did not convince is not going to be convinced by more reasoning.
//
// ── IT DOES NOT BREAK THE EXPLAINABILITY RULE ───────────────────────────────────────────────────
// suggestFlavour.js opens by insisting a recommendation must be EXPLAINABLE, because a customer is
// about to spend real money on an occasion that matters. A wheel has no reason at all — and it is
// still honest, because the customer asked for one. "You spun for it" is a true and checkable
// sentence, and the screen never dresses the result as advice.
//
// What WOULD break the rule is a wheel that is secretly weighted toward the answers we like: a
// rigged game presented as chance. So it is not weighted, in either sense — see below.
//
// ── GENUINELY RANDOM, BOTH TIMES ────────────────────────────────────────────────────────────────
// A wheel can hold about eight segments before the labels stop being readable, and this baker makes
// twenty-six flavours. WHICH eight is therefore a decision, and picking the top-scoring eight would
// quietly stack it. So the eight are drawn at random, and the landing is random among them.
//
// Re-drawn on every spin rather than fixed for the visit, which is what keeps all twenty-six
// reachable — a wheel sampled once would put eighteen flavours permanently out of reach of a
// feature whose whole promise is chance.
//
// ── ELIGIBLE FLAVOURS ONLY ──────────────────────────────────────────────────────────────────────
// The caller passes the dietary-filtered list. Landing on something the baker would then have to
// decline is what suggestFlavour.js calls worse than suggesting nothing, and a game does not get an
// exemption from the one filter that keeps this honest.

const SEGMENTS = 8;
const SPIN_MS  = 3400;
/** Full turns before it settles. Enough that the landing is not visibly telegraphed. */
const TURNS    = 5;

/** Fisher–Yates, then take. `sort(() => Math.random() - 0.5)` is not a shuffle — it is biased and
 *  depends on the engine's sort, which is exactly the kind of quiet unfairness this screen must not
 *  have when it is calling itself luck. */
function sample(list, n) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/** Dark text on a pale slice, pale on a dark one. Flavours carry real sponge colours — Belgian Dark
 *  is nearly black and Vanilla is nearly white — so one fixed label colour is unreadable on half
 *  the wheel. Rec. 601 luma, which is plenty for a yes/no. */
function readableOn(hex) {
  const h = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!h) return '#2A241F';
  const n = parseInt(h[1], 16);
  const luma = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return luma > 150 ? '#2A241F' : '#FFFDF9';
}

const polar = (cx, cy, r, deg) => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
};

export default function FlavourWheel({ flavours, bakerName, onConfirm, onSkip }) {
  const size = 260, C = size / 2, R = C - 6;
  const seg = 360 / SEGMENTS;

  // Fewer than a full wheel's worth is still a wheel — it just has fewer, wider segments.
  const count = Math.min(SEGMENTS, flavours.length);
  const [wheel, setWheel] = useState(() => sample(flavours, count));
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [landed, setLanded] = useState(null);
  const timer = useRef(null);

  // Somebody who has asked not to be moved should not be handed a spinning wheel. They still get
  // the result and the same choice — only the animation goes.
  const still = useMemo(
    () => typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true,
    [],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  const segCount = wheel.length;
  const segAngle = 360 / segCount;

  function spin() {
    if (spinning) return;
    const next = sample(flavours, count);       // a fresh draw, so nothing is unreachable
    const target = Math.floor(Math.random() * next.length);
    setWheel(next);
    setLanded(null);

    if (still) { setSpinning(false); setLanded(target); return; }

    setSpinning(true);
    // Land the CENTRE of the target segment under the pointer at the top. Adding whole turns keeps
    // the direction consistent no matter where it stopped last time.
    const per = 360 / next.length;
    const settle = 360 - (target * per + per / 2);
    setAngle(a => a + TURNS * 360 + ((settle - (a % 360)) + 360) % 360);
    timer.current = setTimeout(() => { setSpinning(false); setLanded(target); }, SPIN_MS);
  }

  const picked = landed != null ? wheel[landed] : null;

  return (
    <div style={s.wrap}>
      <div style={s.title}>Give it a spin</div>
      {/* Deliberately not "{baker}'s flavours": a bakery called Feelings & Flavours renders as
          "Feelings & Flavours's flavours" — a possessive on a name already ending in s, beside the
          same word again. Naming the count and dropping the possessive sidesteps both. */}
      <p style={s.blurb}>
        {segCount} of the flavours {bakerName} makes, picked at random. Spin as often as you like.
      </p>

      <div style={s.stage}>
        {/* The pointer sits ABOVE the wheel and never rotates — it is the thing the wheel is
            measured against, so it has to be the still one. */}
        <div style={s.pointer} aria-hidden="true" />
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
             aria-label={`A wheel of ${segCount} flavours`}
             style={{
               display: 'block',
               transform: `rotate(${angle}deg)`,
               transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.9, 0.15, 1)` : 'none',
             }}>
          {wheel.map((f, i) => {
            const from = i * segAngle, to = (i + 1) * segAngle;
            const [x1, y1] = polar(C, C, R, from);
            const [x2, y2] = polar(C, C, R, to);
            const fill = f.spongeColor || '#EDE5DB';
            const mid = from + segAngle / 2;
            return (
              <g key={f.id}>
                <path d={`M ${C} ${C} L ${x1} ${y1} A ${R} ${R} 0 ${segAngle > 180 ? 1 : 0} 1 ${x2} ${y2} Z`}
                      fill={fill} stroke="#FFFDF9" strokeWidth="2" />
                {/* ── RADIAL, running out from the hub ──────────────────────────────────────────
                    Rotate the segment's spoke to vertical, then turn the text a quarter-turn so its
                    baseline lies ALONG that spoke and reads from the hub outward.

                    It was tangential before — placed on an arc and rotated to match — which is what
                    made "Pineapple" read upside down while "Lotus Biscoff" ran vertically: a name's
                    legibility depended on which segment it landed in.

                    Radially, the left half comes out inverted, and that is the correct behaviour
                    rather than a bug to patch: every real wheel does it, because the alternative is
                    flipping some labels and breaking the one thing a wheel has going for it, which
                    is that every segment is treated exactly alike. A wheel with two conventions
                    reads as a mistake; a wheel with one reads as a wheel.

                    Anchored at the hub end with textAnchor="start", so long names grow toward the
                    rim where the segment is widest — the direction with room, instead of crowding
                    the point where every segment meets. */}
                <g transform={`rotate(${mid} ${C} ${C})`}>
                  <text x={C} y={C - R * 0.24} fill={readableOn(fill)}
                        fontSize="11" fontWeight="800"
                        textAnchor="start" dominantBaseline="middle"
                        transform={`rotate(-90 ${C} ${C - R * 0.24})`}>
                    {f.name.length > 17 ? `${f.name.slice(0, 16)}…` : f.name}
                  </text>
                </g>
              </g>
            );
          })}
          <circle cx={C} cy={C} r="16" fill="#FFFDF9" stroke="#E7DFD5" strokeWidth="2" />
        </svg>
      </div>

      {/* One button that changes its job, rather than two that are alive at different times: before
          a result there is nothing to confirm, and after one the interesting choice is whether to
          keep it. */}
      {picked ? (
        <div style={s.result}>
          <div style={s.pickedName}>{picked.name}</div>
          <div style={s.actions}>
            <button type="button" style={s.take} onClick={() => onConfirm(picked)}>
              Choose {picked.name}
            </button>
            <button type="button" style={s.again} onClick={spin}>Spin again</button>
          </div>
        </div>
      ) : (
        <button type="button" style={s.spin} onClick={spin} disabled={spinning}>
          {spinning ? 'Spinning…' : 'Spin'}
        </button>
      )}

      {onSkip && (
        <button type="button" style={s.skip} onClick={onSkip}>
          Rather have a recommendation?
        </button>
      )}
    </div>
  );
}

const s = {
  wrap:   { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' },
  title:  { fontSize: 17, fontWeight: 800, color: '#2A241F' },
  blurb:  { fontSize: 12.5, color: '#7A6C60', lineHeight: 1.5, margin: 0, maxWidth: 300 },

  stage:   { position: 'relative', padding: '10px 0 4px' },
  pointer: {
    position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 2,
    width: 0, height: 0, borderLeft: '9px solid transparent', borderRight: '9px solid transparent',
    borderTop: '16px solid #2C4433',
  },

  spin:  { marginTop: 4, padding: '12px 32px', borderRadius: 12, border: 'none', background: '#2C4433',
           color: '#fff', font: 'inherit', fontSize: 14.5, fontWeight: 800, cursor: 'pointer' },

  result:    { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' },
  pickedName:{ fontSize: 19, fontWeight: 800, color: '#2A241F' },
  actions:   { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', width: '100%' },
  take:      { flex: '1 1 auto', padding: '12px 20px', borderRadius: 12, border: 'none',
               background: '#2C4433', color: '#fff', font: 'inherit', fontSize: 14, fontWeight: 800,
               cursor: 'pointer', lineHeight: 1.3 },
  again:     { padding: '12px 18px', borderRadius: 12, border: '1.5px solid #E7DFD5', background: '#fff',
               font: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#7A6C60', cursor: 'pointer' },

  skip:  { border: 'none', background: 'none', font: 'inherit', fontSize: 12, fontWeight: 700,
           color: '#A2968A', cursor: 'pointer', padding: '4px 0', textDecoration: 'underline' },
};
