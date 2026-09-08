// ── Piped flowers, arranged rather than drawn ───────────────────────────────────────────────────
//
// ⚠️ THIS REPLACES PIPING A FLOWER BY HAND, AND THAT WAS A DELIBERATE RETREAT. The flower nail let
// you pipe petal by petal onto a turning disc. It is the right model of the real thing — the bag
// barely moves, the nail turns, the repetition is a rhythm — and it does not survive a mouse. A
// wrist rolls a slit tip through an arc while pressure eases off; a pointer has one position and no
// attitude. What came out was forty aimed strokes, which is admin, not piping.
//
// So the baker no longer draws the petals. They SHAPE them: how many rings, how many petals in a
// ring, how far each ring opens, how much the tip leans, how uneven the hand is. The generator lays
// them out.
//
// ⚠️ A KIND IS A STARTING POINT, NEVER A MENU YOU ARE STUCK IN. The brief for the cream studio was
// "each baker unique — they should work, not we", and that was later relaxed: presets are fine,
// PROVIDED they do not force the choice. So the test this file has to pass is not "are there
// presets" — it is "can a baker leave them". They can: every number here is theirs, and so are the
// two decisions that are not numbers (`form` and `centre` below), which is what makes a flower a
// different flower rather than the same one resized. A baker who wants radial petals round a wound
// bud can have it, and no kind in the list is that.
//
// Everything is built from the pen's own `buildPipingStroke` — the same swept nozzle, the same
// speed-driven width, the same lift-off at the tail. A petal here and a petal piped by hand in the
// pen studio are the same geometry called with different points, which is the only way the two can
// stay in agreement (INVARIANTS #15).
import * as THREE from 'three';
import { buildPipingStroke, buildPipingHeap, NOZZLE_BY_KEY, PEN_FEEL } from './creamPen.js';

/* Every flower answers the same questions, so there is ONE param schema and a kind only moves the
 * defaults. One schema means one set of sliders in the studio, and a kind added later needs no UI
 * work at all — which is the whole point of keeping this config-driven rather than type-driven.
 *
 * `user` marks the params a baker sees. The rest are authoring knobs, tuned in admin and overlaid
 * from the DB like every other tunable in this project.
 */
export const FLOWER_PARAMS = [
  { key: 'layers',   label: 'Rings',        min: 1,   max: 6,   step: 1,    default: 3,    user: true,
    hint: 'Rings of petals, working outward from the middle.' },
  { key: 'petals',   label: 'Petals',       min: 3,   max: 16,  step: 1,    default: 5,    user: true,
    hint: 'Petals in the innermost ring. Each ring outward carries more.' },
  { key: 'size',     label: 'Across',       min: 0.2, max: 1.6, step: 0.02, default: 0.85, user: true,
    hint: 'How wide the finished flower is.' },
  { key: 'open',     label: 'Open',         min: 0,   max: 1,   step: 0.01, default: 0.45, user: true,
    hint: 'Shut bud to fully open bloom — how far the outer rings fall away.' },
  { key: 'lean',     label: 'Lean',         min: 0,   max: 80,  step: 1,    default: 40,   user: true,
    hint: 'How far the tip is tilted. A slit tip piped upright gives a flat petal.' },
  { key: 'rise',     label: 'Petal height', min: 0.02, max: 0.5, step: 0.01, default: 0.16, user: true,
    hint: 'How tall each petal stands off the flower.' },
  { key: 'wobble',   label: 'Hand',         min: 0,   max: 1,   step: 0.01, default: 0.25, user: true,
    hint: 'How even the hand is. Nothing at zero reads as printed rather than piped.' },
  { key: 'span',     label: 'Petal wrap',   min: 40,  max: 220, step: 1,    default: 130,  user: true,
    hint: 'How far a petal travels around the middle before it is released.' },
  // Authoring knobs — the shape of a KIND rather than of one flower.
  { key: 'grow',     label: 'Ring growth',  min: 0,   max: 1.5, step: 0.05, default: 0.55 },
  { key: 'innerRise', label: 'Inner height', min: 0.2, max: 1,  step: 0.02, default: 0.55 },
  { key: 'thickness', label: 'Bead',        min: 0.01, max: 0.12, step: 0.002, default: 0.045, user: true,
    hint: 'The rope the tip lays down.' },
];

