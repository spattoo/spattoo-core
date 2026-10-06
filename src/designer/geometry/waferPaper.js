import * as THREE from 'three';
import { mulberry32 } from '../utils/random.js';
import { perimeter } from './surface.js';
import { mergePenGeometries } from './creamPen.js';

/* ── Wafer paper, cut into panels and stood around the cake ───────────────────────────────────────
 *
 * The reference cakes: a fence of thin translucent sheets wrapped round the wall, each one cut from
 * a sheet of wafer paper, waved by hand, and pressed onto the buttercream along its top edge so the
 * bottom hangs free and splays outward. Four photographs, four dialects of the same technique —
 * crisp pink rectangles with a notched hem; tall white S-curves; dense rippled ribbons; broad
 * near-flat panels standing almost straight.
 *
 * ── HOW IT IS ACTUALLY MADE, WHICH IS WHAT THE PARAMETERS HAVE TO BE ─────────────────────────────
 * Wafer paper is about 0.3mm of dried starch. A baker cuts a sheet into strips with scissors or a
 * wheel, waves each strip over a finger or a dowel, and sticks it on at the TOP ONLY. It dries
 * holding that curve. So:
 *
 *   · the top edge is pinned to the wall and the bottom is free — every bend grows downward from a
 *     fixed line, which is why `splay` is quadratic in v and zero at the top;
 *   · the curve is in the PAPER, not in the placement — a piece bows across its own width (`curl`)
 *     and waves along its length (`wave`), and those are different gestures that a single "bend"
 *     control would weld together;
 *   · the hem is a CUT, so it is straight, angled, or notched — never rounded. Image 1's zigzag is
 *     scissors; images 2 and 3 are a wavy wheel; image 4 is a plain cut at varying heights.
 *
 * ⚠️ THIS IS NOT THE BRUSHSTROKE AND IT IS NOT A FINISH, and both were checked first.
 *   · `brushStrokeOnCake.js` seats a gesture ON the wall with relief — the paint IS the wall there.
 *     Wafer paper stands OFF it: the gap, and the light coming through it, is the whole look.
 *   · `PaletteKnifeStudio` wraps the wall in a tile. A tile cannot give one panel its own height,
 *     its own wave and its own hem, and the variation between panels is most of what reads as
 *     handmade here.
 *   · `festoon.js` already wraps a strip around the wall and is the right shape of idea — but it
 *     bends an authored GLB, and these panels are cut, not modelled. What is borrowed from it is
 *     the lesson in its header: THE WALL IS A PERIMETER, NOT A CIRCLE. Everything below walks
 *     `perimeter(shape)`, so a sheet cake and a heart get a skirt that follows their outline
 *     instead of a circle of panels hanging in mid-air.
 *
 * ⚠️ EVERYTHING IS × THE TIER, NEVER A WORLD CONSTANT (INVARIANTS #8). Widths and waves scale with
 * the radius, heights with the tier's own height, so one authored look suits a 6" and a 10".
 */

export const WAFER_DEFAULTS = {
  /* How many panels go round. Not a spacing, because the spacing that reads right depends on the
     perimeter and a baker thinks in "how many pieces", not in millimetres of gap. */
  /* ⚠️ SWEPT, NOT GUESSED. The first numbers (56 panels, width 1.3, splay 0.26) rendered a hula
     skirt: narrow straps with daylight between them and a flare at the hem. Four renders varying
     one thing at a time said the look wants FEWER, WIDER, more overlapped panels that hug the wall
     — which is also what the photographs show once you stop counting ribbons and start counting
     SHEETS. The ribbons in the references are fold lines, not pieces. */
  count: 34,
  width:  2.30,   // × the mean gap: >1 overlaps its neighbour, which is how every reference looks
  height: 0.95,   // × tier height, measured down from the top edge
  rise:   0.04,   // × tier height, how far the panel stands ABOVE the rim
  taper:  0.18,   // 0 … 1, narrowing toward the hem
  /* ⚠️ THE FOLDS ARE THE LOOK, AND THEY RUN TOP TO BOTTOM. See the note below — this was a
     sideways sway first, and it was the wrong gesture. */
  ripple:  0.28,  // depth of the concertina, × panel width
  ripples: 6.0,   // how many folds across the panel's width
  sway:   0.10,   // the secondary lateral drift down the panel, × width
  sways:  1.0,    // how many times it drifts
  curl:   0.22,   // bow ACROSS the width, × width — the cupping that catches light
  splay:  0.08,   // hem pushed away from the wall, × panel height — paper hugs, it does not flare
  lean:   0.04,   // whole panel tilted out from vertical, radians
  jitter: 0.35,   // 0 … 1, how much the panels differ from one another
  hem:    'straight',  // 'straight' | 'notch' | 'torn'
  notch:  0.10,   // × panel height, the depth of the zigzag when hem === 'notch'
  seed:   7,
  /* Mesh density. 10 × 14 is enough for a sheet this thin: the silhouette comes from the hem and
     the wave, and both are resolved long before the surface is. */
  segW:   10,
  segH:   14,
};

