import { useEffect, useState } from 'react';
import { garnishGuide } from '../../designer/geometry/garnishGuide.js';

// ── The build guide for a chocolate garnish ──────────────────────────────────────────────────────
//
// ⚠️ THE ONLY GUIDE IN THE X-RAY THAT IS NOT WRITTEN BY A MODEL. Every other decoration guide is
// generated from a description and cached against the element; this one is DERIVED from the piece's
// own paths, so it is free, instant, and cannot describe a different garnish from the one on the
// cake. See `geometry/garnishGuide.js` — this file only draws what that returns.
//
// ⚠️ IT IS DESIGNED FOR PAPER FIRST. A baker prints the X-ray or glances at it with their hands full.
// So the numbered diagram is the deliverable and the animation is an enhancement: turn the animation
// off and the guide is unchanged, because the numbers, the dots and the arrows carry the order on
// their own. Building it the other way round produces something that demos well and is useless at
// the bench.

export default function GarnishBuildGuide({ garnish, cakeDiameterMm = null, animate = true }) {
  const guide = garnishGuide(garnish, { cakeDiameterMm });
  if (!guide) return null;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <GuideDiagram guide={guide} animate={animate} />
      {guide.kind === 'cut' && (
        <div style={{ fontSize: 11.5, color: '#7A5A2E', marginTop: -4 }}>
          The dot is where the knife goes in; cut the outline first, then punch the circles.
        </div>
      )}
      <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
        {guide.steps.map((s, i) => (
          <li key={i} style={{ fontSize: 13, lineHeight: 1.5, color: '#333' }}>{s}</li>
        ))}
      </ol>
      <Facts guide={guide} />
    </div>
  );
}

