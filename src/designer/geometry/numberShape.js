// ── Number-cake footprint (shim) ─────────────────────────────────────────────────────────────────
// A number cake is one instance of the generic GLYPH cake — the digits family. The engine now lives in
// `glyphShape.js` (shared with the `letter` family); this module just re-exports the digit-specific
// bindings under their original names, so existing importers (index.js, tests) don't churn and numbers
// stay byte-for-byte identical. New code should import from `glyphShape.js` directly.
export {
  cleanDigits, numberGeometry, numberDigitCount, numberSizeForCount, numberTierDims,
  NUMBER_COUNTS, NUMBER_SIZE_DEFAULTS,
} from './glyphShape.js';
