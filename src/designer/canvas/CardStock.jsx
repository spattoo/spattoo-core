import { useMemo, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { TOPPER_FINISHES } from '../geometry/topperFinishes.js';
import { albedoForLight } from '../shared/albedoForLight.js';

/* ── What a card topper's sheet is MADE OF ────────────────────────────────────────────────────────
 *
 * One answer to "how does this piece of card look", asked by the composer AND by the cake
 * (INVARIANTS #15). They already disagreed about it in the cheapest possible way: both files carried
 * their own copy of `CARD_LIGHT` and `asRendered`, identical today and two numbers to keep in step
 * forever. A studio that is half a shade off the cake is the drift this invariant exists to stop,
 * and it is worse here than most, because the studio is where the colour is CHOSEN.
 *
 * ── PLAIN CARD ──────────────────────────────────────────────────────────────────────────────────
 *
 * Matte, lit by the scene, with the reference-light correction so the hex a baker picked is the hex
 * they see (INVARIANTS #16). No clearcoat: a coat lives on the environment map and ADDS light rather
 * than multiplying it, so no albedo correction can divide it back out — which is why the card cutout
 * studio dropped it too.
 *
 * ── METALLIC CARD ───────────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ BAKED, NOT LIT, and `topperMatcap.js` states the rule this follows: bake when a surface is flat
 * enough to mirror the environment wholesale. A cut card is the flattest thing in the whole scene —
 * flatter than the acrylic word that rule was written for, which at least had a letterform's depth —
 * so a lit metal here would show it one sheet of whatever `lebombo_256.hdr` happens to hold, and
 * every attempt to fix that by moving the scene's numbers moved every other metal on the cake with
 * it. A matcap needs no lights and no environment, so that coupling cannot come back.
 *
 * ⚠️ AND NO ALBEDO CORRECTION ON A METALLIC. The correction divides out a measured reference light,
 * and a matcap has no light to divide — it is already the finished appearance. Running gold through
 * `asRendered` would brighten a picture that is not a reflectance, which is how a gold ends up
 * looking like lemon.
 *
 * ⚠️ BUILT PER MESH AND DISPOSED WITH IT, deliberately not shared. A 128px canvas gradient costs
 * less than the bookkeeping to share one, and the last shared GPU resource in this corner was handed
 * out after something disposed it and rendered BLACK until a page refresh. Nothing is shared here,
 * so there is no cache, no ref-count and no disposal race.
 */

// Measured for this material under the designer's rig — see dev/card-colour.jsx and INVARIANTS #16.
// The studio is lit like the cake (INVARIANTS #17), so ONE reading serves both.
const CARD_LIGHT = Object.freeze([3.193, 2.940, 3.028]);

/** The colour a plain card sheet is drawn in, corrected for the rig. */
export const cardAlbedo = (hex) => albedoForLight(hex || '#FFFFFF', CARD_LIGHT, { rolloff: 6 });

/** Is this finish key one the card studio knows how to draw? Unknown or absent reads as plain card. */
export const isMetallicCard = (finish) => TOPPER_FINISHES[finish]?.medium === 'card';

/* ── How thick a sheet is, and whether its edge is chamfered ─────────────────────────────────────
 *
 * ⚠️ A METALLIC SHEET CARRIES A HAIRLINE CHAMFER ON ITS CUT EDGE, AND NOTHING ELSE. It is exactly
 * as thick as plain card, because it IS card.
 *
 * ⚠️ IT WAS TWO AND A HALF TIMES THICKER FOR ONE ROUND, and that is worth keeping written down. The
 * gloss was being chased through geometry at the time — a chamfer needs depth to sit on — and the
 * result was reported back as "this is like metal not metallic paper". Correct: a deep bevelled edge
 * is a piece cut from PLATE. Metallic card is foil laminated onto board, and its edge is a cut, not
 * a moulding. Once the gloss moved to the reflection it needed no thickness at all, so the thickness
 * went back to what a card is.
 *
 * The cause is that a cut card's face is PERFECTLY FLAT, and both ways of lighting a flat face give
 * it a single tone:
 *
 *   a matcap  is indexed by the surface NORMAL, and a flat face has one — so it samples one texel
 *   a lit metal is indexed by the REFLECTION, and under this scene's environment — a bright,
 *             largely featureless field — that is one sheet of pale gold
 *
 * Measured, rather than argued: with a lit metal at metalness 0.95 the digits came back rgb(244,
 * 226, 143), chroma 101, and a brightness spread across the piece of 0.037 — against the gold BOARD
 * in the same frame at chroma 149 and a spread of 0.219. Six times less variation. The board is not
 * better lit; it is CURVED, so it has a spread of normals and breaks the environment into bands.
 * `topperMatcap.js` says exactly this and says it is about geometry rather than material.
 *
 * The chamfer is what a guillotined edge does: a fine bright line all the way round every contour.
 * It is a real part of the look and it is NOT where the gloss comes from — that lesson cost a round.
 *
 * ⚠️ PLAIN CARD IS LEFT ALONE, unchamfered. Printed card has no shine to catch on its edge, and the
 * thickness of every topper already saved must not move.
 *
 * ⚠️ AND THE CHAMFER IS CAPPED BY THE PIECE, not just by the depth. `ExtrudeGeometry` walks the
 * outline inward by `bevelSize`, and a bevel wider than a thin feature — the counter of an "8", the
 * band of a ring — turns it inside out. Tied to the smaller of the depth and a fraction of the
 * piece's own size, so a big topper gets a proper edge and a small one still cuts cleanly.
 */
export function cardExtrude(depth, finish, pieceSize = 1) {
  if (!isMetallicCard(finish)) return { depth, bevelEnabled: false };
  /* ⚠️ A HAIRLINE, NOT A SLAB — AND IT USED TO BE A SLAB. The chamfer arrived when the gloss was
   * being chased through geometry, so the sheet was thickened two and a half times to give the
   * chamfer something to sit on. That worked and it made the wrong thing: reported as "this is like
   * metal not metallic paper". It was — a 3mm bevelled edge is a piece cut from PLATE, and metallic
   * card is foil laminated onto board. The gloss now comes from the reflection (see `cardEnvMap`),
   * which needs no thickness at all, so the thickness goes back to what a card actually is.
   *
   * The chamfer stays, at a hairline. A guillotined card really does carry a fine bright line along
   * its cut edge, and at this size it reads as the edge of a sheet rather than as a moulding. */
  const bevel = Math.min(depth * 0.28, pieceSize * 0.0025);
  return {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 1,
  };
}

/* How far a sheet's FRONT face sits in front of its extrusion origin.
 *
 * ⚠️ SHEETS ARE STACKED BY THEIR FRONT FACE, NOT THEIR BACK, and that only started to matter when
 * metallic sheets became thicker than plain ones. Layers are a third of a card thickness apart —
 * enough for the depth buffer, small enough that the finished topper is still one flat card — and
 * both renderers used to place each piece by its BACK, which is the same thing while every piece is
 * the same thickness and quietly wrong the moment one is not. A gold band is two and a half card
 * thicknesses deep against a plain word's one, so it would have come forward past the word it sits
 * behind and swallowed it: white lettering disappearing into its own outline. It does not show on
 * the rings preset, where every piece is gold; it shows on the commonest metallic topper there is, a
 * white word on a gold band. Stacked by the front, the extra depth goes BACKWARD, where nothing can
 * see it. */
export const cardFront = (cut) => cut.depth + (cut.bevelThickness ?? 0);

/* ── The room a metallic card reflects ───────────────────────────────────────────────────────────
 *
 * ⚠️ A METAL IS ITS REFLECTION, SO GLOSS IS A PROPERTY OF THE ROOM, NOT OF THE MATERIAL. This was
 * arrived at by exhausting the alternatives, and each one is worth keeping written down because each
 * looks like it should work:
 *
 *   a baked matcap      indexed by the surface NORMAL — a flat face has ONE, so it renders in one
 *                       flat tone however contrasty the picture behind it is
 *   a lit metal under   indexed by the REFLECTION, which is right — but `lebombo_256.hdr` is a
 *   `scene.environment` bright, largely featureless field, so a mirror has nothing but white to
 *                       show. Measured: chroma 101 and a brightness spread across the piece of
 *                       0.037, against the gold BOARD in the same frame at 149 and 0.219
 *   a chamfered edge    real, and only an EDGE: a bright rim a few pixels wide round a face that is
 *                       still one tone. Necessary, nowhere near sufficient
 *
 * `topperMatcap.js` reaches the same conclusion from the other side and states the fix: "the cause
 * that is left is the HDRI's own CONTENT ... The fix is a different environment map, not a different
 * number." This is that environment.
 *
 * ⚠️ THE STRUCTURE IS NEAR THE HORIZON, AND THAT IS THE WHOLE DESIGN. A topper STANDS, so its face
 * is vertical and it reflects sideways — into a band of the room a few degrees either side of level.
 * A small flat piece fans the view by perhaps ten degrees corner to corner, so anything smooth over
 * that span averages to one colour again. Hard bands there are what turn ten degrees of sweep into
 * light-to-dark ACROSS the piece, which is what a mirror-gold topper looks like in a photograph and
 * what a featureless sky can never give.
 *
 * ⚠️ AND IT IS BRIGHT BEHIND THE CAMERA. Face on, a mirror shows you what is behind you; a dark
 * ceiling there is why `metalness: 1` under the scene environment came out brown. A big soft source
 * on the viewer's side is how jewellery is lit in every catalogue, for the same reason.
 *
 * ⚠️ AND THE MAIN SOURCE IS BELOW LEVEL, NOT ABOVE IT, which is the opposite of the obvious guess
 * and cost a round of this. A cake is looked at from ABOVE. Reflect a downward view off a VERTICAL
 * face and the ray goes back out and DOWNWARD — so a standing topper shows you the floor behind the
 * viewer, not the ceiling. Lit ceiling-first, the piece measured luminance 105 against the gold
 * board's 164: a dark brown, which is exactly what it looked like. The bright band belongs where the
 * piece is actually looking.
 *
 * ⚠️ BUILT ONCE PER RENDERER AND NEVER DISPOSED — deliberately, and this is the failure it is
 * written against. A shared environment here once produced BLACK toppers after an add/remove/re-add,
 * because something disposed a texture other meshes were still holding. Keyed on the renderer in a
 * WeakMap and never freed, there is no ref-count to get wrong and no disposed texture to hand out:
 * it lives exactly as long as the GL context that can use it, and dies with it. It is one small
 * prefiltered map per canvas, which is a price worth paying to make that class of bug impossible.
 */
const ENV_BY_RENDERER = new WeakMap();

/* Bands of a room, as an equirectangular strip. Values are deliberately hard-edged: see above — a
   gradient is what the sky already was. Top to bottom is ceiling to floor. */
const ENV_STOPS = [
  /* ⚠️ RAMPS, NOT STEPS. Hard-edged bands gave the structure this needs and then showed it: mirrored
   * off the CURVED inner wall of a "0", the steps came back as visible stripes running round the
   * counter — a staircase, not a room. Every real edge in a room is a little soft, and the ramp
   * between two stops is what makes the difference between a highlight and a stripe. The structure
   * survives; only the staircase goes.
   *
   * ⚠️ THE MAIN SOURCE SITS BELOW LEVEL, and that is the opposite of the obvious guess. A cake is
   * looked at from ABOVE; reflect a downward view off a VERTICAL face and the ray goes back out and
   * DOWNWARD, so a standing topper shows you the floor behind the viewer rather than the ceiling.
   * Lit ceiling-first, the piece measured luminance 105 against the gold board's 164 — a dark brown,
   * which is exactly how it looked.
   *
   * ⚠️ AND IT IS BROKEN BY A DARK LINE, because one unbroken white band there is bright and FLAT:
   * luminance 196 with a spread of 0.117, which is a well-lit sticker rather than a metal. A real
   * room has a mullion, a shelf, an edge. The break has to fall INSIDE the few degrees a small flat
   * piece actually sweeps, or it is never seen at all.
   */
  /* ⚠️ THE DARKS HAVE A FLOOR, AND FINDING IT TOOK BOTH MISTAKES. Run down to #2E2E2E the piece went
   * BROWN at the angles that sampled them — the same complaint that started all this, arriving from
   * the other end; a gold in a real room is never brown, because a room bounces light back at it
   * from everywhere. Lifted to #909090 and above, it measured a spread of 0.001: one flat colour,
   * with no metal in it at all. The contrast that makes a metal read has to happen between BRIGHT
   * and MID, not between bright and unlit — a room is a room, not a void with a lamp in it. These
   * are the middle, and both failures are written down because each looked like the fix for the
   * other.
   *
   * ⚠️ AND A ONE-ANGLE MEASUREMENT WILL MISLEAD YOU HERE, which is how the flat version got as far
   * as it did. A mirror's spread depends entirely on where it is looked at from — the same piece
   * read 0.001 from one camera and far more from another. Judge a change from two camera positions
   * at least, and look for the piece staying GOLD at both rather than for one good number. */
  [1.00, '#EAEAEA'],   // ceiling
  [0.74, '#EAEAEA'],
  [0.64, '#8A8A8A'],   // a band above level — seen when a piece tips back
  [0.58, '#FFFFFF'],
  [0.50, '#FFFFFF'],
  [0.45, '#7C7C7C'],   // ⚠️ the break, inside the sweep
  [0.40, '#FFFFFF'],
  [0.30, '#FFFFFF'],   // the main source, below level, where a standing piece looks
  [0.22, '#828282'],
  [0.12, '#D2D2D2'],
  [0.00, '#565656'],   // the floor: mid, never black
];

function drawCardEnv(w = 512, h = 256) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, h);
  // v = 1 is the top of the image, so a stop's offset is 1 - v.
  for (const [v, colour] of ENV_STOPS) sky.addColorStop(Math.min(1, Math.max(0, 1 - v)), colour);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  /* One window, so the piece is not identical all the way round and turning the cake changes
     something. Soft-edged on purpose: a hard vertical edge reads as a seam. */
  const win = g.createLinearGradient(w * 0.18, 0, w * 0.46, 0);
  win.addColorStop(0, 'rgba(255,255,255,0)');
  win.addColorStop(0.5, 'rgba(255,255,255,0.75)');
  win.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = win;
  g.fillRect(w * 0.18, h * 0.22, w * 0.28, h * 0.5);
  return cv;
}

