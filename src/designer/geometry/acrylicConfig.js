import { faceFit, TOPPER_FACES, DEFAULT_TOPPER_FACE } from './topperFaces.js';
import { TOPPER_FINISHES, DEFAULT_TOPPER_FINISH } from './topperFinishes.js';

/* ── Every number an acrylic word is made of, in ONE place ───────────────────────────────────────
 *
 * ⚠️ THE STUDIO AND THE CAKE WERE NOT CONNECTED, and this is what connects them.
 *
 * The Acrylic Topper Studio has been writing `placement_config.acrylic` since it was built, and
 * nothing read it — the renderer carried its own hardcoded bar ratio, leg length, bury depth, bridge
 * flag and line gap. So an admin could set all of those, save, and change nothing on any cake. The
 * root CLAUDE.md names that exact failure: *a studio whose output can only be pasted into code is
 * not authoring — it is a mock-up.* And `tools-into-the-catalogue.md` records it happening before,
 * to Grass and to Letter Blocks, where nobody ever pressed Save and the absence was later mistaken
 * for a filter bug.
 *
 * So: seeded in code, overlaid from the DB, read through one function. A renderer with a number of
 * its own is a number an admin cannot reach.
 */

export const ACRYLIC_DEFAULTS = Object.freeze({
  face: DEFAULT_TOPPER_FACE,
  stroke: 0.12,           // centreline faces only — about a tenth of the letter, as the market sets it
  weight: 0,              // outline faces — the one lever on a hairline
  minDetail: 1.0,         // mm the cutter will hold
  lineGap: 1.2,           // the LOOSEST setting; rows nest tighter until they meet
  maxLines: 3,
  bridge: true,
  barRatio: 0.13,         // a share of the LETTER height, not of the stacked block
  legs: 2,
  legLen: 0.42,
  bury: 0.21,
  /* ⚠️ Two sheet thicknesses, because the two poses are not the same object.
   *
   * Standing, the sheet holds the word up and pushes into the icing — 3mm. Lying against a wall it
   * carries nothing, and at 3mm the visible edge is as wide as the strokes are, which reads as bent
   * rod rather than cut sheet. The studio only ever previews the standing pose, so its authored
   * `thickness` overrides the standing one; a plaque keeps its own default unless a row says
   * otherwise. One authored number applied to both would quietly fatten every side name. */
  sheetStand: 0.063,
  sheetFlat: 0.030,
  finishes: Object.keys(TOPPER_FINISHES),
  defaultFinish: DEFAULT_TOPPER_FINISH,
});

/* The `cfg` an AcrylicWord wants, resolved from the message and the pose.
 *
 * Every fallback is ACRYLIC_DEFAULTS — never a literal here — so there is exactly one answer to
 * "what is the bar ratio if nobody said", and it is the one an admin can overlay.
 */
export function acrylicCfg(writing = {}, { standing = true } = {}) {
  const d = ACRYLIC_DEFAULTS;
  const face = TOPPER_FACES[writing.font] ? writing.font : d.face;
  return {
    tracking: writing.tracking ?? faceFit(face),
    stroke:   writing.stroke   ?? d.stroke,
    weight:   writing.weight   ?? d.weight,
    lineGap:  writing.lineGap  ?? d.lineGap,
    maxLines: writing.maxLines ?? d.maxLines,
    bridge:   writing.bridge   ?? d.bridge,
    thickness: writing.sheet ?? (standing ? d.sheetStand : d.sheetFlat),
    // Legs and a bar belong to standing. A flat piece has nothing to push into and prongs would
    // point at the customer, so the pose decides and the authored count only says how many.
    bar:      standing && (writing.bar ?? true),
    barRatio: writing.barRatio ?? d.barRatio,
    legs:     standing ? (writing.legs ?? d.legs) : 0,
    legLen:   writing.legLen ?? d.legLen,
    bury:     writing.bury   ?? d.bury,
  };
}

