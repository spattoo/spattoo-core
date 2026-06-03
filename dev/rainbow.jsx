import React, { useState, Suspense, useRef, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, Grid } from '@react-three/drei';
import * as THREE from 'three';

// Analyse geometry and return stats + filtered index
function analyseAndFilter(geo, aspectLimit, areaMultiLimit) {
  if (!geo.index) return { stats: null, newIndexCount: null };

  const pos = geo.attributes.position;
  const idx = geo.index.array;
  const triCount = idx.length / 3;

  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
  const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _e3 = new THREE.Vector3();

  let totalArea = 0, minArea = Infinity, maxArea = 0, maxAspect = 0;

  for (let i = 0; i < idx.length; i += 3) {
    _a.fromBufferAttribute(pos, idx[i]);
    _b.fromBufferAttribute(pos, idx[i + 1]);
    _c.fromBufferAttribute(pos, idx[i + 2]);
    _e1.subVectors(_b, _a); _e2.subVectors(_c, _a); _e3.subVectors(_c, _b);
    const area = _e1.clone().cross(_e2).length() * 0.5;
    const maxEdge = Math.max(_e1.length(), _e2.length(), _e3.length());
    const minEdge = Math.min(_e1.length(), _e2.length(), _e3.length());
    const aspect = maxEdge / (minEdge + 1e-10);
    totalArea += area;
    if (area < minArea) minArea = area;
    if (area > maxArea) maxArea = area;
    if (aspect > maxAspect) maxAspect = aspect;
  }

  const avgArea = totalArea / triCount;
  const maxAreaThreshold = avgArea * areaMultiLimit;
  const minArea2 = 1e-7;

  let hugeCount = 0, thinCount = 0, droppedCount = 0;
  const newIdx = [];

  for (let i = 0; i < idx.length; i += 3) {
    _a.fromBufferAttribute(pos, idx[i]);
    _b.fromBufferAttribute(pos, idx[i + 1]);
    _c.fromBufferAttribute(pos, idx[i + 2]);
    _e1.subVectors(_b, _a); _e2.subVectors(_c, _a); _e3.subVectors(_c, _b);
    const area = _e1.clone().cross(_e2).length() * 0.5;
    const maxEdge = Math.max(_e1.length(), _e2.length(), _e3.length());
    const minEdge = Math.min(_e1.length(), _e2.length(), _e3.length());
    const aspect = maxEdge / (minEdge + 1e-10);

    const isHuge = area > maxAreaThreshold;
    const isThin = aspect > aspectLimit;
    const isZero = area < minArea2;
    if (isHuge) hugeCount++;
    if (isThin) thinCount++;

    if (isHuge || isThin || isZero) droppedCount++;
    else newIdx.push(idx[i], idx[i + 1], idx[i + 2]);
  }

  return {
    stats: { triCount, avgArea, minArea, maxArea, maxAspect, hugeCount, thinCount, droppedCount, keptCount: triCount - droppedCount },
    filteredIndex: new Uint32Array(newIdx),
  };
}

function RainbowModel({ url, applyFilter, aspectLimit, areaMultiLimit, onStats }) {
  const { scene } = useGLTF(url);

  const { cloned, stats } = useMemo(() => {
    const clone = scene.clone(true);
    clone.updateMatrixWorld(true);
    let collectedStats = [];

    clone.traverse(obj => {
      if (!obj.isMesh || !obj.geometry?.index) return;
      const geo = obj.geometry.clone();
      obj.geometry = geo;

      if (applyFilter) {
        const result = analyseAndFilter(geo, aspectLimit, areaMultiLimit);
        if (result.filteredIndex) {
          geo.setIndex(new THREE.BufferAttribute(result.filteredIndex, 1));
          geo.computeBoundingBox();
          geo.computeBoundingSphere();
          collectedStats.push(result.stats);
        }
      } else {
        // stats only, no filter
        const result = analyseAndFilter(geo, aspectLimit, areaMultiLimit);
        if (result.stats) collectedStats.push(result.stats);
      }
    });

    return { cloned: clone, stats: collectedStats };
  }, [scene, applyFilter, aspectLimit, areaMultiLimit]);

  useEffect(() => { onStats(stats); }, [stats]);

  return <primitive object={cloned} />;
}

