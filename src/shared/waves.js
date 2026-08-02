// ── The wave ────────────────────────────────────────────────────────────────────────────────────
// The soft-curve edge is the product's most distinctive shape: every tinted section on a customer
// storefront ends in one instead of a straight rule. It lived inside CustomerStorefront, which is
// where it was invented but not where it belongs — the app's panels want the same edge, and a
// second copy would drift from the first the moment either is retuned.
//
// Asymmetric on purpose: three paths so consecutive bands do not read as the same stamp repeated.
// All are drawn in a 1440x70 viewBox and stretched with preserveAspectRatio="none", so the same
// path works at storefront width and at panel width — only the rendered height changes.
export const WAVES = [
  'M0,40 C300,90 720,4 1140,52 C1320,72 1400,40 1440,50 L1440,70 L0,70 Z',
  'M0,55 C360,2 800,84 1200,30 C1350,10 1410,52 1440,40 L1440,70 L0,70 Z',
  'M0,30 C260,78 640,8 1040,46 C1280,68 1380,28 1440,44 L1440,70 L0,70 Z',
];

export const WAVE_VIEWBOX = '0 0 1440 70';
