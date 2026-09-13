// ── The topper's finish, BAKED ───────────────────────────────────────────────────────────────────
//
// A matcap is a picture of a sphere wearing the material, and the renderer reads it by surface
// normal. It encodes the whole response — head-on, glancing, and everything between — so the
// material needs no lights and no environment at all.
//
// ⚠️ WHY THIS INSTEAD OF LIGHTING THE TOPPER PROPERLY. Because the topper never reflected the cake.
// It reflected `lebombo_256.hdr`, a stock photograph of a field, and the entire cost of that was
// paid in coupling: a flat mirror letterform and a curved faux ball draw from the SAME
// `scene.environment` and want opposite things from it. Dimming the scene to stop the lettering
// washing out turned the faux balls matte; giving the topper its own env map introduced a shared
// PMREM whose disposal produced BLACK toppers after an add/remove/re-add. Both were real fixes for
// the symptom and both created a new problem, because the coupling was the problem.
//
// A finish is a DESIGN DECISION anyway — a baker picks "Mirror gold" from a list, they are not
// simulating an alloy. Baking it makes the code say what the product already says: this is what
// mirror gold looks like, on every device, deterministically.
//
// ⚠️ AND IT IS BUILT PER COMPONENT, ON PURPOSE, NOT SHARED. A 128px canvas gradient costs less than
// the bookkeeping to share one. The previous attempt cached a PMREM texture across mounts and served
// it after something had disposed it — black lettering until a page refresh. Nothing is shared here,
// so there is no cache, no ref-count, no disposal race, and that failure cannot recur.
//
// What this gives up, stated plainly: the topper no longer responds to the scene at all. A dark cake
// will not darken it. For flat lettering lying on a cake that is the right call — it never responded
// to the CAKE anyway, only to a field in Lebombo — but if a finish is ever wanted that picks up its
// surroundings, this is the wrong tool and it should not be bent into it.

// ⚠️ DO NOT SPREAD THIS TO THE OTHER METALS "FOR CONSISTENCY" — they do not have the problem, and
// the reason is geometry, not material. Age numbers run at metalness 0.95 against this element's
// 0.70 — MORE mirror-like — and faux balls are polished spheres, yet both read correctly under the
// scene environment and were confirmed fine in the app. What they have that the topper lacks is a
// spread of surface NORMALS: a chamfered bevel and a sphere break the environment into bands, which
// is what reads as metal. The acrylic word is the one near-flat, near-mirror face in the scene, so
// it showed an open sky as a single sheet of white.
//
// So the rule is about FLATNESS, not metalness or finish: bake when a surface is flat enough to
// mirror the environment wholesale, and leave lit materials alone everywhere else. Baking a bevelled
// or curved element would cost it the environment response it is currently using well, for no gain.

/* Each finish as the few facts a matcap needs: the body colour, the colour of its bright band, and
 * how tight that band is. ⚠️ These are the AUTHORED look, not measurements — that is the point of
 * baking. Tuned against the previous environment-lit gold so the change reads as the same product. */
