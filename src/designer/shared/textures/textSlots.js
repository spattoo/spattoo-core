// ── Text slots ────────────────────────────────────────────────────────────────
// The ONE renderer for "template artwork + editable text placeholders". A template element carries
// `placement_config.text_slots` — an array of named slots ({number}, {name}, …) — and the customer's
// values are rendered INTO the artwork on a 2D canvas at design time. Consequences of that choice:
//   • assets are O(1) per template — a value is never an asset, so "2", "47" and "Amara" cost nothing;
//   • nothing branches on element type or slug (INVARIANTS #1) — a template with 0 slots is a plain
//     sticker, 1 slot is a number plaque, 2 is a "Happy 5th, Amara" banner.
//
// The data↔code seam mirrors cake_textures: `style.algorithm` KEYS into ALGORITHMS below. A brand-new
// look needs a new strategy here; tuning an existing one is pure config (a DB `text_styles` row).
//
// Geometry is NORMALIZED (0..1 of the artwork) so a slot survives any raster size.
// This module is pure canvas-2D + framework-free ON PURPOSE. It is the SINGLE renderer: the designer
// composites the customer's value with it (useStickerImageTexture) and the admin Text Topper Studio
// previews with the very same import (`@spattoo/designer`) — there is no second copy to drift.

// The ONE CORS qualifier — imported, never re-inlined.
// A webfont is always fetched in CORS mode, so it is exposed to the same R2 cache-poisoning failure as
// a texture: a cached no-ACAO response would block the FontFace load and the topper would silently
// fall back to sans-serif.
import { corsUrl } from '../../utils/assetUrl.js';

export const TEXT_SLOT_KINDS = Object.freeze({ NUMBER: 'number', TEXT: 'text' });

// A style's tunable params. `algorithm` picks the strategy; everything else is config.
export const DEFAULT_TEXT_STYLE = Object.freeze({
  algorithm: 'scribble',
  font: { family: 'sans-serif', url: null, weight: 800 },
  fill: '#5A3410',
  hatch: { color: '#F3E3C8', angle: -35, gap: 0.055, width: 0.014 }, // gap/width are fractions of glyph height
  outline: { color: '#3F230A', width: 0.05, wobble: 0.35 },          // width is a fraction of glyph height
  // 'fondant' only: the shading that makes a glyph read as a rolled, puffy piece of icing. `bevel` is a
  // fraction of the STROKE's own thickness (not of glyph height — see strokeThickness), so one style
  // holds for a fat "4" and a thin "Amara" alike; the shadow lengths are fractions of glyph height;
  // `light` is the direction the light comes FROM, in degrees.
  fondant: { light: 135, bevel: 0.5, gloss: 0.55, ao: 0.45, shadow_blur: 0.08, shadow_dy: 0.04, shadow_alpha: 0.35 },
  tracking: 0,      // extra letter-spacing, fraction of glyph height
  fit: 0.92,        // how much of the slot the text fills
});

// Deep-merge a style preset with a per-slot override, so a slot can tweak one field (e.g. fill) without
// restating the whole preset. One level of nesting is all the shape has.
export function resolveStyle(preset, override) {
  const out = { ...DEFAULT_TEXT_STYLE, ...(preset || {}), ...(override || {}) };
  for (const k of ['font', 'hatch', 'outline', 'fondant']) {
    out[k] = { ...DEFAULT_TEXT_STYLE[k], ...(preset?.[k] || {}), ...(override?.[k] || {}) };
  }
  return out;
}

// Load a style's webfont so canvas can shape with it. A style's font is DATA (an uploaded woff2), not a
// hardcoded family — so a new art style never needs a code change. Idempotent + cached per family+url.
const _fontCache = new Map();
export function loadStyleFont(font) {
  const family = font?.family;
  if (!family || !font?.url) return Promise.resolve(family || 'sans-serif');
  const ck = `${family}|${font.url}`;
  if (_fontCache.has(ck)) return _fontCache.get(ck);
  const p = (async () => {
    const face = new FontFace(family, `url(${JSON.stringify(corsUrl(font.url))})`, { weight: String(font.weight ?? 800) });
    await face.load();
    document.fonts.add(face);
    return family;
  })().catch(() => 'sans-serif'); // a dead font URL degrades to the default face, never a blank topper
  _fontCache.set(ck, p);
  return p;
}
export function loadSlotFonts(slots, styleOf) {
  return Promise.all((slots || []).map(sl => loadStyleFont(resolveStyle(styleOf(sl), sl.style_override).font)));
}

