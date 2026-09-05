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
const LOOKS = {
  gold:   { base: [168, 128, 32], sheen: [255, 240, 186], rim: [92, 62, 12],  tight: 0.55, spec: 0.95 },
  silver: { base: [176, 182, 190], sheen: [255, 255, 255], rim: [78, 86, 96],  tight: 0.55, spec: 0.95 },
  rose:   { base: [198, 138, 120], sheen: [255, 226, 214], rim: [104, 60, 48], tight: 0.55, spec: 0.90 },
  black:  { base: [26, 26, 28],   sheen: [236, 236, 240], rim: [6, 6, 8],     tight: 0.80, spec: 0.75 },
  white:  { base: [232, 230, 226], sheen: [255, 255, 255], rim: [150, 148, 144], tight: 0.80, spec: 0.55 },
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
