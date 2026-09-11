import { describe, it, expect } from 'vitest';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { topperContours, topperSheets, topperBox, topperStick } from './topperPiece.js';
import { TOPPER_FINISHES, finishesOf } from './topperFinishes.js';
import { acrylicFinishes } from './acrylicConfig.js';

const font = new FontLoader().parse(helvetikerBold);
const fontOf = () => font;

const text = (over = {}) => ({
  id: 1, kind: 'text', text: 'TEST', size: 1, x: 0, y: 0,
  colour: '#F2AEC4', offset: 0, offsetColour: '#FFFFFF', face: '__block', ...over,
});
const shape = (over = {}) => ({ id: 2, kind: 'shape', family: 'circle', size: 1, x: 0, y: 0, colour: '#EEE', ...over });

describe('topperContours', () => {
  it('cuts a word', () => {
    const parts = topperContours(text(), font);
    expect(parts?.length).toBeGreaterThan(0);
  });

  it('gives nothing for empty or whitespace text, rather than a zero-sized shape', () => {
    // A blank word must not become a degenerate contour the renderer then has to guard against.
    expect(topperContours(text({ text: '' }), font)).toBeNull();
    expect(topperContours(text({ text: '   ' }), font)).toBeNull();
  });

  it('gives nothing when the face has not loaded yet', () => {
    // Faces resolve asynchronously; a cake mid-render must draw what it has, not throw.
    expect(topperContours(text(), null)).toBeNull();
  });

  it('builds each shape family', () => {
    for (const family of ['circle', 'rect', 'heart']) {
      expect(topperContours(shape({ family }), null), family).toHaveLength(1);
    }
  });
});

/* ── Shapes with a hole ───────────────────────────────────────────────────────────────────────── */
describe('the ring, the first family with a hole', () => {
  it('cuts a hole, where a circle of the same family does not', () => {
    const [ring]   = topperContours(shape({ family: 'ring' }), null);
    const [circle] = topperContours(shape({ family: 'circle' }), null);
    expect(ring.holes).toHaveLength(1);
    expect(circle.holes).toHaveLength(0);
  });

  /* ⚠️ THE HOLE WINDS THE OTHER WAY FROM ITS OUTER. `ExtrudeGeometry` triangulates by winding, so a
   * hole wound WITH its outer is not reliably a hole — it can come back as a second solid disc on
   * top of the first. Even-odd fills (the print sheet, the cutting file) are the forgiving case
   * rather than the rule, which is exactly why this is asserted here and not left to whichever
   * consumer happens to notice. */
  it('winds the hole against the outer, or it is not a hole to every consumer', () => {
    const [ring] = topperContours(shape({ family: 'ring' }), null);
    const area = (pts) => {
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        a += p.x * q.y - q.x * p.y;
      }
      return a / 2;
    };
    expect(Math.sign(area(ring.outer))).not.toBe(Math.sign(area(ring.holes[0])));
  });

  it('leaves a band, not a hairline and not a disc', () => {
    const [ring] = topperContours(shape({ family: 'ring' }), null);
    const span = (pts) => {
      const xs = pts.map(q => q.x);
      return Math.max(...xs) - Math.min(...xs);
    };
    const rim = (span(ring.outer) - span(ring.holes[0])) / 2 / span(ring.outer);
    expect(rim).toBeGreaterThan(0.06);   // thick enough to cut from card and lift off the mat
    expect(rim).toBeLessThan(0.18);      // thin enough to read as a band rather than a fat washer
  });

  /* An offset on a ring is an ordinary thing for a baker to ask for, and `offsetParts` redraws a
     shape at a distance from EVERY ring it has — so the hole must not make it fall over. */
  it('takes an offset band without falling over', () => {
    const sheets = topperSheets({ objects: [shape({ family: 'ring', offset: 0.08 })] }, fontOf);
    expect(sheets).toHaveLength(2);
    const wide = (parts) => Math.max(...parts.flatMap(p => p.outer.map(q => q.x)));
    expect(wide(sheets[0].parts)).toBeGreaterThan(wide(sheets[1].parts));   // the band is outside
  });
});

/* ── The threaded pair ─────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ EVERY ONE OF THESE GUARDS A SILENT FAILURE. A field-built shape never throws: it comes back as
 * the wrong shape, looking plausible, and only rendering it shows anything. Each of these was a real
 * wrong shape on the way here.
 */
