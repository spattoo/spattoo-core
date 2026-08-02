// ── The chrome ──────────────────────────────────────────────────────────────────────────────────
// The moulded near-black the app's furniture is made of: the spatula rail's silhouette, and the
// header band on every panel. It was written inside SpatulaFrame's SVG defs, which is where it was
// invented but not where it belongs the moment a second surface wants to match it — and "match the
// spatula" is exactly the requirement, so an approximation would be wrong by definition.
//
// Kept as STOPS rather than a finished gradient string because it has to render two ways: CSS
// (`linear-gradient`, for a panel header) and SVG (`<stop>`, for the silhouette). One source, two
// renderers, no drift.
export const CHROME_STOPS = [
  { offset: 0,   color: '#121214' },
  { offset: 0.5, color: '#08080a' },
  { offset: 1,   color: '#020203' },
];

/** The same surface as a CSS gradient. `deg` only changes the rake, never the colours. */
export const chromeGradient = (deg = 180) =>
  `linear-gradient(${deg}deg, ${CHROME_STOPS.map((s) => `${s.color} ${s.offset * 100}%`).join(', ')})`;
