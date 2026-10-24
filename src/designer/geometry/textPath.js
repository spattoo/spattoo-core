/* ── Where text may sit ON another element, and how far it has to bend ───────────────────────────
 *
 * A message has only ever been able to name a CAKE surface — `writing.surface` is 'top' | 'side' |
 * 'board'. Sandeep, with a photo of ONE across a fondant arch: *"we have texts element, but that
 * writes only on cake. we need to have a way to attach the texts to different other elements like
 * rainbow, a garnish element etc. rainbow shape is different so the text should go on curve."*
 *
 * ⚠️ THE PATH IS DERIVED, NEVER AUTHORED — asked, and this is the answer with the reason. A
 * rainbow's arch is already a function of its own numbers (`bandRadius` over `innerRadius`,
 * `thickness`, `gap`, all multiplied by `size`), and on top of that `fitOnTopScale` SHRINKS the
 * whole arch when it would overhang the cake: *"where it stands is the author's choice, so when
 * something has to give it is the size."* A hand-placed slot would go stale on a band count, an
 * inner radius, a size — and silently on every cake small enough to trigger the shrink, which is
 * exactly where it matters. So the provider asks the arch the same questions the renderer just
 * asked it, and the text cannot drift off the shape it is written on (INVARIANTS #15).
 *
 * What a row MAY author is in `placement_config.text_path`, and every value is RELATIVE — a
 * fraction of the band, never a position — so none of it can go stale:
 *
 *     { "kind": "arch", "band": "inner", "inset": 0.12, "span": 0.55, "size": 0.8 }
 *
 * `kind` keys into PROVIDERS below. That is the same data↔code seam `procedural: 'rainbow'` and
 * `text_styles.algorithm` already use: a new SHAPE needs a function here, everything else is config
 * and needs no deploy (CLAUDE.md rule 3).
 */
import { rainbowBands } from './rainbow.js';

/* ⚠️ `warpArc`'s amount is NOT a radius, and reading it as one is the easy mistake. It derives its
 * own radius from the TEXT's width — `theta = |k| * 2.2`, `R = W / theta` — so what survives the
 * later `fitStrokes` scaling is the SWEEP ANGLE, not the radius. Hence: to lay text of world width
 * `width` along a circle of world radius `radius`, ask for the angle that arc subtends and convert.
 * Pure, so the mapping is pinned by a test rather than by a render that looks about right. */
export const WARP_SWEEP_AT_ONE = 2.2;
/* ⚠️ NEGATIVE, and the sign is the difference between an arch and a smile. warpArc's +ve curves the
 * ENDS UP (a ∪); a rainbow needs them DOWN (a ∩), which is -ve. With k < 0 the glyph locus is a
 * circle centred at `(0, -R)` in the text's own frame — i.e. the centre of curvature sits BELOW the
 * line's middle, which is what lets the caller drop it straight onto the arch's centre. */
export function curveForArc(width, radius) {
  if (!(width > 0) || !(radius > 0)) return 0;
  const theta = width / radius;                 // the angle this much text subtends on that circle
  return -Math.max(0, Math.min(1, theta / WARP_SWEEP_AT_ONE));
}

/* ── A CUT letter placed on an arc ───────────────────────────────────────────────────────────────
 *
 * ⚠️ CUT LETTERS ARE NOT BENT, THEY ARE TURNED, and that is the difference between the two materials
 * rather than a shortcut. Piped cream is laid down by a nozzle travelling along a path, so the
 * stroke itself genuinely curves — `warpArc` warps its centrelines. A fondant letter is cut flat
 * with a cutter and pressed on; it keeps its own shape and the baker ROTATES it to follow the
 * curve. Warping one would render a letter no cutter makes.
 *
 * Acrylic deliberately gets neither. Sandeep: *"acrylic wont bend like arch. so we dont need
 * acrylic bend."* A perspex topper is cut from one sheet in one piece — it cannot follow a curve at
 * all, and the bridges that hold it together say so.
 *
 * `x` is the letter's centre along the straight baseline, `radius` the arc's, both in the same
 * units. Returns where that letter goes and how far to turn it, in a frame whose origin is the
 * middle of the line and whose centre of curvature is at `(0, -radius)` — the SAME convention
 * `warpArc` leaves cream in, so the two materials seat identically on the host.
 */
export function arcLetter(x, radius) {
  if (!(radius > 0)) return { x, y: 0, rot: 0 };
  const ang = x / radius;
  return { x: radius * Math.sin(ang), y: radius * (Math.cos(ang) - 1), rot: -ang };
}

