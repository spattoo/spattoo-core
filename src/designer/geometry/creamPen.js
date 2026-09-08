import * as THREE from 'three';

// ── Cream Pen (freehand piping) geometry ─────────────────────────────────────
// Ported from the admin prototype (FreehandPenStudio). LINE style only — the shell
// and rosette styles were dropped (they didn't read well). A stroke is the nozzle's
// cross-section profile swept along a centerline: a round tip gives a smooth rope, an
// open star gives a ribbed rope with grooves down its length, French gives fine ribs.
//
// IMPORTANT: the points handed to buildPipingStroke are the SEATED centerline already —
// the draw layer offsets each pointer hit along the surface normal (by the rope radius)
// at capture time, so the cream rests on the cake. This module is pure geometry: it just
// sweeps the profile through the stored points. That keeps design.piping a plain list of
// [x,y,z] points that fully determines the mesh on reload.

// A piping tip is a CROSS-SECTION at unit radius (max reach = 1); thickness scales it.
//
// Real cream ribs are PUFFY ROUNDED LOBES, not sharp spikes — a star nozzle squeezes the
// cream into smooth ridges with rounded tops and rounded valleys. We build the cross-section
// from a cosine so the radius eases between ridge (r = 1) and valley (r = 1 - depth) instead
// of the old straight-line star (which swept into a hard-edged gear). `lobes` = rib count,
// `depth` = groove depth (0 = round … higher = deeper grooves). Sampled densely so the
// rounded ribs read smoothly once normals are computed.
function lobedProfile(lobes, depth, pts = lobes * 8) {
  const out = [];
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const r = 1 - depth * 0.5 * (1 - Math.cos(lobes * a)); // ridge=1 at peaks, 1-depth in valleys
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}
function roundProfile(n) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push([Math.cos(a), Math.sin(a)]); }
  return out;
}

/* ── A PETAL APERTURE, which is not a radius ─────────────────────────────────────────────────────
 *
 * ⚠️ EVERY PROFILE ABOVE IS r(theta) — a radius swept round a centre. That covers every ROPE tip
 * (round, star, French) and it cannot express a petal tip at all. A #104 is a SLIT: a teardrop,
 * thick and rounded at one end, tapering to almost nothing at the other. There is no centre and no
 * radius; it is just a closed shape.
 *
 * That difference is the whole reason buttercream flowers exist. A rope tip makes the same rope
 * whichever way you hold it, so nobody has ever had to care which way up it was. A petal tip makes a
 * RIBBON, and which way up you hold it — and how you turn your wrist through the stroke — is the
 * entire technique. See the `up` frame in pushSweep.
 *
 * Local axes, and they matter:
 *   y  -1 = the WIDE end (rests on the surface / points at the flower's centre)
 *      +1 = the THIN end (stands away, and is what gives a petal its feathered edge)
 *   x  across the slit — the sheet's thickness, fat at the base and vanishing at the tip
 */
function petalProfile(n = 36) {
  const side = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;                                   // 0 at the wide end, 1 at the thin one
    // Fat and rounded at the base, easing away to a hair at the tip. The floor keeps it a solid
    // rather than a zero-thickness sheet, which would shade like paper and z-fight against itself.
    const w = 0.40 * Math.pow(1 - t, 0.65) + 0.022;
    side.push([w, -1 + 2 * t]);
  }
  return [...side, ...side.map(([x, y]) => [-x, y]).reverse()];
}