/* ── How big a world unit is, and why this is an ASSUMPTION rather than a lookup ──────────────────
 *
 * "The thinnest acrylic must clear what the cutter holds" needs a real millimetre, and the designer
 * has no true scale to give one. The only inches-to-units constant in the codebase is
 * SHEET_INCH_TO_WORLD (0.12), and it does not mean what it looks like: at that rate one unit is
 * ~212mm, which makes the default bottom tier — diameter 2.4 — a TWENTY INCH cake. Its own comment
 * says why: it was chosen so a half sheet reads beside a round tier, not as a conversion.
 *
 * So this is declared, not derived: the default bottom tier is taken to be an 8-inch cake, which
 * puts a unit at 8 x 25.4 / 2.4 mm. Stated in one place with the arithmetic shown, so the day an
 * order pins a REAL size the caller passes it and this stops being used — the same bargain
 * rainbow.js makes with its own optional `mmPerUnit`.
 */
export const NOMINAL_MM_PER_UNIT = (8 * 25.4) / 2.4;   // ≈ 84.7

/* How far the letters may be pushed before the cutter cannot hold them, as the pure ratio
 * `topperShapes` wants: the span it will be cut at, over the smallest detail worth cutting.
 *
 * `spanUnits` is world units and `mmPerUnit` converts — optional, because only an order knows the
 * real size. Absent, the nominal above is used and the rule still bites at roughly the right place.
 */
export function acrylicFitAspect(writing = {}, spanUnits = 0, mmPerUnit = NOMINAL_MM_PER_UNIT) {
  const min = Math.max(0.1, writing.minDetail ?? ACRYLIC_DEFAULTS.minDetail);
  const spanMm = spanUnits * (mmPerUnit || NOMINAL_MM_PER_UNIT);
  return spanMm > 0 ? spanMm / min : 28;
}

/* What a CATALOGUE ROW seeds a message with.
 *
 * The studio nests bar and legs as objects and may write null to mean "none"; a message stores them
 * flat because that is what its editor edits. Translated here rather than at the call site, so a
 * second caller cannot invent a second reading of the same row.
 */
export function writingFromAcrylicRow(acrylic) {
  if (!acrylic || typeof acrylic !== 'object') return { style: 'acrylic' };
  const face = TOPPER_FACES[acrylic.face] ? acrylic.face : ACRYLIC_DEFAULTS.face;
  const offered = Array.isArray(acrylic.finishes) && acrylic.finishes.length
    ? acrylic.finishes.filter(k => TOPPER_FINISHES[k])
    : null;
  const seed = {
    style: 'acrylic',
    font: face,
    // An authored fit of 0 is a real choice ("set as drawn"), so `??` and not `||`.
    tracking: acrylic.tracking ?? faceFit(face),
    acrylicFinish: offered?.includes(acrylic.defaultFinish)
      ? acrylic.defaultFinish
      : (offered?.[0] ?? ACRYLIC_DEFAULTS.defaultFinish),
  };
  if (offered) seed.acrylicFinishes = offered;
  for (const [from, to] of [['stroke', 'stroke'], ['weight', 'weight'], ['lineGap', 'lineGap'],
                            ['maxLines', 'maxLines'], ['minDetail', 'minDetail']]) {
    if (typeof acrylic[from] === 'number') seed[to] = acrylic[from];
  }
  if (typeof acrylic.bridge === 'boolean') seed.bridge = acrylic.bridge;
  // ⚠️ The studio's `thickness` is authored against the STANDING preview — see sheetStand above.
  if (typeof acrylic.thickness === 'number') seed.sheet = acrylic.thickness;
  if (typeof acrylic.flatThickness === 'number') seed.sheet = acrylic.flatThickness;

  if (acrylic.bar) { seed.bar = true; if (typeof acrylic.bar.ratio === 'number') seed.barRatio = acrylic.bar.ratio; }
  else if (acrylic.bar === null) seed.bar = false;

  if (acrylic.legs) {
    seed.legs = acrylic.legs.count ?? ACRYLIC_DEFAULTS.legs;
    if (typeof acrylic.legs.length === 'number') seed.legLen = acrylic.legs.length;
    if (typeof acrylic.legs.bury === 'number') seed.bury = acrylic.legs.bury;
  } else if (acrylic.legs === null) seed.legs = 0;

  if (typeof acrylic.text?.default === 'string') seed.text = acrylic.text.default;
  return seed;
}

// Which finishes this message may offer — the authored set, or all of them for a message that was
// never seeded from a row. An unknown key is dropped rather than rendered in a colour nobody chose.
export function acrylicFinishes(writing = {}) {
  const offered = writing.acrylicFinishes?.filter(k => TOPPER_FINISHES[k]);
  return offered?.length ? offered : Object.keys(TOPPER_FINISHES);
}