const DEFAULTS = Object.fromEntries(FLOWER_PARAMS.map(p => [p.key, p.default]));

/* The kinds. A kind is TWO things: which way its petals run, and where its defaults sit.
 *
 * `form` is the one genuine branch, and it is a key rather than a name test (rule 2): a rose petal
 * WRAPS — it travels around the middle, so its path is an arc at a fixed radius — while a daisy
 * petal is RADIAL, dragged from the outside in toward the middle. Those are different paths, not
 * different numbers, and no amount of slider movement turns one into the other.
 */
export const FLOWERS = {
  rose: {
    label: 'Rose', form: 'wrap', centre: 'spiral', nozzle: 'petal',
    hint: 'Wrapped petals round a tight bud. The classic nail flower.',
    defaults: { layers: 3, petals: 3, span: 150, lean: 45, open: 0.4, grow: 0.85, rise: 0.18 },
  },
  dahlia: {
    label: 'Dahlia', form: 'wrap', centre: 'heap', nozzle: 'petal',
    hint: 'Many short pointed petals in close rings.',
    defaults: { layers: 4, petals: 8, span: 70, lean: 55, open: 0.6, grow: 0.5, rise: 0.13 },
  },
  primrose: {
    label: 'Primrose', form: 'radial', centre: 'heap', nozzle: 'petal',
    hint: 'Five broad flat petals round a small eye.',
    defaults: { layers: 1, petals: 5, span: 90, lean: 15, open: 0.8, grow: 0.3, rise: 0.09 },
  },
  daisy: {
    label: 'Daisy', form: 'radial', centre: 'heap', nozzle: 'petal',
    hint: 'Narrow petals, one ring, a raised middle.',
    defaults: { layers: 1, petals: 12, span: 40, lean: 10, open: 0.9, grow: 0.3, rise: 0.07 },
  },
};

/* ⚠️ NO ROSETTE HERE, deliberately. A rosette is one star rope wound out from the middle — it has
 * no petals and needs none of this — and the pen studio already offers it as a STYLE beside Line and
 * Shell. Adding it as a sixth "flower" would be the second implementation the root CLAUDE.md's first
 * rule is about. */
export const FLOWER_ORDER = ['rose', 'dahlia', 'primrose', 'daisy'];

/* ⚠️ THE TWO CHOICES THAT ARE NOT NUMBERS, AND THE BAKER GETS THEM TOO.
 *
 * A kind seeds these, but it does not own them. Which way the petals run and what sits in the middle
 * are the decisions that make a flower a different flower — every slider in the schema above only
 * moves a flower around inside its kind, so if these stayed locked the five kinds WOULD be a shelf
 * of presets you had to pick from, whatever the sliders did. Opening them is what lets a baker build
 * something that is none of the five: radial petals round a wound bud, or wrapped petals with no
 * middle at all. Nobody has to touch them, and the kind is still a sensible place to start.
 */
export const FLOWER_FORMS = [
  { key: 'wrap',   label: 'Wrapped',  hint: 'Each petal travels around the middle. Roses, dahlias.' },
  { key: 'radial', label: 'Out',      hint: 'Each petal is dragged from the rim inward. Daisies.' },
];
export const FLOWER_CENTRES = [
  { key: 'spiral', label: 'Bud',   hint: 'A tight wound cone, piped in one go.' },
  { key: 'heap',   label: 'Eye',   hint: 'A raised mound, like a daisy centre.' },
  { key: 'none',   label: 'Open',  hint: 'Nothing in the middle.' },
];

const FORM_KEYS   = FLOWER_FORMS.map(f => f.key);
const CENTRE_KEYS = FLOWER_CENTRES.map(c => c.key);

/* The kind's own choice unless the baker has made one. Validated rather than trusted, because these
 * arrive from a saved element's placement_config and an unknown key would silently draw nothing. */
