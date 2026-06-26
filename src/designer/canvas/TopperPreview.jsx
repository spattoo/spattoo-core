import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { rectSidePlacement } from '../geometry/surface.js';
import { SIDE_STICKER_SURFACE_OFFSET, STICKER_SIZE } from '../constants.js';
import { buildPreviewTiers, PreviewCakeMeshes } from './previewCake.jsx';
import { TextureErrorBoundary, SafeEnvironment } from './TextureErrorBoundary.jsx';
import { SceneLoader } from './CakeSpinner.jsx';

const isGlbUrl = url => /\.(glb|gltf)(\?|$)/i.test(url ?? '');

// Small live 3D preview of how a GLB hero element renders in one placement mode ('top' | 'side'),
// using the same bounding-box scale + side-wall math the real sticker renderer uses, so the
// preview matches. Mini-cake scaffold is shared with PipingPreview via previewCake.jsx.

// One GLB element mounted on the preview cake, scaled like the real side/top sticker. `offset`
// (optional) positions it as a decor_pattern PART — dx/dz (top: x/z, wall: dx is angular), `mirror`
// flips it across X (matches placePattern + StickerFace), and `r` sizes it to the real part size
// instead of the cake-filling hero scale.
function PreviewTopper({ glbUrl, placement, mode, target, bottom, baseRotation, offset }) {
  const { scene } = useGLTF(glbUrl);
  const { clonedScene, box } = useMemo(() => {
    const clone = scene.clone(true);
    clone.updateMatrixWorld(true);
    return { clonedScene: clone, box: new THREE.Box3().setFromObject(clone) };
  }, [scene]);

  const node = useMemo(() => {
    if (box.isEmpty()) return null;
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.01);
    // Pattern part → real size (STICKER_SIZE × its r, like the live render). Lone hero → fill the cake.
    const scale = offset ? (STICKER_SIZE * (offset.r ?? 2.5)) / maxDim : (bottom.radius * 1.15) / maxDim;
    // Model centred at origin; mirror + the config facing offset applied (matches the real render).
    const model = (
      <group scale={[offset?.mirror ? -1 : 1, 1, 1]}>
        <group rotation={baseRotation ?? [0, 0, 0]}>
          <primitive object={clonedScene} scale={scale} position={[-center.x * scale, -center.y * scale, -center.z * scale]} />
        </group>
      </group>
    );

    if (placement === 'side') {
      const off = SIDE_STICKER_SURFACE_OFFSET;
      const yMid = bottom.baseY + bottom.height / 2;
      let x = 0, z = bottom.radius + off, yaw = 0;
      if (bottom.shp.kind === 'rect') {
        const pl = rectSidePlacement(bottom.shp, 0, off);
        x = pl.x; z = pl.z; yaw = pl.yaw;
      } else {
        const theta = offset?.dx ?? 0;          // wall: dx is an angular offset (radians)
        const surfaceR = bottom.radius + off;
        x = surfaceR * Math.sin(theta); z = surfaceR * Math.cos(theta); yaw = theta;
      }
      return <group position={[x, yMid, z]} rotation={[0, yaw, 0]}>{model}</group>;
    }
    // 'top' — mode-driven, matching the real renderer: 'stand' = upright (base on the surface);
    // anything else (hug, the default) = laid FLAT on the surface (the cake's flat mode rotates the
    // group -90° about X), so the preview hugs instead of always standing.
    if (mode === 'stand') {
      return <group position={[offset?.dx ?? 0, target.topY + (size.y / 2) * scale + 0.02, offset?.dz ?? 0]}>{model}</group>;
    }
    return (
      <group position={[offset?.dx ?? 0, target.topY + (size.z / 2) * scale + 0.02, offset?.dz ?? 0]} rotation={[-Math.PI / 2, 0, 0]}>
        {model}
      </group>
    );
  }, [box, clonedScene, placement, mode, target, bottom, baseRotation, offset]);

  return node;
}

