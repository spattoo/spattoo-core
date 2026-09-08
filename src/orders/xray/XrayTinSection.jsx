// ── The cake, cut through the middle, drawn to scale ────────────────────────────────────────────
//
// One option in the tin comparison: what THIS weight becomes in THIS tin. The same weight in a 6in
// tin and a 12in one are two different cakes — one tall with six layers, one flat with two — and
// the baker's job is to pick the one that matches the picture the customer sent. So the drawing has
// to be honest about proportion above all else, and it has to look like cake, because a baker
// comparing five of these at a glance is reading shape, not numbers.
//
// ⚠️ A CROSS-SECTION, NOT A SLICE, and the difference is not stylistic. `Slice` in the storefront is
// a WEDGE — one straight cut face, one leaning outer edge — which is right for showing flavour. Its
// width is the cake's RADIUS. This screen exists to compare 6in against 12in, so a shape whose width
// means half the number under it would quietly mislead on the one question being asked. This is the
// whole cake cut down the middle: symmetric, and its width IS the diameter.
//
// ⚠️ AND NOT THE 3/4 WIREFRAME EITHER (XrayTinDiagram). On a cylinder seen from above, a layer of
// filling is an elliptical arc, not a straight line — so bands cannot be drawn on it without arc
// geometry per layer, and it would still foreshorten the height, which is the very thing being
// compared. A flat elevation shows the true ratio.
//
// The rendering is the storefront's: filled sponge and filling bands, a frosting cap, the rim
// rolling over at the top, a shadow under the board.

const NEUTRAL_SPONGE  = '#EFE5D2';
const NEUTRAL_FILLING = '#F3EDE1';

// Design space is INCHES, scaled to pixels at the edge — so one ruler serves both axes and a tall
// option cannot accidentally be drawn at a different scale from a flat one.
const CAP_IN   = 0.35;   // frosting over the top. Roughly constant in inches whatever the cake does.
const RIM_IN   = 0.30;   // how far the frosting rolls over the top edge before the side goes straight
const PLATE_IN = 0.35;   // room under the base for the board shadow

/* Sponge and filling bands for one tier.
 *
 * ⚠️ Generated, where the storefront hardcodes seven. Its comment is the reason to keep the SHAPE of
 * that choice: thin uneven bands read as food, few fat ones read as a colour chart, and perfectly
 * regular ones look printed. So filling stays ~0.3 of a sponge band and each band is nudged a few
 * percent either way — deterministically, by index, because a drawing that changes on every render
 * is worse than one that is slightly regular.
 */
function bandsFor(layers, sponge, filling) {
  const n = Math.max(2, layers | 0);
  const F = 0.3;                                    // filling thickness, as a fraction of a sponge band
  const unit = 1 / (n + F * (n - 1));
  const out = [];
  for (let i = 0; i < n; i++) {
    const jitter = 1 + ((i % 3) - 1) * 0.05;        // -5%, 0, +5%, repeating
    out.push({ c: sponge, h: unit * jitter });
    if (i < n - 1) out.push({ c: filling, h: unit * F * (1 + ((i % 2) ? 0.08 : -0.08)) });
  }
  return out;
}

/* The outline of one tier, in inches, centred on x = 0.
 *
 * ⚠️ ROUND ON TOP, SQUARE ON THE BOTTOM. Buttercream is scraped up the side and rolls over the rim,
 * so the top edges turn; the base is cut flat against the board and does not. Rounding all four
 * corners stops it reading as cake and starts it reading as a pill, which is what most drawings of
 * a cake get wrong. `Slice` makes the same distinction, and it is most of why it works.
 *
 * `sharp` tightens the roll for a square tier: a fondant-covered square holds a much crisper edge
 * than scraped buttercream, and the tier already knows its own shape so this is free to be right.
 */
function tierPath(w, h, topY, sharp) {
  const hw = w / 2;
  const r = Math.min(sharp ? RIM_IN * 0.45 : RIM_IN, hw * 0.35, h * 0.4);
  const botY = topY + h;
  return (
    `M ${-hw} ${botY} ` +
    `L ${-hw} ${topY + r} ` +
    `Q ${-hw} ${topY} ${-hw + r} ${topY} ` +
    `L ${hw - r} ${topY} ` +
    `Q ${hw} ${topY} ${hw} ${topY + r} ` +
    `L ${hw} ${botY} Z`
  );
}