export const resolveFlowerForm   = (kind, o) => (FORM_KEYS.includes(o?.form) ? o.form : (flowerDef(kind).form ?? 'wrap'));
export const resolveFlowerCentre = (kind, o) => (CENTRE_KEYS.includes(o?.centre) ? o.centre : (flowerDef(kind).centre ?? 'none'));

export const flowerDef = (kind) => FLOWERS[kind] ?? FLOWERS.rose;

/* Defaults ← the kind's own ← the baker's overrides. Same shape as `resolveStyleParams` in
 * creamStyles.js, because a second way to resolve params is a second thing to keep in step. */
export function resolveFlowerParams(kind, overrides) {
  const def = flowerDef(kind);
  const out = { ...DEFAULTS, ...(def.defaults ?? {}) };
  for (const p of FLOWER_PARAMS) {
    const v = overrides?.[p.key];
    if (v !== undefined && v !== null && v !== '') out[p.key] = Number(v);
  }
  return out;
}

export const userFlowerParams = () => FLOWER_PARAMS.filter(p => p.user);

/* Admin authors the kinds; a row overlays the seed (rule 3). Mirrors `applyTextureConfig`. */
export function applyFlowerConfig(rows) {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    if (!row?.key) continue;
    const seed = FLOWERS[row.key];
    FLOWERS[row.key] = {
      label: row.label ?? seed?.label ?? row.key,
      form: row.config?.form ?? seed?.form ?? 'wrap',
      centre: row.config?.centre ?? seed?.centre ?? 'none',
      nozzle: row.config?.nozzle ?? seed?.nozzle ?? 'petal',
      hint: row.config?.hint ?? seed?.hint ?? '',
      defaults: { ...(seed?.defaults ?? {}), ...(row.config?.defaults ?? {}) },
    };
    if (!FLOWER_ORDER.includes(row.key)) FLOWER_ORDER.push(row.key);
  }
}

/* ⚠️ Deterministic, by index — never Math.random.
 *
 * A flower with no unevenness reads as printed; the eye finds the repetition before it finds the
 * shape. But a flower that reshuffles on every render is worse than a regular one: you cannot tune
 * a slider against a picture that will not hold still, and the same saved element would come back
 * different. So the wobble is a hash of the petal's own index — arbitrary-looking, and identical
 * every time. `XrayTinSection` reached the same conclusion about its filling bands.
 */
/* A flower is dozens of small strokes, not one big one — see `decimateProfile` in creamPen.js. */
const FLOWER_LOD = Object.freeze({ segs: 26, profileStep: 3 });

function jitter(i, salt) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;              // -1..1
}

/* One petal that WRAPS: an arc at a fixed radius from the middle, arching up and back down.
 *
 * The tilt is what stops a ring of these reading as a wall. Real petals open outward as they rise,
 * so the radius grows with the height rather than staying on a cylinder. */
function wrapPetal(r, thetaC, span, rise, tiltOut, n = 16) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = thetaC + (t - 0.5) * span;
    const y = rise * Math.sin(Math.PI * t);          // up and back down over the arc
    const rr = r + tiltOut * y;
    pts.push([rr * Math.cos(a), y, rr * Math.sin(a)]);
  }
  return pts;
}

/* One petal that runs RADIALLY: dragged from the outer edge in toward the middle.
 *
 * It ends high and inside rather than low and outside, because that is the direction the real
 * stroke runs — the tip touches down at the rim and is pulled in, so the cream is thickest and
 * tallest where it finishes against the eye of the flower. Piping it the other way gives a petal
 * that tapers the wrong end and reads as a spike. */
function radialPetal(rInner, rOuter, thetaC, span, rise, n = 14) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;                                 // 0 at the rim, 1 at the middle
    const rr = rOuter + (rInner - rOuter) * t;
    /* A gentle bow rather than a dead straight radius. `span` is a petal's WIDTH on a wrapped
     * flower, and a radial petal has no arc to widen — so here it bends the stroke instead, which
     * is what a real drag does when the hand pulls in and slightly across. Straight radii read as
     * spokes on a wheel. */
    const a = thetaC + Math.sin(t * Math.PI) * span * 0.12;
    const y = rise * Math.pow(t, 0.8);
    pts.push([rr * Math.cos(a), y, rr * Math.sin(a)]);
  }
  return pts;
}

