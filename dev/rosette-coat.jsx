// A cake coated end to end in piped roses — the tight loop for the geometry behind
// RosetteCoatStudio in admin. http://localhost:5173/rosette-coat.html
//
// Sandeep, with a photograph of a rose-covered cake: "cream piping is filled on entire cake. we
// need to achieve this."
//
// ⚠️ THE QUESTION THIS BENCH EXISTS TO ANSWER IS "DOES IT READ AS A ROSE", and no test can answer
// it. `creamPen.js` records that the pen's own rosette style was built once and dropped because it
// "didn't read well" — almost certainly because a flat spiral of swept rope reads as a coil seen
// from above. So the two knobs to sweep first are PEAK (is it domed?) and OVERLAP (is the spiral
// hidden?), and they are the first two sliders for that reason.
//
// Everything here is imported: the packing from core's rosetteCoat, the sweep from core's cream
// pen, the light from core's own rig. Nothing about cream is re-implemented in this file.

import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import './scene.js';
import {
  rosetteLocalPath, rosetteSeats, ROSETTE_DEFAULTS,
  buildPipingStroke, mergePenGeometries, NOZZLES,
  creamMaterialProps, SceneLights, SceneEnv, SceneBackground, DESIGNER_GROUND,
} from '../src/index.js';

const R = 1.2, H = 1.45, BASE = 0.1;      // the designer's default bottom tier

/* ⚠️ ONE GEOMETRY, MANY INSTANCES, and the first version of this bench is why the comment is here.
   It swept every rose separately in world space: 144 meshes, **17.6 million vertices**, and the
   page never finished drawing. Every rose is the same shape at a different place, so the coat is
   one swept spiral plus a matrix per seat — which is exactly the frame rosetteSeats returns. */
