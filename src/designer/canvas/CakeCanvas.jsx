import { useRef, useMemo, useEffect, Suspense, Component } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Text3D, Center, Html, Environment, useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
import CakeTier from './CakeTier';
import { Drip, TopFlowers, SideFlowers } from './Decorations';

function darkenHex(hex, amount) {
  if (!hex || !hex.startsWith('#')) return '#888';
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  const f = 1 - amount;
  return '#' +
    Math.round(r * f).toString(16).padStart(2,'0') +
    Math.round(g * f).toString(16).padStart(2,'0') +
    Math.round(b * f).toString(16).padStart(2,'0');
}

function cylinderHit(ray, radius) {
  const { origin: o, direction: d } = ray;
  const a = d.x * d.x + d.z * d.z;
  const b = 2 * (o.x * d.x + o.z * d.z);
  const c = o.x * o.x + o.z * o.z - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0) return null;
  const p = ray.at(t, new THREE.Vector3());
  return { theta: Math.atan2(p.x, p.z), y: p.y };
}

function glyphAdvance(char) {
  const g = helvetikerBold.glyphs[char] ?? helvetikerBold.glyphs['?'];
  if (!g) return 0.6;
  return (g.ha ?? 0) / (helvetikerBold.resolution ?? 1000);
}

function DraggableText({ textEl, radius, selected, onSelect, onMove: onMove_prop, onContentChange, onOrbitEnable, toolbar }) {
  const { camera, gl } = useThree();
  const didDrag      = useRef(false);
  const startPos     = useRef({ x: 0, y: 0 });
  const startHit     = useRef(null);
  const startTextPos = useRef(null);
  const dragR        = useRef(0);
  const inputRef     = useRef();

  useEffect(() => {
    if (selected) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [selected]);

  const surfaceR = radius + 0.015;
  const cx = surfaceR * Math.sin(textEl.theta);
  const cz = surfaceR * Math.cos(textEl.theta);
  const chars = textEl.content.split('');
  const faceColor = textEl.color || '#ffffff';
  const sideColor = darkenHex(faceColor, 0.38);
  const fs = textEl.fontSize || 0.2;

  const LETTER_SPACING = fs * 0.04;
  const charWidths = chars.map(c => glyphAdvance(c) * fs + LETTER_SPACING);
  const totalWidth = charWidths.reduce((s, w) => s + w, 0);
  const hitW = Math.max(0.5, totalWidth + fs * 0.4);

  const boxGeom = useMemo(
    () => new THREE.EdgesGeometry(new THREE.PlaneGeometry(hitW + 0.12, fs * 1.6)),
    [hitW, fs]
  );

  function pointerRay(e) {
    const rect = gl.domElement.getBoundingClientRect();
    const ndx  = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    const ndy  = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    const rc   = new THREE.Raycaster();
    rc.setFromCamera({ x: ndx, y: ndy }, camera);
    return rc.ray;
  }

  const totalArcAngle = totalWidth / surfaceR;

  return (
    <group>
      {chars.map((char, i) => {
        let cumWidth = 0;
        for (let j = 0; j < i; j++) cumWidth += charWidths[j];
        cumWidth += charWidths[i] / 2;
        const angle = textEl.theta + (cumWidth - totalWidth / 2) / surfaceR;
        const px = surfaceR * Math.sin(angle);
        const pz = surfaceR * Math.cos(angle);
        return (
          <group key={i} position={[px, textEl.y, pz]} rotation={[0, angle, 0]}>
            <Center disableY disableZ>
              <Text3D
                font={helvetikerBold}
                size={fs}
                height={fs * 0.22}
                curveSegments={10}
                bevelEnabled
                bevelThickness={fs * 0.05}
                bevelSize={fs * 0.04}
                bevelSegments={5}
              >
                {char}
                <meshStandardMaterial
                  attach="material-0"
                  color={faceColor}
                  roughness={0.78}
                  metalness={0.0}
                  emissive={selected ? '#6c47ff' : '#000000'}
                  emissiveIntensity={selected ? 0.10 : 0}
                />
                <meshStandardMaterial
                  attach="material-1"
                  color={sideColor}
                  roughness={0.88}
                  metalness={0.0}
                />
              </Text3D>
            </Center>
          </group>
        );
      })}

      <group position={[cx, textEl.y, cz]} rotation={[0, textEl.theta, 0]}>
        {selected && (
          <lineSegments position={[0, 0, 0.02]} geometry={boxGeom}>
            <lineBasicMaterial color="#6c47ff" />
          </lineSegments>
        )}
        {selected && toolbar && (
          <Html position={[0, fs * 1.4 + 0.15, 0.05]} center zIndexRange={[200, 0]}>
            {toolbar}
          </Html>
        )}
        {selected && (
          <Html center zIndexRange={[150, 0]}>
            <input
              ref={inputRef}
              value={textEl.content}
              onChange={e => onContentChange(textEl.id, e.target.value)}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
              style={{
                background:'transparent', border:'none', outline:'none',
                color:'transparent', caretColor:'transparent',
                fontSize:16, textAlign:'center',
                width: Math.max(160, textEl.content.length * 13 + 40),
              }}
            />
          </Html>
        )}
        <mesh position={[0, 0, 0.02]}
        onPointerDown={e => {
          e.stopPropagation();
          didDrag.current      = false;
          startPos.current     = { x: e.clientX, y: e.clientY };
          dragR.current        = surfaceR;
          startHit.current     = cylinderHit(pointerRay(e), surfaceR);
          startTextPos.current = { theta: textEl.theta, y: textEl.y };
          onOrbitEnable(false);

          const canvas = gl.domElement;

          function onMove(ev) {
            const dx = ev.clientX - startPos.current.x;
            const dy = ev.clientY - startPos.current.y;
            if (dx * dx + dy * dy > 25) didDrag.current = true;
            if (didDrag.current && startHit.current) {
              const hit = cylinderHit(pointerRay(ev), dragR.current);
              if (hit) onMove_prop(textEl.id, {
                theta: startTextPos.current.theta + (hit.theta - startHit.current.theta),
                y:     startTextPos.current.y     + (hit.y     - startHit.current.y),
              });
            }
          }

          function onUp() {
            onOrbitEnable(true);
            if (!didDrag.current) onSelect(textEl.id);
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerup',   onUp);
          }

          canvas.addEventListener('pointermove', onMove);
          canvas.addEventListener('pointerup',   onUp);
        }}
        onClick={e => e.stopPropagation()}>
        <planeGeometry args={[hitW, fs * 1.4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      </group>
    </group>
  );
}

// ── Sticker components ────────────────────────────────────────────────────────

const STICKER_SIZE = 0.28;

class TextureErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() { return this.state.error ? null : this.props.children; }
}

function StickerTexture({ imageUrl, selected }) {
  const texture = useTexture(imageUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh>
      <planeGeometry args={[STICKER_SIZE, STICKER_SIZE]} />
      <meshStandardMaterial
        map={texture}
        transparent
        alphaTest={0.05}
        roughness={0.75}
        emissive={selected ? '#6c47ff' : '#000000'}
        emissiveIntensity={selected ? 0.2 : 0}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function StickerModel({ imageUrl, selected, color }) {
  const { scene } = useGLTF(imageUrl);

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.updateMatrixWorld(true);
    clone.traverse(obj => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(mat => { mat.depthWrite = true; mat.needsUpdate = true; });
    });
    return clone;
  }, [scene]);

  const { scale, position } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(clonedScene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const sc = STICKER_SIZE / Math.max(size.x, size.y, size.z, 0.01);
    return { scale: sc, position: [-center.x * sc, -center.y * sc, -center.z * sc] };
  }, [clonedScene]);

  useEffect(() => {
    clonedScene.traverse(obj => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(mat => {
        if (!mat.map && color) mat.color = new THREE.Color(color);
        if (mat.emissive !== undefined) {
          mat.emissive = new THREE.Color(selected ? '#6c47ff' : '#000000');
          mat.emissiveIntensity = selected ? 0.2 : 0;
        }
        mat.needsUpdate = true;
      });
    });
  }, [clonedScene, selected, color]);

  return <primitive object={clonedScene} scale={scale} position={position} />;
}

