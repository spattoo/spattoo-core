import opentype from 'opentype.js';
import { writeFileSync, readFileSync } from 'node:fs';

/* TTF → three.js typeface JSON, subset and normalised to 1000 units/em.
 *
 * The token format is the one FontLoader parses, and it is NOT the order the path commands come in:
 *   m x y            moveTo
 *   l x y            lineTo
 *   q x y  cx cy     quadratic — END POINT FIRST, then the control
 *   b x y  c1x c1y c2x c2y   cubic — end point first again
 * Getting that backwards produces a glyph that is subtly, plausibly wrong, so it is written down.
 */
const CHARS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 &\'’!?.,-#()/:+"'];
const RES = 1000;

export function convert(path, familyName) {
  const buf = readFileSync(path);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const k = RES / font.unitsPerEm;
  const r = (n) => Math.round(n * k);
  const glyphs = {};
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;

  for (const ch of CHARS) {
    const g = font.charToGlyph(ch);
    if (!g || (g.index === 0 && ch !== ' ')) continue;
    const cmds = g.path.commands;
    const o = [];
    for (const c of cmds) {
      if (c.type === 'M') o.push('m', r(c.x), r(c.y));
      else if (c.type === 'L') o.push('l', r(c.x), r(c.y));
      else if (c.type === 'Q') o.push('q', r(c.x), r(c.y), r(c.x1), r(c.y1));
      else if (c.type === 'C') o.push('b', r(c.x), r(c.y), r(c.x1), r(c.y1), r(c.x2), r(c.y2));
      // 'Z' is implicit: FontLoader closes each subpath itself.
    }
    const bb = g.getBoundingBox();
    const entry = { ha: r(g.advanceWidth), x_min: r(bb.x1 || 0), x_max: r(bb.x2 || 0), o: o.join(' ') };
    glyphs[ch] = entry;
    if (o.length) {
      xMin = Math.min(xMin, r(bb.x1)); xMax = Math.max(xMax, r(bb.x2));
      yMin = Math.min(yMin, r(bb.y1)); yMax = Math.max(yMax, r(bb.y2));
    }
  }

  return {
    glyphs,
    familyName,
    ascender: r(font.ascender),
    descender: r(font.descender),
    underlinePosition: r(font.tables.post?.underlinePosition ?? -100),
    underlineThickness: r(font.tables.post?.underlineThickness ?? 50),
    boundingBox: { xMin, xMax, yMin, yMax },
    resolution: RES,
    original_font_information: {
      full_font_name: font.names.fullName?.en ?? familyName,
      designer: font.names.designer?.en ?? '',
      license: 'SIL Open Font License 1.1',
      manufacturer_name: font.names.manufacturer?.en ?? '',
    },
  };
}

if (process.argv[2]) {
  const out = convert(process.argv[2], process.argv[3]);
  writeFileSync(process.argv[4], JSON.stringify(out));
  console.log(process.argv[3].padEnd(16), Object.keys(out.glyphs).length, 'glyphs,',
    Math.round(JSON.stringify(out).length / 1024) + 'KB');
}