// Per-nozzle character:
//   twist/ruffle (0..1) scale the global spiral + squeeze rhythm below — a round writing tip
//     wants neither (clean rope); star tips want both for a hand-piped look.
//   thickness (optional) — the tip's natural rope radius, applied when you pick it; lets a
//     fat bead tip read differently from a fine French even though both are "just" a profile.
// lobes/depth tuned to the real tips: 1M open star, deep 8-point closed star (the classic
// ruffled rope), fine French flutes, plus the Phase-1 additions (bead, drop, jumbo, fine).
export const NOZZLES = [
  { key: 'round',  label: 'Round',       hint: 'Writing / smooth rope',     profile: roundProfile(20),      twist: 0,   ruffle: 0   },
  { key: 'bead',   label: 'Bead',        hint: 'Fat smooth bead / outline', profile: roundProfile(24),      twist: 0,   ruffle: 0,   thickness: 0.05 },
  { key: 'star5',  label: 'Open Star',   hint: '1M — the classic',          profile: lobedProfile(5,  0.50), twist: 1,   ruffle: 1   },
  { key: 'star6',  label: '6-Star',      hint: 'Tighter ribs',              profile: lobedProfile(6,  0.52), twist: 1,   ruffle: 1   },
  { key: 'drop',   label: 'Drop-Star',   hint: 'Dense drop-flower rope',    profile: lobedProfile(12, 0.42), twist: 1,   ruffle: 1,   thickness: 0.038 },
  { key: 'closed', label: 'Closed Star', hint: 'Deep ruffled rope',         profile: lobedProfile(8,  0.62), twist: 1,   ruffle: 1   },
  { key: 'jumbo',  label: 'Jumbo Star',  hint: 'Bold chunky grooves',       profile: lobedProfile(6,  0.72), twist: 1,   ruffle: 1,   thickness: 0.055 },
  { key: 'french', label: 'French',      hint: 'Fine fluted ribs',          profile: lobedProfile(16, 0.26), twist: 0.6, ruffle: 0.6 },
  { key: 'fine',   label: 'Fine French', hint: 'Silky many-rib flutes',     profile: lobedProfile(26, 0.18), twist: 0.5, ruffle: 0.5, thickness: 0.024 },
  /* ⚠️ `flat` is the flag that changes the FRAME, not the profile. A petal tip only means anything
   * if it is held at a known attitude — wide end down, slit square to the direction of travel — so
   * this nozzle asks pushSweep for a fixed-up frame instead of the rotation-minimising one every
   * rope uses. Twist and ruffle are off: corrugating a ribbon reads as crimped foil, not cream.
   * Thicker by default because a petal is a decoration in its own right, not a line. */
  { key: 'petal',  label: 'Petal 104',  hint: 'Roses, ruffles — a slit, wide end down',
    profile: petalProfile(), twist: 0, ruffle: 0, thickness: 0.10, flat: true },
];
export const NOZZLE_BY_KEY = Object.fromEntries(NOZZLES.map(n => [n.key, n]));
export const DEFAULT_NOZZLE = 'star5';

/* ── How alive the rope looks ────────────────────────────────────────────────────────────────────
 *
 * ⚠️ THE OLD NUMBERS MADE IT LOOK LIKE TWISTED CORD, and the reason is worth stating because it is
 * the whole difference between piped cream and extruded plastic:
 *
 *   ALL THE VARIATION WAS HIGH-FREQUENCY AND PERFECTLY PERIODIC, AND THERE WAS NONE OF THE OTHER
 *   KIND. Hand-piped cream is the opposite. It varies SLOWLY and UNEVENLY along a stroke, and its
 *   surface texture is comparatively calm. Regular periodic detail is the visual signature of a
 *   machine, which is exactly what a baker reported seeing.
 *
 * Measured on a stroke twenty diameters long, which is an ordinary one:
 *   twist 0.16/dia  -> 3.2 full turns of the ribs. A barber pole.
 *   ruffle 0.85/dia -> ~17 identical ripples at ±6%. A regular knurl.
 *   radius constant -> dead uniform width, end to end, which no hand can produce.
 *
 * A real star tip's ribs run essentially STRAIGHT unless the wrist turns, so the twist is now a
 * hint rather than a spiral; the swell is slow and irregular; and the width comes from the drag.
 *
 * Every number here is a FEEL, not a fact, so they live in one object an admin studio can drive —
 * see FreehandPenStudio. `speedWidth: 0` restores the old dead-constant rope exactly.
 */
export const PEN_FEEL = Object.freeze({
  /* How much the drag's own speed shapes the rope. See widthAlong: this is the single biggest cue,
   * and it costs nothing — the signal is already in the stored points. */
  speedWidth: 1,
  widthMin:   0.72,   // clamps, because a stalled pointer would otherwise balloon
  widthMax:   1.55,
  /* Ribs corkscrew a LITTLE as cream extrudes — not 0.16 of a turn per diameter, which is a rope. */
  twistTurnsPerDia: 0.03,
  /* One lazy swell every ~8 diameters instead of one ripple per diameter, and irregular: two
   * incommensurate waves, so the rhythm never repeats. Deterministic — no random, because a stroke
   * must rebuild identically on reload. */
  swellAmp:    0.085,
  swellPerDia: 0.13,
  /* The lift-off. Release pressure and draw away and the bead thins to a point; both ends used to
   * be the same rounded nub, which is a strong tell. */
  tailDias: 1.3,
  tailEnd:  0.32,
  /* ⚠️ SLIT TIPS ONLY — the angle the bag is held at. A rope tip's roll is invisible, so this does
   * nothing to one. For a petal it is the technique: held upright the ribbon stands on its edge and
   * reads as a loop of tape, and leaning it away from the flower's centre is what lays the sheet
   * over so it cups. Every reference photo of a piped rose is a bag held at an angle. */
  leanDeg: 40,
});

