import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { drawTopperMatcap } from '../geometry/topperMatcap.js';
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
 * ⚠️ A METALLIC SHEET IS THICKER AND ITS EDGE IS CHAMFERED, and that is the whole of what makes it
 * look GLOSSY rather than drawn. Reported from the app: "not as glossy as my reference", and "the
 * ring is just an outline of a ring" — which is one complaint, not two.
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
 * So the gloss has to be geometry, and a real one has it: a topper is cut from 3mm acrylic or from
 * board, and the cut EDGE catches the light all the way round every contour. That edge was being
 * thrown away — the sheets extruded at about 1.2% of their width with `bevelEnabled: false`, which
 * is a foil, not a card. A metallic sheet is now about 3% (a real 3mm on a real 100mm piece) with a
 * chamfer of half of it, so every contour carries a bright rim that turns with the cake.
 *
 * ⚠️ PLAIN CARD IS LEFT ALONE, thin and unchamfered. Printed card IS a foil-thin matte thing, it has
 * no shine to catch, and thickening it would move every topper already saved.
 *
 * ⚠️ AND THE CHAMFER IS CAPPED BY THE PIECE, not just by the depth. `ExtrudeGeometry` walks the
 * outline inward by `bevelSize`, and a bevel wider than a thin feature — the counter of an "8", the
 * band of a ring — turns it inside out. Tied to the smaller of the depth and a fraction of the
 * piece's own size, so a big topper gets a proper edge and a small one still cuts cleanly.
 */
export function cardExtrude(depth, finish, pieceSize = 1) {
  if (!isMetallicCard(finish)) return { depth, bevelEnabled: false };
  const thick = depth * 2.5;
  const bevel = Math.min(thick * 0.5, pieceSize * 0.012);
  return {
    depth: thick,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 2,
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

  /* ⚠️ THE HOOK RUNS EITHER WAY and returns null for plain card. A hook under a condition is the
     thing `check:hooks` fails the build for, and a piece whose finish is cleared must not change how
     many hooks its mesh calls. */
  const matcap = useMemo(() => {
    if (!metallic) return null;
    const t = new THREE.CanvasTexture(drawTopperMatcap(finish));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [metallic, finish]);
  useEffect(() => () => matcap?.dispose(), [matcap]);

  if (matcap) return <meshMatcapMaterial matcap={matcap} />;

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