function cssFont(style, px) {
  const f = style.font || {};
  return `${f.weight ?? 800} ${px}px ${JSON.stringify(f.family || 'sans-serif')}, sans-serif`;
}

// Largest font size at which `text` fits the slot box, so a 1-char "2" and a 9-char name both sit right.
// Binary search on the real measured metrics — never a guessed ratio.
function fitFontSize(ctx, text, style, boxW, boxH) {
  const track = t => (style.tracking || 0) * t;
  let lo = 1, hi = Math.ceil(boxH * 2), best = 1;
  for (let i = 0; i < 24 && lo <= hi; i++) {
    const mid = (lo + hi) / 2;
    ctx.font = cssFont(style, mid);
    const m = ctx.measureText(text);
    const w = m.width + track(mid) * Math.max(0, text.length - 1);
    const asc = m.actualBoundingBoxAscent || mid * 0.72;
    const desc = m.actualBoundingBoxDescent || mid * 0.22;
    const h = asc + desc;
    if (w <= boxW && h <= boxH) { best = mid; lo = mid + 0.5; } else { hi = mid - 0.5; }
  }
  return best;
}

// Draw `text` centred at the origin, letter by letter, so `tracking` is honoured. `draw` does the ink.
function eachGlyph(ctx, text, size, style, draw) {
  const track = (style.tracking || 0) * size;
  const widths = [...text].map(ch => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + track * Math.max(0, text.length - 1);
  let x = -total / 2;
  [...text].forEach((ch, i) => {
    draw(ch, x + widths[i] / 2);
    x += widths[i] + track;
  });
}

// ── Strategies ────────────────────────────────────────────────────────────────
// A strategy inks ONE slot's text into `ctx`, already translated+rotated to the slot centre with the
// font size resolved. Adding a look = adding a key here (+ its params to the style config).

// 'scribble' — the hand-drawn plaque look: a solid glyph with light hairlines CARVED through it
// (the "scribble" is the gaps, not the strokes) under a darker, slightly wobbly outline.
function inkScribble(ctx, text, size, style) {
  const { fill, hatch, outline } = style;
  const ow = (outline.width || 0) * size;

  // The outline ring: stroke UNDER the fill so only its outer half survives. Re-stroked at small
  // offsets to fake the wobble of a hand-drawn line.
  if (ow > 0) {
    ctx.save();
    ctx.strokeStyle = outline.color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const jitter = (outline.wobble || 0) * ow * 0.5;
    const passes = jitter > 0
      ? [[0, 0], [jitter, jitter * 0.6], [-jitter * 0.7, jitter * 0.4], [jitter * 0.3, -jitter * 0.8]]
      : [[0, 0]];
    for (const [dx, dy] of passes) {
      ctx.lineWidth = ow * 2; // half sits inside the glyph and is covered by the fill below
      eachGlyph(ctx, text, size, style, (ch, cx) => ctx.strokeText(ch, cx + dx, dy));
    }
    ctx.restore();
  }

  // The glyph interior, drawn on its own layer so the hatch can be clipped to it (`source-atop`)
  // without ever touching the outline ring.
  const pad = Math.ceil(ow * 3 + size * 0.5);
  const w = Math.ceil(ctx.measureText(text).width + (style.tracking || 0) * size * text.length) + pad * 2;
  const h = Math.ceil(size * 2) + pad * 2;
  const lay = document.createElement('canvas');
  lay.width = Math.max(1, w); lay.height = Math.max(1, h);
  const lx = lay.getContext('2d');
  lx.font = ctx.font;
  lx.textAlign = 'center';
  lx.textBaseline = 'middle';
  lx.translate(w / 2, h / 2);

  lx.fillStyle = fill;
  eachGlyph(lx, text, size, style, (ch, cx) => lx.fillText(ch, cx, 0));

  // Carve the hairlines: they exist ONLY where the glyph already is.
  const gap = (hatch?.gap || 0) * size;
  if (gap > 0.4) {
    lx.save();
    lx.globalCompositeOperation = 'source-atop';
    lx.strokeStyle = hatch.color;
    lx.lineWidth = Math.max(0.5, (hatch.width || 0) * size);
    lx.lineCap = 'round';
    lx.rotate(((hatch.angle || 0) * Math.PI) / 180);
    const span = Math.hypot(w, h);
    lx.beginPath();
    for (let y = -span / 2; y <= span / 2; y += gap) {
      lx.moveTo(-span / 2, y);
      lx.lineTo(span / 2, y);
    }
    lx.stroke();
    lx.restore();
  }

  ctx.drawImage(lay, -w / 2, -h / 2);
}

// 'flat' — the plain look: solid fill + optional outline, no hatch. The baseline every style degrades to.
function inkFlat(ctx, text, size, style) {
  const ow = (style.outline?.width || 0) * size;
  if (ow > 0) {
    ctx.strokeStyle = style.outline.color;
    ctx.lineJoin = 'round';
    ctx.lineWidth = ow * 2;
    eachGlyph(ctx, text, size, style, (ch, cx) => ctx.strokeText(ch, cx, 0));
  }
  ctx.fillStyle = style.fill;
  eachGlyph(ctx, text, size, style, (ch, cx) => ctx.fillText(ch, cx, 0));
}

// ── 'fondant' — a rolled, puffy piece of icing ────────────────────────────────
// Every ramp below is derived from the TYPED glyph's own mask, which is the whole point: the shading
// follows the shape it is lighting, so the look transfers to a "7" or to "Amara". (Lifting the shading
// out of the artwork's own baked-in numeral cannot: its highlights run along THAT numeral's strokes.)

// A blurred, offset copy of `src` in a solid colour. Canvas-2D's drop shadow IS a gaussian blur, and it
// is the only blur we may use: `ctx.filter` is absent on Safari 15.0–15.3 and our floor is Safari 15, so
// filter-based bevels would silently vanish on real phones. Parking the source off-canvas and steering
// the shadow back into frame renders the shadow ALONE.
function softCopy(src, blurPx, dx, dy, color) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const x = c.getContext('2d');
  const OFF = src.width + src.height;
  x.shadowColor = color;
  x.shadowBlur = Math.max(0.01, blurPx);
  x.shadowOffsetX = OFF + dx;
  x.shadowOffsetY = dy;
  x.drawImage(src, -OFF, 0);
  return c;
}

