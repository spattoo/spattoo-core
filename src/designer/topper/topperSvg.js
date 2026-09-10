import { topperSheets, topperBox } from '../geometry/topperPiece.js';

// ── A card topper as a cutting file ──────────────────────────────────────────────────────────────
//
// The same contours the cake draws and the print sheet prints, serialised for a cutting machine
// instead of a canvas. That is the whole reason the A4 sheet was built on contours rather than
// pixels: a cut file is a different SERIALISER over one geometry, never a second derivation, so a
// machine can never cut a shape the customer did not approve.
//
// ⚠️ ONE PATH PER COLOUR, WHICH IS THE OPPOSITE OF THE PRINT SHEET — and deliberately so. A printed
// topper is one piece with its offset baked in, because the baker prints it and cuts round the
// outside. A machine does not print: it cuts each colour from a DIFFERENT sheet of card, and the
// baker stacks them. So the band and the face have to arrive as separate layers, and every design
// tool that reads these files treats one path as one layer.
//
// ⚠️ NO STICK. It is taped on, not cut from card — it is already outside `topperSheets`, and this is
// the second reason that was right.
//
// ⚠️ MILLIMETRES, WITH A MATCHING viewBox. Cutting software assumes 96 dpi for a unitless SVG and
// imports it at the wrong scale; stating mm on both `width`/`height` and the viewBox is what makes a
// file open at the size it says. The SIZE ITSELF is a starting point, not a measurement — no saved
// design records a real-world one (see chefsdesk/a4/cutoutSource.js, which sets out why at length),
// so the file says what it is and the baker sets the real size in their own software, which is where
// that judgement is easy and exact.

/** How wide one topper is written, in millimetres. A starting size — see the note above. */
export const DEFAULT_WIDTH_MM = 100;
const GAP_MM = 10;           // between toppers, so a machine's auto-arrange has something to hold
const DP = 3;                // decimal places: finer than any blade, far short of noise

const n = (v) => Number(v.toFixed(DP));

/* One sheet's contours as SVG path data. Holes are subpaths of the SAME path and the fill rule is
   even-odd, because the counter of an "O" is not a shape — it is the absence of one. */
function pathData(sheet, project) {
  let d = '';
  for (const part of sheet.parts) {
    const ring = (pts) => {
      if (!pts?.length) return;
      pts.forEach((q, i) => {
        const [x, y] = project(q.x + (sheet.x ?? 0), q.y + (sheet.y ?? 0));
        d += `${i ? 'L' : 'M'}${n(x)} ${n(y)}`;
      });
      d += 'Z';
    };
    ring(part.outer);
    for (const h of part.holes ?? []) ring(h);
  }
  return d;
}

/**
 * Lay one topper out for cutting: its layers, and how much room it takes in millimetres.
 * Pure — no DOM — so what gets cut can be checked without a browser.
 */
export function topperLayers(payload, fontOf, { widthMm = DEFAULT_WIDTH_MM } = {}) {
  const box = topperBox(payload, fontOf);
  const sheets = topperSheets(payload, fontOf);
  if (!box || !(box.w > 0) || !(box.h > 0) || !sheets.length) return null;

  const scale = widthMm / box.w;
  const heightMm = box.h * scale;
  // Composer y grows UP and SVG's grows DOWN, so every point is flipped. Getting this wrong does not
  // throw — it cuts the topper mirrored, and only somebody holding the card would notice.
  const project = (x, y) => [(x - (box.cx - box.w / 2)) * scale, ((box.cy + box.h / 2) - y) * scale];

  /* ⚠️ MERGED BY COLOUR. `topperSheets` yields a sheet per piece, so two words in one colour are two
     sheets — but they are cut from ONE sheet of card, and a machine treats one path as one layer.
     Merging means the baker loads each colour once instead of once per word. First appearance sets
     the order, so the back layer stays the back layer. */
  const byColour = new Map();
  for (const sheet of sheets) {
    const key = (sheet.colour || '#FFFFFF').toUpperCase();
    byColour.set(key, (byColour.get(key) ?? '') + pathData(sheet, project));
  }

  return {
    widthMm, heightMm,
    layers: [...byColour].map(([colour, d]) => ({ colour, d })),
  };
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Every card topper on a cake, as one cutting file.
 *
 * ⚠️ ONE FILE, NOT ONE PER TOPPER. A cake with two toppers is one job — one import, one mat, one
 * cut. Each topper is its own group, so a machine can still separate them.
 *
 * @param {Array} toppers  `[{ id, name, payload }]`
 * @param {Function} fontOf  the face for an object, already loaded
 * @returns {string|null} SVG text, or null when nothing on the cake can be cut
 */
export function toppersToSvg(toppers, fontOf, { widthMm = DEFAULT_WIDTH_MM } = {}) {
  const laid = [];
  let x = 0;
  for (const t of toppers ?? []) {
    const one = topperLayers(t?.payload, fontOf, { widthMm });
    if (!one) continue;                      // an empty topper is left out, not written as a blank
    laid.push({ ...one, name: t.name, x });
    x += one.widthMm + GAP_MM;
  }
  if (!laid.length) return null;

  const totalW = x - GAP_MM;
  const totalH = Math.max(...laid.map(l => l.heightMm));

  const groups = laid.map(l => [
    `  <g transform="translate(${n(l.x)} 0)">`,
    `    <title>${esc(l.name || 'Card topper')}</title>`,
    ...l.layers.map(y => `    <path fill="${y.colour}" fill-rule="evenodd" d="${y.d}"/>`),
    '  </g>',
  ].join('\n')).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(totalW)}mm" height="${n(totalH)}mm"`,
    `     viewBox="0 0 ${n(totalW)} ${n(totalH)}">`,
    groups,
    '</svg>',
    '',
  ].join('\n');
}
