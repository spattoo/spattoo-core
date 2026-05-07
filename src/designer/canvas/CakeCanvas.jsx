import { useRef, useMemo, useEffect, Suspense, Component } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Text3D, Center, Html, Environment, useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
import CakeTier from './CakeTier';
import { Drip, TopFlowers, SideFlowers } from './Decorations';
import {
  STICKER_SIZE, GOLD_COLOR, SELECTION_COLOR,
  PICKER_ORIGIN_X, PICKER_STEP_X, PICKER_ORIGIN_Z, PICKER_STEP_Z,
  CAMERA_POSITION, CAMERA_FOV,
  SIDE_STICKER_SURFACE_OFFSET, FLAT_STICKER_Y_OFFSET,
} from '../constants.js';
import { pointerRay, cylinderHit, planeHit, buildRay } from '../utils/raycasting.js';

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
                  emissive={selected ? SELECTION_COLOR : '#000000'}
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
            <lineBasicMaterial color={SELECTION_COLOR} />
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
          startHit.current     = cylinderHit(pointerRay(e, gl.domElement, camera), surfaceR);
          startTextPos.current = { theta: textEl.theta, y: textEl.y };
          onOrbitEnable(false);

          const canvas = gl.domElement;

          function onMove(ev) {
            const dx = ev.clientX - startPos.current.x;
            const dy = ev.clientY - startPos.current.y;
            if (dx * dx + dy * dy > 25) didDrag.current = true;
            if (didDrag.current && startHit.current) {
              const hit = cylinderHit(pointerRay(ev, gl.domElement, camera), dragR.current);
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

// Cache of GLB URL → horizontal half-radius in model-local space (before group scale).
// Populated by StickerModel when the bounding box is first computed.
const glbXRadiusCache = {};

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
        emissive={selected ? SELECTION_COLOR : '#000000'}
        emissiveIntensity={selected ? 0.2 : 0}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function StickerModel({ imageUrl, selected, color, clipY }) {
  const { scene } = useGLTF(imageUrl);
  const clipPlane = useRef(null);

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.updateMatrixWorld(true);
    clone.traverse(obj => {
      if (!obj.isMesh) return;
      obj.raycast = () => {}; // hit plane handles interaction; GLB meshes must not absorb raycasts
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(mat => { mat.depthWrite = true; mat.needsUpdate = true; });
    });
    return clone;
  }, [scene]);

  // Sync clip plane: set, update constant, or clear when clipY becomes undefined.
  useEffect(() => {
    if (clipY !== undefined) {
      if (!clipPlane.current) {
        clipPlane.current = new THREE.Plane(new THREE.Vector3(0, 1, 0), -clipY);
      } else {
        clipPlane.current.constant = -clipY;
      }
      const plane = clipPlane.current;
      clonedScene.traverse(obj => {
        if (!obj.isMesh) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(mat => { mat.clippingPlanes = [plane]; mat.needsUpdate = true; });
      });
    } else {
      clonedScene.traverse(obj => {
        if (!obj.isMesh) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(mat => { mat.clippingPlanes = []; mat.needsUpdate = true; });
      });
    }
  }, [clipY, clonedScene]);

  const { scale, position } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(clonedScene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const sc = STICKER_SIZE / Math.max(size.x, size.y, size.z, 0.01);
    glbXRadiusCache[imageUrl] = (size.x / 2) * sc;
    return { scale: sc, position: [-center.x * sc, -center.y * sc, -center.z * sc] };
  }, [clonedScene, imageUrl]);

  useEffect(() => {
    clonedScene.traverse(obj => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(mat => {
        if (!mat.map && color) mat.color = new THREE.Color(color);
        if (mat.emissive !== undefined) {
          mat.emissive = new THREE.Color(selected ? SELECTION_COLOR : '#000000');
          mat.emissiveIntensity = selected ? 0.2 : 0;
        }
        mat.needsUpdate = true;
      });
    });
  }, [clonedScene, selected, color]);

  return <primitive object={clonedScene} scale={scale} position={position} />;
}