/* Rope radius along the stroke, from how fast the hand was moving.
 *
 * ⚠️ PHYSICS, NOT A TUNING. At a steady squeeze the flow Q is constant, so the cross-section area
 * A = Q/v and the radius goes as v^-1/2. That exponent is derived, not picked, which is why this
 * reads as cream rather than as a wobble effect.
 *
 * ⚠️ AND THE SPEED IS ALREADY IN THE FILE. Capture uses getCoalescedEvents(), which samples at a
 * roughly fixed RATE, so the SPACING between stored points is the speed: points close together mean
 * a slow hand, which means more cream. Nothing new is stored, `design.piping` stays a plain list of
 * points that fully determines the mesh (the contract at the top of this file), and every stroke
 * already drawn gets better the next time it is loaded.
 *
 * Normalised against this stroke's OWN median gap, so it is immune to device sampling rate, cake
 * scale and how fast this particular person draws — it reads the variation within a stroke, which
 * is what a hand actually is, rather than an absolute speed nobody agrees on.
 *
 * Smoothed over several points, which fixes mouse jitter AND is physically right: cream has inertia
 * and a bead cannot change width instantly.
 */
function widthAlong(pts, feel) {
  const n = pts.length;
  if (n < 4 || !(feel.speedWidth > 0)) return null;

  const gap = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const span = Math.min(n - 1, i + 1) - Math.max(0, i - 1);
    gap[i] = span > 0 ? a.distanceTo(b) / span : 0;
  }
  const sorted = gap.filter(g => g > 1e-9).sort((x, y) => x - y);
  const med = sorted.length ? sorted[sorted.length >> 1] : 0;
  if (!(med > 0)) return null;

  // v^-1/2, with the slow end floored so a stationary pointer cannot balloon the rope.
  let w = gap.map(g => Math.sqrt(med / Math.max(g, med * 0.25)));

  // Box blur, twice — a bead's width changes over roughly its own length, not per sample.
  for (let pass = 0; pass < 2; pass++) {
    const src = w;
    w = src.map((_, i) => {
      let sum = 0, k = 0;
      for (let d = -2; d <= 2; d++) { const j = i + d; if (j >= 0 && j < n) { sum += src[j]; k++; } }
      return sum / k;
    });
  }
  const lo = feel.widthMin, hi = feel.widthMax;
  return w.map(f => Math.min(hi, Math.max(lo, 1 + (f - 1) * feel.speedWidth)));
}

// Star "heap" (pipe-and-lift): tap instead of drag and the tip is held PERPENDICULAR to the
// surface — cream extrudes up the surface normal and tapers to a peak, so the ribs radiate
// from a centre (the rosette/star-flower look) instead of running down a flat rope. Height
// is keyed to the rope diameter; the rib twist gives a gentle pinwheel swirl as it rises.
export const HEAP_HEIGHT_PER_DIAMETER = 0.9;   // default mound height; calibratable per stroke
const HEAP_TWIST_TURNS = 0.18;   // total turns over the whole height — a slight pinwheel
const HEAP_TAPER_EXP = 0.62;     // <1 = stays fat then tapers near the tip (kiss/star shape)

// Rotation-minimizing frames (double-reflection method, Wang et al.) along a sampled curve.
// THREE's computeFrenetFrames flips the normal at inflection points, which twists the
// cross-section and pinches the tube to near-zero width — the "sometimes it gets thin"
// artifact. RMF carries the frame forward with the least possible rotation, so the profile
// stays stable through bends; our intentional rib twist is then layered on top in pushSweep.
function rmFrames(samples) {
  const n = samples.length;
  const T = new Array(n), N = new Array(n), B = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(n - 1, i + 1)];
    T[i] = b.clone().sub(a);
    if (T[i].lengthSq() < 1e-12) T[i] = (T[i - 1] || new THREE.Vector3(0, 0, 1)).clone();
    T[i].normalize();
  }
  const up = Math.abs(T[0].y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  N[0] = up.sub(T[0].clone().multiplyScalar(up.dot(T[0]))).normalize();
  B[0] = new THREE.Vector3().crossVectors(T[0], N[0]).normalize();
  for (let i = 0; i < n - 1; i++) {
    const v1 = samples[i + 1].clone().sub(samples[i]);
    const c1 = v1.dot(v1);
    if (c1 < 1e-12) { N[i + 1] = N[i].clone(); B[i + 1] = B[i].clone(); continue; }
    const nL = N[i].clone().sub(v1.clone().multiplyScalar((2 / c1) * v1.dot(N[i])));
    const tL = T[i].clone().sub(v1.clone().multiplyScalar((2 / c1) * v1.dot(T[i])));
    const v2 = T[i + 1].clone().sub(tL);
    const c2 = v2.dot(v2);
    const nN = c2 < 1e-12 ? nL : nL.clone().sub(v2.clone().multiplyScalar((2 / c2) * v2.dot(nL)));
    N[i + 1] = nN.normalize();
    B[i + 1] = new THREE.Vector3().crossVectors(T[i + 1], N[i + 1]).normalize();
  }
  return { tangents: T, normals: N, binormals: B };
}

