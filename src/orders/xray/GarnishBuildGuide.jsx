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

  const drawing = useProgressiveDraw(animate, guide.strokes.length);

  return (
    <svg viewBox={view} role="img"
      aria-label={guide.kind === 'cut'
        ? `Cutting template: ${guide.panels.length} piece${guide.panels.length > 1 ? 's' : ''}`
        : `Piping order: ${guide.strokes.length} stroke${guide.strokes.length > 1 ? 's' : ''}`}
      style={{ width: '100%', maxWidth: 420, background: '#FCFBF9', borderRadius: 10,
               border: '1px solid #ECE7E0' }}>

      {/* The finished piece, faintly — so the numbered strokes read as marks ON something rather
          than as a diagram floating in space. */}
      {guide.kind === 'cut'
        ? guide.panels.map((p, i) => (
            <g key={i}>
              <path d={`${p.outline} ${p.holes.join(' ')}`} fillRule="evenodd"
                fill="#EDE4D8" stroke="#8A7457" strokeWidth={unit * 0.3} />
              {/* ⚠️ A HOLE IS A CUT, AND THE OUTLINE ALONE DOES NOT SAY SO. Drawn solid it reads as a
                  circle printed on the panel — something to pipe, or ignore. The dashes say
                  "cut here", which is the same convention a paper pattern uses. */}
              {p.holes.map((d, k) => (
                <path key={k} d={d} fill="none" stroke="#8A7457" strokeWidth={unit * 0.26}
                  strokeDasharray={`${unit * 0.8} ${unit * 0.6}`} />
              ))}
            </g>
          ))
        : guide.strokes.map(s => (
            <path key={`ghost-${s.n}`} d={s.d} fill="none" stroke="#EDE7DF"
              strokeWidth={unit * 1.5} strokeLinecap="round" strokeLinejoin="round" />
          ))}

      {guide.kind === 'piped' && guide.strokes.map((s, i) => (
        <g key={s.n}>
          {/* ⚠️ AN EDGE UNDER EVERY STROKE, BECAUSE WHITE CHOCOLATE IS NEARLY THE COLOUR OF PAPER.
              Drawn as bare colour, a white or pale piece all but disappeared against the plate — the
              guide showed a stroke count and no visible stroke. The outline is what a piped rope has
              anyway, so it costs nothing on a dark piece and rescues a pale one. */}
          <path d={s.d} fill="none" stroke="#B3A794" strokeWidth={unit * 0.95}
            strokeLinecap="round" strokeLinejoin="round"
            style={drawing == null || i <= drawing
              ? undefined
              : { opacity: 0.12, transition: 'opacity .25s' }} />
          <path d={s.d} fill="none" stroke={s.color} strokeWidth={unit * 0.7}
            strokeLinecap="round" strokeLinejoin="round"
            /* ⚠️ THE DASH TRICK NEEDS A LENGTH IT CANNOT KNOW IN SVG MARKUP, so the whole path is
               hidden until its turn and then revealed. Cruder than growing along the line and it
               degrades to the finished diagram, which is the point: nothing here is load-bearing. */
            style={drawing == null || i <= drawing
              ? undefined
              : { opacity: 0.12, transition: 'opacity .25s' }} />

          {/* Start: a filled dot. End: an arrowhead pointing the way the hand was going. */}
          <circle cx={s.start[0]} cy={s.start[1]} r={unit * 0.55} fill="#1F5F3F" />
          <Arrow at={s.end} angle={s.heading} size={unit * 1.15} />

          {/* The number sits BESIDE the start, not on it — on it and the dot is unreadable, which is
              the one mark that says where to begin. */}
          <text x={s.start[0] + unit * 1.1} y={s.start[1] - unit * 0.9}
            fontSize={unit * 1.9} fontWeight="800" fill="#1F5F3F"
            stroke="#FCFBF9" strokeWidth={unit * 0.5} paintOrder="stroke">{s.n}</text>
        </g>
      ))}

      {/* ⚠️ NUMBERED ONLY WHEN THERE IS SOMETHING TO ORDER. A lone "1" beside a single panel is a
          mark that means nothing and invites the reader to hunt for a 2. Several pieces cut from one
          sheet do need telling apart. */}
      {guide.kind === 'cut' && guide.panels.length > 1 && guide.panels.map((p, i) => (
        <text key={p.n} x={box.x0 + unit + i * unit * 2.4} y={box.y0 + unit * 2}
          fontSize={unit * 1.8} fontWeight="800" fill="#7A5A2E"
          stroke="#FCFBF9" strokeWidth={unit * 0.45} paintOrder="stroke">{p.n}</text>
      ))}
    </svg>
  );
}

/* An arrowhead as a triangle, because a stroke-based one needs a marker definition per colour and
 * markers are the first thing to be lost when SVG is rasterised into the printed sheet. */
function Arrow({ at: [x, y], angle, size }) {
  const p = (d, a) => `${x + Math.cos(angle + a) * d},${y + Math.sin(angle + a) * d}`;
  return <polygon points={`${x},${y} ${p(size, 2.5)} ${p(size, -2.5)}`} fill="#1F5F3F" />;
}

/* ⚠️ REDUCED MOTION IS NOT A PREFERENCE TO BE WEIGHED HERE — it is a request from someone for whom
 * movement is a problem, and the diagram is complete without it. Checked once at mount and again if
 * the setting changes, and when it is set the animation never starts at all. */
function useProgressiveDraw(animate, count) {
  const [i, setI] = useState(null);

  useEffect(() => {
    if (!animate || count < 2) return undefined;
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq?.matches) return undefined;

    setI(0);
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      setI(n);
      if (n >= count - 1) { clearInterval(t); setI(null); }   // ends on the finished diagram
    }, 700);
    return () => clearInterval(t);
  }, [animate, count]);

  return i;
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