function Coat({ opts, nozzle, colour, softness, onStat }) {
  const geo = useMemo(() => {
    const g = buildPipingStroke(rosetteLocalPath(opts), nozzle, opts.ropeRadius);
    return g;
  }, [opts, nozzle]);

  const seats = useMemo(
    () => rosetteSeats({ tierRadius: R, tierHeight: H, baseY: BASE, ...opts }),
    [opts]);

  const ref = React.useRef();
  React.useEffect(() => {
    if (!ref.current || !geo) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    const basis = new THREE.Matrix4();
    seats.forEach((s, i) => {
      const u = new THREE.Vector3(...s.u), n = new THREE.Vector3(...s.n), v = new THREE.Vector3(...s.v);
      /* The rose was built with X/Z across the surface and Y along the normal, so the columns are
         (u, n, v) in that order — getting them out of order is the bug that lays every wall rose
         flat against the cake, and it looks plausible from directly in front. */
      basis.makeBasis(u, n, v);
      /* Roll about the normal is where per-rose variation lives now. It used to be a different
         start angle per spiral, which is the same picture and defeats instancing. */
      q.setFromRotationMatrix(basis);
      const roll = new THREE.Quaternion().setFromAxisAngle(n, (i * 2.399963) % (Math.PI * 2));
      m.compose(new THREE.Vector3(...s.p), roll.multiply(q), new THREE.Vector3(1, 1, 1));
      ref.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    const per = geo.getAttribute('position').count;
    onStat({ roses: seats.length, per, total: per * seats.length });
  }, [geo, seats, onStat]);

  if (!geo || !seats.length) return null;
  /* ⚠️ NO castShadow — see the cost note in rosetteCoat.js: the shadow pass re-renders every
     instance, and self-shadowing between roses is not where the look comes from.
     ⚠️ And this is a JS block comment rather than a JSX one, for two reasons that both bit here.
     A JSX comment as a bare sibling at the top of a parenthesised return does not parse — the
     fourth time this codebase has hit that. And writing one out INSIDE a block comment closes the
     block early on its own terminator, which is the second parse error this same comment caused.
     Comments about JSX go above the return, and never quote a comment delimiter. */
  return (
    <instancedMesh ref={ref} args={[geo, undefined, seats.length]} receiveShadow>
      <meshPhysicalMaterial {...creamMaterialProps(softness)} color={colour} />
    </instancedMesh>
  );
}

/* Cost belongs on screen, not in a console nobody opens — this is the most geometry any one
   decoration has asked for, and the difference between instanced and not is three orders of
   magnitude. */
function Stat({ s }) {
  if (!s) return null;
  const heavy = s.total > 3e6;
  return (
    <div style={{ fontSize: 11.5, lineHeight: 1.5, marginTop: 10, padding: '8px 10px',
                  borderRadius: 6, background: heavy ? '#fff1f0' : '#f1f6f2',
                  color: heavy ? '#a4252a' : '#3d5247' }}>
      <b>{s.roses}</b> roses · <b>{s.per.toLocaleString()}</b> verts each<br />
      one instanced mesh — uploaded once<br />
      <span style={{ opacity: 0.75 }}>
        {(s.total / 1e6).toFixed(1)}M if each were built separately
      </span>
    </div>
  );
}

const Row = ({ label, value, children }) => (
  <label style={{ display: 'grid', gridTemplateColumns: '116px 1fr 52px', alignItems: 'center',
                  gap: 8, fontSize: 12, marginBottom: 7 }}>
    <span style={{ color: '#444' }}>{label}</span>
    {children}
    <span style={{ color: '#888', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
  </label>
);

function Bench() {
  const [o, setO] = useState({ ...ROSETTE_DEFAULTS, coverTop: true, coverSide: true, seed: 1 });
  const [nozzle, setNozzle] = useState('star5');
  const [colour, setColour] = useState('#d81e5b');
  const [softness, setSoftness] = useState(0.7);
  const [stat, setStat] = useState(null);
  const onStat = React.useCallback(setStat, []);
  const set = (k, v) => setO(p => ({ ...p, [k]: v }));

  const num = (k, min, max, step) => (
    <input type="range" min={min} max={max} step={step} value={o[k]}
           onChange={e => set(k, +e.target.value)} />
  );

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: 320, padding: 16, overflowY: 'auto', background: '#fafafa',
                    borderRight: '1px solid #e3e3e3' }}>
        <h2 style={{ fontSize: 15, margin: '0 0 4px' }}>Rosette coat</h2>
        <p style={{ fontSize: 11.5, color: '#777', margin: '0 0 14px', lineHeight: 1.45 }}>
          Peak and Overlap first — they are what separate a rose from a coil of rope.
        </p>

        <Row label="Peak (dome)" value={o.peak.toFixed(2)}>{num('peak', 0, 1.2, 0.01)}</Row>
        <Row label="Coil overlap" value={o.coilOverlap.toFixed(2)}>{num('coilOverlap', 0, 0.75, 0.01)}</Row>
        <Row label="Rose radius" value={o.rosetteRadius.toFixed(3)}>{num('rosetteRadius', 0.08, 0.5, 0.005)}</Row>
        <Row label="Rope radius" value={o.ropeRadius.toFixed(3)}>{num('ropeRadius', 0.02, 0.12, 0.002)}</Row>
        <Row label="Centre start" value={o.startRadiusFrac.toFixed(2)}>{num('startRadiusFrac', 0.02, 0.5, 0.01)}</Row>
        <Row label="Tail turns" value={o.tailTurns.toFixed(2)}>{num('tailTurns', 0, 0.5, 0.01)}</Row>
        <Row label="Jitter" value={o.jitter.toFixed(2)}>{num('jitter', 0, 1, 0.02)}</Row>
        <Row label="Samples/turn" value={o.samplesPerTurn}>{num('samplesPerTurn', 12, 72, 4)}</Row>
        <Row label="Seed" value={o.seed}>{num('seed', 1, 40, 1)}</Row>

        <div style={{ display: 'flex', gap: 14, margin: '12px 0 10px', fontSize: 12 }}>
          <label><input type="checkbox" checked={o.coverTop}
                        onChange={e => set('coverTop', e.target.checked)} /> Top</label>
          <label><input type="checkbox" checked={o.coverSide}
                        onChange={e => set('coverSide', e.target.checked)} /> Side</label>
        </div>

        <Row label="Nozzle" value="">
          <select value={nozzle} onChange={e => setNozzle(e.target.value)} style={{ fontSize: 12 }}>
            {NOZZLES.map(n => <option key={n.key} value={n.key}>{n.label}</option>)}
          </select>
        </Row>
        <Row label="Colour" value="">
          <input type="color" value={colour} onChange={e => setColour(e.target.value)} />
        </Row>
        <Row label="Softness" value={softness.toFixed(2)}>
          <input type="range" min={0} max={1} step={0.01} value={softness}
                 onChange={e => setSoftness(+e.target.value)} />
        </Row>
        <Stat s={stat} />
      </div>

      <div style={{ flex: 1 }}>
        <Canvas shadows camera={{ position: [0, 2.6, 4.6], fov: 38 }}>
          <SceneBackground />
          <SceneLights />
          <SceneEnv />
          {/* The bare tier underneath. It should be INVISIBLE once the coat closes — if cake shows
              through, the packing is wrong, and seeing it is the point of leaving it here. */}
          <mesh position={[0, BASE + H / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[R, R, H, 64]} />
            <meshStandardMaterial color="#6d4a35" roughness={0.9} />
          </mesh>
          <Coat opts={o} nozzle={nozzle} colour={colour} softness={softness} onStat={onStat} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, BASE, 0]} receiveShadow>
            <circleGeometry args={[R * 1.45, 64]} />
            <meshStandardMaterial color={DESIGNER_GROUND} roughness={0.8} />
          </mesh>
          <OrbitControls target={[0, BASE + H * 0.5, 0]} />
        </Canvas>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Bench />);
