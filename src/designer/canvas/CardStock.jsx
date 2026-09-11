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
