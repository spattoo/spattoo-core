import React from 'react';

/* ── A slice, seen close ─────────────────────────────────────────────────────────────────────────
 *
 * The Lookbook theme's own drawing.
 *
 * ── WHY NOT REUSE THE TWO-TIER ONE ──────────────────────────────────────────────────────────────
 * Because it is already the other theme's hero, and a shared drawing recreates the exact complaint
 * that started all of this: bakers cannot tell the themes apart. A theme's picture has to be that
 * theme's picture. The 3D cake was rejected for the same reason — it is shared by three themes and
 * so belongs to none of them.
 *
 * ── HOW IT DIFFERS, DELIBERATELY ────────────────────────────────────────────────────────────────
 * Different SUBJECT and different HAND, because subject alone is not enough — two drawings in the
 * same monoline outline read as one illustrator's set, which is a house style when you want it and a
 * duplicate when you do not.
 *
 *   whole cake, standing        →  one slice, cropped
 *   pure outline, no fills      →  filled layers; the fills do the drawing
 *   even single-weight line     →  no outline at all on the sponge, only where cream meets air
 *   the object entire           →  bleeds off the bottom and both sides
 *
 * A slice also says something the whole cake does not: cut, served, eaten. It is the cake at the
 * moment it is actually enjoyed rather than the cake as a product photograph — and it is the one
 * view where SPONGE is visible, which is the part a baker is judged on.
 */

export default function CakeSlice({ ink = '#1C1B18', cream = '#F3EBDD', sponge = '#D8C3A5',
                                    jam = '#B4694F', style }) {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" style={style} aria-hidden="true"
         fill="none" stroke="none">
      {/* ── THE CUT FACE ────────────────────────────────────────────────────────────────────────
          A wedge, not a rectangle: the near edge is taller than the far one because a slice is cut
          from a round cake and we are looking at the cut. Everything below y=300 is off the frame,
          which is what makes this a crop rather than a diagram of a slice. */}
      <path d="M56 96 L344 118 L352 300 L44 300 Z" fill={sponge} />

      {/* Layers. Sponge, cream, sponge, jam, sponge — the section a knife reveals, and the reason a
          slice is worth drawing at all. They sag slightly to the right, following the wedge. */}
      <path d="M50 150 L348 170 L348 196 L50 178 Z" fill={cream} />
      <path d="M48 218 L350 236 L350 254 L48 240 Z" fill={jam} opacity="0.85" />

      {/* ── THE CREAM ON TOP ────────────────────────────────────────────────────────────────────
          The only place a line is drawn: where cream meets air. Everywhere else the fills describe
          the form, which is what stops this reading as the other theme's outline drawing. */}
      <path d="M52 96 C74 74 104 84 126 74 C150 63 172 82 198 76 C226 70 246 88 276 84
               C306 80 330 96 348 118 L344 138 C322 120 300 108 274 112 C246 116 224 100 198 106
               C170 112 148 94 124 104 C102 113 76 108 56 124 Z" fill={cream} />
      <path d="M52 96 C74 74 104 84 126 74 C150 63 172 82 198 76 C226 70 246 88 276 84
               C306 80 330 96 348 118" stroke={ink} strokeWidth="3" strokeLinecap="round" />

      {/* A berry on top, half out of frame at the right — the crop has to cut something or it is not
          a crop. */}
      <path d="M330 66 C318 62 314 48 322 38 C330 28 348 28 356 38 C364 48 360 62 348 66
               C342 68 336 68 330 66 Z" fill={jam} />
      <path d="M332 40 l-10 -10 M340 36 l-2 -14 M348 40 l10 -10" stroke={ink} strokeWidth="2.6" strokeLinecap="round" />

      {/* Crumbs on the plate line. Three, because a slice that has been moved leaves some behind and
          a perfectly clean plate reads as a rendering rather than as a thing someone served. */}
      <circle cx="86" cy="286" r="3" fill={ink} opacity="0.5" />
      <circle cx="112" cy="294" r="2.2" fill={ink} opacity="0.4" />
      <circle cx="322" cy="290" r="2.6" fill={ink} opacity="0.45" />
    </svg>
  );
}
