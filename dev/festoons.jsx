import { createRoot } from 'react-dom/client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { tierShape, pipingPerimeters } from '../src/designer/geometry/surface.js';
import { buildFestoons, perimeterBreaks } from '../src/designer/geometry/festoon.js';
import { applyCakeShapeConfig } from '../src/index.js';

/* ── Garlands on every wall the catalogue can hold ───────────────────────────────────────────────
 * http://localhost:5190/festoons.html
 *
 * ⚠️ THE BENCH THAT DID NOT EXIST, which is why a heart's garland shipped as a crust of crushed
 * rope. `festoon.test.js` only ever drove `circlePerimeter` and `roundedRectPerimeter` — analytic
 * curves whose normals turn smoothly — and the designer can only reach a non-round cake through an
 * admin-authored row, so nobody could look at one without a database. The fault was entirely in the
 * POLYGON path that every authored shape takes.
 *
 * The strip is a plain segmented box rather than a piping GLB, on purpose: what is being judged is
 * WHERE the swags sit and HOW BIG they are, which is `buildFestoons`' job and nothing to do with
 * what is threaded through it. A GLB would need the asset CDN and would hide the geometry under a
 * rope texture. Same strip the unit test uses.
 *
 * Grey line = the wall. Red dots = the corners `perimeterBreaks` found — the whole bug was that an
 * outline reported one per polygon vertex, so if you see a red rash rather than a few dots, that is
 * it coming back.
 */

applyCakeShapeConfig([
  { key: 'square',    label: 'Square',    family: 'rounded_rect', config: { square: true } },
  { key: 'heart',     label: 'Heart',     family: 'heart',        config: { plump: 1, cleft: 1 } },
  { key: 'butterfly', label: 'Butterfly', family: 'butterfly',    config: { wing: 1 } },
  { key: 'hexagon',   label: 'Hexagon',   family: 'polygon',      config: { sides: 6, rotation: 0 } },
  { key: 'oval',      label: 'Oval',      family: 'oval',         config: {} },
]);

const CASES = [
  ['Round',        { radius: 1.2 }],
  ['Rect',         { shape: 'rect', width: 2.16, depth: 1.56 }],
  ['Hexagon',      { shapeFamily: 'polygon', shapeConfig: { sides: 6 }, width: 2.4, depth: 2.4 }],
  ['Heart',        { shapeFamily: 'heart', width: 2.4, depth: 2.4 }],
  ['Heart wide',   { shapeFamily: 'heart', width: 3.0, depth: 2.0 }],
  ['Butterfly',    { shapeFamily: 'butterfly', width: 2.4, depth: 2.4 }],
  ['Oval',         { shapeFamily: 'oval', width: 2.4, depth: 2.4 }],
  ['Oval flat',    { shapeFamily: 'oval', width: 3.4, depth: 1.6 }],
];

// The same strip festoon.test.js bends: long in x, a shallow bump in z, thin in y, and SEGMENTED —
// the bend maps each vertex by how far along the strip it sits, so an 8-vertex box comes out flat.
function stripScene() {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 0.1, 48, 1, 1), new THREE.MeshBasicMaterial());
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

function Cell({ label, tier }) {
  const ref = useRef(null);
  const shape = tierShape(tier);
  const perims = pipingPerimeters(shape);
  const breaks = perimeterBreaks(perims[0]);
  const geos = buildFestoons(stripScene(), {
    festoons: 6, depth: 0.4, attachY: 0, radius: 1.2, perims,
  });

  useEffect(() => {
    const el = ref.current;
    const W = el.clientWidth, H = 300;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(W, H);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 100);
    camera.position.set(0, 3.4, 5.4);
    camera.lookAt(0, -0.2, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(4, 8, 6);
    scene.add(key);

    // The wall, so a swag can be seen sitting ON it rather than floating.
    const P = perims[0], N = 400;
    const wall = [];
    for (let i = 0; i <= N; i++) { const p = P.at((i / N) * P.length); wall.push(new THREE.Vector3(p.x, 0, p.z)); }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(wall),
                             new THREE.LineBasicMaterial({ color: 0xbdbdbd })));

    // Where the corners were found. A rash of these IS the bug.
    for (const b of breaks) {
      const p = P.at(b);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12),
                                 new THREE.MeshBasicMaterial({ color: 0xd23b3b }));
      dot.position.set(p.x, 0, p.z);
      scene.add(dot);
    }

    const mat = new THREE.MeshStandardMaterial({ color: 0x9c3b3b, roughness: 0.6 });
    for (const g of geos) scene.add(new THREE.Mesh(g, mat));

    renderer.render(scene, camera);
    return () => { renderer.dispose(); el.removeChild(renderer.domElement); };
  });

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
        {breaks.length} corner{breaks.length === 1 ? '' : 's'} · {geos.length} swag{geos.length === 1 ? '' : 's'}
      </div>
      <div ref={ref} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <div style={{ fontFamily: 'system-ui, sans-serif', padding: 20 }}>
    <h1 style={{ fontSize: 18 }}>Garlands on every shape — the real buildFestoons</h1>
    <p style={{ fontSize: 13, color: '#555', maxWidth: 760 }}>
      Grey = the wall. Red = the corners the wall was cut at. A heart should show two (its point and
      its cleft); an oval none. One red dot per polygon vertex is the bug this bench was written for.
    </p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
      {CASES.map(([label, tier]) => <Cell key={label} label={label} tier={tier} />)}
    </div>
  </div>,
);