function GuideDiagram({ guide, animate }) {
  const { box } = guide;
  const w = Math.max(1, box.x1 - box.x0), h = Math.max(1, box.y1 - box.y0);
  /* Marks scale with the piece, so a small garnish does not get numbers larger than itself and a
     large one does not get dots too small to find. */
  const unit = Math.max(w, h) / 26;
  /* ⚠️ THE PADDING IS FOR THE MARKS, NOT FOR LOOKS, so it is measured in the same unit they are. A
     fixed pad clipped the number off any stroke starting at the top edge — and a stroke starting at
     the top edge is the normal case for a spike, which is the shape the reference cakes are made of.
     The number is the instruction; losing it loses the guide. */
  const pad = unit * 3.4;
  const view = `${box.x0 - pad} ${box.y0 - pad} ${w + pad * 2} ${h + pad * 2}`;

  /* Every line that gets drawn, in the order it is made. For a piped piece that is the strokes; for
     a cut one it is each outline followed by its holes — because cutting is a sequence too. */
  /* ⚠️ A DASHED LINE CANNOT BE DRAWN BY A DASH TRICK — a path has ONE `stroke-dasharray`, and the
     progressive draw needs it. Animating the punch lines the same way as the cut line silently
     turned them solid for the whole of the animation, collapsing the one distinction this diagram
     exists to make. So they FADE IN in their turn instead: a different motion for a different
     action, which is honest anyway — the outline is traced, a hole is punched in one go. */
  const timeline = guide.kind === 'cut'
    ? guide.panels.flatMap(p => [
        { d: p.outline, color: '#8A7457', mode: 'draw' },
        ...p.holes.map(d => ({ d, color: '#8A7457', mode: 'reveal', dashed: true })),
      ])
    : guide.strokes.map(st => ({ d: st.d, color: st.color, wide: true, mode: 'draw' }));

  const anim = useDrawAnimation(animate, timeline.length);

  return (
    <svg viewBox={view} role="img"
      aria-label={guide.kind === 'cut'
        ? `Cutting order: ${guide.panels.length} piece${guide.panels.length > 1 ? 's' : ''}`
        : `Piping order: ${guide.strokes.length} stroke${guide.strokes.length > 1 ? 's' : ''}`}
      /* ⚠️ BOUNDED IN BOTH DIRECTIONS. Width alone is not a size for a tall piece: a spike is three
         times as high as it is wide, so a 420-wide box made a diagram over a thousand pixels tall
         that pushed the steps — the actual instructions — off the screen entirely. */
      style={{ width: '100%', maxWidth: 420, maxHeight: 340, background: '#FCFBF9', borderRadius: 10,
               border: '1px solid #ECE7E0' }}>

      {anim.css && <style>{anim.css}</style>}

      {/* The finished piece, faintly, under everything — so the drawing reads as marks ON something,
          and so the animation has a shape to grow into rather than appearing out of nothing. */}
      {guide.kind === 'cut'
        ? guide.panels.map((p, i) => (
            <path key={i} d={`${p.outline} ${p.holes.join(' ')}`} fillRule="evenodd"
              fill="#F3EEE6" stroke="none" />
          ))
        : guide.strokes.map(st => (
            <path key={`ghost-${st.n}`} d={st.d} fill="none" stroke="#EDE7DF"
              strokeWidth={unit * 1.5} strokeLinecap="round" strokeLinejoin="round" />
          ))}

      {/* ⚠️ THE LINE IS DRAWN ALONG ITS OWN LENGTH, which is what makes this a build guide rather than
          a picture that fades in. `pathLength="100"` is the trick that makes it possible without
          measuring anything: it tells SVG to treat every path as 100 units long whatever its real
          length, so one dash rule animates every stroke, and no layout read is needed. */}
      {timeline.map((t, i) => (
        <g key={i}>
          {t.wide && (
            <path d={t.d} fill="none" stroke="#B3A794" strokeWidth={unit * 0.95} pathLength="100"
              strokeLinecap="round" strokeLinejoin="round" className={anim.cls(i, t.mode)} />
          )}
          <path d={t.d} fill="none" stroke={t.color} pathLength="100"
            strokeWidth={t.wide ? unit * 0.7 : unit * 0.3}
            strokeLinecap="round" strokeLinejoin="round"
            className={anim.cls(i, t.mode)}
            style={t.dashed ? { strokeDasharray: `${unit * 0.8} ${unit * 0.6}` } : undefined} />
        </g>
      ))}

      {guide.kind === 'piped' && guide.strokes.map(st => (
        <g key={st.n}>
          {/* Start: a filled dot. End: an arrowhead pointing the way the hand was going. */}
          <circle cx={st.start[0]} cy={st.start[1]} r={unit * 0.55} fill="#1F5F3F" />
          <Arrow at={st.end} angle={st.heading} size={unit * 1.15} />
          {/* The number sits BESIDE the start, not on it — on it and the dot is unreadable, which is
              the one mark that says where to begin. */}
          <text x={st.start[0] + unit * 1.1} y={st.start[1] - unit * 0.9}
            fontSize={unit * 1.9} fontWeight="800" fill="#1F5F3F"
            stroke="#FCFBF9" strokeWidth={unit * 0.5} paintOrder="stroke">{st.n}</text>
        </g>
      ))}

      {guide.kind === 'cut' && guide.panels.map((p, i) => (
        <g key={i}>
          <circle cx={p.start[0]} cy={p.start[1]} r={unit * 0.55} fill="#7A5A2E" />
          <Arrow at={p.start} angle={p.heading} size={unit * 1.15} color="#7A5A2E" />
          {p.holeStarts.map(([hx, hy], k) => (
            <circle key={k} cx={hx} cy={hy} r={unit * 0.4} fill="#7A5A2E" />
          ))}
        </g>
      ))}
    </svg>
  );
}

/* An arrowhead as a triangle, because a stroke-based one needs a marker definition per colour and
 * markers are the first thing to be lost when SVG is rasterised into the printed sheet. */
