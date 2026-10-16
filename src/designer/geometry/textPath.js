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
    centerX, centerY: archY, standoff,
    radius, maxW, maxH, capH, sweep,
    curve: curveForArc(arcLen, radius),
  };
}

const PROVIDERS = { arch: archTextPath };

/* The one reader. A host hands its own params and the cake it sits on; the row's `text_path` says
 * which shape to ask for and tunes it. Absent or unknown `kind` → null, which is "this element
 * takes no text" — the card then offers nothing rather than offering a control that does nothing
 * (INVARIANTS #11). */
export function textPathFor(textPathCfg, params, cake) {
  const kind = textPathCfg?.kind;
  const provider = kind && PROVIDERS[kind];
  return provider ? provider(params, cake, textPathCfg) : null;
}
