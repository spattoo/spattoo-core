// ── A composed card topper, turned into contours ─────────────────────────────────────────────────
//
// One function answers "what shape is this topper", and BOTH the composer and the cake ask it.
//
// ⚠️ THAT IS THE WHOLE POINT OF THE FILE (INVARIANTS #15). The composer had this logic inside it,
// which was fine while the composer was the only thing that drew a topper. The moment a cake draws
// one too, a private copy is two answers to one question — and the one on the cake is the one the
// customer sees, so the studio would be the half that quietly went wrong.
//
// ⚠️ IT TAKES THE OBJECT LIST, WHICH IS WHAT IS STORED. A saved topper holds its words, not the
// contours cut from them (see TopperComposer's note and baker_garnishes' before it), so the cutting
// happens here on the way in — which is also why an improvement to `topperShapes` or `offsetParts`
// reaches every topper already kept.
import { topperShapes, backingPlate, offsetParts } from './topperShape.js';
import { TOPPER_FINISHES } from './topperFinishes.js';

/* What colour a sheet READS as, which is not always the colour on the object.
 *
 * ⚠️ A METALLIC SHEET'S COLOUR COMES FROM ITS CARD, not from the wheel. A piece cut from gold card
 * has whatever hex it last carried still sitting on it — the baker picked pink, then chose gold —
 * and everything downstream of here reads `sheet.colour`: the cutting file writes it as the layer's
 * fill, and the print sheet fills the shape with it. Left alone, a gold "10" would arrive in the
 * baker's cutting software as a PINK layer, which is the one place the colour's whole job is to say
 * which card to cut it from.
 *
 * ⚠️ AND THE OBJECT'S OWN HEX IS NOT OVERWRITTEN, only what this function reports. A baker who
 * chooses gold and changes their mind gets their colour back; storing the swatch over it would lose
 * what they picked. One place decides, and it is the place both renderers already ask. */
const sheetColour = (colour, finish) => TOPPER_FINISHES[finish]?.color ?? colour;

/* One object's outline. `font` is the face already loaded for it — resolving faces is asynchronous
 * and belongs to the caller, which knows whether it can wait (a studio) or must draw what it has
 * (a cake mid-render). */
export function topperContours(obj, font) {
  if (!obj) return null;
  if (obj.kind === 'text') {
    if (!font || !String(obj.text ?? '').trim()) return null;
    const probe = topperShapes(font, obj.text, { height: 1 });
    if (!probe.width) return null;
    return topperShapes(font, obj.text, { height: obj.size / probe.width }).parts;
  }
  /* A shape has no word to fit, so it is fitted to a box of its own size — `backingPlate` sizes
   * itself around whatever it is given, and giving it a box is how you ask for the shape alone.
   *
   * ⚠️ `ratio` IS WIDTH OVER HEIGHT, and it is why a rectangle can be a NAME PLAQUE. The box was
   * always square, so "rect" — the one family that follows what it is fitted around — could only
   * ever come out square, and a preset asking for a rectangle got a lozenge. Absent means 1, so every
   * shape saved before this is unchanged. A circle and a heart ignore it by their own rule
   * (`followsBox`), which is why the studio only offers the control where it does something. */
  const hh = obj.size / 2;
  const hw = hh * (Number.isFinite(obj.ratio) && obj.ratio > 0 ? obj.ratio : 1);
  const box = [{
    outer: [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }],
    holes: [],
  }];
  const plate = backingPlate(box, { family: obj.family, pad: 0 });
  return plate ? [plate] : null;
}

/* Every sheet of a topper, back to front, ready to extrude:
 *   [{ parts, colour, layer }]
 *
 * `layer` is the stacking order, and it exists because COPLANAR EXTRUSIONS DO NOT STACK: a word laid
 * on a disc at the same depth has half its letters inside the disc, so the disc wins wherever it
 * happens to be nearer and the letters show through in patches. It reads as transparency and is two
 * solids sharing a plane. The renderer turns this into a depth; what matters here is only the order.
 */
