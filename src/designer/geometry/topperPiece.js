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
      sheets.push({
        parts: offsetParts(parts, obj.offset * obj.size), colour: obj.offsetColour, layer: i * 2,
        x: obj.x ?? 0, y: obj.y ?? 0,
      });
    }
    sheets.push({ parts, colour: obj.colour, layer: i * 2 + 1, x: obj.x ?? 0, y: obj.y ?? 0 });
  });
  return sheets.map(s => ({ x: 0, y: 0, ...s }));
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