function StickerFace({ imageUrl, selected, color }) {
  if (!imageUrl) return null;
  const isGlb = /\.(glb|gltf)(\?|$)/i.test(imageUrl);
  return (
    <TextureErrorBoundary>
      <Suspense fallback={null}>
        {isGlb
          ? <StickerModel imageUrl={imageUrl} selected={selected} color={color} />
          : <StickerTexture imageUrl={imageUrl} selected={selected} />
        }
      </Suspense>
    </TextureErrorBoundary>
  );
}

const OUTLINE_GEOM = new THREE.EdgesGeometry(new THREE.PlaneGeometry(STICKER_SIZE, STICKER_SIZE));
const HANDLE_R = 0.06;

function DraggableSideSticker({ sticker, radius, baseY, height, selected, onSelect, onMove, onOrbitEnable, toolbar }) {
  const { camera, gl } = useThree();
  const didDrag      = useRef(false);
  const startPos     = useRef({ x: 0, y: 0 });
  const startHit     = useRef(null);
  const startSticker = useRef(null);

  const surfaceR = radius + 0.025;
  const cx = surfaceR * Math.sin(sticker.theta);
  const cz = surfaceR * Math.cos(sticker.theta);

  function pointerRay(e) {
    const rect = gl.domElement.getBoundingClientRect();
    const ndx  = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    const ndy  = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    const rc   = new THREE.Raycaster();
    rc.setFromCamera({ x: ndx, y: ndy }, camera);
    return rc.ray;
  }

  return (
    <group
      position={[cx, sticker.y, cz]}
      rotation={[0, sticker.theta, 0]}
      scale={sticker.scale}
    >
      <StickerFace imageUrl={sticker.imageUrl} selected={selected} color={sticker.color} />
      {selected && toolbar && (
        <Html position={[0, STICKER_SIZE / 2 + 0.18, 0.02]} center zIndexRange={[200, 0]}>
          {toolbar}
        </Html>
      )}
      {selected && (
        <lineSegments geometry={OUTLINE_GEOM} position={[0, 0, 0.001]} renderOrder={1}>
          <lineBasicMaterial color="#ffffff" depthTest={false} />
        </lineSegments>
      )}
      <mesh
        position={[0, 0, 0.001]}
        onPointerDown={e => {
          e.stopPropagation();
          didDrag.current      = false;
          startPos.current     = { x: e.clientX, y: e.clientY };
          startHit.current     = cylinderHit(pointerRay(e), surfaceR);
          startSticker.current = { theta: sticker.theta, y: sticker.y };
          onOrbitEnable(false);

          const canvas = gl.domElement;
          function onMoveHandler(ev) {
            const dx = ev.clientX - startPos.current.x;
            const dy = ev.clientY - startPos.current.y;
            if (dx * dx + dy * dy > 25) didDrag.current = true;
            if (didDrag.current && startHit.current) {
              const hit = cylinderHit(pointerRay(ev), surfaceR);
              if (hit) onMove(sticker.id, {
                theta: startSticker.current.theta + (hit.theta - startHit.current.theta),
                y: Math.max(baseY + 0.05, Math.min(baseY + height - 0.05,
                     startSticker.current.y + (hit.y - startHit.current.y))),
              });
            }
          }
          function onUp() {
            onOrbitEnable(true);
            if (!didDrag.current) onSelect(sticker.id);
            canvas.removeEventListener('pointermove', onMoveHandler);
            canvas.removeEventListener('pointerup', onUp);
          }
          canvas.addEventListener('pointermove', onMoveHandler);
          canvas.addEventListener('pointerup', onUp);
        }}
        onClick={e => e.stopPropagation()}
      >
        <planeGeometry args={[STICKER_SIZE, STICKER_SIZE]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {selected && sticker.allowedActions?.resize !== false && (
        <group position={[STICKER_SIZE / 2, -STICKER_SIZE / 2, 0.012]} scale={1 / sticker.scale}>
          <mesh>
            <circleGeometry args={[HANDLE_R + 0.015, 12]} />
            <meshBasicMaterial color="#888888" />
          </mesh>
          <mesh
            position={[0, 0, 0.001]}
            onPointerDown={e => {
              e.stopPropagation();
              onOrbitEnable(false);
              const rect = gl.domElement.getBoundingClientRect();
              const ndc  = new THREE.Vector3(cx, sticker.y, cz).project(camera);
              const scx  = (ndc.x + 1) / 2 * rect.width  + rect.left;
              const scy  = (-ndc.y + 1) / 2 * rect.height + rect.top;
              const d0   = Math.hypot(e.clientX - scx, e.clientY - scy);
              const s0   = sticker.scale;
              function onResizeMove(ev) {
                const d = Math.hypot(ev.clientX - scx, ev.clientY - scy);
                if (d0 > 2) onMove(sticker.id, { scale: Math.max(0.25, Math.min(3, s0 * d / d0)) });
              }
              function onResizeUp() {
                onOrbitEnable(true);
                gl.domElement.removeEventListener('pointermove', onResizeMove);
                gl.domElement.removeEventListener('pointerup', onResizeUp);
              }
              gl.domElement.addEventListener('pointermove', onResizeMove);
              gl.domElement.addEventListener('pointerup', onResizeUp);
            }}
            onClick={e => e.stopPropagation()}
          >
            <circleGeometry args={[HANDLE_R, 12]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </group>
      )}
    </group>
  );
}

function DraggableTopSticker({ sticker, topY, selected, onSelect, onMove, onOrbitEnable, toolbar }) {
  const { camera, gl } = useThree();
  const didDrag      = useRef(false);
  const startPos     = useRef({ x: 0, y: 0 });
  const startHit     = useRef(null);
  const startSticker = useRef(null);
  const plane        = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -topY), [topY]);

  const py = topY + 0.025;
  const rotation = sticker.placementMode === 'stand'
    ? [0, sticker.rotation ?? 0, 0]
    : [-Math.PI / 2, 0, sticker.rotation ?? 0];

  function pointerRay(e) {
    const rect = gl.domElement.getBoundingClientRect();
    const ndx  = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    const ndy  = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    const rc   = new THREE.Raycaster();
    rc.setFromCamera({ x: ndx, y: ndy }, camera);
    return rc.ray;
  }

  function planeHit(ray) {
    const target = new THREE.Vector3();
    return ray.intersectPlane(plane, target) ? { x: target.x, z: target.z } : null;
  }

  return (
    <group
      position={[sticker.x, py, sticker.z]}
      rotation={rotation}
      scale={sticker.scale}
    >
      <StickerFace imageUrl={sticker.imageUrl} selected={selected} color={sticker.color} />
      {selected && toolbar && (
        <Html position={[0, STICKER_SIZE / 2 + 0.18, 0.02]} center zIndexRange={[200, 0]}>
          {toolbar}
        </Html>
      )}
      {selected && (
        <lineSegments geometry={OUTLINE_GEOM} position={[0, 0, 0.001]} renderOrder={1}>
          <lineBasicMaterial color="#ffffff" depthTest={false} />
        </lineSegments>
      )}
      <mesh
        position={[0, 0, 0.001]}
        onPointerDown={e => {
          e.stopPropagation();
          didDrag.current      = false;
          startPos.current     = { x: e.clientX, y: e.clientY };
          startHit.current     = planeHit(pointerRay(e));
          startSticker.current = { x: sticker.x, z: sticker.z };
          onOrbitEnable(false);

          const canvas = gl.domElement;
          function onMoveHandler(ev) {
            const dx = ev.clientX - startPos.current.x;
            const dy = ev.clientY - startPos.current.y;
            if (dx * dx + dy * dy > 25) didDrag.current = true;
            if (didDrag.current && startHit.current) {
              const hit = planeHit(pointerRay(ev));
              if (hit) onMove(sticker.id, {
                x: startSticker.current.x + (hit.x - startHit.current.x),
                z: startSticker.current.z + (hit.z - startHit.current.z),
              });
            }
          }
          function onUp() {
            onOrbitEnable(true);
            if (!didDrag.current) onSelect(sticker.id);
            canvas.removeEventListener('pointermove', onMoveHandler);
            canvas.removeEventListener('pointerup', onUp);
          }
          canvas.addEventListener('pointermove', onMoveHandler);
          canvas.addEventListener('pointerup', onUp);
        }}
        onClick={e => e.stopPropagation()}
      >
        <planeGeometry args={[STICKER_SIZE, STICKER_SIZE]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {selected && sticker.allowedActions?.resize !== false && (
        <group position={[STICKER_SIZE / 2, -STICKER_SIZE / 2, 0.012]} scale={1 / sticker.scale}>
          <mesh>
            <circleGeometry args={[HANDLE_R + 0.015, 12]} />
            <meshBasicMaterial color="#888888" />
          </mesh>
          <mesh
            position={[0, 0, 0.001]}
            onPointerDown={e => {
              e.stopPropagation();
              onOrbitEnable(false);
              const rect = gl.domElement.getBoundingClientRect();
              const ndc  = new THREE.Vector3(sticker.x, py, sticker.z).project(camera);
              const scx  = (ndc.x + 1) / 2 * rect.width  + rect.left;
              const scy  = (-ndc.y + 1) / 2 * rect.height + rect.top;
              const d0   = Math.hypot(e.clientX - scx, e.clientY - scy);
              const s0   = sticker.scale;
              function onResizeMove(ev) {
                const d = Math.hypot(ev.clientX - scx, ev.clientY - scy);
                if (d0 > 2) onMove(sticker.id, { scale: Math.max(0.25, Math.min(3, s0 * d / d0)) });
              }
              function onResizeUp() {
                onOrbitEnable(true);
                gl.domElement.removeEventListener('pointermove', onResizeMove);
                gl.domElement.removeEventListener('pointerup', onResizeUp);
              }
              gl.domElement.addEventListener('pointermove', onResizeMove);
              gl.domElement.addEventListener('pointerup', onResizeUp);
            }}
            onClick={e => e.stopPropagation()}
          >
            <circleGeometry args={[HANDLE_R, 12]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </group>
      )}
    </group>
  );
}

export function preloadTopper(url) {
  if (url) useGLTF.preload(url);
}

function CakeTopper({ glbPath, topY, topRadius, scaleMultiplier = 1, onClick }) {
  const { scene } = useGLTF(glbPath);

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.updateMatrixWorld(true);
    // Transparency sorting causes flickering as the camera rotates.
    // Force all fully-opaque materials to be treated as opaque so Three.js
    // skips the sort-by-depth pass for this model.
    clone.traverse(obj => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(mat => {
        mat.depthWrite = true;
        if (mat.opacity >= 1 && !mat.alphaMap) {
          mat.transparent = false;
        }
        mat.needsUpdate = true;
      });
    });
    return clone;
  }, [scene]);

  const { scale, yPos } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(clonedScene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const sc = (topRadius * 1.8) / Math.max(size.x, size.z, 0.01);
    return { scale: sc, yPos: topY - box.min.y * sc * scaleMultiplier };
  }, [clonedScene, topRadius, topY, scaleMultiplier]);

  return (
    <primitive
      object={clonedScene}
      position={[0, yPos, 0]}
      scale={scale * scaleMultiplier}
      onClick={e => { e.stopPropagation(); onClick?.(); }}
    />
  );
}