describe('the interlocked rings', () => {
  const rings = () => topperContours(shape({ family: 'rings', size: 2 }), null);

  /* ⚠️ ONE PIECE. The first cut wove BOTH crossings, and two thin rings touch at exactly two places
   * — so cutting both left nothing holding them together and the "welded pair" came back as two
   * loose rings that merely overlapped, which is the very thing this shape exists to stop. It looked
   * almost right. `parts.length` is the only thing that says otherwise. */
  it('is ONE welded piece, not two rings that happen to overlap', () => {
    expect(rings()).toHaveLength(1);
  });

  /* The right ring's opening survives as a hole. The LEFT one deliberately does not — the weave slit
     opens it to the outside, which is what "this band passes behind" looks like as a cut. */
  it('keeps an opening you can see through', () => {
    const [piece] = rings();
    expect(piece.holes.length).toBeGreaterThanOrEqual(1);
  });

  it('spans its box, so `size` means what it says on a shape nobody writes on', () => {
    const [piece] = rings();
    const xs = piece.outer.map(q => q.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2, 1);
  });

  /* ⚠️ AND IT IS NOT GROWN TO CONTAIN A WORD. `backingPlate` fits a shape AROUND a word by growing
   * it until the corners of a box fall inside — which a threaded pair can never satisfy, so the
   * search ran to its cap and returned a piece TWENTY TIMES the size asked for. Nothing threw; the
   * topper was simply enormous. `plate: false` is what stops it. */
  it('is not inflated by the fit search', () => {
    const [piece] = rings();
    const ys = piece.outer.map(q => q.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(2);
  });

  /* ⚠️ THE WEAVE IS ACTUALLY CUT. The slit is about 1.5% of the shape across, and a grid coarser
   * than the cut simply does not see it: the rings come back welded at both crossings and look like
   * the weave was never asked for. Asserted as the piece being NARROWER at the top crossing than at
   * the bottom one — cut on one side, welded on the other. */
  it('breaks one band at the top crossing and welds them at the bottom', () => {
    const [piece] = rings();
    // How much material the piece has in a thin horizontal slice near the middle column.
    const spanNear = (yWant) => {
      const xs = piece.outer.concat(...piece.holes)
        .filter(q => Math.abs(q.y - yWant) < 0.03 && Math.abs(q.x) < 0.25)
        .map(q => q.x);
      return xs.length;
    };
    // The crossing sits at y = ±0.438 for this pair. A cut edge puts contour points there; a weld
    // puts none, because there is no boundary inside solid material.
    expect(spanNear(0.438)).toBeGreaterThan(spanNear(-0.438));
  });
});

describe('topperSheets', () => {
  it('is empty for an empty payload', () => {
    expect(topperSheets({ objects: [] }, fontOf)).toEqual([]);
    expect(topperSheets(null, fontOf)).toEqual([]);
  });

  /* ⚠️ The order IS the stacking, and coplanar extrusions do not stack — a word laid on a disc at
   * the same depth has half its letters inside it. If this ever stops being back-to-front, letters
   * show through the shape they are sitting on. */
  it('puts a shape behind a word added after it', () => {
    const sheets = topperSheets({ objects: [shape(), text()] }, fontOf);
    const shapeLayer = sheets[0].layer;
    const textLayer = sheets[sheets.length - 1].layer;
    expect(textLayer).toBeGreaterThan(shapeLayer);
  });

  it('puts a band behind its own word and in front of what is below', () => {
    const sheets = topperSheets({ objects: [shape(), text({ offset: 0.08 })] }, fontOf);
    expect(sheets).toHaveLength(3);                       // shape, band, word
    const [plate, band, word] = sheets;
    expect(band.layer).toBeGreaterThan(plate.layer);      // the band never falls behind the plate
    expect(word.layer).toBeGreaterThan(band.layer);       // and never in front of its own word
    expect(band.colour).toBe('#FFFFFF');
  });

  /* ⚠️ A SHAPE GETS A BAND TOO. This was text-only, and the gap was invisible: nothing failed, a
   * heart simply had no way to carry an outline and the control was not offered for one. */
  it('gives a shape its own offset band, behind it', () => {
    const sheets = topperSheets({ objects: [shape({ offset: 0.1, offsetColour: '#FFFFFF' })] }, fontOf);
    expect(sheets).toHaveLength(2);                       // the band, then the shape
    const [band, face] = sheets;
    expect(band.colour).toBe('#FFFFFF');
    expect(face.layer).toBeGreaterThan(band.layer);       // the band never covers its own shape
  });

  it('leaves a shape alone when it has no offset', () => {
    // Every shape saved before offsets existed carries no `offset` key at all.
    expect(topperSheets({ objects: [shape()] }, fontOf)).toHaveLength(1);
    expect(topperSheets({ objects: [shape({ offset: 0 })] }, fontOf)).toHaveLength(1);
  });

  /* ⚠️ A BAND SITS ON ITS OWN PIECE, NOT AT THE ORIGIN. It used to take the default (0, 0) while the
   * face carried the object's position, so an outline detached and slid to the middle of the topper.
   * Invisible while everything with an offset happened to be centred. */
  it('puts the offset band at its own object\'s position', () => {
    const sheets = topperSheets({ objects: [
      text({ id: 1, offset: 0.1, x: -0.58, y: 0.2 }),
      shape({ id: 2, offset: 0.1, x: 0.58, y: -0.2 }),
    ] }, fontOf);
    expect(sheets).toHaveLength(4);
    for (const sh of sheets) {
      // Each pair — band then face — shares one position.
      expect(Math.abs(sh.x)).toBeCloseTo(0.58, 5);
      expect(Math.abs(sh.y)).toBeCloseTo(0.2, 5);
    }
    expect(sheets[0].x).toBe(sheets[1].x);   // the word's band sits on the word
    expect(sheets[2].x).toBe(sheets[3].x);   // the shape's band sits on the shape
  });

  it('leaves out a word that cannot be cut', () => {
    expect(topperSheets({ objects: [text({ text: '' })] }, fontOf)).toEqual([]);
  });

  /* ── Metallic card ────────────────────────────────────────────────────────────────────────────
   * A piece is CUT FROM a stock, so the stock travels with the sheet and decides what colour that
   * sheet reads as. Everything downstream asks this one function. */
  it('carries a piece\'s finish onto its sheet', () => {
    const [sheet] = topperSheets({ objects: [text({ finish: 'card_gold' })] }, fontOf);
    expect(sheet.finish).toBe('card_gold');
  });

  /* ⚠️ THE CARD'S COLOUR, NOT THE WHEEL'S. A baker picks pink, then chooses gold — the pink is still
   * on the object. The cutting file writes `sheet.colour` as the layer's fill, which is the one
   * place whose whole job is to say WHICH CARD to cut from, so a gold "10" arriving as a pink layer
   * would send the baker to the wrong sheet. */
  it('reports the CARD\'s colour for a metallic sheet, not the hex underneath', () => {
    const [sheet] = topperSheets({ objects: [text({ colour: '#F2AEC4', finish: 'card_gold' })] }, fontOf);
    expect(sheet.colour).not.toBe('#F2AEC4');
    expect(sheet.colour).toBe(TOPPER_FINISHES.card_gold.color);
  });

  /* ⚠️ AND THE OBJECT IS NOT REWRITTEN — only what the sheet reports. A baker who changes their mind
   * about gold gets their own colour back; storing the swatch over it would lose what they picked. */
  it('leaves the object\'s own colour alone', () => {
    const obj = text({ colour: '#F2AEC4', finish: 'card_gold' });
    topperSheets({ objects: [obj] }, fontOf);
    expect(obj.colour).toBe('#F2AEC4');
  });

  /* ⚠️ THE BAND HAS ITS OWN CARD. A white word on a gold band is the commonest metallic topper made
   * — commoner than a gold word — so the two are cut from two sheets and must not share a key. */
  it('gives the offset band a stock of its own', () => {
    const [band, face] = topperSheets({ objects: [
      text({ offset: 0.08, offsetFinish: 'card_gold', finish: null, colour: '#FFFFFF' }),
    ] }, fontOf);
    expect(band.finish).toBe('card_gold');
    expect(band.colour).toBe(TOPPER_FINISHES.card_gold.color);
    expect(face.finish).toBeNull();
    expect(face.colour).toBe('#FFFFFF');
  });

  it('is plain card when nothing says otherwise, so every topper saved before this is unchanged', () => {
    const [sheet] = topperSheets({ objects: [text({ colour: '#F2AEC4' })] }, fontOf);
    expect(sheet.finish).toBeNull();
    expect(sheet.colour).toBe('#F2AEC4');
  });

  /* A finish an admin has since withdrawn must not take the colour with it — the piece still cuts,
     in the hex it carries, rather than vanishing or arriving as `undefined`. */
  it('falls back to the hex when the finish is unknown', () => {
    const [sheet] = topperSheets({ objects: [text({ colour: '#F2AEC4', finish: 'nonesuch' })] }, fontOf);
    expect(sheet.colour).toBe('#F2AEC4');
  });
});

describe('card stock and acrylic stay apart', () => {
  /* ⚠️ ONE TABLE, ASKED BY MEDIUM. They are both "topper finishes" and they are different materials:
   * mirror acrylic is a sheet of plastic, metallic card is foil on board. Before `medium`, the
   * acrylic message's default was "every key in the table" — so the day card stock was added, a
   * message seeded from no row would have started offering "Gold card" for a piece of acrylic. */
  it('offers card stock to the card studio and none of it to acrylic', () => {
    expect(finishesOf('card')).toContain('card_gold');
    expect(finishesOf('card')).not.toContain('gold');
    expect(acrylicFinishes()).toContain('gold');
    expect(acrylicFinishes()).not.toContain('card_gold');
  });

  it('every finish says what it is made of, so neither list can silently gain a row', () => {
    for (const [key, f] of Object.entries(TOPPER_FINISHES)) {
      expect(['acrylic', 'card'], key).toContain(f.medium);
    }
  });
});

describe('topperBox', () => {
  it('measures what the topper OCCUPIES, not the sizes added up', () => {
    const one = topperBox({ objects: [shape({ size: 1 })] }, fontOf);
    const two = topperBox({ objects: [shape({ size: 1 }), shape({ id: 3, size: 1, x: 3 })] }, fontOf);
    // Two 1-wide shapes 3 apart span about 4, never 2.
    expect(two.w).toBeGreaterThan(one.w * 2);
    expect(two.cx).toBeGreaterThan(one.cx);
  });

  it('grows with the offset band, because the band is part of the piece', () => {
    const bare = topperBox({ objects: [text({ offset: 0 })] }, fontOf);
    const band = topperBox({ objects: [text({ offset: 0.1 })] }, fontOf);
    expect(band.w).toBeGreaterThan(bare.w);
    expect(band.h).toBeGreaterThan(bare.h);
  });

  it('is null when there is nothing on it', () => {
    expect(topperBox({ objects: [] }, fontOf)).toBeNull();
  });
});

describe('topperStick', () => {
  const box = { w: 2, h: 1, cx: 0, cy: 0 };

  it('is nothing at all unless there is a stick', () => {
    expect(topperStick(box, null)).toBeNull();
    expect(topperStick(box, { on: false, bury: 0.5 })).toBeNull();
    expect(topperStick(null, { on: true })).toBeNull();
  });

  /* ⚠️ A stick that stops at the card's bottom edge hangs off it with daylight between the two, and
   * reads as a card floating above a rod. The tuck is the attachment. */
  it('runs UP behind the card as well as down below it', () => {
    const s = topperStick(box, { on: true, bury: 0.5 });
    expect(s.topY).toBeGreaterThan(box.cy - box.h / 2);   // above the card's bottom edge
    expect(s.bottomY).toBeLessThan(box.cy - box.h / 2);   // and below it
  });

  /* ⚠️ `bury` is a FRACTION, so the stick can never be the thing that runs out and nothing has to be
   * re-measured when the topper is resized. */
  it('buries a fraction of the hanging part, clamped', () => {
    expect(topperStick(box, { on: true, bury: 0.5 }).buried).toBeCloseTo(topperStick(box, { on: true }).len * 0.5, 6);
    expect(topperStick(box, { on: true, bury: 5 }).bury).toBe(1);
    expect(topperStick(box, { on: true, bury: -3 }).bury).toBe(0);
    expect(topperStick(box, { on: true, bury: undefined }).bury).toBe(0.5);
  });

  it('scales with the card, so a resized topper keeps its proportions', () => {
    const small = topperStick({ ...box, h: 1 }, { on: true, bury: 0.5 });
    const big   = topperStick({ ...box, h: 2 }, { on: true, bury: 0.5 });
    expect(big.len / small.len).toBeCloseTo(2, 6);
    expect(big.tuck / small.tuck).toBeCloseTo(2, 6);
  });

  /* ⚠️ THE STICK IS NOT A SHEET. If it ever entered topperSheets/topperBox the card would shrink to
   * fit a box that is mostly rod, and the print sheet would print a picture of a stick. */
  it('never reaches the sheets or the measured box', () => {
    const withStick = { v: 1, objects: [text()], stick: { on: true, bury: 0.5 } };
    const without   = { v: 1, objects: [text()] };
    expect(topperSheets(withStick, fontOf)).toHaveLength(topperSheets(without, fontOf).length);
    expect(topperBox(withStick, fontOf)).toEqual(topperBox(without, fontOf));
  });
});
