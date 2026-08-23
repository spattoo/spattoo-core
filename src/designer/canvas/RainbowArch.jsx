import { useMemo, useEffect } from 'react';
import { rainbowBands, bandGeometry, RAINBOW_DEFAULTS } from '../geometry/rainbow.js';

// ── A fondant rainbow, standing against the cake ──────────────────────────────
// One mesh per band, NOT instanced — the opposite call to GrassPatch, and for the opposite reason.
// Grass instances because a dense top is ~3000 identical tufts. Here every band is a different
// radius AND a different colour, so there is nothing to share: six meshes of a few hundred triangles
// is already cheaper than the machinery to avoid them.
//
// The geometry is built by geometry/rainbow.js, which the admin studio also calls. One generator,
// so what is tuned there is what a customer gets — the same rule ChocolateDripStudio states and
// GrassStudio repeats.
export default function RainbowArch({
  params = RAINBOW_DEFAULTS,
  cake,                       // { radius, topY, boardY } — the geometry it has to fit
  yaw = 0,                    // where it stands around the cake
  roughness = 0.86,           // fondant: matte, with just enough sheen to read as sugar not paper
  metalness = 0,
}) {
  const p = { ...RAINBOW_DEFAULTS, ...params };
  const { bands } = useMemo(() => rainbowBands(p, cake), [JSON.stringify(p), JSON.stringify(cake)]);

  const geometries = useMemo(
    () => bands.map(b => bandGeometry(b, { flatten: p.flatten, tubeSegments: p.tubeSegments })),
    [bands, p.flatten, p.tubeSegments],
  );

  // A tube per band per slider drag, and nothing else frees them. Grass gets away without this by
  // building ONE tuft; here a studio session would leak a geometry for every value the author tried.
  useEffect(() => () => geometries.forEach(g => g.dispose()), [geometries]);

  // Lean tips the whole arch back from vertical, about the point where its feet stand — leaning
  // about the centre would swing them off the board.
  const lean = (p.lean ?? 0) * Math.PI / 180;

  return (
    <group rotation={[0, yaw, 0]}>
      <group position={[0, cake?.boardY ?? 0, 0]} rotation={[lean, 0, 0]}>
        <group position={[0, -(cake?.boardY ?? 0), 0]}>
          {bands.map((b, i) => (
            <mesh key={b.index} geometry={geometries[i]} castShadow receiveShadow>
              <meshStandardMaterial color={b.color} roughness={roughness} metalness={metalness} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}
