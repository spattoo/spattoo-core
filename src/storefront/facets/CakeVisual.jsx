import HeroCake3D from '../HeroCake3D.jsx';

// ── Something delicious, always on screen ───────────────────────────────────────────────────────
// There is no progress bar here, because the CAKE is the progress bar.
//
// A wizard is boring for one reason: nothing happens between steps. So every choice changes what is
// on screen — pick chocolate and the crumb goes dark, pick 2kg and it grows. That kills the problem
// at its root rather than decorating around it, and it is why the visual is part of the shell
// rather than something each facet brings.
//
// ── TWO VISUALS, BECAUSE THE FACETS ARE ABOUT DIFFERENT THINGS ──────────────────────────────────
// The design facet shows the CAKE. The flavour facet shows a SLICE — and that is not a stylistic
// choice: a cake's exterior cannot show flavour at all. A chocolate cake and a vanilla one under
// fondant are identical from outside. The cross-section is the only view where a flavour is
// visible, which is exactly why flavours were given sponge and filling colours (migration 038).

const NEUTRAL_SPONGE  = '#EFE5D2';
const NEUTRAL_FILLING = '#F3EDE1';

/**
 * A slice, seen from the side: sponge, filling, sponge, filling, sponge.
 *
 * Falls back to a neutral sponge for a flavour nobody has coloured yet. That is the same answer the
 * admin preview gives and the same rule the rest of this feature keeps — say the honest thing
 * rather than invent one. A flavour added to the global list tomorrow has no colours until somebody
 * authors them, and it must not render as a black rectangle in the meantime.
 */
// Drawn once, in a fixed coordinate space, and SCALED by the viewBox. The first version took a
// height and kept a hardcoded 150px width, so asking for a small one produced a 150×92 slab that
// overflowed its card into the neighbours — and every absolute coordinate in the outline would have
// distorted if the width had simply been shrunk to match. Design space here, pixels at the edge.
const W0 = 150;          // design width
const BODY0 = 190;       // design height of the cake itself
const PLATE0 = 20;       // room beneath it for the plate
const H0 = BODY0 + PLATE0;
const ASPECT = W0 / H0;

export function Slice({ sponge, filling, height = 190 }) {
  const sp = sponge  || NEUTRAL_SPONGE;
  const fl = filling || NEUTRAL_FILLING;
  const uid = `${sp}${fl}`.replace(/[^0-9a-z]/gi, '');   // ids must not collide when several render

  // FOUR sponges rather than two. A first pass used two thick slabs and read as a colour chart —
  // and a stack of flat bands is exactly what this must not be, because the job is to make someone
  // hungry. Real cake is thin layers with thin cream between them, so more, thinner bands read as
  // food where fewer, fatter ones read as a swatch. Uneven heights for the same reason: regular
  // stripes look printed.
  const bands = [
    { c: sp, h: 0.185 }, { c: fl, h: 0.055 },
    { c: sp, h: 0.175 }, { c: fl, h: 0.050 },
    { c: sp, h: 0.170 }, { c: fl, h: 0.055 },
    { c: sp, h: 0.160 },
  ];

  const TOP = BODY0 * 0.13;          // the frosting cap above the sponge stack
  const body = BODY0 - TOP;

  let y = BODY0;
  const rows = bands.map((b, i) => {
    const h = b.h * body;
    y -= h;
    return <rect key={i} x="0" y={y - 0.4} width={W0} height={h + 0.8} fill={b.c} />;
  });

  // A WEDGE, not a rectangle. The left edge is the cut — dead straight, because a knife made it —
  // and the right is the outside of the cake, which leans out slightly and rounds where the
  // frosting turns over the rim. That asymmetry is most of what makes it read as a slice.
  const outline =
    `M 6 ${BODY0} L 6 ${TOP + 6} Q 6 ${TOP - 2} 16 ${TOP - 3} ` +
    `Q ${W0 / 2} ${TOP - 12} ${W0 - 14} ${TOP - 1} Q ${W0 - 5} ${TOP + 2} ${W0 - 4} ${TOP + 12} ` +
    `L ${W0 - 2} ${BODY0} Z`;

  return (
    <svg width={Math.round(height * ASPECT)} height={height} viewBox={`0 0 ${W0} ${H0}`}
         role="img" aria-label="A slice of cake, cut to show the sponge and filling">
      <defs>
        <clipPath id={`sl-${uid}`}><path d={outline} /></clipPath>
        <linearGradient id={`sh-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0"    stopColor="#000" stopOpacity="0.13" />
          <stop offset="0.28" stopColor="#000" stopOpacity="0" />
          <stop offset="1"    stopColor="#000" stopOpacity="0.07" />
        </linearGradient>
      </defs>

      {/* The plate first, so the slice sits ON it rather than over it. */}
      <ellipse cx={W0 / 2} cy={BODY0 + 8} rx={W0 / 2 - 4} ry="6" fill="#000" opacity="0.08" />

      <g clipPath={`url(#sl-${uid})`}>
        {rows}
        {/* The frosting cap, drawn past the top so the rounded rim is filled to the edge. */}
        <rect x="0" y="-6" width={W0} height={TOP + 8} fill={fl} />
        <rect x="0" y="-6" width={W0} height={BODY0 + 8} fill={`url(#sh-${uid})`} />
      </g>

      {/* A hairline round the whole thing, so a pale flavour still has an edge against a pale
          background — Coconut and Vanilla vanish without it. */}
      <path d={outline} fill="none" stroke="#000" strokeOpacity="0.10" strokeWidth="1" />
    </svg>
  );
}

/**
 * Whichever visual the open facet is about.
 *
 * `flavour` is the resolved flavour for the tier being chosen, or null. Passing the whole flavour
 * rather than two colours means this never has to know about the fallback rule twice.
 */
export default function CakeVisual({ facet, flavour, primary, accent, height = 230 }) {
  if (facet === 'flavour') {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', height }}>
        <Slice sponge={flavour?.spongeColor} filling={flavour?.fillingColor} height={height - 30} />
      </div>
    );
  }

  // Everything else shows the cake. The storefront hero already renders this one, so three.js is
  // not a new cost on this page — it is the same component, at a smaller height.
  return <HeroCake3D primary={primary} accent={accent} height={height} mood="light" spin={0.35} />;
}