// 2D-image decor preview — a textured plane standing on the top surface or mounted flat on
// the side wall (for elements whose asset is a PNG rather than a GLB, e.g. some top&side decor).
function PreviewImage({ url, placement, target, bottom }) {
  const tex = useTexture(url);
  const aspect = tex.image ? tex.image.width / tex.image.height : 1;
  const w = bottom.radius * 1.15;
  const h = w / (aspect || 1);

  if (placement === 'side') {
    const off = SIDE_STICKER_SURFACE_OFFSET;
    const yMid = bottom.baseY + bottom.height / 2;
    let x = 0, z = bottom.radius + off, yaw = 0;
    if (bottom.shp.kind === 'rect') {
      const pl = rectSidePlacement(bottom.shp, 0, off);
      x = pl.x; z = pl.z; yaw = pl.yaw;
    }
    return (
      <mesh position={[x, yMid, z]} rotation={[0, yaw, 0]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} transparent alphaTest={0.05} side={THREE.DoubleSide} />
      </mesh>
    );
  }
  // 'top' — standing upright, centred on the top surface.
  return (
    <mesh position={[0, target.topY + h / 2, 0]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} transparent alphaTest={0.05} side={THREE.DoubleSide} />
    </mesh>
  );
}

function PreviewDecor(props) {
  return isGlbUrl(props.glbUrl) ? <PreviewTopper {...props} /> : <PreviewImage url={props.glbUrl} {...props} />;
}

export default function TopperPreview({ glbUrl, parts = null, placement = 'top', mode = null, tiers = null, tierIndex = 0, baseRotation = null }) {
  const { placed, totalH } = useMemo(() => buildPreviewTiers(tiers), [tiers]);

  const target = placed[Math.min(tierIndex, placed.length - 1)] ?? placed[0];
  const bottom = placed[0];
  const R0 = bottom.radius;

  // Frame the WHOLE cake plus headroom for a topper standing on top, so neither the
  // top- nor side-mounted topper clips, and both tiles share identical framing (matched
  // pair). FRONT-ON (camX = 0) guarantees the cake is horizontally centred — an azimuth
  // angle shifts it sideways in a narrow tile. Aim above the cake centre, look down ~24°.
  const compTop  = totalH * 1.9;            // board (y=0) → above a top-standing topper
  const targetY  = compTop * 0.5;
  const camZ     = Math.max(R0 * 6.2, compTop * 3.0);
  const camY     = targetY + camZ * 0.45;
  const camX     = 0;
  const camZView = camZ;

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ alpha: true }}
      camera={{ position: [camX, camY, camZView], fov: 32 }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 9, 6]} intensity={1.3} />
      <directionalLight position={[-3, 3, -3]} intensity={0.4} />
      <Suspense fallback={<SceneLoader size={20} />}>
        <SafeEnvironment preset="apartment" />
        <PreviewCakeMeshes placed={placed} />
        {/* A failed decor texture/GLB (e.g. CORS-poisoned cache, 404) must not crash the whole
            preview Canvas — render the cake without the decor instead. */}
        <TextureErrorBoundary screen="TopperPreview">
          {parts && parts.length
            ? parts.map((pt, i) => (
                <PreviewDecor key={i} glbUrl={pt.glbUrl} placement={placement} mode={mode} target={target} bottom={bottom} baseRotation={pt.baseRotation} offset={pt} />
              ))
            : (glbUrl && <PreviewDecor glbUrl={glbUrl} placement={placement} mode={mode} target={target} bottom={bottom} baseRotation={baseRotation} />)}
        </TextureErrorBoundary>
      </Suspense>
      <OrbitControls
        enableZoom={false} enablePan={false}
        target={[0, targetY, 0]} minPolarAngle={Math.PI / 3} maxPolarAngle={Math.PI / 2.1}
      />
    </Canvas>
  );
}
