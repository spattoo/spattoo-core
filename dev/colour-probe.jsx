import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import * as THREE from 'three';
import { SafeEnvironment } from '../src/designer/canvas/TextureErrorBoundary.jsx';
import { envProps } from '../src/designer/canvas/envMap.js';
import { garnishMaterialProps } from '../src/designer/geometry/garnishMaterial.js';

/* ⚠️ THIS PAGE'S LIGHTING IS NOT THE CAKE'S, AND THAT MATTERS MORE THAN THE PAGE DOES.
 *
 * It was built to answer "what does the renderer do to a colour", and it does answer that — but with
 * a rig invented here (ambient 0.5, one directional at 1.1, no tone mapping), NOT the one the cake
 * scene uses. So its RENDERED column comes out considerably lighter than the same material on a
 * cake, and reading it as though it were the cake led to the conclusion that every colour washes
 * out. Measured on the real cake afterwards, dark chocolate arrives at 86,46,34 against an asked-for
 * 74,44,27 — close, not washed out at all.
 *
 * ⚠️ A PROBE THAT DOES NOT REPRODUCE THE THING IT PROBES IS WORSE THAN NO PROBE, because it produces
 * numbers, and numbers get believed. Before trusting a row here, make this page light its plates the
 * way `CakeCanvas` lights the cake — until then it is useful for comparing colours WITH EACH OTHER
 * under one rig, and not for judging what a baker will see.
 *
 * ⚠️ MEASURE, DO NOT MODEL. Two rounds were spent deriving what the renderer does to a colour from
 * first principles, and both were wrong in ways only the cake showed. Each row here puts the colour
 * that was ASKED FOR directly against the same colour rendered through the REAL garnish material, so
 * the difference is visible rather than inferred — and so a fix can be judged by whether the two
 * halves match, not by whether the numbers look plausible.
 *
 * ⚠️ WHAT THIS HAS ALREADY RULED OUT. Sweeping `envMapIntensity` from 0 to 0.7 with the clearcoat off
 * changed the rendered pixel NOT AT ALL — five identical readings. Every compensation attempted so
 * far aimed at that term, so all of them were aimed at the wrong thing, which is why none of them
 * moved the colour. The lift comes from elsewhere: the scene's lights, the tone mapping, or
 * colour-space handling of the material colour. Sweep those next, here, before writing another
 * correction. */

const COLOURS = [
  ['Teal (the studio one)', '#4EC5B0'],
  ['Bright teal',           '#2FBFA8'],
  ['Dark teal',             '#0d6e5e'],
  ['Pink',                  '#F2A0B5'],
  ['Ruby',                  '#C4626B'],
  ['Orange',                '#E8963C'],
  ['Green',                 '#7FC241'],
  ['Blue',                  '#2b8fd6'],
  ['Lilac',                 '#B49AD8'],
  ['Dark chocolate',        '#4A2C1B'],
  ['Milk chocolate',        '#8A5A3B'],
  ['White chocolate',       '#EFE3CE'],
];

function Row({ label, hex }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 10 }}>
      <div style={{ width: 150, fontSize: 12, fontFamily: 'system-ui', color: '#333' }}>{label}</div>
      {/* Asked for — flat, exactly the value chosen. */}
      <div style={{ width: 150, height: 76, background: hex }} />
      {/* Rendered — the same value through the material the cake uses. */}
      <div style={{ width: 150, height: 76 }}>
        <Canvas orthographic camera={{ position: [0, 0, 5], zoom: 60 }}>
          <Suspense fallback={null}>
            <SafeEnvironment {...envProps()} />
            <ambientLight intensity={0.5} />
            <directionalLight position={[2, 3, 2]} intensity={1.1} />
            <mesh>
              <planeGeometry args={[4, 2]} />
              <meshPhysicalMaterial side={THREE.DoubleSide} {...garnishMaterialProps({ color: hex })} />
            </mesh>
          </Suspense>
        </Canvas>
      </div>
      <div style={{ width: 90, fontSize: 11, fontFamily: 'monospace', color: '#888', paddingLeft: 10 }}>{hex}</div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <div style={{ padding: 22, fontFamily: 'system-ui' }}>
    <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>What the renderer does to a colour</h2>
    <p style={{ fontSize: 12.5, color: '#666', margin: '0 0 16px' }}>
      Left block is the colour asked for. Right is that colour through the garnish material — but lit
      by THIS PAGE'S rig, not the cake's, so it reads lighter than the cake does. Use it to compare
      colours with each other, not to judge what a baker will see. On the real cake, dark chocolate
      measures 86,46,34 against an asked-for 74,44,27.
    </p>
    <div style={{ display: 'flex', gap: 0, marginBottom: 6, fontSize: 11, fontWeight: 700, color: '#888' }}>
      <div style={{ width: 150 }} /><div style={{ width: 150 }}>ASKED FOR</div><div style={{ width: 150 }}>RENDERED</div>
    </div>
    {COLOURS.map(([label, hex]) => <Row key={hex} label={label} hex={hex} />)}
  </div>,
);
