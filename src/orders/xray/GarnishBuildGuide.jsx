import { useEffect, useRef, useState } from 'react';
import { garnishGuide } from '../../designer/geometry/garnishGuide.js';
import { useNarrow } from '../../shared/useNarrow.js';

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

  return <GuideBody guide={guide} animate={animate} />;
}

function GuideBody({ guide, animate }) {
  const clock = useDrawClock(animate, guide.beats.length);
  const isMobile = useNarrow();

  const caption = (
    <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45, fontWeight: 600,
                color: guide.kind === 'cut' ? '#7A5A2E' : '#1F5F3F' }}>
      {clock.beat != null
        ? guide.beats[clock.beat]?.caption
        : guide.beats.map(b => b.caption).join(' ')}
    </p>
  );

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* ⚠️ THE WORDS AND THE DRAWING MUST BE SEEN TOGETHER — INVARIANTS #11. The caption sat UNDER
          the animation, so you could watch the line being drawn or read what it meant, never both:
          look down to read, look back, and the motion has moved on. That defeats the entire point of
          narrating it. Beside it where there is room; ABOVE it on a phone, so the instruction arrives
          before the thing it describes rather than after. Never below. */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row',
                    gap: isMobile ? 8 : 16, alignItems: isMobile ? 'stretch' : 'center' }}>
        {isMobile && <div style={{ minHeight: 58 }}>{caption}</div>}
        <div style={{ flex: '0 1 auto', minWidth: 0 }}>
          <GuideDiagram guide={guide} clock={clock} />
        </div>
        {!isMobile && (
          /* A fixed height so the panel does not jump as the sentences change length. */
          <div style={{ flex: '1 1 200px', minHeight: 76, display: 'flex', alignItems: 'center' }}>
            {caption}
          </div>
        )}
      </div>

      <details>
        <summary style={{ fontSize: 12.5, fontWeight: 700, color: '#666', cursor: 'pointer' }}>
          The whole method, in full
        </summary>
        <ol style={{ margin: '10px 0 0', paddingLeft: 18, display: 'grid', gap: 6 }}>
          {guide.steps.map((st, i) => (
            <li key={i} style={{ fontSize: 13, lineHeight: 1.5, color: '#333' }}>{st}</li>
          ))}
        </ol>
      </details>

      <Facts guide={guide} />
    </div>
  );
}

function GuideDiagram({ guide, clock }) {
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
              strokeLinecap="round" strokeLinejoin="round" style={clock.style(i, t.mode)} />
          )}
          <path d={t.d} fill="none" stroke={t.color} pathLength="100"
            strokeWidth={t.wide ? unit * 0.7 : unit * 0.3}
            strokeLinecap="round" strokeLinejoin="round"
            style={{
              ...(t.dashed ? { strokeDasharray: `${unit * 0.8} ${unit * 0.6}` } : null),
              ...clock.style(i, t.mode),
            }} />
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

/* ⚠️ SLOW ENOUGH TO FOLLOW WITH YOUR HANDS BUSY. At under a second a stroke the drawing was a
 * flicker — technically an animation and useless as an instruction, since a baker glancing up from
 * the bench has to find the line, read the caption and look back down. */
const STEP_MS = 2200;      // one stroke, drawn
const HOLD_MS = 3000;      // the finished piece, held, before it starts over

/* ── The clock ───────────────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ ONE CLOCK DRIVES BOTH THE DRAWING AND THE WORDS. The first version animated the paths with CSS
 * keyframes, which would have needed a second, separate timer to change the caption — two clocks
 * that drift apart, so the sentence ends up describing the stroke before or after the one actually
 * being drawn. That is worse than no sentence at all.
 *
 * ⚠️ AND IT IS NOT LOAD-BEARING. With motion reduced the beat is null: every line shows complete and
 * the captions run together as a paragraph, so nothing is available only to someone who waits.
 */
function useDrawClock(animate, count) {
  const [t, setT] = useState(null);
  const raf = useRef(0);

  useEffect(() => {
    if (!animate || count < 1) return undefined;
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq?.matches) return undefined;

    const cycle = count * STEP_MS + HOLD_MS;
    const started = performance.now();
    const tick = now => {
      setT(((now - started) % cycle) / STEP_MS);        // measured in steps, not seconds
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [animate, count]);

  if (t == null) return { beat: null, style: () => undefined };

  const past = t >= count;                              // the hold at the end of the cycle
  const beat = past ? count - 1 : Math.floor(t);
  const within = past ? 1 : t - Math.floor(t);
  return {
    beat,
    style: (i, mode) => {
      const done = past || i < beat;
      if (mode === 'reveal') return { opacity: done ? 1 : i === beat ? within : 0 };
      /* Traced along its own length. `pathLength="100"` on the path is what lets one rule fit every
         stroke whatever its real length — no measuring, no layout read. */
      const shown = done ? 100 : i === beat ? within * 100 : 0;
      return { strokeDasharray: 100, strokeDashoffset: 100 - shown };
    },
  };
}

function Facts({ guide }) {
  const items = [
    guide.kind === 'piped' ? ['Strokes', guide.strokes.length] : ['Pieces', guide.panels.length],
    guide.kind === 'piped' ? ['Lifts', guide.lifts] : null,
  ].filter(Boolean);
  /* ⚠️ NO SIZE. It was shown in millimetres and it is not ours to state — how big the piece should
     be depends on the cake in front of the baker, and a number here reads as a specification to hit.
     What this guide is for is the technique. */

  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
      {items.map(([k, v]) => (
        <div key={k}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#999', letterSpacing: 0.4,
                        textTransform: 'uppercase' }}>{k}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>{v}</div>
        </div>
      ))}
    </div>
  );
}