// `a` with `b` punched out of it — only b's ALPHA matters, so the pair below can carry any colour.
function cutOut(a, b) {
  const c = document.createElement('canvas');
  c.width = a.width; c.height = a.height;
  const x = c.getContext('2d');
  x.drawImage(a, 0, 0);
  x.globalCompositeOperation = 'destination-out';
  x.drawImage(b, 0, 0);
  return c;
}

// Shading is a TINT of the icing, never black/white: darkening yellow toward black gives olive, and
// lifting it toward white gives chalk. Fondant lit by a warm kitchen light stays the colour it is.
function shiftColor(hex, amount) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  const n = m ? parseInt(m[1], 16) : 0x808080;
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => (
    amount >= 0 ? v + (255 - v) * amount : v * (1 + amount)
  ));
  return `rgb(${ch.map(v => Math.round(Math.max(0, Math.min(255, v)))).join(',')})`;
}

// The typed glyphs' stroke thickness in px, estimated as 2·area/perimeter. This is what makes the look
// scale-free, and it is not a nicety: a bevel sized as a fraction of GLYPH HEIGHT swallows a thin
// "Amara" whole while barely creasing a fat "4". Fondant is rolled to a thickness — the ramps follow the
// STROKE, so a style tuned on one value survives every value a customer types.
function strokeThickness(mask, ring, nominal) {
  const area = alphaArea(mask);
  const perimeter = alphaArea(ring) / Math.max(1, nominal);   // a ring of width `nominal` covers perim·nominal
  if (!area || !perimeter) return nominal;
  return Math.max(2, (2 * area) / perimeter);
}