const PICKER_ORIGIN_X = -0.5;
const PICKER_STEP_X   = -0.62;
const PICKER_ORIGIN_Z =  2.0;
const PICKER_STEP_Z   = +0.52;

function StyleTile({ id, label, glbPath, position, onSelect }) {
  const [px, py, pz] = position;
  const { scene } = useGLTF(glbPath);

  const { geo, scale } = useMemo(() => {
    let g = null;
    scene.traverse(obj => { if (obj.isMesh && !g) g = obj.geometry.clone(); });
    if (!g) return { geo: null, scale: 1 };
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    g.computeBoundingBox();
    const box = g.boundingBox;
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    g.translate(-center.x, -box.min.y, -center.z);
    return { geo: g, scale: 0.38 / size.y };
  }, [scene]);

  if (!geo) return null;
  return (
    <group position={[px, py, pz]}>
      <mesh geometry={geo} scale={scale} castShadow
        onClick={e => { e.stopPropagation(); onSelect({ id, glbUrl: glbPath, name: label }); }}>
        <meshPhysicalMaterial color="#f5e6c8" roughness={0.82} sheen={0.4} sheenRoughness={0.9} sheenColor="#f5e6c8" />
      </mesh>
      <Html position={[0, -0.28, 0]} center zIndexRange={[300, 0]}>
        <div onClick={() => onSelect({ id, glbUrl: glbPath, name: label })} style={{
          fontSize: 9, fontWeight: 700, color: '#9b5f72',
          cursor: 'pointer', letterSpacing: 0.5,
          textTransform: 'uppercase', fontFamily: "'Quicksand',sans-serif",
          whiteSpace: 'nowrap',
        }}>
          {label}
        </div>
      </Html>
    </group>
  );
}

