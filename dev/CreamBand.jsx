import React from 'react';

/* ── The icing band ──────────────────────────────────────────────────────────────────────────────
 *
 * The texture under the wordmark. Drawn, not photographed, and deliberately not a picture of a CAKE.
 *
 * ── WHY A TEXTURE AND NOT AN OBJECT ─────────────────────────────────────────────────────────────
 * The reference this comes from — a bakery site whose hero is a big name over a macro crop of crust
 * and seeds — never shows a whole loaf. You cannot tell what the bread is or how big it is. The
 * photo is not the subject; it is a SURFACE that gives the type warmth and something to sit on. Swap
 * the crust for a different crust and the page is unchanged.
 *
 * That is why a cake render kept failing here: a cake on white is an object, and an object asks to
 * be looked at. A surface asks nothing, which is exactly its job.
 *
 * A drawn surface also beats a photograph on the two things that matter to a theme shipped to
 * hundreds of bakeries: it needs no crop, and it is not the same stock picture in every shop.
 *
 * ── WHAT IT IS, AFTER TWO FAILURES ──────────────────────────────────────────────────────────────
 * Attempts one and two were fields of piped shells. Both read as eggs, and the second — smaller and
 * denser — read as bubble wrap, because rows of closed ovals interlock into a mesh no matter how the
 * ridges inside them are drawn. A shell needs its TAIL to be a shell, and a tail does not survive
 * being tiled.
 *
 * So the surface is stated by its EDGE instead: a poured drip line across the top, the same mark the
 * two-tier drawing uses, with sprinkles scattered below it. An edge plus scatter cannot collapse
 * into a pattern, because there is nothing repeating to lock together — and it says "the top of a
 * cake, cropped", which is the reference's macro-surface idea in our own vocabulary.
 */

// Deterministic pseudo-random: same band every render, no Math.random. A sprinkle field that
// reshuffles on every re-render twitches, and a hero that twitches is a bug nobody can name.
const rnd = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

// Mix towards the page colour. The band has to be the BAKER'S colour without becoming a block of it:
// a hero band at full saturation stops being a ground and starts being a poster.
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, k) => '#' + hex2rgb(a).map((v, i) => Math.round(v + (hex2rgb(b)[i] - v) * k))
  .map(v => v.toString(16).padStart(2, '0')).join('');

const DRIPS = 26;      // tongues across the top edge
const SPRINKLES = 90;

export default function CreamBand({ ink = '#1C1B18', accent = '#A8654B', paper = '#F7F4EE', style }) {
  // Two steps of the SAME hue rather than two unrelated colours: the icing is the baker's accent
  // pulled most of the way to paper, the cake beneath it one step deeper. One colour, two values —
  // which is what makes it read as light falling on a surface instead of as two stripes.
  const tint = mix(paper, accent, 0.16);
  const side = mix(paper, accent, 0.30);
  const w = 900, h = 380;
  // Two fills, both bleeding to every edge: ICING on top, the cake's SIDE below it, and the drips
  // are where one becomes the other. The previous pass filled only a thin ribbon and left the rest
  // of the band as page colour, so it read as a shelf with icicles over empty paper — there was no
  // surface anywhere, which was the one thing the band exists to provide.
  const ICE = 150;   // where the icing's edge sits before the tongues start

  // ── the poured edge ───────────────────────────────────────────────────────────────────────────
  // Flat icing between tongues of wildly different lengths — the same rule the cake drawing learned:
  // evenly spaced, equally deep tongues read as a piped scalloped border, not as something poured.
  const step = w / DRIPS;
  let d = `M0 0 L${w} 0 L${w} ${ICE}`;
  for (let i = DRIPS; i >= 0; i--) {
    // Position jitters as well as depth. Depth alone was not enough: tongues pinned to an even grid
    // still read as a border with some long teeth, because the EYE finds the rhythm in the spacing
    // before it notices the lengths. And the depth spread runs 10–150 now rather than 10–100 — a
    // range that never quite doubles reads as noise on one shape rather than as different drips.
    const cx = i * step + (rnd(i * 8.3) - 0.5) * step * 0.55;
    const half = step * (0.2 + rnd(i) * 0.22);
    const depth = 10 + Math.pow(rnd(i * 3.7), 1.6) * 150;
    d += ` L${cx + half} ${ICE} C${cx + half} ${ICE + depth} ${cx - half} ${ICE + depth} ${cx - half} ${ICE}`;
  }
  d += ` L0 ${ICE} Z`;

  const sprinkles = [];
  for (let i = 0; i < SPRINKLES; i++) {
    const x = rnd(i * 1.7) * w;
    // Kept clear of the top 120px so they fall on the icing rather than in the drips.
    const y = 16 + rnd(i * 5.3) * (ICE - 40);   // on the icing, above the tongues
    const a = rnd(i * 9.1) * 180;
    const len = 7 + rnd(i * 2.3) * 7;
    sprinkles.push(
      <line key={i} x1={x} y1={y} x2={x + len} y2={y}
            transform={`rotate(${a} ${x} ${y})`} strokeWidth="3" opacity={0.28 + rnd(i * 4.4) * 0.3} />,
    );
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" style={style} aria-hidden="true"
         fill="none" stroke={ink} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      {/* The cake's side fills the whole band; the icing is poured over the top of it. */}
      <rect x="0" y="0" width={w} height={h} fill={side} stroke="none" />
      <path d={d} fill={tint} stroke="none" />
      <path d={d} stroke={ink} strokeWidth="2.6" fill="none" opacity="0.9" />
      <g stroke={ink}>{sprinkles}</g>
    </svg>
  );
}
