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

// ── The scallop ─────────────────────────────────────────────────────────────────────────────────
// The wave's sibling, for templates whose language is doilies and awnings rather than soft curves
// (Patisserie). Same 1440x70 viewBox and the same stretch behaviour, so it is a DROP-IN for any
// WAVES entry — a template picks its edge with a token instead of anyone branching on theme.
//
// Three variants for the same reason the waves have three: consecutive bands must not read as one
// stamp repeated. Here that means varying the COUNT rather than the curve, because scallops are
// regular by nature — an irregular scallop reads as a mistake, where an irregular wave reads as a
// hand.
const scallopEdge = (y, count, depth) => {
  const step = 1440 / count;
  let d = `M0,${y}`;
  for (let i = 0; i < count; i++) d += ` A ${step / 2} ${depth} 0 0 1 ${step * (i + 1)},${y}`;
  return `${d} L1440,70 L0,70 Z`;
};

export const SCALLOPS = [
  scallopEdge(30, 16, 26),
  scallopEdge(26, 12, 30),
  scallopEdge(34, 20, 22),
];
