// ── Letter-cake footprint (shim) ─────────────────────────────────────────────────────────────────
// A letter cake is one instance of the generic GLYPH cake — the A–Z family (uppercased, up to 3 letters).
// The engine lives in `glyphShape.js` (shared with the `number` family); this module re-exports the
// letter-specific bindings under their own names, mirroring `numberShape.js`. A letter glyph and a digit
// glyph are the SAME thing to the font engine — the only differences (charset, max, per-count defaults)
// live in glyphShape's GLYPH_FAMILIES registry.
export {
  cleanLetters, letterGeometry, letterCount, letterSizeForCount, letterTierDims,
  LETTER_COUNTS, LETTER_SIZE_DEFAULTS,
} from './glyphShape.js';