/* ⚠️ THE BODY COLOUR IS THE DARK THE HIGHLIGHT IS SEEN AGAINST, which is why the three metals are
 * far darker here than the gold, silver and rose anyone would name. A letter is a FLAT face: it takes
 * one normal, so it samples ONE texel of this picture and renders as a single colour. Whatever
 * variation the piece shows comes from its CHAMFER, and a bright edge only reads if the face behind
 * it is darker. Set the body to the colour of the metal itself and the edge has nothing to be bright
 * against — which is what "dull" meant when it was reported from the app on 2026-09-09.
 *
 * ⚠️ AND THIS IS MEASURED, NOT PREFERRED. `black` was already right and nobody had complained about
 * it: it reads 0.368 relative contrast where gold read 0.148, and the only thing it does differently
 * is start from a dark body. Darkening the metals to ~2/3 moved them the same way, each measured
 * separately rather than by spreading gold's number across the table:
 *
 *     finish   was     now      (relative contrast, scripts/measure-topper-glare.mjs)
 *     gold     0.148   0.191
 *     silver   0.131   0.169
 *     rose     0.132   0.174
 *     black    0.368   0.368    unchanged — it already had this
 *     white    0.083   0.083    unchanged — a white topper IS pale, and darkening it would make
 *                               it grey rather than white. Low contrast is correct here.
 *     ⚠️ These are re-taken WITHOUT the chamfer. The first set was measured with a bevel on the
 *     letters that has since been reverted, so every figure in it — before and after — described a
 *     geometry that does not ship.
 *
 * ⚠️ THERE IS NO GEOMETRY HALF. A chamfer on the letters was shipped alongside the body colours and
 * then reverted, because it measured identical: brightness spread across seven turning angles 28.3
 * either way, contrast within the piece 0.595 chamfered against 0.605 flat, and WORSE head-on (0.123
 * → 0.090 at a low camera). A matcap is sampled by the normal in VIEW space, and a chamfer's normals
 * turn with the piece — they slide across the same picture together with the face.
 *
 * ── AND A SECOND HALF THAT THE BODY COLOUR DID NOT COVER: A METAL TINTS ITS OWN REFLECTION ───────
 *
 * Reported from the app 2026-09-10: "its front view is dull, other angle view is better". Both
 * screenshots were the same piece; only the camera HEIGHT differed. That is not a lighting bug, it
 * is how a matcap works — the eye's height decides which part of this picture a flat letter shows —
 * but it is also the clue, because it says the head-on look is decided by ONE texel, and which texel
 * is not the one you would guess.
 *
 * A letter standing on the cake WALL is tilted away from the eye, so head-on it does NOT sample the
 * centre. It samples the ring at about 0.4 radius — and that ring was `sheen`, which was
 * [255, 240, 186]. A near-white cream. So the lettering rendered rgb(201, 186, 136), chroma 65: not
 * dark, WASHED OUT, which is what "dull" meant.
 *
 * ⚠️ That value was silver's highlight on a gold object. A metal has no white specular: it colours
 * what it reflects, which is why gold looks gold in its highlights and not just in its shadows. With
 * the sheen tinted to [255, 180, 55] the same lettering renders rgb(203, 156, 48), chroma 155 —
 * against the gold BOARD, the metal in the same frame nobody has ever called dull, at rgb(203, 164,
 * 55), chroma 148. It lands on the reference rather than near it.
 *
 * Only `gold` and `rose` changed, and the rule says which: silver's reflection genuinely IS neutral,
 * and black and white acrylic are DIELECTRICS — their highlight is the colour of the light, so white
 * is correct there. Do not "make the others consistent".
 *
 * ⚠️ AND STOP MEASURING A FLAT FACE WITH CONTRAST. p95−p5 over the mean is the right metric for a
 * curved or bevelled surface and the wrong one here: the face is ONE colour, so nearly all of that
 * spread is the letters' antialiased EDGES against the cake. It is why three visibly different
 * matcaps returned 0.190 to the digit. Measure the FACE COLOUR and its chroma — the harness's
 * `?cam=` sweep plus a median over the piece's pixels, which is what found this.
 *
 * ⚠️ WHAT STILL IS NOT FIXED, and cannot be from here: the word changes brightness AS A BLOCK
 * through a turn, 111 to 196. One normal, one texel, every pixel moving together. Only a surface
 * that responds to the scene fixes that, which is what baking deliberately gave up.
 */