export const ARCH_TEXT_DEFAULTS = Object.freeze({
  /* Which rope the line rides: 'inner', 'mid', 'outer', or a band index. 'mid' is the default
     because that is what the reference does — the letters are stuck ACROSS the stack, centred on
     the arch's face, not perched on one edge of it. */
  band:  'mid',
  /* ⚠️ AN OFFSET FROM THAT ROPE'S CENTRELINE, IN BAND THICKNESSES, AND ZERO MEANS ON IT. The first
     version added half a thickness before the inset, so the line was always pushed OFF the rope —
     inside the hole or out past the outer band, floating clear of the arch. Sandeep: *"the text
     going outside the rainbow. not looking as in like reference image."* The letters are stuck ON
     the fondant, so the default must put them there; +ve nudges outward, -ve inward. */
  inset: 0,
  /* How much of the arch's half-turn a line may use before it is scaled down to fit. A name that
     ran the whole sweep would wrap onto the legs, where there is nothing to read it against. */
  span:  0.55,
  /* Cap height as a fraction of the whole band STACK's depth — the thing the eye measures
     lettering against, not one rope. */
  size:  0.45,
});

/* The arch a message sits on, in the HOST's own frame: where its centre is, how far the line is
 * from that centre, and how wide/tall the line may be. The caller turns that into a transform.
 * `params`/`cake` are exactly what `RainbowArch` renders from, so this cannot describe a different
 * arch from the one on the cake. */
export function archTextPath(params, cake, cfg = {}) {
  /* ⚠️ `undefined` IN THE ROW MUST NOT BEAT THE SEED. Spreading a config that carries explicit
     undefineds (an admin form that writes every key) would wipe the defaults, so each value is
     taken with `??` rather than by spread. */
  const c = {
    band:  cfg.band  ?? ARCH_TEXT_DEFAULTS.band,
    inset: cfg.inset ?? ARCH_TEXT_DEFAULTS.inset,
    span:  cfg.span  ?? ARCH_TEXT_DEFAULTS.span,
    size:  cfg.size  ?? ARCH_TEXT_DEFAULTS.size,
  };
  const { bands, thickness, archY, centerX, standoff } = rainbowBands(params, cake);
  if (!bands?.length) return null;
  const pick = Number.isFinite(c.band) ? Math.max(0, Math.min(bands.length - 1, Math.round(c.band)))
             : c.band === 'outer' ? bands.length - 1
             : c.band === 'inner' ? 0
             : Math.floor((bands.length - 1) / 2);     // 'mid' — centred on the stack
  const band = bands[pick];
  const radius = band.radius + thickness * c.inset;
  if (!(radius > 0)) return null;
  /* ⚠️ CAP HEIGHT IS A FRACTION OF THE WHOLE STACK, not of one rope. A rope is a thin thing and a
     reference bow of letters spans several of them; sizing off one band made a line nobody could
     read from across a room. The stack is what the eye measures the lettering against. */
  const stack = Math.abs(bands[bands.length - 1].radius - bands[0].radius) + thickness;
  const capH = stack * c.size;
  /* The arch is a half-turn, so the sweep a line may use is `span` of π. */
  const sweep = Math.PI * c.span;
  const arcLen = radius * sweep;
  /* ⚠️ THE BOX BOUNDS THE BENT LINE, NOT THE STRAIGHT ONE, because `buildCreamWriting` warps FIRST
     and fits SECOND. Handing it the chord and a cap height let the arc's own sagitta blow the box,
     and `fitStrokes` then shrank the whole word to a speck at the centre of the hole — which is
     exactly what the first render showed. So: the chord it really spans, plus the sagitta it really
     rises, plus the cap height. Fitted to this, the glyphs come out at `size` of a band and the
     arc's radius lands back on the arch's. */
  const half = sweep / 2;
  const maxW = 2 * radius * Math.sin(half);
  const maxH = radius * (1 - Math.cos(half)) + capH;
  return {
    kind: 'arch',
    /* ⚠️ `pose` AND `transform` ARE ADDITIVE — every field below stayed. A second host shape (a
       plaque lying face-up on the cake top) needs the renderer to know WHICH WAY the host faces,
       and the renderer had that baked in: it placed the group at `[centerX, centerY + radius, face]`
       with no rotation, because an arch is the only host there was and an arch stands upright
       facing the camera. Rewriting these fields into a transform would have been the tidier change
       and a worse one — the twenty tests below pin this shape, and they are the only proof that
       adding a second host left the rainbow alone. So the transform is new and the old fields are
       untouched; the renderer prefers the transform, and this provider computes it from exactly the
       numbers it already returned. */
    pose: 'upright',
    position: [centerX, archY + radius, standoff + thickness / 2],
    rotation: [0, 0, 0],
    centerX, centerY: archY, standoff,
    /* ⚠️ THE FRONT OF THE ROPE, NOT THE PLANE THE ARCH IS CENTRED ON. A band is a TUBE: its
       centreline sits at `standoff`, but its surface stands a half-thickness proud of that. A
       message placed at the centreline is INSIDE the fondant with only slivers of letter poking
       through — which is exactly how it rendered, as a row of white ticks along the ropes. The
       caller adds its own half-thickness on top, because how thick a letter is belongs to the
       letter and not to the arch. */
    face: standoff + thickness / 2,
    radius, maxW, maxH, capH, sweep,
    curve: curveForArc(arcLen, radius),
  };
}