function StickerFace({ imageUrl, selected, color, clipY }) {
  if (!imageUrl) return null;
  const isGlb = /\.(glb|gltf)(\?|$)/i.test(imageUrl);
  return (
    <TextureErrorBoundary>
      <Suspense fallback={null}>
        {isGlb
          ? <StickerModel imageUrl={imageUrl} selected={selected} color={color} clipY={clipY} />
          : <StickerTexture imageUrl={imageUrl} selected={selected} />
        }
      </Suspense>
    </TextureErrorBoundary>
  );
}

const OUTLINE_GEOM = new THREE.EdgesGeometry(new THREE.PlaneGeometry(STICKER_SIZE, STICKER_SIZE));
const HANDLE_R = 0.06;

function DraggableSideSticker({ sticker, radius, baseY, height, selected, onSelect, onLongPress, onMove, onGroupMove, allStickers, onOrbitEnable, toolbar }) {
  const { camera, gl } = useThree();
  const didDrag           = useRef(false);
  const startPos          = useRef({ x: 0, y: 0 });
  const startHit          = useRef(null);
  const startSticker      = useRef(null);
  const groupStart        = useRef(null);
  const pointerDownTime   = useRef(0);
  const pressedRef        = useRef(false);

  const surfaceR = radius + SIDE_STICKER_SURFACE_OFFSET + (sticker.radialOffset ?? 0);
  const cx = surfaceR * Math.sin(sticker.theta);
  const cz = surfaceR * Math.cos(sticker.theta);

  return (
    <group
      position={[cx, sticker.y, cz]}
      rotation={[0, sticker.theta, 0]}
      scale={sticker.scale}
    >
      {/* X-axis tilt: leans the pick up (+) or down (−) along the cake side */}
      <group rotation={[sticker.tiltAngle ?? 0, 0, 0]}>
      <StickerFace imageUrl={sticker.imageUrl} selected={selected} color={sticker.color} />
      {selected && toolbar && (
        <Html position={[0, STICKER_SIZE / 2 + 0.18, 0.02]} center zIndexRange={[200, 0]}>
          {toolbar}
        </Html>
      )}
      <mesh
        userData={{ isStickerHitPlane: true }}
        position={[0, 0, 0.001]}
        onPointerEnter={e => { e.stopPropagation(); onOrbitEnable(false); }}
        onPointerLeave={e => { e.stopPropagation(); if (!pressedRef.current) onOrbitEnable(true); }}
        onPointerDown={e => {
          e.stopPropagation();
          pressedRef.current   = true;
          onOrbitEnable(false);
          try { gl.domElement.setPointerCapture(e.pointerId); } catch (_) {}
          didDrag.current      = false;
          pointerDownTime.current = Date.now();
          startPos.current     = { x: e.clientX, y: e.clientY };
          startHit.current     = cylinderHit(pointerRay(e, gl.domElement, camera), surfaceR);
          startSticker.current = { theta: sticker.theta, y: sticker.y };

          if (sticker.groupId) {
            groupStart.current = {};
            allStickers.forEach(s => {
              if (s.groupId === sticker.groupId)
                groupStart.current[s.id] = { theta: s.theta, y: s.y };
            });
          } else {
            groupStart.current = null;
          }

          const canvas = gl.domElement;
          function onMoveHandler(ev) {
            const dx = ev.clientX - startPos.current.x;
            const dy = ev.clientY - startPos.current.y;
            if (dx * dx + dy * dy > 25) didDrag.current = true;
            if (didDrag.current && startHit.current) {
              const hit = cylinderHit(pointerRay(ev, gl.domElement, camera), surfaceR);
              if (!hit) return;
              const deltaTheta = hit.theta - startHit.current.theta;
              const deltaY     = hit.y     - startHit.current.y;
              if (sticker.groupId && groupStart.current && onGroupMove) {
                onGroupMove(sticker.groupId, groupStart.current, { deltaTheta, deltaY });
              } else {
                onMove(sticker.id, {
                  theta: startSticker.current.theta + deltaTheta,
                  y: Math.max(baseY + 0.05, Math.min(baseY + height - 0.05,
                       startSticker.current.y + deltaY)),
                });
              }
            }
          }
          function onUp(ev) {
            pressedRef.current = false;
            onOrbitEnable(true);
            if (!didDrag.current) {
              const elapsed = Date.now() - pointerDownTime.current;
              if (elapsed >= 500 && onLongPress) {
                onLongPress(sticker.id);
              } else {
                onSelect(sticker.id, ev.ctrlKey || ev.metaKey);
              }
            }
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
      </group>
    </group>
  );
}

// ── Procedural faux-ball cluster ──────────────────────────────────────────────
// Builds world-space ball positions from the sticker's (x,z) anchor point.
// Top-surface balls sit on the cake top; side balls press against the cylinder.
function buildFauxBallPositions(theta, topY, radius, baseY, scale, yOffset) {
  const ty = topY + yOffset;

  const r_big  = 0.075 * scale;
  const r_sm   = 0.060 * scale;
  const r_gap  = 0.046 * scale;   // gap balls — smaller, elevated between big & right/left
  const rd_big = radius - 0.08 * scale;

  // Back ball (dt=0, inward): (rd_big - rd_back)² + (r_big - r_sm)² = (r_big + r_sm)²
  //   → rd_back = rd_big - 2√(r_big·r_sm)
  const rd_back = rd_big - 2 * Math.sqrt(r_big * r_sm);
  // Right/left (same rd as big): cos(dt) = 1 - 2·r_big·r_sm / rd_big²
  const cos_dt  = 1 - (2 * r_big * r_sm) / (rd_big * rd_big);
  const dt      = Math.acos(Math.max(-1, Math.min(1, cos_dt)));

  const flat = (th, rd, r) => [rd * Math.sin(th), ty + r, rd * Math.cos(th)];

  const B = flat(theta,      rd_big,  r_big);
  const K = flat(theta,      rd_back, r_sm);
  const R = flat(theta + dt, rd_big,  r_sm);
  const L = flat(theta - dt, rd_big,  r_sm);

  // 3-sphere Apollonius: centre of a ball of radius rG touching spheres P1,P2,P3
  // from above (max-y solution). Uses pairwise subtraction of sphere equations to
  // get two linear planes, finds their intersection line, then solves for the point
  // on the line that lies on sphere-1. Returns max-y solution.
  function apollo3(P1,rP1, P2,rP2, P3,rP3, rG) {
    const R1=rP1+rG, R2=rP2+rG, R3=rP3+rG;
    const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
    const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
    const sc=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
    const d12=[P2[0]-P1[0],P2[1]-P1[1],P2[2]-P1[2]];
    const d23=[P3[0]-P2[0],P3[1]-P2[1],P3[2]-P2[2]];
    const n=cross(d12,d23);
    const nn=dot(n,n);
    if(nn<1e-12) return null;
    const b1=(R1*R1-R2*R2+dot(P2,P2)-dot(P1,P1))/2;
    const b2=(R2*R2-R3*R3+dot(P3,P3)-dot(P2,P2))/2;
    const G0=sc(add(sc(cross(d23,n),b1), sc(cross(n,d12),b2)), 1/nn);
    const nLen=Math.sqrt(nn);
    const nu=sc(n,1/nLen);
    const v=[G0[0]-P1[0],G0[1]-P1[1],G0[2]-P1[2]];
    const bq=2*dot(v,nu), cq=dot(v,v)-R1*R1;
    const disc=bq*bq-4*cq;
    if(disc<0) return null;
    const sq=Math.sqrt(disc);
    const C1=add(G0,sc(nu,(-bq+sq)/2));
    const C2=add(G0,sc(nu,(-bq-sq)/2));
    return C1[1]>=C2[1] ? C1 : C2;
  }

  const balls = [{ pos: B, r: r_big }];
  if (rd_back > r_sm) balls.push({ pos: K, r: r_sm });
  balls.push({ pos: R, r: r_sm }, { pos: L, r: r_sm });

  // Gap balls touch big + back + right/left simultaneously
  const g1 = apollo3(B,r_big, K,r_sm, R,r_sm, r_gap);
  const g2 = apollo3(B,r_big, K,r_sm, L,r_sm, r_gap);
  if (g1 && g1[1] - r_gap > topY) balls.push({ pos: g1, r: r_gap });
  if (g2 && g2[1] - r_gap > topY) balls.push({ pos: g2, r: r_gap });


  // ── Side cluster ──────────────────────────────────────────────────────────
  // Center side ball pressed against the cake side, top edge at ty
  const r_cs  = 0.055 * scale;
  const r_fs  = 0.040 * scale;
  const rd_cs = radius + r_cs;
  const rd_fs = radius + r_fs;
  const y_cs  = ty - r_cs * 0.3;       // center ball just below cake rim, close to top cluster
  const y_fs  = y_cs - r_cs * 1.2;    // flanking balls below center

  // dt so flanking ball (at rd_fs, y_fs) touches center ball (at rd_cs, y_cs)
  // dist² = rd_cs² + rd_fs² - 2·rd_cs·rd_fs·cos(dt) + (y_cs-y_fs)² = (r_cs+r_fs)²
  const dh = y_cs - y_fs;
  const cos_dt_s = (rd_cs*rd_cs + rd_fs*rd_fs + dh*dh - (r_cs+r_fs)*(r_cs+r_fs))
                   / (2 * rd_cs * rd_fs);
  const dt_s = Math.acos(Math.max(-1, Math.min(1, cos_dt_s)));

  const theta_s = theta + 0.40;        // shift side cluster to the right

  // ── Connector ball — sits on the cake side at the rim, between top and side clusters ──
  // Placed outside the rim (rd > radius) so it can't overlap the top-cluster balls (rd < radius)
  const r_e    = 0.055 * scale;
  const theta_e = theta + 0.20;        // between top cluster and side cluster
  const rd_e   = radius + r_e;         // pressed against cake side (like side cluster)
  const y_e    = ty + r_e * 0.3;       // near the rim edge, slightly above top surface
  balls.push({ pos: [rd_e*Math.sin(theta_e), y_e, rd_e*Math.cos(theta_e)], r: r_e });

  if (y_cs - r_cs > baseY)
    balls.push({ pos: [rd_cs*Math.sin(theta_s), y_cs, rd_cs*Math.cos(theta_s)], r: r_cs });
  if (y_fs - r_fs > baseY) {
    balls.push({ pos: [rd_fs*Math.sin(theta_s+dt_s), y_fs, rd_fs*Math.cos(theta_s+dt_s)], r: r_fs });
    balls.push({ pos: [rd_fs*Math.sin(theta_s-dt_s), y_fs, rd_fs*Math.cos(theta_s-dt_s)], r: r_fs });
  }

  return balls;
}

function FauxBallCluster({ sticker, topY, radius, baseY, selected, onSelect, onLongPress, onMove, onOrbitEnable, toolbar }) {
  const { camera, gl } = useThree();
  const didDrag        = useRef(false);
  const startPos       = useRef({ x: 0, y: 0 });
  const startHit       = useRef(null);
  const startSticker   = useRef(null);
  const pressedRef     = useRef(false);
  const pointerDownTime = useRef(0);
  const lastHitRef     = useRef(null);
  const lastValidPos   = useRef(null);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -topY), [topY]);

  const theta = Math.atan2(sticker.x, sticker.z);
  const sc    = sticker.scale ?? 1;
  const yo    = sticker.yOffset ?? 0;
  const color = sticker.color ?? GOLD_COLOR;

  const balls = useMemo(
    () => buildFauxBallPositions(theta, topY, radius, baseY, sc, yo),
    [theta, topY, radius, baseY, sc, yo]
  );

  const onDown = e => {
    e.stopPropagation();
    pressedRef.current = true;
    onOrbitEnable(false);
    try { gl.domElement.setPointerCapture(e.pointerId); } catch (_) {}
    didDrag.current         = false;
    pointerDownTime.current = Date.now();
    startPos.current        = { x: e.clientX, y: e.clientY };
    startHit.current        = planeHit(pointerRay(e, gl.domElement, camera), plane);
    startSticker.current    = { x: sticker.x, z: sticker.z };
    lastHitRef.current      = null;
    lastValidPos.current    = { x: sticker.x, z: sticker.z };

    const canvas = gl.domElement;
    function onMove_(ev) {
      const dx = ev.clientX - startPos.current.x;
      const dy = ev.clientY - startPos.current.y;
      if (dx * dx + dy * dy > 25) didDrag.current = true;
      if (didDrag.current && startHit.current) {
        const hit = planeHit(pointerRay(ev, gl.domElement, camera), plane);
        if (!hit) return;
        const prev = lastHitRef.current ?? startHit.current;
        let newX = lastValidPos.current.x + (hit.x - prev.x);
        let newZ = lastValidPos.current.z + (hit.z - prev.z);
        const maxR = radius * 0.99;
        const rr = Math.sqrt(newX * newX + newZ * newZ);
        if (rr > maxR) { newX = newX * maxR / rr; newZ = newZ * maxR / rr; }
        lastValidPos.current = { x: newX, z: newZ };
        onMove(sticker.id, { x: newX, z: newZ });
        lastHitRef.current = hit;
      }
    }
    function onUp(ev) {
      pressedRef.current = false;
      onOrbitEnable(true);
      if (!didDrag.current) {
        const elapsed = Date.now() - pointerDownTime.current;
        if (elapsed >= 500 && onLongPress) onLongPress(sticker.id);
        else onSelect(sticker.id, ev.ctrlKey || ev.metaKey);
      }
      canvas.removeEventListener('pointermove', onMove_);
      canvas.removeEventListener('pointerup', onUp);
    }
    canvas.addEventListener('pointermove', onMove_);
    canvas.addEventListener('pointerup', onUp);
  };

  return (
    <group>
      {balls.map((ball, i) => (
        <mesh key={i} position={ball.pos} castShadow>
          <sphereGeometry args={[ball.r, 24, 24]} />
          <meshStandardMaterial
            color={color}
            metalness={0.88}
            roughness={0.15}
            emissive={selected ? SELECTION_COLOR : '#000000'}
            emissiveIntensity={selected ? 0.15 : 0}
          />
        </mesh>
      ))}
      {selected && toolbar && (
        <Html position={[sticker.x, topY + 0.22 * sc + yo + 0.12, sticker.z]} center zIndexRange={[200, 0]}>
          {toolbar}
        </Html>
      )}
      {/* Flat hit plane on the cake top for drag + click */}
      <mesh
        userData={{ isStickerHitPlane: true }}
        position={[sticker.x, topY + 0.002, sticker.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerEnter={e => { e.stopPropagation(); onOrbitEnable(false); }}
        onPointerLeave={e => { e.stopPropagation(); if (!pressedRef.current) onOrbitEnable(true); }}
        onPointerDown={onDown}
        onClick={e => e.stopPropagation()}
      >
        <planeGeometry args={[0.5, 0.5]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function DraggableTopSticker({ sticker, topY, topRadius = Infinity, selected, onSelect, onLongPress, onMove, onGroupMove, allStickers, onOrbitEnable, toolbar }) {
  const { camera, gl } = useThree();
  const didDrag         = useRef(false);
  const startPos        = useRef({ x: 0, y: 0 });
  const startHit        = useRef(null);
  const startSticker    = useRef(null);
  const groupStart      = useRef(null);
  const pressedRef      = useRef(false);
  const pointerDownTime = useRef(0);
  const lastHitRef      = useRef(null);
  const lastValidPos    = useRef(null);
  const plane        = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -topY), [topY]);

  const py = topY + (sticker.yOffset ?? 0) + (sticker.placementMode === 'stand' ? -STICKER_SIZE * 0.3 : FLAT_STICKER_Y_OFFSET);
  const isStand = sticker.placementMode === 'stand';

  // Shared children: face + toolbar Html + invisible hit mesh
  const innerContent = (e_onDown) => (
    <>
      <StickerFace imageUrl={sticker.imageUrl} selected={selected} color={sticker.color} clipY={isStand ? undefined : py} />
      {selected && toolbar && (
        <Html position={[0, STICKER_SIZE / 2 + 0.18, 0.02]} center zIndexRange={[200, 0]}>
          {toolbar}
        </Html>
      )}
      <mesh userData={{ isStickerHitPlane: true }} position={[0, 0, 0.001]}
        onPointerEnter={e => { e.stopPropagation(); onOrbitEnable(false); }}
        onPointerLeave={e => { e.stopPropagation(); if (!pressedRef.current) onOrbitEnable(true); }}
        onPointerDown={e_onDown} onClick={e => e.stopPropagation()}>
        <planeGeometry args={[STICKER_SIZE, STICKER_SIZE]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  );

  const onDown = e => {
    e.stopPropagation();
    pressedRef.current = true;
    onOrbitEnable(false);
    try { gl.domElement.setPointerCapture(e.pointerId); } catch (_) {}
    didDrag.current         = false;
    pointerDownTime.current = Date.now();
    startPos.current        = { x: e.clientX, y: e.clientY };
    startHit.current        = planeHit(pointerRay(e, gl.domElement, camera), plane);
    startSticker.current    = { x: sticker.x, z: sticker.z };
    lastHitRef.current      = null;
    lastValidPos.current    = { x: sticker.x, z: sticker.z };

    if (sticker.groupId) {
      groupStart.current = {};
      allStickers.forEach(s => {
        if (s.groupId === sticker.groupId)
          groupStart.current[s.id] = { x: s.x, z: s.z };
      });
    } else {
      groupStart.current = null;
    }

    const canvas = gl.domElement;
    function onMoveHandler(ev) {
      const dx = ev.clientX - startPos.current.x;
      const dy = ev.clientY - startPos.current.y;
      if (dx * dx + dy * dy > 25) didDrag.current = true;
      if (didDrag.current && startHit.current) {
        const hit = planeHit(pointerRay(ev, gl.domElement, camera), plane);
        if (!hit) return;
        if (sticker.groupId && groupStart.current && onGroupMove) {
          const rawDx = hit.x - startHit.current.x;
          const rawDz = hit.z - startHit.current.z;
          onGroupMove(sticker.groupId, groupStart.current, { dx: rawDx, dz: rawDz });
        } else {
          // Incremental delta from last frame so the collision direction never flips
          // when the total drag overshoots the sibling centre.
          const prevHit = lastHitRef.current ?? startHit.current;
          const incrDx  = hit.x - prevHit.x;
          const incrDz  = hit.z - prevHit.z;
          let newX = lastValidPos.current.x + incrDx;
          let newZ = lastValidPos.current.z + incrDz;
          const maxR = topRadius * 0.92;
          const r = Math.sqrt(newX * newX + newZ * newZ);
          if (r > maxR) { newX = newX * maxR / r; newZ = newZ * maxR / r; }
          const siblings = allStickers.filter(s => s.id !== sticker.id && s.zone === sticker.zone && s.tierIndex === sticker.tierIndex);
          for (const sib of siblings) {
            const selfR = (glbXRadiusCache[sticker.imageUrl] ?? STICKER_SIZE / 4) * (sticker.scale ?? 1);
            const sibR  = (glbXRadiusCache[sib.imageUrl]    ?? STICKER_SIZE / 4) * (sib.scale ?? 1);
            const minDist = selfR + sibR;
            const ex = newX - sib.x, ez = newZ - sib.z;
            const dist = Math.sqrt(ex * ex + ez * ez);
            if (dist < minDist && dist > 0.001) {
              newX = sib.x + ex * (minDist / dist);
              newZ = sib.z + ez * (minDist / dist);
              const r2 = Math.sqrt(newX * newX + newZ * newZ);
              if (r2 > maxR) { newX = newX * maxR / r2; newZ = newZ * maxR / r2; }
            }
          }
          lastValidPos.current = { x: newX, z: newZ };
          onMove(sticker.id, { x: newX, z: newZ });
        }
        lastHitRef.current = hit;
      }
    }
    function onUp(ev) {
      pressedRef.current = false;
      onOrbitEnable(true);
      if (!didDrag.current) {
        const elapsed = Date.now() - pointerDownTime.current;
        if (elapsed >= 500 && onLongPress) {
          onLongPress(sticker.id);
        } else {
          onSelect(sticker.id, ev.ctrlKey || ev.metaKey);
        }
      }
      canvas.removeEventListener('pointermove', onMoveHandler);
      canvas.removeEventListener('pointerup', onUp);
    }
    canvas.addEventListener('pointermove', onMoveHandler);
    canvas.addEventListener('pointerup', onUp);
  };

  // Stand mode: outer=position+scale, middle=Y-spin, inner=X-tilt
  if (isStand) {
    return (
      <group position={[sticker.x, py, sticker.z]} scale={sticker.scale}>
        <group rotation={[0, sticker.rotation ?? 0, 0]}>
          <group rotation={[-(sticker.tiltAngle ?? 0), 0, 0]}>
            {innerContent(onDown)}
          </group>
        </group>
      </group>
    );
  }
  // Flat mode (sticker laid horizontal on top surface)
  return (
    <group
      position={[sticker.x, py, sticker.z]}
      rotation={[-Math.PI / 2, 0, sticker.rotation ?? 0]}
      scale={sticker.scale}
    >
      {innerContent(onDown)}
    </group>
  );
}

export function preloadTopper(url) {
  if (url) useGLTF.preload(url);
}

function CakeTopper({ glbPath, topY, topRadius, scaleMultiplier = 1, onClick, selected, toolbar }) {
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

  const topHeight = useMemo(() => {
    const box = new THREE.Box3().setFromObject(clonedScene);
    return (box.max.y - box.min.y) * scale * scaleMultiplier;
  }, [clonedScene, scale, scaleMultiplier]);

  return (
    <group>
      <primitive
        object={clonedScene}
        position={[0, yPos, 0]}
        scale={scale * scaleMultiplier}
        onClick={e => { e.stopPropagation(); onClick?.(); }}
      />
      {selected && toolbar && (
        <Html position={[0, yPos + topHeight + 0.25, 0]} center zIndexRange={[200, 0]}>
          {toolbar}
        </Html>
      )}
    </group>
  );
}

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
  onTopperClick, topperSelected, topperToolbar,
  selectedStickerIds, onStickerSelect, onStickerLongPress, onStickerMove, onGroupMove, stickerToolbar,
  tierDataRef,
}) {
  const { tiers, texts = [], stickers = [], topper = null } = config;
  const orbitBlockSet = useRef(new Set());
  const { gl, camera, scene } = useThree();

  // Capture-phase pointerdown fires before OrbitControls' bubble-phase listener.
  // Raycast here guarantees orbit is disabled before OrbitControls sees the event,
  // even when onPointerEnter hasn't pre-fired (e.g. stationary pointer on a freshly placed sticker).
  useEffect(() => {
    const canvas = gl.domElement;
    function onCaptureDown(e) {
      const rect = canvas.getBoundingClientRect();
      const ndx  = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      const ndy  = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
      const rc   = new THREE.Raycaster();
      rc.setFromCamera({ x: ndx, y: ndy }, camera);
      const hits = rc.intersectObjects(scene.children, true);
      const overSticker = hits.some(h => h.object.userData.isStickerHitPlane);
      if (orbitRef.current) orbitRef.current.enabled = !overSticker;
    }
    canvas.addEventListener('pointerdown', onCaptureDown, { capture: true });
    return () => canvas.removeEventListener('pointerdown', onCaptureDown, { capture: true });
  }, [gl, camera, scene]);

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
            selected={topperSelected}
            toolbar={topperToolbar}
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
            onOrbitEnable={enabled => {
              if (enabled) orbitBlockSet.current.delete(t.id); else orbitBlockSet.current.add(t.id);
              if (orbitRef.current) orbitRef.current.enabled = orbitBlockSet.current.size === 0;
            }}
          />
        );
      })}

      {stickers.map(sticker => {
        const tier = tierData[sticker.tierIndex] ?? tierData[0];
        const isSide = sticker.zone === 'side' || sticker.zone === 'middle_tier';
        const orbitEnable = enabled => {
          if (enabled) orbitBlockSet.current.delete(sticker.id); else orbitBlockSet.current.add(sticker.id);
          if (orbitRef.current) orbitRef.current.enabled = orbitBlockSet.current.size === 0;
        };

        const isSelected = selectedStickerIds?.has(sticker.id) ?? false;
        if (isSide) {
          return (
            <DraggableSideSticker
              key={sticker.id}
              sticker={sticker}
              radius={tier.radius}
              baseY={tier.baseY}
              height={tier.height}
              selected={isSelected}
              onSelect={(id, ctrlKey) => onStickerSelect(id, ctrlKey)}
              onLongPress={onStickerLongPress}
              onMove={onStickerMove}
              onGroupMove={onGroupMove}
              allStickers={stickers}
              onOrbitEnable={orbitEnable}
              toolbar={isSelected ? stickerToolbar : null}
            />
          );
        }
        // top_surface
        const topY = tier.baseY + tier.height;
        if (sticker.placementMode === 'faux_balls') {
          return (
            <FauxBallCluster
              key={sticker.id}
              sticker={sticker}
              topY={topY}
              radius={tier.radius}
              baseY={tier.baseY}
              selected={isSelected}
              onSelect={(id, ctrlKey) => onStickerSelect(id, ctrlKey)}
              onLongPress={onStickerLongPress}
              onMove={onStickerMove}
              onOrbitEnable={orbitEnable}
              toolbar={isSelected ? stickerToolbar : null}
            />
          );
        }
        return (
          <DraggableTopSticker
            key={sticker.id}
            sticker={sticker}
            topY={topY}
            topRadius={tier.radius}
            selected={isSelected}
            onSelect={(id, ctrlKey) => onStickerSelect(id, ctrlKey)}
            onLongPress={onStickerLongPress}
            onMove={onStickerMove}
            onGroupMove={onGroupMove}
            allStickers={stickers}
            onOrbitEnable={orbitEnable}
            toolbar={isSelected ? stickerToolbar : null}
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
          const r = tier.radius + SIDE_STICKER_SURFACE_OFFSET + (sticker.radialOffset ?? 0);
          return (
            <group key={sticker.id} position={[r * Math.sin(sticker.theta), sticker.y, r * Math.cos(sticker.theta)]} rotation={[0, sticker.theta, 0]} scale={sticker.scale}>
              <group rotation={[sticker.tiltAngle ?? 0, 0, 0]}>
                <StickerFace imageUrl={sticker.imageUrl} selected={false} />
              </group>
            </group>
          );
        }
        const topY = tier.baseY + tier.height;
        if (sticker.placementMode === 'faux_balls') {
          const balls = buildFauxBallPositions(
            Math.atan2(sticker.x, sticker.z), topY, tier.radius, tier.baseY,
            sticker.scale ?? 1, sticker.yOffset ?? 0
          );
          return (
            <group key={sticker.id}>
              {balls.map((ball, i) => (
                <mesh key={i} position={ball.pos}>
                  <sphereGeometry args={[ball.r, 16, 16]} />
                  <meshStandardMaterial color={sticker.color ?? GOLD_COLOR} metalness={0.88} roughness={0.15} />
                </mesh>
              ))}
            </group>
          );
        }
        const py   = topY + (sticker.yOffset ?? 0) + (sticker.placementMode === 'stand' ? -STICKER_SIZE * 0.3 : FLAT_STICKER_Y_OFFSET);
        if (sticker.placementMode === 'stand') {
          return (
            <group key={sticker.id} position={[sticker.x, py, sticker.z]} scale={sticker.scale}>
              <group rotation={[0, sticker.rotation ?? 0, 0]}>
                <group rotation={[-(sticker.tiltAngle ?? 0), 0, 0]}>
                  <StickerFace imageUrl={sticker.imageUrl} selected={false} clipY={undefined} />
                </group>
              </group>
            </group>
          );
        }
        return (
          <group key={sticker.id} position={[sticker.x, py, sticker.z]} rotation={[-Math.PI / 2, 0, sticker.rotation ?? 0]} scale={sticker.scale}>
            <StickerFace imageUrl={sticker.imageUrl} selected={false} clipY={py} />
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
        onCreated={({ gl }) => { gl.localClippingEnabled = true; }}
        camera={{ position: CAMERA_POSITION, fov: CAMERA_FOV }}
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
  onTopperClick, topperSelected = false, topperToolbar,
  selectedStickerIds, onStickerSelect, onStickerLongPress, onStickerMove, onGroupMove, stickerToolbar,
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
      const ray = buildRay(clientX, clientY, glRef.current.domElement, cameraRef.current);

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
      camera={{ position: CAMERA_POSITION, fov: CAMERA_FOV }}
      style={{ position: 'absolute', inset: 0 }}
      gl={{ preserveDrawingBuffer: true }}
      onCreated={({ gl }) => { glRef.current = gl; gl.localClippingEnabled = true; }}
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
        topperSelected={topperSelected}
        topperToolbar={topperToolbar}
        selectedStickerIds={selectedStickerIds}
        onStickerSelect={(id, ctrlKey) => onStickerSelect?.(id, ctrlKey)}
        onStickerLongPress={(id) => onStickerLongPress?.(id)}
        onStickerMove={onStickerMove}
        onGroupMove={onGroupMove}
        stickerToolbar={stickerToolbar}
        tierDataRef={tierDataRef}
      />
      <OrbitControls
        makeDefault
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
