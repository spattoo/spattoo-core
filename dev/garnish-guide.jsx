import { createRoot } from 'react-dom/client';
import GarnishBuildGuide from '../src/orders/xray/GarnishBuildGuide.jsx';

/* The build guide on its own, against pieces of the kinds a baker actually makes — so the diagram
 * can be LOOKED AT rather than reasoned about. A numbered diagram that reads wrong is the whole risk
 * of this feature: the numbers, the start dots and the arrows are the instruction. */

const arc = (cx, cy, r, a0, a1, n = 22) => Array.from({ length: n }, (_, i) => {
  const a = a0 + (a1 - a0) * (i / (n - 1));
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
});

// A filigree: an outer swirl, two veins, a curl — four lifts.
const FILIGREE = {
  name: 'Filigree swirl', kind: 'piped', zone: 'top', mode: 'lie', color: '#4A2C1B',
  rope: 6, plate: 420, scale: 1,
  paths: [
    arc(210, 210, 90, -2.6, 2.2),
    [[150, 200], [210, 170], [270, 200]],
    [[150, 240], [210, 270], [270, 240]],
    arc(210, 210, 40, 0.4, 4.6),
  ],
  rings: [],
};

// Two chocolates: a dark triangle with a white bar across it.
const TWO_TONE = {
  name: 'Two-tone spike', kind: 'piped', zone: 'top', mode: 'stand', color: '#4A2C1B',
  rope: 6, plate: 420, scale: 1,
  paths: [
    [[210, 90], [270, 320], [150, 320], [210, 90]],
    [[170, 250], [250, 250]],
  ],
  rings: [],
  parts: [
    { color: '#4A2C1B', paths: [[[210, 90], [270, 320], [150, 320], [210, 90]]] },
    { color: '#EFE3CE', paths: [[[170, 250], [250, 250]]] },
  ],
};

// The reference cake's piece: a cut panel with a circle punched out.
const PANEL = {
  name: 'Cut spike', kind: 'cut', zone: 'top', mode: 'stand', color: '#8A5A3B',
  rope: 6, plate: 420, scale: 1,
  paths: [[[210, 80], [260, 330], [160, 330], [210, 80]]],
  rings: [[[210, 80], [260, 330], [160, 330], [210, 80]], arc(210, 265, 28, 0, 6.28)],
};

const Case = ({ title, garnish, mm }) => (
  <section style={{ maxWidth: 460 }}>
    <h2 style={{ fontSize: 15, marginBottom: 10 }}>{title}</h2>
    <GarnishBuildGuide garnish={garnish} cakeDiameterMm={mm} />
  </section>
);

createRoot(document.getElementById('root')).render(
  <div style={{ padding: 24, display: 'flex', gap: 34, flexWrap: 'wrap', alignItems: 'start' }}>
    <Case title="Piped — four strokes, four lifts" garnish={FILIGREE} mm={180} />
    <Case title="Piped — two chocolates" garnish={TWO_TONE} mm={180} />
    <Case title="Cut — panel with a punched hole" garnish={PANEL} mm={180} />
    <Case title="Piped — no cake size yet" garnish={FILIGREE} mm={null} />
  </div>,
);
