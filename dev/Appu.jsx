import React from 'react';

/* ── Appu, the narrator ───────────────────────────────────────────────────────────────────────────────
 *
 * Appu: a doodle baker who walks on and tells the visitor, in words, that the cake on screen is theirs to
 * design. The promise used to be a line of italic text above the step rail: correct, small, and
 * competing with a rotating 3D cake, which it lost. A drawn character with a speech bubble does not
 * lose that fight.
 *
 * ── DRAWN, NOT SOURCED ──────────────────────────────────────────────────────────────────────────
 * Built from a reference doodle the same way Patisserie was built from the Theobroma illustration:
 * we take the VOCABULARY — one heavy ink weight, round head, toque with a scalloped fringe, stick
 * limbs, dot shoes, a single flat colour on the apron — and draw our own from scratch. No asset is
 * traced, downloaded or shipped; this file is the drawing.
 *
 * ── WHY IT IS PARAMETRIC ────────────────────────────────────────────────────────────────────────
 * The apron wears the baker's own primary colour, so a mint-green shop gets a mint-green apron
 * rather than a mascot in someone else's brand. The face is ink-on-white with no fill, which is the
 * reference's own convention and also means we never pick a skin tone on behalf of a thousand
 * different bakeries.
 *
 * ── PROPORTION IS THE WHOLE STYLE ───────────────────────────────────────────────────────────────
 * The first draft was drawn at human proportions and read as a small adult in a hat. Hat and head
 * take the TOP HALF of the figure here; the body below is barely more than an apron with sticks
 * attached. Cute is not a rendering style, it is a ratio — get it wrong and no amount of line
 * quality rescues it.
 *
 * Poses are named, not numeric: the caller says what the character is DOING, and this file decides
 * what that looks like. An index would have to be re-read here every time the beats change.
 */

const INK = '#16150F';

// One arm does all the acting. Rotated about the shoulder, so the elbow and hand follow for free.
// Angles are absolute rotations of a limb that naturally hangs 47° BELOW horizontal, so the useful
// numbers are far larger than they look: -96 is a raised wave, and -26 (the first guess) merely
// lifted the hand to waist height and read as standing still.
//
// He stands to the LEFT of the cake, so every pointing angle aims right and the only variable is
// height: pointUp reaches the top tier, point the middle, pointLow the base where the name is piped.
// One generic point held through every beat is a character gesturing at a page; a character whose
// hand tracks the thing being described is a character explaining something.
// Measured against where the cake actually IS on screen, not against intuition. He stands at the
// left edge and the cake is far to his right, so even its top tier is only ~26° above his hand —
// the first numbers here (-104 for "up") aimed at the ceiling. The usable range is narrow, so the
// three aims are spread slightly wider than the true geometry to stay readable at a glance.
const ARM_ANGLE = { wave: -96, pointUp: -82, point: -66, pointLow: -52, pipe: -52, rest: 4 };

export default function Appu({ pose = 'rest', apron = '#E9B7C2', style }) {
  const angle = ARM_ANGLE[pose] ?? ARM_ANGLE.rest;
  return (
    <svg viewBox="0 0 158 244" style={style} aria-hidden="true"
         fill="none" stroke={INK} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
      {/* ── TOQUE ───────────────────────────────────────────────────────────────────────────── */}
      {/* Three lobes, deliberately uneven — a symmetrical hat reads as clip-art. */}
      <path d="M32 50 C24 26 40 10 54 20 C58 2 84 2 88 19 C104 10 118 27 108 50 Z" fill="#fff" />
      <path d="M56 21 C54 30 54 40 55 49" strokeWidth="2.4" opacity="0.45" />
      <path d="M86 20 C87 30 87 40 86 49" strokeWidth="2.4" opacity="0.45" />
      <rect x="30" y="46" width="80" height="17" rx="5" fill="#fff" />

      {/* ── HEAD — half the figure, which is the entire trick ───────────────────────────────── */}
      <rect x="35" y="59" width="70" height="62" rx="30" fill="#fff" />
      {/* Ears, before the face, so the outline sits behind the head. */}
      <path d="M35 88 q-7 4 -1 12" strokeWidth="3" />
      <path d="M105 88 q7 4 1 12" strokeWidth="3" />
      {/* Fringe: the scallops that make it read as hair rather than a bald egg. */}
      <path d="M39 68 q6 9 12 0 q6 9 12 0 q6 9 12 0 q6 9 12 0" strokeWidth="3" />
      {/* Eyes, and one eyebrow higher than the other — the entire personality is in that asymmetry. */}
      <ellipse cx="57" cy="92" rx="4.4" ry="5.6" fill={INK} stroke="none" />
      <ellipse cx="83" cy="92" rx="4.4" ry="5.6" fill={INK} stroke="none" />
      <path d="M49 81 q8 -4 14 -1" strokeWidth="2.8" />
      <path d="M77 80 q8 -5 15 0" strokeWidth="2.8" />
      {/* A wide open smile. A closed curve reads polite; this one reads pleased to see you. */}
      <path d="M58 103 q12 16 24 0 z" fill={INK} stroke={INK} strokeWidth="2.6" />

      {/* ── BODY — an apron with sticks attached ────────────────────────────────────────────── */}
      {/* Sleeve outlines only, so the apron is the one filled shape and carries the colour. */}
      <path d="M56 126 L42 132 L36 146" />
      {/* The resting arm bends out to the elbow and back to the hip — the triangle silhouette that
          makes a stick figure look like it is standing rather than dangling. */}
      <path d="M40 140 L26 158 L46 168" />
      {/* Apron: bib, then a skirt that FLARES. A rectangle here read as a bin bag. */}
      <path d="M54 124 h32 v14 l10 7 L100 188 q0 9 -9 9 h-42 q-9 0 -9 -9 L44 145 l10 -7 z" fill={apron} />
      <path d="M54 126 L47 121 M86 126 L93 121" strokeWidth="2.8" />
      {/* Legs and dot shoes. Stick limbs are the charm of the reference — no calves, no laces, just
          a line and a full stop. */}
      <path d="M58 196 L55 226" />
      <path d="M84 196 L87 226" />
      <ellipse cx="50" cy="229" rx="10" ry="5" fill={INK} stroke="none" />
      <ellipse cx="92" cy="229" rx="10" ry="5" fill={INK} stroke="none" />

      {/* ── THE ARM THAT ACTS ───────────────────────────────────────────────────────────────── */}
      <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: '96px 136px',
                  transition: 'transform 620ms cubic-bezier(.34,1.3,.5,1)' }}>
        <path d="M84 126 L100 132 L108 141" />
        {/* Long enough that a RAISED hand clears the head. The first arm was drawn to human scale
            against a head drawn to doodle scale, so every lifted pose folded the hand onto the ear
            and read as a squiggle rather than a gesture. Limb length is set by the head here, not
            by anatomy. */}
        <path d="M96 136 L120 148 L136 161" />
        <circle cx="138" cy="164" r="6" fill="#fff" />
        {/* The piping bag only exists on the beat where a name is piped. A prop the character holds
            through four steps it is not using is set dressing; a prop that appears exactly when it
            is used is storytelling. */}
        {pose === 'pipe' && (
          <g>
            <path d="M136 158 l14 -12 q5 -4 5 2 l-6 17 q-2 6 -7 2 z" fill="#fff" strokeWidth="3" />
            <path d="M134 161 l-6 6" strokeWidth="2.8" />
          </g>
        )}
      </g>
    </svg>
  );
}