function alphaArea(canvas) {
  const x = canvas.getContext('2d', { willReadFrequently: true });
  const d = x.getImageData(0, 0, canvas.width, canvas.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 128) n++;
  return n;
}

function inkFondant(ctx, text, size, style) {
  const f = { ...DEFAULT_TEXT_STYLE.fondant, ...(style.fondant || {}) };
  const ow = (style.outline?.width || 0) * size;

  const pad = Math.ceil(size * 0.5 + size * 0.35 + ow * 3);
  const w = Math.max(1, Math.ceil(ctx.measureText(text).width + (style.tracking || 0) * size * text.length) + pad * 2);
  const h = Math.max(1, Math.ceil(size * 2) + pad * 2);
  const layer = () => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.font = ctx.font;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    return [c, x];
  };
  const glyphs = (x, op) => {
    x.save();
    x.translate(w / 2, h / 2);
    eachGlyph(x, text, size, style, (ch, cx) => op(x, ch, cx));
    x.restore();
  };

  // The mask every ramp is derived from.
  const [mask, mx] = layer();
  mx.fillStyle = '#000';
  glyphs(mx, (x, ch, cx) => x.fillText(ch, cx, 0));

  // The silhouette, at a nominal width — it measures the perimeter, then it becomes the rim.
  const nominal = Math.max(2, size * 0.04);
  const [ring, rx] = layer();
  rx.strokeStyle = '#000';
  rx.lineJoin = 'round';
  rx.lineCap = 'round';
  rx.lineWidth = nominal;
  glyphs(rx, (x, ch, cx) => x.strokeText(ch, cx, 0));

  // Every ramp below is a fraction of the STROKE, not of the glyph — see strokeThickness.
  const bev = Math.max(1, Math.max(0.05, Math.min(1, f.bevel ?? 0.5)) * strokeThickness(mask, ring, nominal) * 0.5);
  const shade = shiftColor(style.fill, -0.55);
  const lit = shiftColor(style.fill, 0.75);

  // Light comes FROM `light`°. Canvas y grows downward, so the vertical component is negated.
  const th = ((f.light ?? 135) * Math.PI) / 180;
  const dx = Math.cos(th) * bev;
  const dy = -Math.sin(th) * bev;

  // The emboss pair: the mask pushed toward the light, and away from it. Where TOWARD survives but AWAY
  // does not, the surface faces the light — the lit crescent. The reverse is the shaded far edge. This
  // difference-of-offsets is what reads as roundness.
  const toward = softCopy(mask, bev, dx, dy, lit);
  const away = softCopy(mask, bev, -dx, -dy, shade);
  const litBand = cutOut(toward, softCopy(mask, bev, -dx, -dy, '#000'));
  const shadeBand = cutOut(away, softCopy(mask, bev, dx, dy, '#000'));

  // The all-round inner rim: the silhouette blurred to the bevel width, of which only the inner half
  // survives the source-atop clip. Without it a glyph reads as a flat sticker lit from one side.
  const [rimSrc, rimX] = layer();
  rimX.strokeStyle = '#000';
  rimX.lineJoin = 'round';
  rimX.lineCap = 'round';
  rimX.lineWidth = bev * 1.1;
  glyphs(rimX, (x, ch, cx) => x.strokeText(ch, cx, 0));
  const rim = softCopy(rimSrc, bev * 0.8, 0, 0, shade);

  // Build the icing on its own layer so every ramp clips to the glyph (source-atop) and never leaks onto
  // the artwork.
  const [lay, lx] = layer();
  lx.fillStyle = style.fill;
  glyphs(lx, (x, ch, cx) => x.fillText(ch, cx, 0));

  const clamp01 = v => Math.max(0, Math.min(1, v ?? 0));
  lx.globalCompositeOperation = 'source-atop';
  lx.globalAlpha = clamp01(f.ao) * 0.5;
  lx.drawImage(rim, 0, 0);
  lx.globalAlpha = clamp01(f.ao);
  lx.drawImage(shadeBand, 0, 0);
  lx.globalAlpha = clamp01(f.gloss);
  lx.drawImage(litBand, 0, 0);
  lx.globalAlpha = 1;

  // The outline sits UNDER the icing (only its outer half shows), exactly as in `scribble`.
  if (ow > 0) {
    ctx.save();
    ctx.strokeStyle = style.outline.color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = ow * 2;
    eachGlyph(ctx, text, size, style, (ch, cx) => ctx.strokeText(ch, cx, 0));
    ctx.restore();
  }

  // Stamped with a contact shadow — the piece sits ON the plaque rather than being printed on it.
  ctx.save();
  const sa = Math.max(0, Math.min(1, f.shadow_alpha ?? 0));
  if (sa > 0) {
    ctx.shadowColor = `rgba(0,0,0,${sa})`;
    ctx.shadowBlur = (f.shadow_blur || 0) * size;
    ctx.shadowOffsetY = (f.shadow_dy || 0) * size;
  }
  ctx.drawImage(lay, -w / 2, -h / 2);
  ctx.restore();
}

