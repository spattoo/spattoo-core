import { expandParts, restingY, SHAPES } from './fondantParts.js';

/* ── How to make it: the build, one piece at a time ──────────────────────────────────────────────
 *
 * The problem this exists for: a baker gets an order with a reference photo of a fondant figure and
 * has no idea where to start. Not "which colour" — HOW. The answer is always the same and is never
 * obvious from the photo: it is a few balls pressed together, in an order.
 *
 * ⚠️ THE PARTS LIST ALREADY IS THE RECIPE, and that is the whole of this module. A figure is stored
 * as an ORDERED list built bench-upward (`settle` rests each piece on the ones before it), which is
 * exactly the order a person rolls them. So the step-by-step is `parts.slice(0, n)` replayed. There
 * is nothing to author, nothing to keep in sync, and no second source that can disagree with the
 * figure.
 *
 * ── WHY NOT A VIDEO ─────────────────────────────────────────────────────────────────────────────
 * A recorded video is an asset: it has to be produced, stored, re-produced when the figure changes,
 * and it cannot be recoloured. Replaying the config costs nothing, is always current, and shows the
 * bear in the customer's own colour. The one thing a video has — a human's hands — is exactly what
 * this cannot show, and it is worth being honest that this is a diagram, not a demonstration.
 *
 * ── SIZES ARE RELATIVE, NEVER ABSOLUTE ──────────────────────────────────────────────────────────
 * "Roll a ball of radius 0.14" is meaningless at a bench. Every size here is expressed against the
 * FIRST piece — the body — because that is the one a baker sizes by eye against the cake, and
 * everything else is judged against it. Get the body right and the rest follows.
 */

/* What a baker DOES to make each shape. The verb matters more than the noun: "roll a ball and
 * flatten it" is an instruction, "disc" is a label.
 *
 * ⚠️ SINGULAR AND PLURAL ARE BOTH WRITTEN OUT. The first cut derived the pair form by replacing
 * "Roll a" with "Roll two", which produced "Roll two ball for the eyes" — English plurals are not a
 * regex, and the pronoun has to move too ("taper IT" → "taper THEM"). Two strings is less clever
 * and cannot be wrong. */
// ⚠️ Split into what you PICK UP and what you then DO to it, so the body part can be named in
// between: "Roll a ball, then taper it into an egg for the body" put the name at the end of a
// clause it did not belong to. "Roll a ball for the body, then taper it into an egg" is the order
// a person says it in.
const HOW = {
  ball: { lead: ['Roll a ball', 'Roll two balls'],            tail: '' },
  egg:  { lead: ['Roll a ball', 'Roll two balls'],            tail: ['then taper it into an egg', 'then taper them into eggs'] },
  rope: { lead: ['Roll a rope', 'Roll two ropes'],            tail: '' },
  cone: { lead: ['Roll a ball', 'Roll two balls'],            tail: ['then pinch it into a cone', 'then pinch them into cones'] },
  disc: { lead: ['Roll a ball', 'Roll two balls'],            tail: ['then flatten it into a disc', 'then flatten them into discs'] },
  ring: { lead: ['Roll a thin rope', 'Roll two thin ropes'],  tail: ['then join the ends into a ring', 'then join each into a ring'] },
  slab: { lead: ['Roll out a sheet', 'Roll out a sheet'],     tail: ['then cut a slab', 'then cut two slabs'] },
};

// A generated id ('ball-3') names a shape, not a body part — fall back to the shape's own label so
// a step never reads "Add the ball-3".
const NAMED = /^[a-z]+-\d+$/;
const humanName = (part) =>
  (NAMED.test(part.id) ? SHAPES[part.shape]?.label?.toLowerCase() : part.id.replace(/[_-]/g, ' ')) ?? 'piece';

const volume = (p) => (p.size?.[0] ?? 0) * (p.size?.[1] ?? 0) * (p.size?.[2] ?? 0);

/* Against the body, in words a bench can act on. Deliberately coarse — six buckets, not a
 * percentage. A baker matching "about half the size" gets it right; a baker reading "47%" measures
 * nothing and trusts it less. */
function relativeSize(part, base) {
  if (!base || base.id === part.id) return null;
  const r = Math.cbrt(volume(part) / Math.max(volume(base), 1e-9));   // a length ratio, not a volume one
  if (r >= 0.85) return 'about the same size as the body';
  if (r >= 0.6)  return 'about three-quarters the size of the body';
  if (r >= 0.4)  return 'about half the size of the body';
  if (r >= 0.25) return 'about a third the size of the body';
  if (r >= 0.12) return 'about a fifth the size of the body';
  // Still against the body. A bucket that stopped comparing ("a tiny piece") left the smallest
  // pieces — eyes, a nose — as the only ones with nothing to judge them by, which is where a
  // relative scale is needed MOST.
  return 'much smaller than the body, about a pea';
}