/* Frames from a fixed reference direction — the bag held at a constant attitude. See the note in
 * pushSweep for why a petal needs this and a rope does not. */
function fixedUpFrames(samples, up) {
  const n = samples.length;
  const U = up.clone().normalize();
  const T = new Array(n), N = new Array(n), B = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(n - 1, i + 1)];
    T[i] = b.clone().sub(a);
    if (T[i].lengthSq() < 1e-12) T[i] = (T[i - 1] || new THREE.Vector3(0, 0, 1)).clone();
    T[i].normalize();
    let nrm = new THREE.Vector3().crossVectors(U, T[i]);
    // Travel parallel to `up` leaves the cross product undefined — carry the last frame rather than
    // let it flip, which would twist the ribbon through 180 degrees in one sample.
    if (nrm.lengthSq() < 1e-8) nrm = (N[i - 1] || new THREE.Vector3(1, 0, 0)).clone();
    N[i] = nrm.normalize();
    B[i] = new THREE.Vector3().crossVectors(T[i], N[i]).normalize();
  }
  return { tangents: T, normals: N, binormals: B };
}

// Sweep a profile along a centerline: sample a CENTRIPETAL CatmullRom through the control
// points (centripetal provably avoids the cusps/self-intersections that pinch the tube at
// sharp corners), build rotation-minimizing frames (a stable normal/binormal plane per
// sample), drop the profile ring — twisted and swelled by arc-length — at radius
// radiusAt(i, segs), stitch the rings, and fan-cap both ends (rounded tips). Appends into
// shared pos/idx arrays so a geometry can hold several strokes if needed.
//   opts.twistPerLen  — radians of rib rotation per unit arc length
//   opts.ruffleAmp    — fractional radius swell (0 = off)
//   opts.ruffleFreq   — radians of squeeze phase per unit arc length
function pushSweep(pos, idx, controlPts, profile, radiusAt, opts = {}) {
  const { twistPerLen = 0, ruffleAmp = 0, ruffleFreq = 0, up = null, roll = 0 } = opts;
  const curve = new THREE.CatmullRomCurve3(controlPts, false, 'centripetal');
  const segs = Math.min(900, Math.max(24, controlPts.length * 5));
  const samples = curve.getPoints(segs);                 // segs + 1

  /* ⚠️ TWO KINDS OF FRAME, and which one you want depends on whether the tip is symmetric.
   *
   * A ROPE tip is a radius, so its roll is invisible and the right frame is the one that TWISTS
   * LEAST — that is rmFrames, and every nozzle above uses it.
   *
   * A PETAL tip is a slit, and its roll is the entire technique. You hold the wide end down and the
   * slit square to where you are going, and you turn your wrist through the stroke; that is what
   * makes a petal a petal rather than a smear. So `up` replaces the frame with one built from a
   * fixed reference direction — the surface normal, or the flower nail's axis — exactly the way a
   * hand holds a bag at a constant attitude:
   *
   *   N = up x T   the slit's width, horizontal and square to travel
   *   B = T x N    the slit's length, standing along `up`
   *
   * Degenerate where the path runs parallel to `up` (a petal piped straight upward); the previous
   * frame is carried forward there rather than flipping, which is the same reason rmFrames exists. */
  const frames = up ? fixedUpFrames(samples, up) : rmFrames(samples);
  const P = profile.length;
  const base = pos.length / 3;

  // Cumulative arc length per sample, so twist/ruffle advance in real space (CatmullRom
  // samples are even in parameter, not distance).
  const arc = new Array(segs + 1); arc[0] = 0;
  for (let i = 1; i <= segs; i++) arc[i] = arc[i - 1] + samples[i].distanceTo(samples[i - 1]);

  for (let i = 0; i <= segs; i++) {
    const C = samples[i], N = frames.normals[i], B = frames.binormals[i];
    const s = arc[i];
    /* Two incommensurate waves, not one — a single sine is a knurl, and the ear (or eye) finds a
     * repeating rhythm immediately. The 0.61 ratio is irrational enough that the pattern never
     * closes over any stroke a person will draw, and it is a CONSTANT, so a reloaded stroke is
     * identical to the one that was piped. */
    const swell = ruffleAmp
      ? 1 + ruffleAmp * (0.66 * Math.sin(ruffleFreq * s) + 0.34 * Math.sin(ruffleFreq * 0.61 * s + 1.7))
      : 1;
    const r = radiusAt(i, segs, s, arc[segs]) * swell;
    /* `roll` is the WRIST, and for a slit tip it is the whole difference between a petal and a
     * standing loop of ribbon. Nobody pipes a petal with the bag upright — it is held leaning away
     * from the flower's centre, which is what makes the sheet lie over and cup instead of standing
     * on its edge. Constant along the stroke, added to the rib spiral, which is zero for a slit. */
    const phi = roll + twistPerLen * s;
    const cs = Math.cos(phi), sn = Math.sin(phi);
    for (let j = 0; j < P; j++) {
      const ax = profile[j][0] * r, ay = profile[j][1] * r;
      const px = ax * cs - ay * sn, py = ax * sn + ay * cs;  // rotate in the N/B plane
      pos.push(C.x + N.x * px + B.x * py, C.y + N.y * px + B.y * py, C.z + N.z * px + B.z * py);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < P; j++) {
      const a = base + i * P + j, b = base + i * P + (j + 1) % P;
      const c = base + (i + 1) * P + j, d = base + (i + 1) * P + (j + 1) % P;
      idx.push(a, c, b, b, c, d);
    }
  }
  const r0 = radiusAt(0, segs, 0, arc[segs]), rn = radiusAt(segs, segs, arc[segs], arc[segs]);
  const sC = samples[0].clone().addScaledVector(frames.tangents[0], -r0 * 0.6);
  const eC = samples[segs].clone().addScaledVector(frames.tangents[segs], rn * 0.6);
  const sI = pos.length / 3; pos.push(sC.x, sC.y, sC.z);
  const eI = pos.length / 3; pos.push(eC.x, eC.y, eC.z);
  for (let j = 0; j < P; j++) {
    idx.push(sI, base + (j + 1) % P, base + j);
    idx.push(eI, base + segs * P + j, base + segs * P + (j + 1) % P);
  }
}

