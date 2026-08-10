import { useEffect, useRef, useState } from 'react';
import { useCakeDesign } from '../hooks/useCakeDesign.js';
import { CakePreview } from '../canvas/CakeCanvas.jsx';
import { demoTimeline, demoActions } from '../elementDemo.js';
import { ZONES } from '../constants.js';

/* ─────────────────────────────────────────────────────────────────────────────────────────────────
 * "Show me what this does" — the element performing its own capabilities.
 *
 * The help problem with a catalogue of decorations is that each one behaves differently and none of
 * it is visible from a thumbnail: this butterfly lies flat on the top, leans out over the rim and
 * stands off the side wall; that topper only ever stands on top; a pick buries itself in the
 * surface. A tooltip cannot say that in a way anybody reads, and a question mark next to 94
 * thumbnails is 94 invitations to not click.
 *
 * So it is performed rather than described. The element flies through every pose it is capable of,
 * on a real cake, in the designer's own renderer, with one short line naming what it just did.
 *
 * ── NOTHING HERE IS AUTHORED PER ELEMENT ────────────────────────────────────────────────────────
 * The timeline comes from `elementDemo.js`, which derives it from `allowed_zones`,
 * `placement_config` and `allowed_actions` — the very config that drives the real behaviour. Every
 * element in the library therefore has a demo the day this ships, a new element has one the moment
 * admin saves it, and the demo cannot drift from the truth because if it ever disagreed, the element
 * would be broken rather than the help.
 *
 * ── IT IS THE REAL PLACEMENT PATH, NOT AN IMITATION ─────────────────────────────────────────────
 * Each pose is produced by calling `addSticker` — the same function the designer calls when a baker
 * taps a decoration — into this component's OWN design. A demo that positioned the element itself
 * would be free to show a placement the element cannot actually take, which is worse than no help:
 * it teaches something untrue and the customer discovers it only when they try.
 *
 * Its own `useCakeDesign` instance is also what makes the ghost safe. The demo mutates a scratch
 * design that belongs to this component and is thrown away when it unmounts, so there is no path by
 * which a demonstration sticker reaches the customer's cake, an order snapshot, or undo history.
 * ───────────────────────────────────────────────────────────────────────────────────────────────*/