export const DISC_TEXT_DEFAULTS = Object.freeze({
  /* Share of the disc's DIAMETER a line may use before it is scaled to fit. Not 1.0: a circle is
     widest only across its exact middle, so letters run at the full diameter would touch the rim at
     their ends and leave no fondant round the word. 0.72 keeps a margin that reads as deliberate. */
  span: 0.72,
  /* Cap height as a fraction of the diameter. A name plaque's lettering is big — it IS the object —
     but a descender ('g', 'y') and an ascender still have to sit inside the disc. */
  size: 0.26,
  /* Off the disc's centre along its own face, in diameters; +ve towards the far edge. 0 = centred,
     which is what a name plaque wants. Here so a row can seat a line low and leave room for a
     flourish above it without authoring a position — the same relative rule the arch's `inset` is. */
  inset: 0,
});

/* ── A flat round plaque, lying face-up ─────────────────────────────────────────────────────────
 *
 * The second host shape. Sandeep's reference is a white fondant disc with a name raised across it,
 * and the whole reason it is HERE rather than painted into the disc's texture is the metal: a
 * hosted message is real geometry with a real material, so `TOPPER_FINISHES.gold` reflects the
 * scene. A gold painted into a decal cannot — turn the cake and it does not move.
 *
 * ⚠️ IT TAKES THE DISC'S OWN MEASUREMENTS, NEVER A POSITION, for the reason the arch's note gives:
 * a plaque is placed by dragging, resized by a dial and seated by the surface it is on, so any
 * slot authored as a coordinate goes stale the first time one of those changes — silently. The
 * caller measures the placed instance and hands those numbers in; everything below is a fraction
 * of them.
 *
 * `host` is `{ center: [x, y, z], diameter, rotation }` — the disc's FACE in world space, which
 * only the canvas can know.
 *
 * ⚠️ THE ROTATION IS THE CALLER'S, NOT THIS FUNCTION'S, and the first cut had it the other way.
 * It hardcoded `[-PI/2, yaw, 0]` — face-up — on the reasoning that a plaque lies on the cake top.
 * It also goes on the SIDE, where the disc faces radially outward and that constant is simply
 * wrong: the name would be laid flat in the air beside the wall. Sandeep: *"it should work on the
 * side as well."* Which way a host faces is a fact about where it was placed, and the placement
 * code is the only thing that knows it; this function sizes the line and passes the pose through.
 */
export function discTextPath(host, cfg = {}) {
  const d = Number(host?.diameter);
  if (!(d > 0) || !Array.isArray(host?.center) || !Array.isArray(host?.rotation)) return null;
  const c = {
    span:  cfg.span  ?? DISC_TEXT_DEFAULTS.span,
    size:  cfg.size  ?? DISC_TEXT_DEFAULTS.size,
    inset: cfg.inset ?? DISC_TEXT_DEFAULTS.inset,
  };
  const capH = d * c.size;
  return {
    kind: 'disc',
    /* ⚠️ THE RENDERER LIFTS THE LETTERS ALONG THE GROUP'S LOCAL +Z, which this rotation points at
       the host's face. Face-up on the cake top (`[-PI/2, yaw, 0]` turns local +Z into world +Y);
       radially outward on the wall (`[0, yaw, 0]` leaves it pointing out of the cylinder). One
       renderer, both zones, because the pose travels with the host rather than being guessed. */
    pose: 'face',
    position: [...host.center],
    rotation: [...host.rotation],
    /* A line across the face, shifted along it by `inset`. The box is the cap height plus room for
       a descender — a plain `capH` box clips the tail of a 'g' and the fitter cannot know that. */
    maxW: d * c.span,
    maxH: capH * 1.35,
    capH,
    offset: d * c.inset,
    /* ⚠️ STRAIGHT, AND NOT BECAUSE IT IS EASIER. The arch hands back a curve because the bend IS
       the arch; a disc's face is flat, so a bend here would be decoration the host does not
       justify — and `AcrylicWriting` cannot bend a cut word anyway (see PLACEMENT_CONFIG). The
       card hides the Curve dial on any hosted message, which is already true. */
    curve: 0,
  };
}

const PROVIDERS = { arch: archTextPath, disc: (params, cake, cfg) => discTextPath(params, cfg) };

/* The one reader. A host hands its own params and the cake it sits on; the row's `text_path` says
 * which shape to ask for and tunes it. Absent or unknown `kind` → null, which is "this element
 * takes no text" — the card then offers nothing rather than offering a control that does nothing
 * (INVARIANTS #11). */
export function textPathFor(textPathCfg, params, cake) {
  const kind = textPathCfg?.kind;
  const provider = kind && PROVIDERS[kind];
  return provider ? provider(params, cake, textPathCfg) : null;
}