function finishGeo(pos, idx) {
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const toVec = p => (p instanceof THREE.Vector3 ? p : new THREE.Vector3(p[0], p[1], p[2]));

// Build one freehand stroke: sweep the chosen nozzle profile (constant radius) through the
// seated centerline points. `points` is [[x,y,z]…] or Vector3[]. Returns a BufferGeometry,
// or null if there's nothing to draw.
export function buildPipingStroke(points, nozzleKey, thickness, feelOverride = null, upVec = null) {
  const noz = NOZZLE_BY_KEY[nozzleKey] || NOZZLE_BY_KEY[DEFAULT_NOZZLE];
  const feel = feelOverride ? { ...PEN_FEEL, ...feelOverride } : PEN_FEEL;
  let pts = points.map(toVec).filter((p, i, a) => i === 0 || p.distanceTo(a[i - 1]) > 1e-4);
  if (pts.length === 0) return null;
  // A lone tap can't sweep — stub it upward so a dot still reads as piped cream.
  if (pts.length === 1) pts = [pts[0], pts[0].clone().add(new THREE.Vector3(0, Math.max(0.02, thickness), 0))];
  const pos = [], idx = [];
  // Spiral + squeeze rhythm scale with the rope diameter so they read the same at any size.
  const dia = 2 * thickness;
  const opts = {
    twistPerLen: (noz.twist  ?? 0) * feel.twistTurnsPerDia * 2 * Math.PI / dia,
    ruffleAmp:   (noz.ruffle ?? 0) * feel.swellAmp,
    ruffleFreq:  feel.swellPerDia * 2 * Math.PI / dia,
    /* A slit tip needs a known attitude; a rope tip does not care and is better off with the
     * least-twisting frame. Defaults to world up, which is the flat surface a flower is piped on —
     * a caller with the real surface normal (or a nail's axis) should pass it. */
    up: noz.flat ? (upVec ? toVec(upVec) : new THREE.Vector3(0, 1, 0)) : null,
    // Only a slit has an attitude worth setting; a rope's roll is invisible, so leaning it is noise.
    roll: noz.flat ? (feel.leanDeg * Math.PI) / 180 : 0,
  };

  /* The hand's own speed, mapped onto the swept samples. pushSweep resamples the control points
   * onto a centripetal CatmullRom, so a sample's index is not a control index — but the curve spans
   * the controls evenly in parameter, so i/segs scaled by (n-1) lands between the two it came from
   * and lerping between their widths is faithful enough for something this smooth. */
  const w = widthAlong(pts, feel);
  const tail = feel.tailDias * dia;

  const radiusAt = (i, segs2, arcS, arcTotal) => {
    let f = 1;
    if (w) {
      const u = (i / segs2) * (w.length - 1);
      const k = Math.min(w.length - 2, Math.floor(u));
      f = w[k] + (w[k + 1] - w[k]) * (u - k);
    }
    /* ⚠️ The LIFT-OFF, and only at the end. A stroke starts where the tip was already pressed to the
     * surface with cream under it, so it begins at full width; it ENDS by releasing and drawing
     * away, which thins the bead to a point. Both ends used to be the same rounded nub, and the
     * ends are where the eye goes first. */
    if (tail > 0 && arcTotal > tail * 1.5) {
      const left = arcTotal - arcS;
      if (left < tail) {
        const t = left / tail;                       // 1 at the start of the tail, 0 at the tip
        f *= feel.tailEnd + (1 - feel.tailEnd) * (t * t * (3 - 2 * t));   // smoothstep
      }
    }
    return thickness * f;
  };

  pushSweep(pos, idx, pts, noz.profile, radiusAt, opts);
  return finishGeo(pos, idx);
}

// Build one star heap: sweep the nozzle profile UP the surface normal from `point`, tapering
// the radius to a peak so it reads as a piped-and-lifted star/rosette rather than a rope.
// `point` is the seated base, `normal` the surface normal there (defaults to up). The rib
// twist corkscrews gently over the height for the pinwheel swirl; round tips give a smooth
// dome (a "kiss"). Returns a BufferGeometry, or null if there's nothing to draw.
export function buildPipingHeap(point, normal, nozzleKey, thickness, heightPerDia = HEAP_HEIGHT_PER_DIAMETER) {
  const noz = NOZZLE_BY_KEY[nozzleKey] || NOZZLE_BY_KEY[DEFAULT_NOZZLE];
  const baseP = toVec(point);
  const up = normal ? toVec(normal) : new THREE.Vector3(0, 1, 0);
  if (up.lengthSq() < 1e-9) up.set(0, 1, 0);
  up.normalize();
  const h = heightPerDia * 2 * thickness;
  const n = 8;
  const pts = Array.from({ length: n + 1 }, (_, i) => baseP.clone().addScaledVector(up, (h * i) / n));
  const radiusAt = (i, segs) => Math.max(thickness * 0.05, thickness * Math.pow(1 - i / segs, HEAP_TAPER_EXP));
  const opts = {
    twistPerLen: (noz.twist ?? 0) * HEAP_TWIST_TURNS * 2 * Math.PI / h,
    ruffleAmp: 0,
    ruffleFreq: 0,
  };
  const pos = [], idx = [];
  pushSweep(pos, idx, pts, noz.profile, radiusAt, opts);
  return finishGeo(pos, idx);
}

// ── GLB stamp placement ──────────────────────────────────────────────────────
// Instead of swept geometry, the pen can stamp a real modelled piece (rosette/shell/star)
// from the element library: a tap drops one, a drag tiles a row along the path (a shell/rope
// border). This turns a committed stamp stroke + the loaded GLB's footprint into a list of
// world transforms; the renderer clones the GLB mesh at each. Deterministic per-stamp jitter
// (size + spin) from the stored seed keeps repeats from looking cloned, and survives reload.

// Tiny deterministic PRNG (mulberry32) so jitter is stable across reloads from the seed.
function rng(seed) {
  let t = (seed >>> 0) || 1;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// stroke: { kind:'stamp', point, normal, thickness, seed }
//      or { kind:'stamprope', points, normal, thickness, spacing, seed, regular }
// footprint: the GLB's max(x,z) extent after it's centred with its base at y=0.
// Returns [{ pos:[x,y,z], quat:[x,y,z,w], scale }]. Each stamp sits with its base ON the
// surface (the stored points are the SEATED centerline, lifted one radius along the normal,
// so we drop back by the radius) and its up axis along the surface normal.
//
// ── `regular`: the difference between scattering and PIPING ──────────────────────────────────────
// Every copy is normally given a small random spin and a few percent of random scale. That is what
// makes a dragged row of blossoms look strewn by hand instead of printed, and it is right for what
// this was built for.
//
// It is wrong for piping. A piped border is one shell pressed out over and over by the same nozzle
// at the same angle — its whole character is that the repeats AGREE. Jittered, the same GLB reads as
// a row of shells somebody knocked askew. So `regular` turns both randomisations off and locks each
// copy's forward to the path tangent, which is the shape a baker's hand actually makes.
//
// A flag rather than a second function: the walk, the seating and the orientation are identical, and
// the one thing that differs is whether the hand wobbles.
export function stampTransforms(stroke, metrics) {
  const up0 = new THREE.Vector3().fromArray(stroke.normal || [0, 1, 0]);
  if (up0.lengthSq() < 1e-9) up0.set(0, 1, 0);
  up0.normalize();
  const th = stroke.thickness ?? 0.03;
  const target = 2 * th;                         // stamp footprint ≈ rope diameter
  const regular = !!stroke.regular;
  // ── Sized by HEIGHT for piping, by footprint for scattering ──────────────────────────────────
  // A ring sizes a shell by how TALL it stands: `sc = radius × SHELL_HEIGHT_FRAC / size.y`. The
  // stamp sized by widest horizontal extent, which for a shell authored lying down is its LENGTH —
  // so one slider produced two different sizes depending on how the model happened to be exported,
  // and neither matched the ring.
  //
  // `metrics` is the bare footprint number for every caller that predates this, or
  // {footprint, height}. Scattering keeps the footprint it was built on, so nothing already stamped
  // on a cake changes size.
  const mm = (typeof metrics === 'number') ? { footprint: metrics, height: metrics } : (metrics ?? {});
  const footprint = mm.footprint ?? 1;
  const height = mm.height ?? footprint;
  const baseScale = target / Math.max(regular ? height : footprint, 1e-4);
  const rand = rng(((stroke.seed ?? 1) * 100003 + 7) | 0);
  const out = [];

  // ── The element's own rotation, the way a RING applies it ────────────────────────────────────
  // Aligning up to the surface normal and forward to the tangent says where a copy sits and which
  // way it faces. It says nothing about how the GLB is authored — a shell modelled lying on its side
  // stays lying on its side, which is why hand-piped shells came out fallen while the same element
  // ringed round a rim stood up.
  //
  // A ring reads `placement_config.*_rotation` and splits it (CakeTier: `ryA`/`meshA`): Y yaws the
  // piece about the surface normal, X and Z tilt it upright. Nested there as group(yaw) →
  // mesh(tilt), so the same composition is qYaw · qTilt applied AFTER the basis. Degrees, because
  // that is what an admin types and what the column stores.
  // ── Which part of the calibration to keep ────────────────────────────────────────────────────
  // A calibrated ring rotation is not a small adjustment. The shipped Classic Shell Border is
  // [-68, -1, 175]: a 175° ROLL that fixes how the GLB was authored, and a -68° TILT that leans the
  // piece out over the rim's edge.
  //
  // In the ring's own frame those axes have meanings. Local X runs TANGENTIALLY, along the border,
  // so a rotation about X tips the piece forward or back — that IS the outward lean. Z is the radial
  // axis (CakeTier: "local z = the radial axis the renderer places along"), so a rotation about it
  // rolls the piece upright. Y spins it in place.
  //
  // Reproduced verbatim on a flat cake top, the -68° pivots the shell about its base and lays it
  // down — which is exactly what it should do on a rim edge and exactly wrong in the middle. So the
  // roll and the spin are kept (they fix the model), and the lean is dropped: a hand-piped shell
  // stands on whatever surface it is drawn on.
  //
  // `lean` puts it back by degrees, because this decomposition is READ off the renderer rather than
  // proven, and a number the customer can turn beats another round of me guessing at it.
  // The calibration is applied VERBATIM, and that only became the right answer once the geometry was
  // prepared the way a ring prepares it. extractGeo bakes a +90° X turn into the mesh, so the -68°
  // is not the huge lean it reads as on paper — against that baked turn it nets to a modest upright
  // tilt, which is what a rim shell actually looks like. Decomposing it (an earlier attempt here)
  // was compensating for the missing +90° in the wrong place.
  //
  // `lean` stays, as an adjustment ON TOP rather than a replacement: 0 is the ring's own angle, and
  // it is there because this is the fourth attempt at this orientation and a number the customer can
  // turn is worth more than my confidence.
  const rot = stroke.rotation;
  const lean = stroke.lean ?? 0;
  let extra = null;
  if (rot || lean) {
    const DEG = Math.PI / 180;
    const rx = (rot?.[0] ?? 0) + lean;
    const ry = rot?.[1] ?? 0;
    const rz = rot?.[2] ?? 0;
    if (rx || ry || rz) {
      extra = new THREE.Quaternion()
        .setFromEuler(new THREE.Euler(0, ry * DEG, 0))
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rx * DEG, 0, rz * DEG)));
    }
  }

  // ── Sitting ON the surface after the piece has been turned ───────────────────────────────────
  // StampStroke translates the merged geometry so its base is at y=0 IN THE AUTHORED FRAME. That
  // only seats the piece if it is authored standing. Roll it 175° to stand it up and the old base is
  // now its top, so it hangs under the cake — and any lean pivots it about a point that is no longer
  // its lowest.
  //
  // So: rotate the bounding box the same way the piece is rotated, and read how far its lowest
  // corner has ended up below the origin. That drop is added back along the surface normal. Needs
  // the box, so it only applies where StampStroke supplies one — without it this is a no-op and the
  // behaviour is exactly what it was.
  let seatDrop = 0;
  if (mm.bbox && extra) {
    const b = new THREE.Box3(
      new THREE.Vector3().fromArray(mm.bbox.min),
      new THREE.Vector3().fromArray(mm.bbox.max),
    ).applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(extra));
    seatDrop = -b.min.y * baseScale;         // >0 when the turn pushed the piece below its origin
  }

  const place = (seatedP, forward) => {
    const up = up0.clone();
    // -th puts the base back on the surface (the stored centerline is lifted one radius); +seatDrop
    // lifts it by however far the rotation dropped its lowest point.
    const surface = seatedP.clone().addScaledVector(up, -th + seatDrop);
    const fwd = forward ? forward.clone() : new THREE.Vector3(1, 0, 0);
    // A lone regular stamp still has to face somewhere, and `rand()` would be a different somewhere
    // every render. Zero keeps it put.
    if (!regular) fwd.applyAxisAngle(up, forward ? (rand() - 0.5) * 0.5 : rand() * Math.PI * 2);
    // ── Which way the piece FACES: along the run, or across it ──────────────────────────────────
    // Scattering faces along the drag — a row of blossoms follows the hand, and that is what this
    // was built for.
    //
    // A ring does the opposite, and working it out from the renderer is the only way to see it.
    // Shell nests group(yaw = -rotY + π/2 + ry) → mesh(tilt), with an identity outer quaternion on a
    // plain ring. At shell angle `a` that yaw is (π/2 − a), which sends the GLB's +Z to
    // (cos a, 0, sin a) — the OUTWARD RADIAL. A piped shell points away from the cake, square across
    // the border's direction of travel, not along it.
    //
    // Piped by hand with +Z along the tangent, every shell was turned a quarter turn, and the X-tilt
    // that should lean it forward leaned it SIDEWAYS instead. That is what "it's falling" was — not
    // a missing rotation (the previous fix, which was real but not this) but a rotation applied to a
    // frame that was already ninety degrees out.
    //
    // Tied to `regular` because that flag already means "behave like a ring". Scattering keeps the
    // convention it was written with, so no cream-pen stroke anybody has already drawn moves.
    let z;
    if (regular) {
      z = new THREE.Vector3().crossVectors(fwd, up);              // across the run
      if (z.lengthSq() < 1e-8) z = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), up);
      if (z.lengthSq() < 1e-8) z = new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0), up);
    } else {
      z = fwd.sub(up.clone().multiplyScalar(fwd.dot(up)));        // along the run
      if (z.lengthSq() < 1e-8) z = new THREE.Vector3(0, 0, 1).sub(up.clone().multiplyScalar(up.z));
    }
    z.normalize();
    const x = new THREE.Vector3().crossVectors(up, z).normalize();
    const m = new THREE.Matrix4().makeBasis(x, up, z);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    // AFTER the basis, so the tilt is applied in the copy's own frame — the piece leans relative to
    // the surface it sits on, which is what a ring does and what a hand does. Multiplied the other
    // way round it would lean relative to the world and every copy on a curved wall would lean a
    // different way.
    if (extra) q.multiply(extra);
    out.push({ pos: surface.toArray(), quat: q.toArray(), scale: regular ? baseScale : baseScale * (1 + (rand() - 0.5) * 0.16) });
  };

  if (stroke.kind === 'stamp') { place(new THREE.Vector3().fromArray(stroke.point)); return out; }

  const pts = (stroke.points || []).map(p => new THREE.Vector3().fromArray(p));
  if (pts.length === 0) return out;
  if (pts.length === 1) { place(pts[0]); return out; }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = cum[cum.length - 1];
  const step = Math.max((stroke.spacing ?? 0.85) * target, 1e-3);
  for (let d = 0; d <= total + 1e-6; d += step) {
    let s = 1; while (s < cum.length && cum[s] < d) s++;
    s = Math.min(s, cum.length - 1);
    const segLen = (cum[s] - cum[s - 1]) || 1e-6;
    const t = (d - cum[s - 1]) / segLen;
    place(pts[s - 1].clone().lerp(pts[s], t), pts[s].clone().sub(pts[s - 1]).normalize());
  }
  return out;
}