export function topperSheets(payload, fontOf) {
  const objects = Array.isArray(payload?.objects) ? payload.objects : [];
  const sheets = [];
  objects.forEach((obj, i) => {
    const parts = topperContours(obj, fontOf?.(obj));
    if (!parts?.length) return;
    /* The offset sheet goes BEHIND the piece it belongs to and in front of everything below it, so a
       band never separates from its own word or shape.

       ⚠️ ANY PIECE, NOT ONLY A WORD. This was gated on `kind === 'text'` on the reasoning that a
       shape is already a solid, so an outline round it is just a second shape you could add
       yourself. That is true and it is not the same thing: a second heart has to be sized and
       centred BY EYE, and it comes apart again the moment the first one is moved or resized. An
       offset is exact, and it is locked to its piece. The machinery never cared — `offsetParts`
       walks contours and has no opinion about where they came from. */
    if (obj.offset > 0) {
      /* ⚠️ THE BAND CARRIES ITS OBJECT'S POSITION TOO. It did not, and defaulted to the origin — so
         an outline DETACHED from the piece it belongs to and sat in the middle of the topper. It hid
         for as long as it did because everything that had an offset was centred: the moment two
         hearts went to x = ±0.58, both their white bands stacked up in the gap between them and ate
         the white letters of the word on top. On a cake it is worse than it looks in a studio — the
         band is part of the CUT, so the piece would be cut wrong. */
      /* ⚠️ THE BAND HAS ITS OWN CARD. A white word on a GOLD band is the commonest metallic topper
         there is — commoner than a gold word — so the band carries `offsetFinish` exactly as the
         face carries `finish`. They are two pieces of card and the baker cuts them from two
         sheets. */
      sheets.push({
        parts: offsetParts(parts, obj.offset * obj.size),
        colour: sheetColour(obj.offsetColour, obj.offsetFinish), finish: obj.offsetFinish ?? null,
        layer: i * 2, x: obj.x ?? 0, y: obj.y ?? 0,
      });
    }
    sheets.push({
      parts, colour: sheetColour(obj.colour, obj.finish), finish: obj.finish ?? null,
      layer: i * 2 + 1, x: obj.x ?? 0, y: obj.y ?? 0,
    });
  });
  return sheets.map(s => ({ x: 0, y: 0, finish: null, ...s }));
}

/* How big the finished topper is, in the composer's own units — the bounding box of everything on
 * it, which is what `garnishPlacement` wants as its `piece`.
 *
 * ⚠️ MEASURED FROM THE BUILT SHEETS, never from the objects' sizes. An object's `size` is the height
 * a word was cut at; what a topper actually OCCUPIES is where its pieces ended up, including the
 * offset band and every object's own position. Adding sizes up gives a number that is never the
 * width of anything.
 */
export function topperBox(payload, fontOf) {
  let lo = Infinity, hi = -Infinity, bo = Infinity, to = -Infinity;
  for (const sheet of topperSheets(payload, fontOf)) {
    for (const p of sheet.parts) for (const q of p.outer) {
      const x = q.x + sheet.x, y = q.y + sheet.y;
      if (x < lo) lo = x; if (x > hi) hi = x;
      if (y < bo) bo = y; if (y > to) to = y;
    }
  }
  if (!Number.isFinite(lo)) return null;
  return { w: hi - lo, h: to - bo, cx: (lo + hi) / 2, cy: (bo + to) / 2 };
}

// ── The stick ────────────────────────────────────────────────────────────────────────────────────
//
// ⚠️ NOT A SHEET, AND DELIBERATELY OUTSIDE `topperSheets` AND `topperBox`. A stick is not cut from
// card — it is taped to the back — so putting it among the sheets would have three consequences, all
// wrong: the topper's measured height would include it, so the CARD would shrink to fit a box that is
// mostly rod; the print sheet would print a picture of a stick; and a saved topper's proportions
// would change the day someone ticked the box.
//
// ⚠️ IT TUCKS UP BEHIND THE CARD. A stick that stops at the bottom edge hangs off it with daylight
// between the two, and reads as a card floating above a rod. A real one runs a good way up the back
// and you never see the join, because the card hides it — so `tuck` is overlap, and the overlap IS
// the attachment. Nothing is glued in the geometry.
//
// ⚠️ LENGTH IS PROPORTIONAL, so it survives scaling. What matters is only that there is more stick
// than anyone will push in — `bury` is a FRACTION of it, so the stick can never be the thing that
// runs out, and the fraction means nothing has to be re-measured when the topper is resized.
const STICK_BELOW = 0.8;    // how far it hangs below the card, as a fraction of the card's height
const STICK_TUCK  = 0.55;   // how far it runs UP behind the card, likewise

/**
 * The stick's geometry in the composer's own units, or null when there is no stick.
 *
 * ⚠️ ONE FUNCTION, ASKED BY THE STUDIO AND BY THE CAKE. Two copies of "how long is the stick" is how
 * a baker buries it to the right depth on one screen and the wrong one on the other.
 *
 * `bury` is a fraction of `len` — how much of the hanging part goes into the icing.
 */
export function topperStick(box, stick) {
  if (!stick?.on || !box || !(box.h > 0)) return null;
  const len = box.h * STICK_BELOW;
  const tuck = box.h * STICK_TUCK;
  const bottom = box.cy - box.h / 2;
  const bury = Math.max(0, Math.min(1, Number.isFinite(stick.bury) ? stick.bury : 0.5));
  return {
    len,
    tuck,
    bury,
    buried: len * bury,
    radius: Math.max(box.h * 0.014, 0.006),
    topY: bottom + tuck,        // where it ends, hidden behind the card
    bottomY: bottom - len,      // the end that goes into the cake
  };
}
