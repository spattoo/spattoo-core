import { faceFit, TOPPER_FACES, DEFAULT_TOPPER_FACE } from './topperFaces.js';
/* ⚠️ HOW BIG A WORLD UNIT IS lives in constants.js now, not here. It was defined in this file, which
 * imports the cream fonts — so anything that only wanted to know what an inch measures had to pull a
 * font table in with it, and the piped cream wall (which sizes a nozzle in inches) could not. It is
 * re-exported so every existing caller is untouched. */
import { NOMINAL_MM_PER_UNIT, WRITING_FIT } from '../constants.js';
export { NOMINAL_MM_PER_UNIT };
import { TOPPER_FINISHES, DEFAULT_TOPPER_FINISH, finishesOf } from './topperFinishes.js';

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
  /* How much of the surface the piece spans before anybody drags the Size slider. The number lives
     in constants.js so `surface.js` can read it without importing a font table — see WRITING_FIT
     there — but it is authored HERE, because this is where an admin's acrylic row is applied. */
  fit: WRITING_FIT.acrylic,
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
  finishes: finishesOf('acrylic'),
  defaultFinish: DEFAULT_TOPPER_FINISH,
});

/* ── What each cut medium is ASSEMBLED with ──────────────────────────────────────────────────────
 *
 * ⚠️ THREE OF THESE NUMBERS DESCRIBE ACRYLIC'S MANUFACTURE, NOT LETTERING. A perspex word is cut
 * from ONE sheet on a machine, so it has to hang together and hold itself up: `bridge` drops thin
 * stems between parts that would otherwise fall out of the cutter, `bar` is the baseline strip they
 * all sit on, and `legs` are the prongs that push into the icing. None of the three is a decision
 * anybody makes about the word — they are what the material costs you.
 *
 * Fondant costs you none of them. It is cut letter by letter with a cutter and laid on by hand, so
 * there is nothing to bridge, no bar to sit on and no prong to push in — a standing fondant word
 * rests on its own baseline. Sandeep: "for fondant, some acrylic options are appearing. like legs
 * and the bridge line. these options should not be available for fondant."
 *
 * A table rather than `if (medium === 'fondant')` scattered through the builder: a fourth cut medium
 * is a row, and the card reads the same row to decide which controls to offer, so the controls and
 * the geometry cannot disagree about what a material has.
 */
export const CUT_ASSEMBLY = {
  acrylic: { bridge: true,  bar: true,  legs: true  },
  fondant: { bridge: false, bar: false, legs: false },
};
export const cutAssembly = (medium) => CUT_ASSEMBLY[medium] ?? CUT_ASSEMBLY.acrylic;

/* The `cfg` an AcrylicWord wants, resolved from the message and the pose.
 *
 * Every fallback is ACRYLIC_DEFAULTS — never a literal here — so there is exactly one answer to
 * "what is the bar ratio if nobody said", and it is the one an admin can overlay.
 */
export function acrylicCfg(writing = {}, { standing = true, medium = 'acrylic' } = {}) {
  const d = ACRYLIC_DEFAULTS;
  const face = TOPPER_FACES[writing.font] ? writing.font : d.face;
  /* ⚠️ THE MEDIUM VETOES, IT DOES NOT DEFAULT. A `?? ` here would let a saved acrylic `legs: 2` ride
     across when a message is switched to fondant — the value is on the message, and the Look is not
     allowed to leave a prong behind. */
  const a = cutAssembly(medium);
  return {
    tracking: writing.tracking ?? faceFit(face),
    stroke:   writing.stroke   ?? d.stroke,
    weight:   writing.weight   ?? d.weight,
    lineGap:  writing.lineGap  ?? d.lineGap,
    maxLines: writing.maxLines ?? d.maxLines,
    bridge:   a.bridge && (writing.bridge ?? d.bridge),
    thickness: writing.sheet ?? (standing ? d.sheetStand : d.sheetFlat),
    // Legs and a bar belong to standing. A flat piece has nothing to push into and prongs would
    // point at the customer, so the pose decides and the authored count only says how many.
    bar:      a.bar && standing && (writing.bar ?? true),
    barRatio: writing.barRatio ?? d.barRatio,
    legs:     a.legs && standing ? (writing.legs ?? d.legs) : 0,
    legLen:   writing.legLen ?? d.legLen,
    bury:     writing.bury   ?? d.bury,
  };
}

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
    /* ⚠️ The Look is not a choice on a message that came from a CATALOGUE ROW.
     *
     * Texts offers "Piped cream / Acrylic" because there the customer is typing a message and the
     * material is genuinely theirs to pick. This row is a PRODUCT — an acrylic topper somebody
     * authored, priced and put on the shelf — and offering to render it in cream turns the thing
     * they chose into something else entirely. Every acrylic number on it (sheet, bar, legs, the
     * finishes on offer) would be meaningless the moment it was pressed.
     *
     * On the seed rather than checked in the editor, so it travels with the saved design: a message
     * reopened tomorrow still knows it came from a row. */
    lockLook: true,
    font: face,
    // An authored fit of 0 is a real choice ("set as drawn"), so `??` and not `||`.
    tracking: acrylic.tracking ?? faceFit(face),
    acrylicFinish: offered?.includes(acrylic.defaultFinish)
      ? acrylic.defaultFinish
      : (offered?.[0] ?? ACRYLIC_DEFAULTS.defaultFinish),
    /* ⚠️ `size`, NOT `fit` — on a row `fit` already means TRACKING (how tightly the letters close
       up, `faceFit` above), and one key meaning two things is how a studio ends up moving a number
       nothing consumes. This is how big the piece is on the cake; it seeds the Size slider, which
       the customer is then free to drag. */
    fit: typeof acrylic.size === 'number' ? acrylic.size : ACRYLIC_DEFAULTS.fit,
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
  /* ⚠️ THE ACRYLIC ONES, not every row in the table. The table also holds metallic CARD now, and
     "all of them" was a fine default only while acrylic was the only thing in it — the day card
     stock arrived, a message that had never been seeded from a row would have started offering
     "Gold card" as a finish for a piece of acrylic. Asked by medium, so neither list can drift. */
  return offered?.length ? offered : finishesOf('acrylic');
}