export default function ElementDemo({
  element,
  // Loop by default: this plays beside a decision ("is this the one?"), and a demo that stops after
  // one pass has to be restarted by someone who does not know there is anything to restart.
  loop = true,
  onCaption,          // optional: caption text lifted out, for hosts that draw their own chrome
  showCaption = true,
  showActions = true,
  style,
}) {
  const { design, addSticker, updateSticker, resetDesign, addTier } = useCakeDesign();
  const [step, setStep] = useState(0);
  const stickerId = useRef(null);
  const raf = useRef(null);

  const timeline = demoTimeline(element);
  const actions  = demoActions(element);
  const current  = timeline[step] ?? null;

  // A middle tier needs a cake that HAS one. Demoing "the middle tier" on a single-tier cake shows
  // the element on the only tier there is, which is not a lie so much as a sentence with no
  // referent — the viewer sees the same picture as the previous pose and concludes the demo is
  // stuck. Three tiers whenever the element claims that zone, one otherwise.
  const wantsMiddle = timeline.some(t => t.zone === ZONES.MIDDLE_TIER);
  const tierCount = wantsMiddle ? 3 : 1;

  // 70% up the authored range — visible without being a caricature. Null when the element authors no
  // bounds, in which case addSticker's own default stands (inventing a size for an untuned element
  // is exactly how a demo starts showing placements nobody validated).
  const sizeStep = timeline.find(t => t.kind === 'size');
  const poseScale = sizeStep ? sizeStep.from + (sizeStep.to - sizeStep.from) * 0.7 : null;

  // ── Stage the current step ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!element || !current) return;
    resetDesign();
    // Sequential functional updates compose, so the sticker below seats against the stack this loop
    // just built rather than the previous design.
    for (let i = 1; i < tierCount; i++) addTier();
    // A stable id, so the size step can animate THIS sticker rather than add a second one.
    const id = `demo-${step}`;
    stickerId.current = id;
    // The middle-tier pose belongs on the middle tier; everything else on the bottom one.
    const tierIndex = current.zone === ZONES.MIDDLE_TIER ? 1 : 0;
    addSticker(element, current.zone, tierIndex, current.mode, {}, {
      id,
      // Poses play at the LARGE end of the element's own authored range. At the default `r` a piping
      // drop is a handful of pixels against a whole cake and the viewer cannot see the thing being
      // explained. Biased high rather than maxed, and always a size the element genuinely allows —
      // a demo that showed a size the customer cannot pick would be teaching a lie.
      ...(current.kind === 'size' ? { scale: current.from } : (poseScale ? { scale: poseScale } : {})),
    });
    onCaption?.(current.caption);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element?.id, step, tierCount]);

  // ── Advance, and animate the size step while it is on screen ────────────────────────────────
  useEffect(() => {
    if (!current) return;
    let cancelled = false;

    if (current.kind === 'size') {
      // Grown smoothly rather than stepped between two sizes: the point of the step is the RANGE,
      // and two discrete sizes read as the element glitching.
      const t0 = performance.now();
      const tick = (now) => {
        if (cancelled) return;
        const t = Math.min(1, (now - t0) / current.ms);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;   // ease-in-out
        updateSticker(stickerId.current, { scale: current.from + (current.to - current.from) * eased });
        if (t < 1) raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    }

    const timer = setTimeout(() => {
      if (cancelled) return;
      const next = step + 1;
      if (next < timeline.length) setStep(next);
      else if (loop) setStep(0);
    }, current.ms);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, element?.id, timeline.length, loop]);

  // Restart from the top when the element changes, or a new element inherits the old one's position
  // in a timeline it may not even have.
  useEffect(() => { setStep(0); }, [element?.id]);

  if (!element || !timeline.length) return null;

  return (
    <div style={{ ...s.wrap, ...style }}>
      {/* Keyframes cannot be expressed as an inline style, and the caption swap needs to READ as a
          swap — without it the text changes silently and the eye, which is on the cake, misses it. */}
      <style>{DEMO_CSS}</style>
      <div style={s.stage}>
        {/* autoRotate off on purpose: the element is already moving, and a turntable under a moving
            element makes it impossible to tell which motion is the answer to the question. */}
        {/* CakePreview's own fit. Overriding fov/target to "zoom in" cropped a three-tier cake in
            half — the fit is computed from the tier stack, so a hand-tuned camera is only right for
            the cake it was tuned against. Legibility is solved by SIZE below, not by the lens. */}
        <CakePreview design={design} autoRotate={false} style={s.canvas} />

        {showCaption && current && (
          <div style={s.captionRow}>
            <span key={step} data-sf-demo-caption style={s.caption}>{current.caption}</span>
          </div>
        )}
      </div>

      {/* Where it can go, as a progress track — it also silently answers "how many places DOES this
          go?" before the loop has finished playing. */}
      <div style={s.dots}>
        {timeline.map((t, i) => (
          <span key={i} style={{ ...s.dot, ...(i === step ? s.dotOn : {}) }} />
        ))}
      </div>

      {showActions && actions.length > 0 && (
        <div style={s.chips}>
          {actions.map(a => <span key={a.key} style={s.chip}>{a.label}</span>)}
        </div>
      )}
    </div>
  );
}

const DEMO_CSS = `
@keyframes sfDemoCaption { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { [data-sf-demo-caption] { animation: none !important; } }
`;

const s = {
  wrap:   { display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' },
  stage:  { position: 'relative', width: '100%' },
  canvas: { width: '100%', aspectRatio: '1 / 1', borderRadius: 14, overflow: 'hidden' },
  captionRow: {
    position: 'absolute', left: 0, right: 0, bottom: 10, display: 'flex', justifyContent: 'center',
    pointerEvents: 'none',
  },
  caption: {
    // Over the cake rather than under it: the eye is already there, and a caption in a strip below
    // is read as a label for the whole widget instead of for the thing that just happened.
    padding: '5px 12px', borderRadius: 999, background: 'rgba(26,26,26,0.72)', color: '#fff',
    fontSize: 13, fontWeight: 600, letterSpacing: 0.1, backdropFilter: 'blur(4px)',
    animation: 'sfDemoCaption 260ms ease-out',
  },
  dots:  { display: 'flex', gap: 6 },
  dot:   { width: 6, height: 6, borderRadius: 999, background: '#d9d4cb', transition: 'background 200ms, transform 200ms' },
  dotOn: { background: '#1a1a1a', transform: 'scale(1.25)' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  chip: {
    padding: '4px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
    background: '#f2efe9', color: '#5a5a5a',
  },
};