export const ALGORITHMS = Object.freeze({ scribble: inkScribble, flat: inkFlat, fondant: inkFondant });

// Render one slot's value into a W×H canvas context. `rect` is normalized (0..1), so the same slot
// renders identically into the studio's 1024² frame and into whatever natural size the artwork has on
// the cake. W and H are separate: the designer composites at the image's real dimensions, which are not
// guaranteed square.
export function renderTextSlot(ctx, W, H, slot, text, style) {
  const value = String(text ?? '').trim();
  if (!value) return;
  const r = slot.rect || {};
  const boxW = (r.w ?? 0.4) * W;
  const boxH = (r.h ?? 0.4) * H;
  if (boxW < 1 || boxH < 1) return;

  ctx.save();
  ctx.translate((r.x ?? 0.5) * W, (r.y ?? 0.5) * H);
  ctx.rotate(((r.rot || 0) * Math.PI) / 180);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const fit = style.fit ?? 0.92;
  const size = fitFontSize(ctx, value, style, boxW * fit, boxH * fit);
  ctx.font = cssFont(style, size);

  const ink = ALGORITHMS[style.algorithm] || inkFlat;
  ink(ctx, value, size, style);
  ctx.restore();
}

// Ink every slot's value onto an EXISTING context (the artwork is already drawn). The designer calls
// this on the canvas it is already deriving inside useStickerImageTexture, so the composite costs no
// extra raster; the studio calls it via composeTextTopper below. ONE inking path either way.
export function drawTextSlots(ctx, W, H, slots, values, styleOf) {
  for (const slot of slots || []) {
    const style = resolveStyle(styleOf(slot), slot.style_override);
    const v = values?.[slot.key] ?? slot.default ?? '';
    renderTextSlot(ctx, W, H, slot, v, style);
  }
}

// The whole topper on a fresh canvas: artwork + every slot's value. Used by the admin preview and its
// thumbnail bake. Shares drawTextSlots with the designer, so the two cannot disagree.
export function composeTextTopper(S, artworkImg, slots, values, styleOf) {
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  if (artworkImg) ctx.drawImage(artworkImg, 0, 0, S, S);
  drawTextSlots(ctx, S, S, slots, values, styleOf);
  return c;
}