function CreamStylePicker({ styles = [], onSelect, onCancel }) {
  const positions = styles.map((_, i) => [
    PICKER_ORIGIN_X + i * PICKER_STEP_X,
    0.02,
    PICKER_ORIGIN_Z + i * PICKER_STEP_Z,
  ]);
  const midX = positions[Math.floor(positions.length / 2)]?.[0] ?? 0;
  const midZ = positions[Math.floor(positions.length / 2)]?.[2] ?? 3;

  return (
    <group>
      {styles.map((s, i) => (
        <StyleTile key={s.id} id={s.id} label={s.name} glbPath={s.image_url} position={positions[i]} onSelect={onSelect} />
      ))}
      <Html position={[midX, -0.5, midZ]} center zIndexRange={[300, 0]}>
        <button onClick={onCancel} style={{
          fontSize: 11, fontWeight: 700, padding: '6px 22px', borderRadius: 20,
          border: '1.5px solid #e0d0d5', background: '#fff', color: '#9b5f72',
          cursor: 'pointer', fontFamily: "'Quicksand',sans-serif",
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>
          Cancel
        </button>
      </Html>
    </group>
  );
}

function CameraCapture({ cameraRef }) {
  const { camera } = useThree();
  cameraRef.current = camera;
  return null;
}

function CakeScene({
  config, selectedTier, onTierClick, onDeselect,
  selectedTextId, onTextSelect, onTextMove, onTextContentChange, textToolbar,
  orbitRef,
  selectedPiping, onTopPipingSelect, onBottomPipingSelect,
  pipingTarget, onPipingStyleSelect, onPipingCancel, pipingStyles,
  pipingToolbar,
  onTopperClick,
  selectedStickerId, onStickerSelect, onStickerMove, stickerToolbar,
  tierDataRef,
}) {
  const { tiers, texts = [], stickers = [], topper = null } = config;

  let stackY = 0.1;
  const tierData = tiers.map(tier => {
    const baseY = stackY;
    stackY += tier.height;
    return { ...tier, baseY };
  });
  tierDataRef.current = tierData;

  const bottomTier = tierData[0];
  const minTextY = 0.1 + 0.18;
  const maxTextY = stackY - 0.18;

  return (
    <>
      <color attach="background" args={['#f4f4f5']} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[6, 14, 8]} intensity={1.5} castShadow />
      <directionalLight position={[-4, 4, -4]} intensity={0.4} />
      <Environment preset="apartment" backgroundBlurriness={1} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow
        onClick={e => { e.stopPropagation(); onDeselect(); }}>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#fce8d5" roughness={0.85} />
      </mesh>

      <mesh position={[0, 0.05, 0]} castShadow receiveShadow
        onClick={e => { e.stopPropagation(); onDeselect(); }}>
        <cylinderGeometry args={[bottomTier.radius + 0.6, bottomTier.radius + 0.6, 0.1, 64]} />
        <meshStandardMaterial color="#d4af37" roughness={0.15} metalness={0.75} />
      </mesh>

      {tierData.map((tier, i) => (
        <group key={i}>
          <CakeTier
            radius={tier.radius}
            height={tier.height}
            color={tier.color}
            yBase={tier.baseY}
            frostingType={tier.frostingType}
            selected={selectedTier === i}
            topPiping={tier.topPiping}
            bottomPiping={tier.bottomPiping}
            topPipingSelected={selectedPiping?.tierIndex === i && selectedPiping?.zone === 'top'}
            bottomPipingSelected={selectedPiping?.tierIndex === i && selectedPiping?.zone === 'bottom'}
            onTopPipingClick={e => { e.stopPropagation(); onTopPipingSelect(i); }}
            onBottomPipingClick={e => { e.stopPropagation(); onBottomPipingSelect(i); }}
            onClick={e => { e.stopPropagation(); onTierClick(i); }}
          />
          {selectedPiping?.tierIndex === i && pipingToolbar && (
            <Html
              position={[tier.radius + 0.35, tier.baseY + (selectedPiping.zone === 'top' ? tier.height + 0.1 : 0.1), 0]}
              zIndexRange={[200, 0]}
            >
              {pipingToolbar}
            </Html>
          )}
        </group>
      ))}

      {topper?.image_url && (
        <Suspense fallback={null}>
          <CakeTopper
            glbPath={topper.image_url}
            topY={stackY}
            topRadius={tierData[tierData.length - 1].radius}
            scaleMultiplier={topper.scale ?? 1}
            onClick={onTopperClick}
          />
        </Suspense>
      )}

      {pipingTarget && (
        <CreamStylePicker styles={pipingStyles} onSelect={onPipingStyleSelect} onCancel={onPipingCancel} />
      )}

      {texts.map(t => {
        const hostTier = tierData.find(td => t.y >= td.baseY && t.y < td.baseY + td.height)
          ?? tierData[0];
        return (
          <DraggableText
            key={t.id}
            textEl={t}
            radius={hostTier.radius}
            selected={selectedTextId === t.id}
            onSelect={onTextSelect}
            onMove={(id, pos) => onTextMove(id, {
                theta: pos.theta,
                y: Math.max(minTextY, Math.min(maxTextY, pos.y)),
              })}
            onContentChange={onTextContentChange}
            toolbar={selectedTextId === t.id ? textToolbar : null}
            onOrbitEnable={enabled => { if (orbitRef.current) orbitRef.current.enabled = enabled; }}
          />
        );
      })}

      {stickers.map(sticker => {
        const tier = tierData[sticker.tierIndex] ?? tierData[0];
        const isSide = sticker.zone === 'side' || sticker.zone === 'middle_tier';
        const orbitEnable = enabled => { if (orbitRef.current) orbitRef.current.enabled = enabled; };

        if (isSide) {
          return (
            <DraggableSideSticker
              key={sticker.id}
              sticker={sticker}
              radius={tier.radius}
              baseY={tier.baseY}
              height={tier.height}
              selected={selectedStickerId === sticker.id}
              onSelect={onStickerSelect}
              onMove={onStickerMove}
              onOrbitEnable={orbitEnable}
              toolbar={selectedStickerId === sticker.id ? stickerToolbar : null}
            />
          );
        }
        // top_surface
        const topY = tier.baseY + tier.height;
        return (
          <DraggableTopSticker
            key={sticker.id}
            sticker={sticker}
            topY={topY}
            selected={selectedStickerId === sticker.id}
            onSelect={onStickerSelect}
            onMove={onStickerMove}
            onOrbitEnable={orbitEnable}
            toolbar={selectedStickerId === sticker.id ? stickerToolbar : null}
          />
        );
      })}
    </>
  );
}

function CakeThumbnailScene({ config }) {
  const { tiers, stickers = [], topper = null } = config;

  let stackY = 0.1;
  const tierData = tiers.map(tier => {
    const baseY = stackY;
    stackY += tier.height;
    return { ...tier, baseY };
  });

  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[6, 14, 8]} intensity={1.5} />
      <directionalLight position={[-4, 4, -4]} intensity={0.4} />
      {tierData.map((tier, i) => (
        <CakeTier
          key={i}
          radius={tier.radius}
          height={tier.height}
          color={tier.color}
          yBase={tier.baseY}
          frostingType={tier.frostingType}
          selected={false}
          topPiping={tier.topPiping}
          bottomPiping={tier.bottomPiping}
          topPipingSelected={false}
          bottomPipingSelected={false}
          onTopPipingClick={() => {}}
          onBottomPipingClick={() => {}}
          onClick={() => {}}
        />
      ))}
      {topper?.image_url && (
        <Suspense fallback={null}>
          <CakeTopper
            glbPath={topper.image_url}
            topY={stackY}
            topRadius={tierData[tierData.length - 1].radius}
            scaleMultiplier={topper.scale ?? 1}
          />
        </Suspense>
      )}
      {stickers.map(sticker => {
        const tier = tierData[sticker.tierIndex] ?? tierData[0];
        const isSide = sticker.zone === 'side' || sticker.zone === 'middle_tier';
        if (isSide) {
          const r = tier.radius + 0.025;
          return (
            <group key={sticker.id} position={[r * Math.sin(sticker.theta), sticker.y, r * Math.cos(sticker.theta)]} rotation={[0, sticker.theta, 0]} scale={sticker.scale}>
              <StickerFace imageUrl={sticker.imageUrl} selected={false} />
            </group>
          );
        }
        const topY = tier.baseY + tier.height;
        const rot = sticker.placementMode === 'stand' ? [0, sticker.rotation ?? 0, 0] : [-Math.PI / 2, 0, sticker.rotation ?? 0];
        return (
          <group key={sticker.id} position={[sticker.x, topY + 0.025, sticker.z]} rotation={rot} scale={sticker.scale}>
            <StickerFace imageUrl={sticker.imageUrl} selected={false} />
          </group>
        );
      })}
    </>
  );
}