function cardEnvMap(gl) {
  if (!gl) return null;
  const held = ENV_BY_RENDERER.get(gl);
  if (held) return held;
  const src = new THREE.CanvasTexture(drawCardEnv());
  src.mapping = THREE.EquirectangularReflectionMapping;
  src.colorSpace = THREE.SRGBColorSpace;
  /* Prefiltered, because a standard material samples an environment by roughness and wants the mip
     chain that goes with it. The generator is disposed; what it produced is kept. */
  const pmrem = new THREE.PMREMGenerator(gl);
  const target = pmrem.fromEquirectangular(src);
  pmrem.dispose();
  src.dispose();
  ENV_BY_RENDERER.set(gl, target.texture);
  return target.texture;
}

/**
 * The material for one sheet of a card topper.
 *
 * Used as a mesh's child: `<mesh …><CardStock colour={c} finish={f} /></mesh>`.
 *
 * `finish` absent (or a key an admin has since withdrawn) falls back to plain card in `colour`,
 * rather than vanishing or rendering in a colour nobody chose — the same bargain `topperFinish()`
 * makes, and the reason a saved topper survives the finish list changing under it.
 */
export function CardStock({ colour, finish = null, selected = false }) {
  const metallic = isMetallicCard(finish);
  const { gl } = useThree();

  /* ⚠️ THE HOOK RUNS EITHER WAY and returns null for plain card. A hook under a condition is the
     thing `check:hooks` fails the build for, and a piece whose finish is cleared must not change how
     many hooks its mesh calls. */
  const envMap = useMemo(() => (metallic ? cardEnvMap(gl) : null), [metallic, gl]);

  if (metallic) {
    const f = TOPPER_FINISHES[finish];
    /* ⚠️ `metalness: 1` AND NOTHING ELSE HOLDING IT UP. A metal has no diffuse: it is its
     * reflection, tinted by its own colour. That was the reason this could not be done under the
     * scene's environment — face on, the reflected direction is BEHIND the camera, which in a field
     * of sky is nothing in particular, and the piece came out brown. `cardEnvMap` puts the bright
     * part of the room exactly there, which is also how anybody photographs jewellery.
     *
     * ⚠️ `roughness` LOW ENOUGH TO KEEP THE BANDS. Blur them away and the environment's structure —
     * the entire point of building one — averages back to a single tone, which is where this
     * started. 0.12 keeps the edges; much below it the bands turn into a hard mirror and the piece
     * starts showing seams where the chamfer meets the face. */
    return (
      <meshStandardMaterial
        color={f.color} metalness={1} roughness={0.16}
        envMap={envMap} envMapIntensity={1.45}
      />
    );
  }

  return (
    <meshStandardMaterial
      color={cardAlbedo(colour)}
      roughness={0.86}
      metalness={0}
      emissive={selected ? '#ffffff' : '#000000'}
      emissiveIntensity={selected ? 0.06 : 0}
    />
  );
}