/* The middle, wound outward — a rose's bud. A single continuous stroke rather than petals, because
 * that is what it is in the hand: the tip never lifts, it just spirals up and out. */
function spiralCentre(r, rise, turns = 2.2, n = 40) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turns * 2 * Math.PI;
    const rr = r * (0.18 + 0.82 * t);
    pts.push([rr * Math.cos(a), rise * (1 - t) * 0.9, rr * Math.sin(a)]);
  }
  return pts;
}

/**
 * The strokes that make one flower, in the order a hand would pipe them: middle first, then each
 * ring working outward.
 *
 * Returns `[{ points, nozzle, thickness, feel, heap }]` — SPECS, not geometry, so the studio can
 * give each stroke its own material and the designer can merge them. `heap` marks the one stroke
 * that is a mound rather than a sweep (a daisy's eye), because `buildPipingHeap` takes a point.
 *
 * ⚠️ ONE function for the preview and for the cake (INVARIANTS #15). The studio is not allowed its
 * own idea of what a rose is; if this is wrong, both are wrong together and there is one place to
 * fix it.
 */
export function flowerStrokes(kind, overrides, nozzleKey = null) {
  const def = flowerDef(kind);
  const p = resolveFlowerParams(kind, overrides);
  const form   = resolveFlowerForm(kind, overrides);
  const centre = resolveFlowerCentre(kind, overrides);
  const noz = nozzleKey || def.nozzle;
  const out = [];

  const layers = Math.max(1, Math.round(p.layers));
  const R = p.size / 2;
  // The middle takes a fixed share of the radius, so "Across" means the whole flower and a baker
  // dragging it does not watch the bud swallow the petals.
  const rBud = R * 0.26;

  if (centre === 'spiral') {
    out.push({
      points: spiralCentre(rBud, p.rise * p.innerRise, 2.2),
      nozzle: noz, thickness: p.thickness,
      feel: { ...PEN_FEEL, leanDeg: p.lean * 0.5 },
    });
  } else if (centre === 'heap') {
    out.push({
      heap: [0, 0, 0], normal: [0, 1, 0],
      nozzle: noz === 'petal' ? 'french' : noz,     // a slit tip cannot make a mound
      thickness: Math.max(p.thickness, rBud * 0.75),
    });
  }

  for (let L = 0; L < layers; L++) {
    // 0 for the innermost ring, 1 for the outermost. A single-ring flower is fully "outer", which
    // is what a daisy is — one ring of full-size petals, not one ring of stunted ones.
    const f = layers === 1 ? 1 : L / (layers - 1);

    const rRing = rBud + (R - rBud) * (layers === 1 ? 0.55 : 0.25 + 0.75 * f);
    const count = Math.max(2, Math.round(p.petals * (1 + p.grow * f * (layers - 1))));
    // Inner petals are smaller — the thing you asked for. They are also LESS leant, because a bud's
    // petals are still wrapped upright and only the outer ones have fallen open.
    const rise = p.rise * (p.innerRise + (1 - p.innerRise) * f);
    const lean = p.lean * (0.55 + 0.45 * f);
    const tiltOut = p.open * R * (0.35 + 0.65 * f);
    const span = (p.span * Math.PI) / 180;
    // Each ring is turned off the one under it, so petals sit in the gaps rather than in a column.
    const offset = (L * Math.PI) / Math.max(2, count);

    for (let i = 0; i < count; i++) {
      const w = p.wobble;
      const thetaC = offset + (2 * Math.PI * i) / count + jitter(i + L * 31, 1) * w * (Math.PI / count) * 0.6;
      const rr = rRing * (1 + jitter(i + L * 31, 2) * w * 0.10);
      const sp = span * (1 + jitter(i + L * 31, 3) * w * 0.18);
      const ri = rise * (1 + jitter(i + L * 31, 4) * w * 0.22);

      const points = form === 'radial'
        ? radialPetal(rBud * 0.9, rr, thetaC, sp, ri)
        : wrapPetal(rr, thetaC, sp, ri, tiltOut);

      out.push({
        points, nozzle: noz, thickness: p.thickness,
        // Lean is PER STROKE, which is the whole reason it travels in `feel` rather than sitting
        // global: an inner petal and an outer petal are leant differently, and a global one would
        // re-lean every petal already laid down the moment the slider moved.
        feel: { ...PEN_FEEL, leanDeg: lean * (1 + jitter(i + L * 31, 5) * w * 0.15) },
      });
    }
  }

  /* ⚠️ SCALED TO THE WIDTH THE BAKER ASKED FOR, as the last step.
   *
   * "Across" was the one control that lied. The petals are laid out from ring radii, and what
   * actually sets the outer edge is those radii PLUS however far `open` tilts the tips outward plus
   * the bead itself — so a rose set to 0.85 measured 1.01 and a primrose measured 0.54. Two flowers
   * on the same cake at the same setting came out different sizes, which makes the number useless
   * for the only thing it is for: matching a picture.
   *
   * Measured and corrected rather than solved in closed form, because the tilt, the wobble and the
   * lift-off all move the edge and any formula would have to be kept in step with all three. The
   * footprint is scaled and the height is NOT — "Petal height" is its own control and must keep
   * meaning what it says.
   */
  let maxR = 0;
  for (const st of out) {
    if (!st.points) continue;
    for (const [x, , z] of st.points) maxR = Math.max(maxR, Math.hypot(x, z));
  }
  /* The allowance is the bead PLUS its swell, not the bead alone. A slit tip's blade is a full
   * `thickness` long from the centerline, and the ruffle rhythm adds a few percent on top of that —
   * so subtracting only the thickness left a small flower measurably over its stated width (a
   * dahlia asked for 0.4 came out 0.42, because a fixed bead is a far bigger share of a small
   * flower than of a large one). */
  const targetR = R - p.thickness * (1 + PEN_FEEL.swellAmp * 1.6);
  if (maxR > 1e-6 && targetR > 0) {
    const k = targetR / maxR;
    for (const st of out) {
      if (!st.points) continue;
      for (const q of st.points) { q[0] *= k; q[2] *= k; }
    }
  }

  return out;
}