// ── Clean plate (authoring-time only) ─────────────────────────────────────────
// Stock artwork usually has a value BAKED IN (the "2"). A patch clone-stamps a clean region of the same
// artwork over it, so existing art works without being re-sourced. Patches are baked into the uploaded
// image at SAVE time — the designer never sees them, so there is no runtime patch path to maintain.
// `patch = { rect:{x,y,w,h}, from:{x,y,s} }`, all normalized. `from` is a SMALL clean SAMPLE (centre +
// side `s`) that is mirror-tiled to fill `rect` — NOT a same-size copy of the region. That distinction
// is the whole trick: a same-size clone needs a clean area as big as the text box, and on a
// background-removed plaque no such area exists (the disc is barely bigger than the box), so the search
// finds nothing and you end up cloning transparency. A small sample always has somewhere to come from,
// and mirroring hides the tile seams on near-uniform paper/fondant.
export function applyPatches(canvas, patches) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  for (const p of patches || []) {
    const r = p.rect || {};
    const w = (r.w ?? 0) * S, h = (r.h ?? 0) * S;
    if (w < 1 || h < 1) continue;
    const dx = ((r.x ?? 0.5) * S) - w / 2;
    const dy = ((r.y ?? 0.5) * S) - h / 2;
    const fx = (p.from?.x ?? 0.5) * S;
    const fy = (p.from?.y ?? 0.5) * S;
    const side = Math.max(2, Math.round((p.from?.s ?? 0.08) * S));

    // Cut the sample out first — drawing a canvas onto itself with overlapping rects is undefined.
    const cut = document.createElement('canvas');
    cut.width = side; cut.height = side;
    cut.getContext('2d').drawImage(canvas, fx - side / 2, fy - side / 2, side, side, 0, 0, side, side);

    // A 2×2 mirrored block tiles seamlessly in both axes.
    const tile = document.createElement('canvas');
    tile.width = side * 2; tile.height = side * 2;
    const tx = tile.getContext('2d');
    tx.drawImage(cut, 0, 0);
    tx.save(); tx.translate(side * 2, 0); tx.scale(-1, 1); tx.drawImage(cut, 0, 0); tx.restore();
    tx.save(); tx.translate(0, side * 2); tx.scale(1, -1); tx.drawImage(cut, 0, 0); tx.restore();
    tx.save(); tx.translate(side * 2, side * 2); tx.scale(-1, -1); tx.drawImage(cut, 0, 0); tx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(dx, dy, w, h);
    ctx.clip();
    ctx.fillStyle = ctx.createPattern(tile, 'repeat');
    ctx.translate(dx, dy);
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  return canvas;
}

// A slot that COVERS what it replaces is just a patch on the slot's own rect — same one mechanism, so
// there is no second clone path to keep in step. This is what makes dropping a placeholder onto a
// baked-in "2" erase it, instead of drawing "23".
export function coverPatches(slots) {
  return (slots || [])
    .filter(sl => sl.cover?.from)
    .map(sl => ({ rect: sl.rect, from: sl.cover.from }));
}

// The artwork with every patch baked in — the image uploaded as the element's image_url. Covers bake in
// too, so the designer only ever sees clean artwork and never replays a clone.
export function bakeArtwork(S, artworkImg, patches, slots) {
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  c.getContext('2d').drawImage(artworkImg, 0, 0, S, S);
  return applyPatches(c, [...(patches || []), ...coverPatches(slots)]);
}

// Auto-pick a SMALL clean SAMPLE to tile over the slot: the flattest fully-opaque square on the artwork
// — bare plaque/paper, never a glyph, a leaf or an animal. Flatness = low luminance variance. The square
// is deliberately small (a fraction of the box, not its size) so that one actually EXISTS: on a
// background-removed plaque there is no clean area as large as the text box.
//
// Rejects any candidate that (a) touches a transparent pixel — that's off the artwork — or (b) overlaps
// the slot, which would sample the very value we're covering. Runs on a small analysis raster, so cost
// is independent of the artwork's real resolution. Returns { x, y, s } (centre + side, normalized).
// The colour of the value ALREADY PRINTED in the slot — the artwork's own baked-in "4". It is the one
// thing about the reference numeral that transfers to a typed value (its shading cannot: that follows
// the 4's own strokes). Seeded onto the slot on add, so a placeholder inherits the artwork's icing
// instead of a brown that belongs to no cake.
//
// "Ink" = opaque pixels inside the box that are NOT the plaque it sits on. The plaque reference comes
// from findCleanSource — the same ring-search that decides what gets cloned over the value — so the two
// cannot disagree about which surface is the background. The dominant remaining colour wins (modal
// bucket of a coarse quantization, then averaged within that bucket): a mean over all ink pixels would
// blend a numeral's highlight and its shadow into a muddy midtone that appears nowhere in the art.
export function findInkColor(img, rect, { A = 200, minPixels = 24 } = {}) {
  const c = document.createElement('canvas');
  c.width = A; c.height = A;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, A, A);
  let d;
  try { d = x.getImageData(0, 0, A, A).data; } catch { return null; }   // CORS-tainted → don't guess

  const at = (px, py) => ((py * A) + px) * 4;

  // The plaque's colour, averaged over the clean sample.
  const src = findCleanSource(img, rect);
  let pr = 0, pg = 0, pb = 0, pn = 0;
  const half = Math.max(1, Math.round((src.s * A) / 2));
  const scx = Math.round(src.x * A), scy = Math.round(src.y * A);
  for (let py = Math.max(0, scy - half); py < Math.min(A, scy + half); py++) {
    for (let px = Math.max(0, scx - half); px < Math.min(A, scx + half); px++) {
      const i = at(px, py);
      if (d[i + 3] < 250) continue;
      pr += d[i]; pg += d[i + 1]; pb += d[i + 2]; pn++;
    }
  }
  if (!pn) return null;
  pr /= pn; pg /= pn; pb /= pn;

  // Ink pixels inside the box, bucketed.
  const x0 = Math.max(0, Math.round((rect.x - rect.w / 2) * A));
  const x1 = Math.min(A, Math.round((rect.x + rect.w / 2) * A));
  const y0 = Math.max(0, Math.round((rect.y - rect.h / 2) * A));
  const y1 = Math.min(A, Math.round((rect.y + rect.h / 2) * A));
  const buckets = new Map();
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = at(px, py);
      if (d[i + 3] < 250) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (Math.hypot(r - pr, g - pg, b - pb) < 48) continue;            // that's the plaque, not the value
      const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);           // 12-bit quantization
      const acc = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 };
      acc.n++; acc.r += r; acc.g += g; acc.b += b;
      buckets.set(k, acc);
    }
  }

  let best = null;
  for (const acc of buckets.values()) if (!best || acc.n > best.n) best = acc;
  if (!best || best.n < minPixels) return null;                          // nothing printed there — keep the preset

  const hex = v => Math.round(v).toString(16).padStart(2, '0');
  return `#${hex(best.r / best.n)}${hex(best.g / best.n)}${hex(best.b / best.n)}`;
}