/* The hem, as a fraction of the panel height at each column across the width.
 * 1 = the full drop. Straight is flat; notch is scissors; torn is a cut nobody measured. */
function hemProfile(kind, u01, notch, rnd) {
  if (kind === 'notch') {
    // A zigzag with two teeth across the panel — image 1's hem, which is cut, so it is linear.
    const t = Math.abs(((u01 * 2) % 1) * 2 - 1);
    return 1 - notch * t;
  }
  if (kind === 'torn') return 1 - notch * rnd;
  return 1;
}

/**
 * ONE panel, in its own space: the top edge lies along X, the panel hangs down −Y, and +Z is
 * outward from the cake. The top edge sits at y = 0, so a caller positions by the pinned edge —
 * the only part of a real panel whose position is known.
 */
export function waferPanel({
  width = 1, height = 1, taper = WAFER_DEFAULTS.taper,
  ripple = WAFER_DEFAULTS.ripple, ripples = WAFER_DEFAULTS.ripples,
  sway = WAFER_DEFAULTS.sway, sways = WAFER_DEFAULTS.sways, phase = 0,
  curl = WAFER_DEFAULTS.curl, splay = WAFER_DEFAULTS.splay,
  hem = WAFER_DEFAULTS.hem, notch = WAFER_DEFAULTS.notch,
  segW = WAFER_DEFAULTS.segW, segH = WAFER_DEFAULTS.segH, rng = Math.random,
} = {}) {
  const cols = Math.max(2, segW | 0) + 1;
  const rows = Math.max(2, segH | 0) + 1;
  const pos = new Float32Array(cols * rows * 3);
  const uv  = new Float32Array(cols * rows * 2);

  // One random number per COLUMN for a torn hem, drawn once: drawing inside the vertex loop would
  // give every row of the same column a different tear and shred the panel into noise.
  const tear = Array.from({ length: cols }, () => rng());

  let p = 0, t = 0;
  for (let j = 0; j < rows; j++) {
    const v = j / (rows - 1);                       // 0 at the pinned top edge, 1 at the hem
    for (let i = 0; i < cols; i++) {
      const u01 = i / (cols - 1);                   // 0 … 1 across the width
      const drop = hemProfile(hem, u01, notch, tear[i]);
      const vv = v * drop;                          // this column's own share of the drop
      const w  = width * (1 - taper * vv);          // the panel narrows as it falls
      const u  = (u01 - 0.5) * w;

      /* ── THE CONCERTINA, which is the whole look ─────────────────────────────────────────────
       * A baker does not bend the strip like a snake; they PLEAT it, running the folds from the
       * top edge to the hem. That is why every reference reads as a curtain of narrow vertical
       * ribbons even though each piece is a wide rectangle: the fold lines are the ribbons.
       *
       * ⚠️ THIS WAS A SIDEWAYS SWAY IN THE FIRST VERSION AND IT WAS THE WRONG GESTURE. Displacing
       * the panel left and right as it descends makes a broad sheet with a diagonal twist in it,
       * which is what the first render showed — no vertical structure anywhere, and nothing that
       * looked like paper that had been handled. The fold is `sin` ACROSS the width (u), not along
       * the drop (v). Same amplitude, same code, a completely different cake.
       *
       * It `settles` toward the hem rather than running at full depth: a pleat is pinched at the
       * glued top edge and opens as it hangs, which is also what stops the folds from reading as
       * machine corrugation. */
      const open  = 0.35 + 0.65 * vv;
      const fold  = ripple * width * open * Math.sin(phase + u01 * ripples * Math.PI * 2);
      // The secondary drift: the whole panel leans a little left or right as it falls. Small, and
      // SECONDARY — it is what keeps a wall of pleats from looking stamped, not the shape itself.
      const drift = sway * width * Math.sin(phase * 0.7 + vv * sways * Math.PI * 2);
      // The bow is across the WIDTH: a parabola, zero at the centre, so the two long edges lift
      // toward the viewer and the middle stays back. This is what gives a flat sheet a highlight.
      const bow  = curl * width * (Math.pow((u01 - 0.5) * 2, 2) - 1 / 3);
      // The hem swings away from the wall. Quadratic, so the pinned top edge does not move at all:
      // a linear term there would lift the panel off the buttercream it is stuck to.
      const out  = splay * height * vv * vv;

      pos[p++] = u + drift;
      pos[p++] = -height * vv;
      pos[p++] = bow + out + fold;
      uv[t++] = u01;
      uv[t++] = 1 - vv;
    }
  }

  const idx = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * The whole skirt: panels walked round the tier's own perimeter.
 *
 * `shape` is tierShape()'s output, so round, rect, heart and glyph all work — see the note above
 * about why this walks a perimeter rather than a circle.
 *
 * Returns one merged geometry in CAKE space, with y = 0 at the tier's top edge, so the caller
 * positions it by the rim rather than by the floor.
 */
export function buildWaferSkirt({ shape, tierHeight = 1, radius = 1, ...opts } = {}) {
  const o = { ...WAFER_DEFAULTS, ...opts };
  const perim = perimeter(shape ?? { kind: 'round', radius });
  if (!perim?.length) return null;

  const n = Math.max(1, o.count | 0);
  const gap = perim.length / n;                 // the arc each panel owns
  const w   = gap * o.width;                    // > gap means it overlaps its neighbours
  const h   = tierHeight * o.height;
  const rnd = mulberry32((o.seed | 0) >>> 0);
  const j   = Math.max(0, Math.min(1, o.jitter));

  // ± a fraction of the value, so jitter=0 is "every panel identical" and the knob is linear.
  const vary = (base, amount = 1) => base * (1 + (rnd() * 2 - 1) * j * amount);

  const out = [];
  for (let k = 0; k < n; k++) {
    const s = (k + 0.5) * gap;
    const at = perim.at(s);
    const panel = waferPanel({
      width: vary(w, 0.35), height: vary(h, 0.25), taper: o.taper,
      ripple: vary(o.ripple, 0.5), ripples: vary(o.ripples, 0.35),
      sway: vary(o.sway, 0.7), sways: vary(o.sways, 0.4), phase: rnd() * Math.PI * 2,
      curl: vary(o.curl, 0.5), splay: vary(o.splay, 0.5),
      hem: o.hem, notch: o.notch, segW: o.segW, segH: o.segH, rng: rnd,
    });

    /* Stand it on the wall. The panel's +Z must become the perimeter's OUTWARD normal, so the
       rotation is the angle of that normal — taken from the normal itself rather than from the
       angle round a circle, which is the move that makes a sheet cake work (festoon.js's lesson:
       on a rect wall the normal is constant along a face and turns only at the corners). */
    const m = new THREE.Matrix4();
    const yaw = Math.atan2(at.nx, at.nz);
    m.makeRotationY(yaw);
    // Lean the panel out from the wall, about its own pinned top edge.
    m.multiply(new THREE.Matrix4().makeRotationX(-vary(o.lean, 1)));
    m.setPosition(at.x, tierHeight * o.rise, at.z);
    panel.applyMatrix4(m);
    out.push(panel);
  }

  const merged = mergePenGeometries(out);
  if (merged) merged.computeVertexNormals();
  return merged;
}
