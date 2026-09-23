import { gelRecipeFor } from './gelLibrary.js';

// ── What the mix LOOKS like, not just what it is called ─────────────────────────────────────────
//
// The colour guide already says the right thing: *"White buttercream + a generous amount (build up
// gradually) of Sugarflair Egg Yellow."* Sandeep: *"sugarflair egg yellow might mean slightly
// differently to others. saying it plainly is good. but needs a pictorial view as well."*
//
// He is right, and the reason is specific: a gel's NAME is not a colour. Two brands' "egg yellow"
// are different pigments, a baker who stocks neither has to guess what family is meant, and the one
// thing the sentence cannot say is how far the target sits from the gel it starts at. The picture
// says all three at once — this white, this gel, and THIS is where you are heading.
//
//     ▢ white  +  ▣ gel  [+  ▣ second gel]  →  ▣ what that actually gets you
//
// ⚠️ NO NEW DATA. `gelLibrary.js` has carried a hex for every gel since it was written — "roughly
// full strength" — and the target hex is what the model read off the photo. Both were already on
// screen as words; this only draws them.
//
// ⚠️ THE MIDDLE CHIP IS THE GEL NEAT, AND THAT IS THE HONEST THING TO SHOW. It is not what the
// buttercream will look like after a drop — the third chip is that. Showing a diluted guess instead
// would invent a number (how much is "a generous amount"?) and put it on screen as fact, when the
// amount is the one part of this the baker judges by eye as they go.
//
// ⚠️ IT NEVER REPLACES THE SENTENCE. The words carry the brand, the name and the amount; the strip
// carries the colours. A picture alone would lose the shopping list, and this prints on a sheet a
// baker takes to a bench where there is no hover and no tooltip.

const CHIP = 16;

function Chip({ hex, title }) {
  return (
    <span
      title={title}
      style={{
        width: CHIP, height: CHIP, borderRadius: 4, background: hex,
        border: '1.5px solid rgba(0,0,0,0.14)', flexShrink: 0, display: 'inline-block',
      }}
    />
  );
}

// Typographic, not pictographic — these are operators, and the rule against emoji is about icons
// standing in for words (root CLAUDE.md #4). aria-hidden because the sentence beneath says it in
// words already, and a screen reader announcing "plus square arrow square" helps nobody.
function Op({ children }) {
  return (
    <span aria-hidden style={{ fontSize: 12, fontWeight: 800, color: '#B0AAA2', lineHeight: 1 }}>
      {children}
    </span>
  );
}

/**
 * The mix, drawn. Returns null when there is nothing to show — a colour that needs no gel is one
 * chip and a sentence, and a strip reading "white → white" is noise on a worksheet.
 *
 * @param {string} hex     the target colour
 * @param {object} recipe  a `gelRecipeFor` result; recomputed from `hex` when not supplied, so a
 *                         caller that already has one never pays for it twice (the report resolves
 *                         every recipe once, for the PDF's sake — see report.js).
 * @param {string} base    what it is mixed INTO. White buttercream for everything today; passed so
 *                         a coloured base (a chocolate buttercream) can be drawn honestly later
 *                         rather than being quietly shown as white.
 */
export default function GelMix({ hex, recipe = undefined, base = '#FFFFFF' }) {
  const rec = recipe === undefined ? gelRecipeFor(hex) : recipe;
  if (!rec?.gel?.hex) return null;

  /* ⚠️ THE LAST CHIP IS WHERE THE RECIPE LANDS, NOT WHAT WAS ASKED FOR. Drawing the target there
     would make every recipe look exact — including the ones that are not, which is the failure this
     drawing existed to expose in the first place (an olive answered with yellow). `reachedHex` is
     what gelLibrary says these gels actually get you; when it differs from the target, the row's own
     swatch is right there above it and the two can be compared. */
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
      <Chip hex={base} title="White buttercream" />
      <Op>+</Op>
      <Chip hex={rec.gel.hex} title={`${rec.gel.brand} ${rec.gel.name} — neat`} />
      {rec.second?.hex && (
        <>
          <Op>+</Op>
          <Chip hex={rec.second.hex} title={`${rec.second.brand} ${rec.second.name} — a touch, to correct it`} />
        </>
      )}
      <Op>→</Op>
      <Chip hex={rec.reachedHex ?? rec.hex ?? hex} title={`What this mix gets you — ${rec.reachedHex ?? rec.hex ?? hex}`} />
    </span>
  );
}