/**
 * `tiers` is bottom-first: { tinInch, heightIn, layers, square, sponge, filling }.
 * `ruler` is the inches the drawing's full width represents — pass the SAME value for every option
 * in a comparison, or the tins cannot be compared by looking at them, which is the whole point.
 */
export default function XrayTinSection({ tiers = [], ruler, width = 150, id = 's' }) {
  const drawn = tiers.filter(t => t?.tinInch > 0 && t?.heightIn > 0);
  if (drawn.length === 0) return null;

  const widest = Math.max(...drawn.map(t => t.tinInch));
  const scaleIn = ruler || widest;

  /* Lay them out top-down in the drawing's own coordinates: y grows downward, the top tier starts
   * at 0, and each tier below begins where the one above ended. Walked from the LAST tier (the top)
   * so the offsets accumulate in drawing order while `tiers` stays bottom-first, which is the order
   * every other part of the tin plan uses. */
  const totalH = drawn.reduce((s, t) => s + t.heightIn, 0);
  const placed = [];
  let top = 0;
  for (let i = drawn.length - 1; i >= 0; i--) {
    placed[i] = { ...drawn[i], topY: top };
    top += drawn[i].heightIn;
  }

  const vbW = scaleIn * 1.06;                       // a little air either side
  const vbH = totalH + CAP_IN + PLATE_IN;
  const px = width / vbW;

  return (
    <svg width={width} height={Math.round(vbH * px)}
         viewBox={`${-vbW / 2} ${-CAP_IN} ${vbW} ${vbH}`}
         role="img"
         aria-label={`${drawn.map(t => `${t.tinInch}in`).join(' on ')}, ${totalH.toFixed(1)} inches tall`}>
      <defs>
        {placed.map((t, i) => (
          <clipPath key={i} id={`ts-${id}-${i}`}>
            <path d={tierPath(t.tinInch, t.heightIn, t.topY, t.square)} />
          </clipPath>
        ))}
        <linearGradient id={`tsh-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0"    stopColor="#000" stopOpacity="0.13" />
          <stop offset="0.28" stopColor="#000" stopOpacity="0" />
          <stop offset="1"    stopColor="#000" stopOpacity="0.07" />
        </linearGradient>
      </defs>

      {/* The board, first, so the cake sits ON it. ⚠️ Sized off the BASE TIER, not the ruler — the
          ruler is the widest option in the whole row, so a 4in cake was being given an 11in
          shadow and read as a small cake on a huge board rather than as a small cake. */}
      <ellipse cx="0" cy={totalH + PLATE_IN * 0.45} rx={placed[0].tinInch * 0.56} ry={PLATE_IN * 0.38}
               fill="#000" opacity="0.09" />

      {/* Bottom-first, so an upper tier is drawn OVER the rim of the one it sits on and the join
          needs no special case — the same reason the storefront draws its cap over the bands. */}
      {placed.map((t, i) => {
        const sponge = t.sponge || NEUTRAL_SPONGE;
        const filling = t.filling || NEUTRAL_FILLING;
        const bands = bandsFor(t.layers ?? 2, sponge, filling);
        const hw = t.tinInch / 2;
        let by = t.topY + t.heightIn;              // fill upward from the tier's base
        return (
          <g key={i} clipPath={`url(#ts-${id}-${i})`}>
            {bands.map((b, k) => {
              const h = b.h * (t.heightIn - CAP_IN);
              by -= h;
              return <rect key={k} x={-hw} y={by - 0.01} width={t.tinInch} height={h + 0.02} fill={b.c} />;
            })}
            {/* The frosting cap, drawn past the top so the rolled rim is filled to its edge. */}
            <rect x={-hw} y={t.topY - CAP_IN} width={t.tinInch} height={CAP_IN * 2} fill={filling} />
            <rect x={-hw} y={t.topY - CAP_IN} width={t.tinInch} height={t.heightIn + CAP_IN}
                  fill={`url(#tsh-${id})`} />
          </g>
        );
      })}

      {/* A hairline round each tier, so a pale flavour still has an edge against a pale card —
          the storefront needed this for Coconut and Vanilla and so does this. */}
      {placed.map((t, i) => (
        <path key={i} d={tierPath(t.tinInch, t.heightIn, t.topY, t.square)}
              fill="none" stroke="#000" strokeOpacity="0.10" strokeWidth={0.02 * scaleIn} />
      ))}
    </svg>
  );
}