/* ⚠️ WHICH PIECE IT IS PRESSED ONTO — the one it TOUCHES, not the one that would catch it.
 *
 * The first cut asked `restingY` which earlier piece would hold this one up if it fell, and picked
 * the highest answer. That is the wrong question for a figure whose pieces were PLACED rather than
 * dropped: an arm sits beside the body at chest height, but an ear high on the head would catch it
 * if it fell from above — so the guide told a baker to press the arms onto the EAR. It read as
 * confident, correct English and was nonsense, which is the failure mode a generated instruction
 * has to be built against.
 *
 * The right question is proximity in the piece's own units: centre-to-centre distance divided by
 * the summed half-extents on each axis. Below 1 the two overlap; the SMALLEST value is the piece
 * this one is pressed deepest into. It answers the same for a settled figure and a hand-placed one,
 * which matters because the studio produces both.
 */
function separation(a, b) {
  const rx = (a.size?.[0] ?? 0) + (b.size?.[0] ?? 0);
  const ry = (a.size?.[1] ?? 0) + (b.size?.[1] ?? 0);
  const rz = (a.size?.[2] ?? 0) + (b.size?.[2] ?? 0);
  return Math.hypot(
    ((a.pos?.[0] ?? 0) - (b.pos?.[0] ?? 0)) / Math.max(rx, 1e-9),
    ((a.pos?.[1] ?? 0) - (b.pos?.[1] ?? 0)) / Math.max(ry, 1e-9),
    ((a.pos?.[2] ?? 0) - (b.pos?.[2] ?? 0)) / Math.max(rz, 1e-9),
  );
}

export function supportingPart(part, earlier) {
  let best = null, bestSep = Infinity;
  for (const o of earlier ?? []) {
    if (!o || o.id === part.id) continue;
    const s = separation(part, o);
    if (s < bestSep) { bestSep = s; best = o; }
  }
  // Nothing within touching distance: this piece stands on the board on its own.
  return bestSep < 1 ? best : null;
}

/* One step per stored piece. `upto` is the figure as it stands AFTER this step, so a viewer just
 * renders it — the accumulation is here rather than in three different callers.
 *
 * Stored pieces, not drawn ones: a mirrored pair is ONE step ("roll two ears"), because that is one
 * action at a bench and two steps would have the baker make an ear, then make the same ear again.
 */
export function buildSteps(parts) {
  const list = (parts ?? []).filter(p => p?.shape && SHAPES[p.shape]);
  const base = list[0] ?? null;

  return list.map((part, i) => {
    const earlier  = list.slice(0, i);
    const on       = supportingPart(part, earlier);
    const pair     = !!part.mirror && Math.abs(part.pos?.[0] ?? 0) > 1e-3;
    const name     = humanName(part);
    const size     = relativeSize(part, base);

    const spec  = HOW[part.shape] ?? { lead: ['Roll a piece', 'Roll two pieces'], tail: '' };
    const lead  = spec.lead[pair ? 1 : 0];
    const tail  = Array.isArray(spec.tail) ? spec.tail[pair ? 1 : 0] : spec.tail;
    const first = i === 0;

    const instruction = first
      // The base is sized against the CAKE, not against itself — it is the only piece with an
      // outside reference, and every later size hangs off it.
      ? `${lead} for the ${name}${tail ? `, ${tail}` : ''}. Size it against the cake — everything `
        + 'else is judged against this.'
      : [
          `${lead} for the ${name}${pair ? 's' : ''}`,
          size ? `, ${size}` : '',
          tail ? `, ${tail}` : '',
          on ? `. Press ${pair ? 'them' : 'it'} onto the ${humanName(on)}.` : '. Set it on the board.',
        ].join('');

    return {
      n: i + 1,
      of: list.length,
      part,
      pair,
      onId: on?.id ?? null,
      title: pair ? `${name}s` : name,
      instruction,
      // The figure as it stands after this step — what the viewer draws.
      upto: list.slice(0, i + 1),
    };
  });
}

// Every piece drawn at this step, mirrored copies included — for a viewer that wants a count
// ("6 of 11 pieces") rather than a step number.
export const piecesAtStep = (steps, n) => expandParts(steps?.[n]?.upto ?? []).length;