export function findCleanSource(img, rect, { A = 200, grid = 44 } = {}) {
  // Sample side: small enough to find, big enough to carry the paper's grain.
  const s = Math.min(0.10, Math.max(0.04, Math.min(rect.w, rect.h) / 3));
  const fallback = { x: rect.x, y: Math.min(0.95, rect.y + rect.h / 2 + s), s };

  const c = document.createElement('canvas');
  c.width = A; c.height = A;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, A, A);
  let d;
  try { d = x.getImageData(0, 0, A, A).data; } catch { return fallback; }  // CORS-tainted → don't guess

  const side = Math.max(3, Math.round(s * A));
  const half = side / 2;

  // Search the RING around the slot first, widening only if nothing clean is there. We want the surface
  // the text SITS ON (the plaque), and that is by definition right next to the box. Searching the whole
  // artwork for the globally flattest patch is wrong: a flat pastel cartoon fill (an elephant's body) is
  // smoother than textured paper, so "flattest" happily picks the elephant.
  const reach = Math.max(rect.w, rect.h);
  for (const radius of [reach * 1.15, reach * 1.6, Infinity]) {
    let best = null;
    for (let gy = 0; gy <= grid; gy++) {
      for (let gx = 0; gx <= grid; gx++) {
        const cx = half + (gx / grid) * (A - side);
        const cy = half + (gy / grid) * (A - side);
        const nx = cx / A, ny = cy / A;

        if (Math.hypot(nx - rect.x, ny - rect.y) > radius) continue;
        // Overlap with the slot (AABB, sample vs box) → it would sample the value being covered.
        if (Math.abs(nx - rect.x) < (rect.w + s) / 2 && Math.abs(ny - rect.y) < (rect.h + s) / 2) continue;

        let n = 0, sum = 0, sumSq = 0, opaque = true;
        for (let py = Math.round(cy - half); py < cy + half && opaque; py++) {
          for (let px = Math.round(cx - half); px < cx + half; px++) {
            const i = ((py * A) + px) * 4;
            if (d[i + 3] < 250) { opaque = false; break; }          // transparent → off the artwork
            const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            sum += l; sumSq += l * l; n++;
          }
        }
        if (!opaque || n < 4) continue;
        const variance = sumSq / n - (sum / n) ** 2;
        if (!best || variance < best.variance) best = { variance, x: nx, y: ny, s };
      }
    }
    if (best) return best;
  }
  return fallback;
}