function Stat({ label, value, warn }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #eee', color: warn ? '#c00' : '#333' }}>
      <span style={{ color: '#888', fontSize: 12 }}>{label}</span>
      <span style={{ fontWeight: warn ? 700 : 400, fontSize: 12 }}>{value}</span>
    </div>
  );
}

function App() {
  const [url, setUrl] = useState(null);
  const [fileName, setFileName] = useState('');
  const [applyFilter, setApplyFilter] = useState(false);
  const [aspectLimit, setAspectLimit] = useState(150);
  const [areaMulti, setAreaMulti] = useState(50);
  const [stats, setStats] = useState([]);

  function onFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setStats([]);
    useGLTF.clear(url || '');
    setUrl(URL.createObjectURL(file));
  }

  const s = stats[0];

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Sidebar */}
      <div style={{ width: 260, background: '#fff', borderRight: '1px solid #ddd', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
        <strong style={{ fontSize: 14 }}>Rainbow GLB Tester</strong>

        <label style={{ cursor: 'pointer', background: '#6c47ff', color: '#fff', padding: '8px 12px', borderRadius: 6, fontSize: 13, textAlign: 'center' }}>
          Load GLB file
          <input type="file" accept=".glb,.gltf" style={{ display: 'none' }} onChange={onFile} />
        </label>
        {fileName && <div style={{ fontSize: 11, color: '#666', wordBreak: 'break-all' }}>{fileName}</div>}

        {s && (
          <div style={{ background: '#f9f9f9', borderRadius: 6, padding: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Geometry Stats</div>
            <Stat label="Triangles" value={s.triCount.toLocaleString()} />
            <Stat label="Avg area" value={s.avgArea.toExponential(2)} />
            <Stat label="Max area" value={s.maxArea.toExponential(2)} warn={s.maxArea > s.avgArea * 10} />
            <Stat label="Max aspect ratio" value={s.maxAspect.toFixed(0)} warn={s.maxAspect > 100} />
            <Stat label="Huge triangles" value={s.hugeCount.toLocaleString()} warn={s.hugeCount > 0} />
            <Stat label="Thin triangles" value={s.thinCount.toLocaleString()} warn={s.thinCount > 0} />
            {applyFilter && <>
              <Stat label="Dropped" value={s.droppedCount.toLocaleString()} />
              <Stat label="Kept" value={s.keptCount.toLocaleString()} />
            </>}
          </div>
        )}

        <div style={{ borderTop: '1px solid #eee', paddingTop: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={applyFilter} onChange={e => setApplyFilter(e.target.checked)} />
            Apply geometry filter
          </label>
        </div>

        {applyFilter && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label style={{ fontSize: 12, color: '#555' }}>Aspect ratio limit: <b>{aspectLimit}</b></label>
              <input type="range" min={10} max={500} value={aspectLimit} onChange={e => setAspectLimit(+e.target.value)} style={{ width: '100%' }} />
              <div style={{ fontSize: 11, color: '#999' }}>Drop triangles thinner than this ratio</div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#555' }}>Area limit (×avg): <b>{areaMulti}×</b></label>
              <input type="range" min={2} max={200} value={areaMulti} onChange={e => setAreaMulti(+e.target.value)} style={{ width: '100%' }} />
              <div style={{ fontSize: 11, color: '#999' }}>Drop triangles larger than this multiple of average</div>
            </div>
          </div>
        )}
      </div>

      {/* 3D viewport */}
      <div style={{ flex: 1, position: 'relative' }}>
        {!url && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 15 }}>
            Select a .glb file to render it
          </div>
        )}
        <Canvas camera={{ position: [0, 0.5, 2.5], fov: 45 }} style={{ background: '#f0f0f0' }}>
          <ambientLight intensity={1.5} />
          <directionalLight position={[3, 5, 3]} intensity={2} />
          <directionalLight position={[-3, 2, -2]} intensity={0.8} />
          <Environment preset="city" />
          <Grid position={[0, -0.7, 0]} args={[10, 10]} cellColor="#ccc" sectionColor="#aaa" />
          <OrbitControls makeDefault />
          {url && (
            <Suspense fallback={null}>
              <RainbowModel
                key={`${url}-${applyFilter}-${aspectLimit}-${areaMulti}`}
                url={url}
                applyFilter={applyFilter}
                aspectLimit={aspectLimit}
                areaMultiLimit={areaMulti}
                onStats={setStats}
              />
            </Suspense>
          )}
        </Canvas>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
root.render(<App />);