const LOOKS = {
  gold:   { base: [112, 84, 20],  sheen: [255, 180, 55],  rim: [92, 62, 12],  tight: 0.55, spec: 0.95 },
  silver: { base: [117, 121, 127], sheen: [255, 255, 255], rim: [78, 86, 96],  tight: 0.55, spec: 0.95 },
  rose:   { base: [132, 92, 80],  sheen: [255, 176, 150], rim: [104, 60, 48], tight: 0.55, spec: 0.90 },
  black:  { base: [26, 26, 28],   sheen: [236, 236, 240], rim: [6, 6, 8],     tight: 0.80, spec: 0.75 },
  white:  { base: [232, 230, 226], sheen: [255, 255, 255], rim: [150, 148, 144], tight: 0.80, spec: 0.55 },

  /* ── Metallic CARD ────────────────────────────────────────────────────────────────────────────
   *
   * ⚠️ SATIN, NOT MIRROR, and that is the whole difference from the three above. These are a foil
   * laminated onto board: it scatters. So the body is LIGHTER than mirror acrylic's (a satin metal's
   * dark is not as dark), the bright band is WIDER and softer, and `spec` is well down — a card has
   * a sheen, not a hard highlight. Reusing the acrylic golds here would have put a mirror finish on
   * a paper cut-out, which is the tell that a render borrowed whatever gold was lying about.
   *
   * ⚠️ THE SHEEN IS STILL TINTED, because that lesson is about metals and not about acrylic: a metal
   * has no white specular, it COLOURS what it reflects. See the long note above — a silver highlight
   * on a gold object is what "dull" meant when it was reported, and a satin gold washes out the same
   * way for the same reason.
   *
   * ⚠️ AND A CARD TOPPER'S FACE IS PERFECTLY FLAT — no chamfer at all, unlike the acrylic word's
   * geometry. So it samples ONE texel and renders as ONE colour, changing as the cake turns. That is
   * not a shortcoming here; it is what a flat sheet of metallic card actually does in the hand — a
   * single tone head-on that flashes when you tilt it. The trade the note above calls a trade is,
   * for this material, the behaviour.
   *
   * ⚠️ WHICH IS EXACTLY WHY THESE CANNOT BE AS CONTRASTY AS THE ACRYLIC LOOKS ABOVE, and the first
   * attempt here was. Copying mirror gold's deliberately dark body gave a topper that read GOLD on
   * the cake and DARK OLIVE in the studio — and it is one material, so that is INVARIANTS #15
   * failing in the worst place there is, the screen where the card is chosen. The cause is the
   * flatness: the STUDIO looks dead-on through an orthographic camera, so the face normal points
   * straight at it and samples the matcap's CENTRE — the dark body. On the cake the same card is
   * tilted away and samples the bright ring instead. A dark body is right for a chamfered piece,
   * whose bright edge needs something to be bright against; a flat card has no edge to read, so the
   * body IS the colour, and the picture has to be flatter. Which is also what satin means.
   *
   * ⚠️ AND SINCE 2026-09-11 THESE THREE DRAW THE SWATCH AND THE RAIL ICON, NOT THE PIECE. The card
   * finishes are rendered in 3D as a real mirror against a built environment — see
   * `canvas/CardStock.jsx`, which sets out why a baked picture could never look glossy on a face as
   * flat as a cut card. What is left here is the 2D job: the chip in the Card control and the fill
   * of a metallic path in a preset's icon, both of which are pictures rather than surfaces and
   * neither of which has a reflection to show.
   *
   * ⚠️ SO THEY ARE TUNED TO WHAT THE RENDER MEASURES, and they have to be: a swatch that promises a
   * gold the cake does not deliver is the thing INVARIANTS #14 is about. The hue cannot drift — both
   * sides take `TOPPER_FINISHES[key].color` as their starting point — but the brightness can, and
   * did: these were set against the old flat gold at rgb(200, 164, 57), while the mirror measures
   * rgb(224, 200, 82) on the cake. Re-matched. Re-measure if the environment moves. */
  card_gold:   { base: [212, 186, 74],  sheen: [255, 232, 140], rim: [140, 108, 34], tight: 0.64, spec: 0.34 },
  card_silver: { base: [206, 210, 215], sheen: [255, 255, 255], rim: [134, 140, 148], tight: 0.64, spec: 0.34 },
  card_rose:   { base: [216, 168, 148], sheen: [255, 214, 194], rim: [146, 100, 84],  tight: 0.64, spec: 0.34 },
};

const rgb = ([r, g, b], a = 1) => `rgba(${r}, ${g}, ${b}, ${a})`;

/**
 * Draw the matcap for a finish onto a canvas and return it.
 *
 * finish  a key of LOOKS; anything unknown falls back to gold, matching `topperFinish()` — an
 *         element carrying a finish an admin has withdrawn still renders rather than vanishing.
 *
 * Returns an HTMLCanvasElement; the caller wraps it in a CanvasTexture and owns its lifetime.
 */
export function drawTopperMatcap(finish, size = 128) {
  const look = LOOKS[finish] ?? LOOKS.gold;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const c = size / 2;

  /* The body: centre is the normal facing the camera, the edge is a normal turned 90° away. A metal
     darkens toward that edge and carries a bright band before it — that band IS what reads as metal,
     and it is why a uniform fill looks like plastic. */
  const body = g.createRadialGradient(c, c, 0, c, c, c);
  body.addColorStop(0, rgb(look.base));
  body.addColorStop(look.tight, rgb(look.sheen, 0.55));
  body.addColorStop(0.86, rgb(look.base));
  body.addColorStop(1, rgb(look.rim));
  g.fillStyle = body;
  g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();

  /* A key light, up and slightly left — the convention every matcap follows, and the reason a
     letterform reads as raised rather than as a flat sticker. Offset, not centred: a highlight in
     the middle makes every surface look like it faces a lamp head-on. */
  const kx = c * 0.62, ky = c * 0.52;
  const key = g.createRadialGradient(kx, ky, 0, kx, ky, c * 0.72);
  key.addColorStop(0, rgb(look.sheen, look.spec));
  key.addColorStop(0.45, rgb(look.sheen, look.spec * 0.28));
  key.addColorStop(1, rgb(look.sheen, 0));
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = key;
  g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();

  /* A dim fill from below-right keeps the shadow side from going dead — a real object sits in a room
     that bounces light back at it, and without this the unlit half reads as a hole. */
  const bx = c * 1.42, by = c * 1.52;
  const bounce = g.createRadialGradient(bx, by, 0, bx, by, c * 0.9);
  bounce.addColorStop(0, rgb(look.sheen, look.spec * 0.20));
  bounce.addColorStop(1, rgb(look.sheen, 0));
  g.fillStyle = bounce;
  g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'source-over';

  return cv;
}

export const TOPPER_MATCAP_FINISHES = Object.keys(LOOKS);