export function CakeThumbnailCanvas({ config, containerRef }) {
  return (
    <div ref={containerRef} style={{ position: 'absolute', left: -9999, top: -9999, width: 400, height: 400 }}>
      <Canvas
        gl={{ preserveDrawingBuffer: true, alpha: true }}
        camera={{ position: [4.5, 5.5, 6.5], fov: 42 }}
        style={{ width: 400, height: 400 }}
      >
        <CakeThumbnailScene config={config} />
        <OrbitControls enableZoom={false} enablePan={false} autoRotate={false} target={[0, 2, 0]} />
      </Canvas>
    </div>
  );
}

export default function CakeCanvas({
  config, selectedTier, onTierClick, onDeselect,
  selectedTextId, onTextSelect, onTextMove, onTextContentChange, textToolbar,
  autoRotate = true,
  selectedPiping, onTopPipingSelect, onBottomPipingSelect,
  pipingTarget, onPipingStyleSelect, onPipingCancel, pipingStyles = [],
  pipingToolbar,
  onTopperClick, topperSelected = false,
  selectedStickerId, onStickerSelect, onStickerMove, stickerToolbar,
  hitTestRef,
}) {
  const pointerRef  = useRef({ x: 0, y: 0, dragged: false });
  const orbitRef    = useRef();
  const cameraRef   = useRef(null);
  const tierDataRef = useRef([]);
  const glRef       = useRef(null);

  // Expose a hit-test function so the parent can raycast without drag events
  useEffect(() => {
    if (!hitTestRef) return;
    hitTestRef.current = (clientX, clientY) => {
      if (!cameraRef.current || !glRef.current) return null;
      const rect = glRef.current.domElement.getBoundingClientRect();
      const ndx  = ((clientX - rect.left) / rect.width)  * 2 - 1;
      const ndy  = -((clientY - rect.top)  / rect.height) * 2 + 1;
      const rc   = new THREE.Raycaster();
      rc.setFromCamera({ x: ndx, y: ndy }, cameraRef.current);
      const ray  = rc.ray;

      const tiers = tierDataRef.current;
      let best = null;
      let bestDist = Infinity;

      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        const topY = tier.baseY + tier.height;

        const topPlane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), -topY);
        const topTarget = new THREE.Vector3();
        if (ray.intersectPlane(topPlane, topTarget)) {
          const r = Math.sqrt(topTarget.x * topTarget.x + topTarget.z * topTarget.z);
          if (r <= tier.radius) {
            const dist = ray.origin.distanceTo(topTarget);
            if (dist < bestDist) {
              bestDist = dist;
              best = { zone: 'top_surface', tierIndex: i, x: topTarget.x, z: topTarget.z };
            }
          }
        }

        const sideHit = cylinderHit(ray, tier.radius);
        if (sideHit && sideHit.y >= tier.baseY && sideHit.y <= topY) {
          const hitPt = new THREE.Vector3(
            tier.radius * Math.sin(sideHit.theta),
            sideHit.y,
            tier.radius * Math.cos(sideHit.theta),
          );
          const dist = ray.origin.distanceTo(hitPt);
          if (dist < bestDist) {
            bestDist = dist;
            best = { zone: 'side', tierIndex: i, theta: sideHit.theta, y: sideHit.y };
          }
        }
      }
      return best;
    };
    return () => { if (hitTestRef) hitTestRef.current = null; };
  }, [hitTestRef]);

  return (
    <Canvas
      shadows
      camera={{ position: [4.5, 5.5, 6.5], fov: 42 }}
      style={{ position: 'absolute', inset: 0 }}
      gl={{ preserveDrawingBuffer: true }}
      onCreated={({ gl }) => { glRef.current = gl; }}
      onPointerDown={e => { pointerRef.current = { x: e.clientX, y: e.clientY, dragged: false }; }}
      onPointerMove={e => {
        const dx = e.clientX - pointerRef.current.x;
        const dy = e.clientY - pointerRef.current.y;
        if (dx * dx + dy * dy > 25) pointerRef.current.dragged = true;
      }}
    >
      <CameraCapture cameraRef={cameraRef} />
      <CakeScene
        config={config}
        selectedTier={selectedTier}
        onTierClick={i  => { if (!pointerRef.current.dragged) onTierClick(i); }}
        onDeselect={()  => { if (!pointerRef.current.dragged) onDeselect(); }}
        selectedPiping={selectedPiping}
        onTopPipingSelect={i => { if (!pointerRef.current.dragged) onTopPipingSelect(i); }}
        onBottomPipingSelect={i => { if (!pointerRef.current.dragged) onBottomPipingSelect(i); }}
        pipingTarget={pipingTarget}
        onPipingStyleSelect={onPipingStyleSelect}
        onPipingCancel={onPipingCancel}
        pipingStyles={pipingStyles}
        pipingToolbar={pipingToolbar}
        selectedTextId={selectedTextId}
        onTextSelect={onTextSelect}
        onTextMove={onTextMove}
        onTextContentChange={onTextContentChange}
        textToolbar={textToolbar}
        orbitRef={orbitRef}
        onTopperClick={() => { if (!pointerRef.current.dragged) onTopperClick?.(); }}
        selectedStickerId={selectedStickerId}
        onStickerSelect={id => { if (!pointerRef.current.dragged) onStickerSelect?.(id); }}
        onStickerMove={onStickerMove}
        stickerToolbar={stickerToolbar}
        tierDataRef={tierDataRef}
      />
      <OrbitControls
        ref={orbitRef}
        enableZoom={false}
        enablePan={false}
        autoRotate={autoRotate && selectedTier === null && selectedTextId === null && !pipingTarget && !topperSelected}
        autoRotateSpeed={0.8}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 2, 0]}
      />
    </Canvas>
  );
}