function Arrow({ at: [x, y], angle, size, color = '#1F5F3F' }) {
  const p = (d, a) => `${x + Math.cos(angle + a) * d},${y + Math.sin(angle + a) * d}`;
  return <polygon points={`${x},${y} ${p(size, 2.5)} ${p(size, -2.5)}`} fill={color} />;
}

const STEP_S = 0.9;      // how long one stroke takes to draw
const HOLD_S = 1.6;      // the finished piece, held, before it starts over

/* ── The progressive draw ────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ IT LOOPS, AND THAT IS THE WHOLE POINT. The first attempt ran once on mount and stopped: by the
 * time anyone had scrolled to the guide it had finished, so the feature existed and was never seen.
 * A build guide is looked at while the hands are busy — it has to be running whenever you look up.
 *
 * ⚠️ AND IT IS NOT LOAD-BEARING. The numbers, dots and arrows carry the order on their own, so with
 * motion reduced or CSS unavailable the diagram is complete and merely still. Keyframes are
 * generated per stroke because each one owns a WINDOW of one shared cycle — that is what makes them
 * draw in sequence and restart together rather than each looping on its own clock.
 */
function useDrawAnimation(animate, count) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!animate || count < 1) return undefined;
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq?.matches) { setOn(false); return undefined; }
    setOn(true);
    const listen = e => setOn(!e.matches);
    mq?.addEventListener?.('change', listen);
    return () => mq?.removeEventListener?.('change', listen);
  }, [animate, count]);

  if (!on) return { css: null, cls: () => undefined };

  const cycle = count * STEP_S + HOLD_S;
  const rules = ['.gbg-draw { stroke-dasharray: 100; }'];
  for (let i = 0; i < count; i++) {
    const from = ((i * STEP_S) / cycle) * 100;
    const to = (((i + 1) * STEP_S) / cycle) * 100;
    rules.push(
      // Traced along its length: the line the tool follows.
      `@keyframes gbg-k${i} {`
      + ` 0%, ${from.toFixed(2)}% { stroke-dashoffset: 100 }`
      + ` ${to.toFixed(2)}%, 100% { stroke-dashoffset: 0 } }`,
      `.gbg-d${i} { animation: gbg-k${i} ${cycle.toFixed(2)}s linear infinite; }`,
      // Appears in one go: a hole is punched, not traced — and its dashes are not ours to spend.
      `@keyframes gbg-r${i} {`
      + ` 0%, ${from.toFixed(2)}% { opacity: 0 }`
      + ` ${to.toFixed(2)}%, 100% { opacity: 1 } }`,
      `.gbg-r${i} { animation: gbg-r${i} ${cycle.toFixed(2)}s linear infinite; }`,
    );
  }
  return {
    css: rules.join('\n'),
    cls: (i, mode) => (mode === 'reveal' ? `gbg-r${i}` : `gbg-draw gbg-d${i}`),
  };
}

function Facts({ guide }) {
  const items = [
    guide.kind === 'piped' ? ['Strokes', guide.strokes.length] : ['Pieces', guide.panels.length],
    guide.kind === 'piped' ? ['Lifts', guide.lifts] : null,
    guide.widthMm ? ['Size', `${guide.widthMm} × ${guide.heightMm} mm`] : null,
    guide.kind === 'piped' && guide.ropeMm ? ['Nozzle', `about ${guide.ropeMm} mm`] : null,
  ].filter(Boolean);

  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
      {items.map(([k, v]) => (
        <div key={k}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#999', letterSpacing: 0.4,
                        textTransform: 'uppercase' }}>{k}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>{v}</div>
        </div>
      ))}
      {!guide.widthMm && (
        /* Said plainly rather than guessed: a template cut to an assumed size does not fit. */
        <div style={{ fontSize: 11, color: '#9A6A2F', alignSelf: 'end' }}>
          Size shown once the cake size is set.
        </div>
      )}
    </div>
  );
}