/* Every stroke of a flower as one geometry, ready to drop on a cake.
 *
 * Merged rather than kept apart because on a cake a flower is ONE decoration — it is placed, moved
 * and deleted as a unit, and forty separate meshes would each cost a draw call for something the
 * baker thinks of as a single object. The studio keeps them separate on purpose; it is the only
 * place the individual petals mean anything.
 */
export function buildFlower(kind, overrides, nozzleKey = null) {
  const parts = [];
  for (const s of flowerStrokes(kind, overrides, nozzleKey)) {
    const g = s.heap
      ? buildPipingHeap(s.heap, s.normal, s.nozzle, s.thickness)
      : buildPipingStroke(s.points, s.nozzle, s.thickness, s.feel, null, FLOWER_LOD);
    if (g) parts.push(g);
  }
  if (parts.length === 0) return null;

  // Merged by hand rather than through BufferGeometryUtils: every part here is non-indexed-safe,
  // position-only + normals, so the merge is a concatenation and pulling in the util would add a
  // dependency for twenty lines. Indices are rebased per part.
  const pos = [], nor = [], idx = [];
  let base = 0;
  for (const g of parts) {
    const gp = g.getAttribute('position');
    const gn = g.getAttribute('normal');
    for (let i = 0; i < gp.count; i++) {
      pos.push(gp.getX(i), gp.getY(i), gp.getZ(i));
      nor.push(gn.getX(i), gn.getY(i), gn.getZ(i));
    }
    const gi = g.getIndex();
    if (gi) for (let i = 0; i < gi.count; i++) idx.push(gi.getX(i) + base);
    else    for (let i = 0; i < gp.count; i++) idx.push(i + base);
    base += gp.count;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}

// The nozzles that can actually pipe a petal. A flower is a slit-tip job; offering the round
// writing tip here would offer a rope wound into a circle and call it a rose.
export const FLOWER_NOZZLES = ['petal', 'star5', 'star6', 'closed', 'drop', 'french'];
export const flowerNozzles = () => FLOWER_NOZZLES.filter(k => NOZZLE_BY_KEY[k]);
