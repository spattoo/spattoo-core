import React from 'react';

/* ── A two-tier cake, drawn ──────────────────────────────────────────────────────────────────────
 *
 * A hero that is honest about being an ILLUSTRATION rather than a 3D render trying to pass as a
 * photograph. It draws on the first frame with no GPU, no catalogue and no fetch, and it sits in the
 * same ink family as Appu and the Patisserie shopfront, so the premium themes read as one house
 * style rather than three unrelated experiments.
 *
 * ── FROM A REFERENCE, NOT OF IT ─────────────────────────────────────────────────────────────────
 * Same method as Patisserie from the Theobroma illustration. What is taken is the VOCABULARY:
 *
 *   · one continuous monoline in a single weight — no shading, no hatching, no second thickness
 *   · metallic ink on a flat ground, which is what makes a line drawing read as expensive
 *   · drips as the only "movement" in an otherwise still object
 *   · sprinkle dots and seed dots for texture, because a pure outline reads as a diagram
 *   · a wobble. Every curve here is deliberately a little off-true; a perfect ellipse reads as
 *     clip-art and no amount of good proportion rescues it.
 *
 * The reference's cupcake is gone: two tiers were asked for, and a second object next to the subject
 * halves the subject.
 *
 * ── WHY IT IS PARAMETRIC ────────────────────────────────────────────────────────────────────────
 * `ink` and `ground` come from the baker's own palette, so this is not one shop's picture reused a
 * thousand times. The ground is painted INTO the shapes rather than left transparent — the tiers,
 * the icing and the berry have to occlude the lines behind them, and a stack of transparent
 * outlines turns into a wireframe.
 */

// ── THE DRIPS, FROM DATA ────────────────────────────────────────────────────────────────────────
// [centre, halfWidth, depth], right to left. Hand-writing the curve produced a sinusoid twice: the
// tongues came out evenly spaced, equally deep and joined to each other, which is a scalloped
// border — a decoration someone piped on purpose. Poured icing does the opposite: it hangs in
// tongues of wildly different lengths with FLAT icing between them, because it ran wherever the
// edge happened to let it go.
// Two of them run a long way — 62 and 58 — because a set of tongues that all stop within a few
// pixels of each other still reads as a border, however uneven the numbers look on paper.
const DRIPS = [
  [247, 7, 24], [231, 5, 10], [212, 9, 62], [194, 6, 18],
  [175, 7, 33], [156, 5,  8], [137, 9, 58], [119, 6, 15], [106, 5, 27],
];
const BASE = 152;   // where the icing's bottom edge sits when it is not dripping

function dripEdge(from, to) {
  let d = `L${from} ${BASE}`;
  for (const [cx, w, depth] of DRIPS) {
    // Flat icing up to this tongue, then a U with a rounded tip. Control points sit BELOW the tip so
    // the tongue bulges rather than tapering to a spike.
    d += ` L${cx + w} ${BASE} C${cx + w} ${BASE + depth} ${cx - w} ${BASE + depth} ${cx - w} ${BASE}`;
  }
  return `${d} L${to} ${BASE}`;
}

export default function CakeLine({ ink = '#A9803C', ground = '#A7D7D3', style }) {
  // Every shape that must hide what is behind it gets the ground as its fill. One constant, so a
  // theme change can never leave a shape filled with last theme's colour.
  const solid = { fill: ground };
  return (
    <svg viewBox="0 0 360 400" style={style} aria-hidden="true"
         fill="none" stroke={ink} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">

      {/* ── BOTTOM TIER ───────────────────────────────────────────────────────────────────────── */}
      {/* Wider and shorter than the tier above it. A two-tier cake whose tiers are near-equal reads
          as two cakes stacked; the step down is what makes it one object. */}
      <path d="M60 252 C58 296 59 330 61 350 C61 366 114 376 180 376 C246 376 299 366 299 350
               C301 330 302 296 300 252 Z" {...solid} />
      <path d="M60 252 C60 235 114 225 180 225 C246 225 300 236 300 252 C300 268 246 278 180 278
               C114 278 60 268 60 252 Z" {...solid} />
      {/* Sponge seams. They stop ~16px short of the silhouette: a seam that runs into the outline
          reads as a painted band, and one that stops short reads as a cut through a sponge. */}
      <path d="M76 308 C108 317 138 320 180 320 C222 320 254 316 285 308" />
      <path d="M75 346 C107 356 138 359 180 359 C222 359 253 355 284 346" />
      <circle cx="110" cy="334" r="2.4" fill={ink} stroke="none" />
      <circle cx="154" cy="341" r="2" fill={ink} stroke="none" />
      <circle cx="238" cy="332" r="2.2" fill={ink} stroke="none" />

      {/* ── TOP TIER ──────────────────────────────────────────────────────────────────────────── */}
      {/* Its base is drawn BELOW the bottom tier's top line and filled, so it cuts that line for us
          and sits IN the cake rather than balancing on it. */}
      <path d="M100 132 C98 166 99 200 101 222 C101 236 136 244 180 244 C224 244 259 236 259 222
               C261 200 262 166 260 132 Z" {...solid} />

      {/* ── ICING, AND THE DRIPS ──────────────────────────────────────────────────────────────── */}
      {/* The only movement in a still object. Each tongue has its OWN width and depth — the first
          pass spaced them evenly at equal depth and it came out as a scallop border, which is a
          decoration, not something poured that found its own way down. */}
      <path d={`M100 132 C100 113 137 102 180 102 C223 102 260 113 260 132 ${dripEdge(260, 100)} Z`}
            {...solid} />
      <path d="M146 120 l7 -4 M174 114 l8 -2 M206 121 l7 -5 M160 130 l6 -3 M192 131 l7 -4"
            strokeWidth="2.6" />

      {/* ── STRAWBERRY ────────────────────────────────────────────────────────────────────────── */}
      {/* Bigger than the first pass, which put a berry the size of a sprinkle on a cake this wide.
          Filled, so its base cuts the icing crown and it sits ON the cake. */}
      {/* Wide at the shoulders, tapering to a point. A circle with leaves on it is a cherry. */}
      <path d="M180 120 C158 106 149 92 152 78 C155 63 166 55 180 55 C194 55 205 63 208 78
               C211 92 202 106 180 120 Z" {...solid} />
      <circle cx="170" cy="79" r="1.9" fill={ink} stroke="none" />
      <circle cx="189" cy="76" r="1.9" fill={ink} stroke="none" />
      <circle cx="180" cy="90" r="1.9" fill={ink} stroke="none" />
      <circle cx="165" cy="95" r="1.8" fill={ink} stroke="none" />
      <circle cx="194" cy="93" r="1.8" fill={ink} stroke="none" />
      {/* POINTED leaves, three of them. The first pass drew two rounded lobes and it read as a bow
          tie — a calyx is spiky or it is not a calyx. */}
      <path d="M180 56 L160 48 L176 47 L164 38 L180 45 L196 38 L184 47 L200 48 Z" {...solid} />
      <path d="M180 46 C181 39 183 34 188 30" strokeWidth="2.8" />

      {/* ── GROUND ────────────────────────────────────────────────────────────────────────────── */}
      {/* A single line under the cake. Without it the drawing hangs in the air; with it, the cake is
          standing on something. It stops short of the frame on both sides so it reads as a surface
          rather than a border. */}
      <path d="M46 380 C96 386 264 386 314 380" strokeWidth="2.6" opacity="0.55" />
    </svg>
  );
}
