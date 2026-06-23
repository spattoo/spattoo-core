import { useRef, useMemo, useEffect, useState, Suspense } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Text3D, Text, Center, Html, Environment, useGLTF, useTexture, Billboard, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
import CakeTier from './CakeTier';
import { TextureErrorBoundary } from './TextureErrorBoundary.jsx';
import { LoadingPing } from './loadingRegistry.js';
import CreamWriting from './CreamWriting.jsx';
import AgeNumber from './AgeNumber.jsx';
import CreamPen from './CreamPen.jsx';
import { Drip, TopFlowers, SideFlowers } from './Decorations';
import {
  STICKER_SIZE, SELECTION_COLOR,
  PICKER_ORIGIN_X, PICKER_STEP_X, PICKER_ORIGIN_Z, PICKER_STEP_Z,
  CAMERA_POSITION, CAMERA_POSITION_MOBILE, CAMERA_FOV,
  SIDE_STICKER_SURFACE_OFFSET, FLAT_STICKER_Y_OFFSET,
} from '../constants.js';
import { pointerRay, cylinderHit, planeHit, buildRay } from '../utils/raycasting.js';
import { getFondantNormalMap, applyBoxUVs } from '../shared/textures/fondantTexture.js';
import { tierShape, topClamp, topClampInset, topContains, boxHit, nearestU, rectSidePlacement, perimeter, snapToRim } from '../geometry/surface.js';
import { manualSeat } from '../geometry/spherePacking.js';
import { hugScale, isDynamicHug, wallClampY, frameTopMaxScale, frameSideMaxScale, DEFAULT_HUG_FILL, DEFAULT_FOLD_DEG, DEFAULT_SPINE } from '../placement.js';
import { recolorImageData } from '../shared/color/imageRecolor.js';
import { applyGradient } from '../shared/color/gradientMaterial.js';
import { styleDef, resolveStyleParams } from '../creamStyles.js';
import { frostingAllowsStyles } from '../frostings.js';
import { makeWallReliefSampler } from '../geometry/creamWall.js';
import { makeDripReliefSampler, dripRenderParams } from '../geometry/chocolateDrip.js';
import { toCanvasConfig } from '../hooks/useCakeDesign.js';

// Per-tier sampler for the cream-wall SURFACE: (theta, v) → local radial relief (world units), so side
// decor seats on the live wavy/swirled wall and hugs it, instead of a fixed offset (which buries decor
// in the ribs) or a global lift (which floats small decor off the troughs). Memoised by wall+radius+
// params (the height-field build is non-trivial). null when the frosting permits no style → flat wall.
const _reliefSamplerCache = new Map();
function wallReliefSamplerOf(tier) {
  if (!tier || !frostingAllowsStyles(tier.frostingType)) return null;
  const wall = styleDef(tier.frostingStyle).wall;
  if (wall === 'smooth') return null;
  const params = resolveStyleParams(tier.frostingStyle, tier.styleParams);
  const key = `${wall}|${tier.radius}|${JSON.stringify(params)}`;
  if (!_reliefSamplerCache.has(key)) _reliefSamplerCache.set(key, makeWallReliefSampler(wall, tier.radius, params));
  return _reliefSamplerCache.get(key);
}

// A chocolate-drip rim ring also adds relief: decor on the upper wall must rest ON the drip where it
// exists (and nestle on bare wall in the open arch pockets). Built from the SAME params the mesh
// renders (dripRenderParams), keyed so it rebuilds when the drip changes.
const _dripReliefCache = new Map();
function dripReliefSamplerOf(tier) {
  const layer = (tier?.topPipings ?? []).find(p => p?.drip);
  if (!layer) return null;
  const { radius, height } = tier;
  const key = `${radius}|${height}|${JSON.stringify(layer.dripConfig)}|${layer.dripLength ?? 1}`;
  if (!_dripReliefCache.has(key)) {
    const { params, startDrop } = dripRenderParams(layer.dripConfig, radius, layer.dripLength ?? 1);
    _dripReliefCache.set(key, makeDripReliefSampler({ params, R: radius, height, startDrop }));
  }
  return _dripReliefCache.get(key);
}

// Per-tier relief = the higher of the wall surface and any drip ring, so decor rests on whichever is
// proud at that point.
function tierReliefSampler(tier) {
  const wallS = wallReliefSamplerOf(tier);
  const dripS = dripReliefSamplerOf(tier);
  if (wallS && dripS) return (theta, v) => Math.max(wallS(theta, v), dripS(theta, v));
  return dripS ?? wallS;
}

// REST an element on the displaced wall: return the HIGHEST relief under the patch the element covers
// (its centre ± half its world footprint, expressed as an arc half-span dTheta and a height half-span
// dV). One rule for any size — a tiny sprinkle's patch ≈ a point (it nestles into a rib), a wide flower's
// patch spans several ribs (it rests on the tallest, never penetrated). dTheta/dV come from the LIVE
// element size, so resizing just re-reads them. Sampler is null for flat walls → caller uses lift 0.
function maxReliefUnder(sampler, thetaC, vC, dTheta, dV) {
  const N = 3;
  let m = -Infinity;
  for (let i = -N; i <= N; i++) {
    const th = thetaC + dTheta * (i / N);
    for (let j = -N; j <= N; j++) {
      const v = Math.min(1, Math.max(0, vC + dV * (j / N)));
      const r = sampler(th, v);
      if (r > m) m = r;
    }
  }
  return m;
}

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

// One 3D letter (face + extruded side materials). Shared by the round (arc) and
// rect (flat) text layouts so both render identical glyphs.
function Glyph({ char, fs, faceColor, sideColor, selected }) {
  return (
    <Center disableY disableZ>
      <Text3D font={helvetikerBold} size={fs} height={fs * 0.22} curveSegments={10}
        bevelEnabled bevelThickness={fs * 0.05} bevelSize={fs * 0.04} bevelSegments={5}>
        {char}
        <meshStandardMaterial attach="material-0" color={faceColor} roughness={0.78} metalness={0.0}
          emissive={selected ? SELECTION_COLOR : '#000000'} emissiveIntensity={selected ? 0.10 : 0} />
        <meshStandardMaterial attach="material-1" color={sideColor} roughness={0.88} metalness={0.0} />
      </Text3D>
    </Center>
  );
}

function DraggableText({ textEl, radius, shp = { kind: 'round', radius }, selected, onSelect, onMove: onMove_prop, onContentChange, onOrbitEnable, toolbar }) {
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

  const isRect = shp.kind === 'rect';
  const surfaceR = radius + 0.015;
  // Anchor + facing: round wraps the cylinder (yaw = theta); rect sits flat on the wall
  // at perimeter fraction u (yaw = the face's outward direction).
  let cx, cz, yaw;
  if (isRect) {
    const pl = rectSidePlacement(shp, textEl.u ?? 0, 0.015);
    cx = pl.x; cz = pl.z; yaw = pl.yaw;
  } else {
    cx = surfaceR * Math.sin(textEl.theta); cz = surfaceR * Math.cos(textEl.theta); yaw = textEl.theta;
  }
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

  // Cumulative centre offset of each glyph along the baseline.
  const charOffset = i => {
    let cum = 0;
    for (let j = 0; j < i; j++) cum += charWidths[j];
    return cum + charWidths[i] / 2 - totalWidth / 2;
  };

  return (
    <group>
      {/* Round cake: letters laid along the cylinder arc (each in world space). */}
      {!isRect && chars.map((char, i) => {
        const angle = textEl.theta + charOffset(i) / surfaceR;
        return (
          <group key={i} position={[surfaceR * Math.sin(angle), textEl.y, surfaceR * Math.cos(angle)]} rotation={[0, angle, 0]}>
            <Glyph char={char} fs={fs} faceColor={faceColor} sideColor={sideColor} selected={selected} />
          </group>
        );
      })}

      <group position={[cx, textEl.y, cz]} rotation={[0, yaw, 0]}>
        {/* Sheet cake: letters laid flat along the wall, in the anchor's local frame. */}
        {isRect && chars.map((char, i) => (
          <group key={i} position={[charOffset(i), 0, 0]}>
            <Glyph char={char} fs={fs} faceColor={faceColor} sideColor={sideColor} selected={selected} />
          </group>
        ))}
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
          startHit.current     = isRect
            ? boxHit(pointerRay(e, gl.domElement, camera), shp.halfW, shp.halfD)
            : cylinderHit(pointerRay(e, gl.domElement, camera), surfaceR);
          startTextPos.current = { theta: textEl.theta, y: textEl.y };
          onOrbitEnable(false);

          const canvas = gl.domElement;

          function onMove(ev) {
            const dx = ev.clientX - startPos.current.x;
            const dy = ev.clientY - startPos.current.y;
            if (dx * dx + dy * dy > 25) didDrag.current = true;
            if (!didDrag.current || !startHit.current) return;
            if (isRect) {
              const bh = boxHit(pointerRay(ev, gl.domElement, camera), shp.halfW, shp.halfD);
              if (bh) onMove_prop(textEl.id, { u: nearestU(shp, bh.x, bh.z), y: bh.y });
              return;
            }
            const hit = cylinderHit(pointerRay(ev, gl.domElement, camera), dragR.current);
            if (hit) onMove_prop(textEl.id, {
              theta: startTextPos.current.theta + (hit.theta - startHit.current.theta),
              y:     startTextPos.current.y     + (hit.y     - startHit.current.y),
            });
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


// Builds a flat-strip geometry that curves around a cylinder of the given radius.
// In the sticker's local space the cylinder axis is at z = -curveRadius, so the
// strip follows the cake surface naturally.
function createCurvedPlane(width, height, curveRadius, radialSegments = 16) {
  const halfAngle = width / (2 * curveRadius);
  const positions = [], normals = [], uvs = [], indices = [];
  for (let j = 0; j <= 1; j++) {
    const y = (j - 0.5) * height;
    for (let i = 0; i <= radialSegments; i++) {
      const u = i / radialSegments;
      const a = (u - 0.5) * 2 * halfAngle;
      positions.push(curveRadius * Math.sin(a), y, curveRadius * (Math.cos(a) - 1));
      normals.push(Math.sin(a), 0, Math.cos(a));
      uvs.push(u, j);
    }
  }
  for (let i = 0; i < radialSegments; i++) {
    const a = i, b = i + radialSegments + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs,       2));
  geo.setIndex(indices);
  return geo;
}

// Builds a "folded sticker": the flat square is split at the body spine into two wings
// that hinge into a shallow V. ONE geometry, the image's left half [0,spine] → left wing and
// right half [spine,1] → right, so a single asset reads as a folded butterfly. `foldRad` tents the
// wings toward +Z (depth — used when laid flat / on a wall). `riseRad` lifts each wing UP (+Y) as it
// extends from the spine, so when standing the body/spine is the lowest support and the wings rise
// off the surface in a V (the perched-butterfly look). Both 0 → a flat plane. spine 0.5 → centred.
function createFoldedPlane(size, foldRad, spine, riseRad = 0) {
  const S = size, hy = S / 2;
  const xh = S * (spine - 0.5);                          // hinge x (the body spine); 0 at spine 0.5
  const cos = Math.cos(foldRad), sin = Math.sin(foldRad), rise = Math.sin(riseRad);
  const fold = (x, y) => { const dx = x - xh; return [xh + dx * cos, y + Math.abs(dx) * rise, Math.abs(dx) * sin]; };
  const positions = [], uvs = [], indices = [];
  let base = 0;
  // Each wing is its own quad (no shared spine vertices) so the crease stays sharp.
  const quad = (x0, x1) => {
    for (const [x, y] of [[x0, -hy], [x1, -hy], [x1, hy], [x0, hy]]) {
      positions.push(...fold(x, y));
      uvs.push((x + hy) / S, (y + hy) / S);              // u from x → auto-splits at spine; v from y
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    base += 4;
  };
  quad(-hy, xh);   // left wing  → u [0, spine]
  quad(xh, hy);    // right wing → u [spine, 1]
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Measure a 2D sticker's opaque content bottom so a STANDING sticker seats its VISIBLE base on the
// surface — not the empty bottom of a square plane with transparent margin (which makes it float).
// Returns the unscaled half-height from the plane centre down to the content bottom (= STICKER_SIZE/2
// when the content fills the plane, so margin-free assets are unaffected). Cached per URL; a
// CORS-tainted canvas falls back to the old half-plane seat. Asset-derived — never type-aware.
// The seat = distance from the plane centre down to the geometry's LOWEST opaque point, over EVERY
// opaque pixel (not just the bottom row). `rise` (= sin(fold) when standing) lifts a pixel by
// |x − spine|·rise, so a low wing pixel that hangs below the body in the flat image rises ABOVE the
// spine in 3D — making the body the true support and the wings clear. rise 0 = plain content-bottom.
function computeSeatHalf(img, spine, rise) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (!w || !h) return STICKER_SIZE / 2;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, w, h).data;          // throws if the canvas is CORS-tainted
  const xh = STICKER_SIZE * (spine - 0.5);
  let minY = Infinity;
  for (let py = 0; py < h; py++) {
    const planeY = STICKER_SIZE * (0.5 - py / h);        // flipY: image top → plane top (+S/2)
    const row = py * w * 4;
    for (let px = 0; px < w; px++) {
      if (d[row + px * 4 + 3] > 8) {
        const planeX = STICKER_SIZE * (px / w - 0.5);
        const y3 = planeY + Math.abs(planeX - xh) * rise;
        if (y3 < minY) minY = y3;
      }
    }
  }
  return minY < Infinity ? -minY : STICKER_SIZE / 2;
}

// Load the asset for MEASURING in its own CORS image with a cache-bust, so the pixel read can't hit
// a cache entry poisoned by a non-CORS <img> (e.g. a picker thumbnail) — which would taint the canvas
// and silently fall the seat back to half-plane (→ float). One fetch per URL, then cached.
const seatImgCache = {};   // bustUrl → { img, loaded, cbs }
function loadSeatImage(imageUrl, cb) {
  const url = imageUrl + (imageUrl.includes('?') ? '&' : '?') + 'cors=seat';
  const e = seatImgCache[url];
  if (e) { e.loaded ? cb(e.img) : e.cbs.push(cb); return; }
  const entry = { img: null, loaded: false, cbs: [cb] };
  seatImgCache[url] = entry;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload  = () => { entry.img = img; entry.loaded = true; entry.cbs.forEach(f => f(img)); entry.cbs = []; };
  img.onerror = () => { entry.loaded = true; entry.cbs.forEach(f => f(null)); entry.cbs = []; };
  img.src = url;
}

const stickerSeatHalfCache = {};
function requestStickerSeatHalf(imageUrl, { spine = 0.5, rise = 0 } = {}, cb) {
  const key = `${imageUrl}|r${rise.toFixed(2)}|s${spine.toFixed(2)}`;
  if (key in stickerSeatHalfCache) { cb(stickerSeatHalfCache[key]); return; }
  loadSeatImage(imageUrl, img => {
    let half = STICKER_SIZE / 2;
    if (img) { try { half = computeSeatHalf(img, spine, rise); } catch (_) { /* tainted → fallback */ } }
    half = Math.max(half, 0.02 * STICKER_SIZE);
    stickerSeatHalfCache[key] = half;
    cb(half);
  });
}

// Returns the sticker's texture, pixel-recoloured to `color` when the element carries a
// `recolor` region descriptor (placement_config.recolor). useTexture still owns loading/suspense/
// caching; we derive a recoloured CanvasTexture from the loaded image only when asked. A tainted
// canvas (CORS) falls back to the original — recolour silently off, sticker still renders.
function useStickerImageTexture(imageUrl, recolor, color) {
  const base = useTexture(imageUrl);
  base.colorSpace = THREE.SRGBColorSpace;
  const recoloured = useMemo(() => {
    if (!recolor || !color) return base;
    const img = base.image;
    const w = img?.naturalWidth || img?.width, h = img?.naturalHeight || img?.height;
    if (!w || !h) return base;
    try {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      const id = ctx.getImageData(0, 0, w, h);
      recolorImageData(id.data, w, h, color, recolor);
      ctx.putImageData(id, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = base.anisotropy;
      tex.flipY = base.flipY;
      return tex;
    } catch (_) {
      return base;   // tainted canvas → original texture (no recolour)
    }
  }, [base, recolor, color]);
  // Free the derived GPU texture when colour changes / unmounts (the cached `base` is left alone).
  useEffect(() => () => { if (recoloured !== base) recoloured.dispose(); }, [recoloured, base]);
  return recoloured;
}

// Map a customer photo into the frame's square plane: cover-fit (fill the square, crop the
// overflow — never distort), then apply the customer's zoom (>1 crops in) and pan (UV fraction).
// With center=(0.5,0.5) the image centre maps to the plane centre for any repeat, so offset is pure
// pan. Clamp wrap so panning past an edge repeats nothing (shows the clamped edge, not a tile seam).
// Build a clip texture from a window mask whose SHAPE lives in its ALPHA channel (white-on-transparent
// — the authoring spec). meshStandardMaterial.alphaMap reads the GREEN channel, but a white-on-
// transparent PNG has green=255 everywhere (the shape is only in alpha), so used raw it would clip
// nothing → a square photo/border. Here we copy alpha → RGB (opaque), so green encodes the shape and
// alphaMap clips correctly to any outline. Canvas-derived (CORS-clean now); cached per mask texture.
function useMaskAlpha(maskUrl) {
  const mask = useTexture(maskUrl);
  return useMemo(() => {
    const img = mask.image;
    const w = img?.naturalWidth || img?.width, h = img?.naturalHeight || img?.height;
    if (!w || !h) return mask;
    try {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, w, h), d = id.data;
      for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; d[i] = a; d[i + 1] = a; d[i + 2] = a; d[i + 3] = 255; }
      ctx.putImageData(id, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.NoColorSpace;
      t.flipY = mask.flipY;
      return t;
    } catch (_) {
      return mask;   // tainted canvas → fall back (clips by green, may be square)
    }
  }, [mask]);
}

function applyPhotoTransform(tex, t, imgAspect) {
  const zoom = Math.max(0.2, t?.zoom ?? 1);
  // Rotating the texture's UV frame turns the image the opposite way, so negate to make the ↻ control
  // visually rotate the photo clockwise (and ↺ anticlockwise).
  const rot = -((t?.rot ?? 0) * Math.PI) / 180;   // 2D rotation of the photo within the frame
  let rx = 1, ry = 1;                       // cover-fit a (imgAspect) image into a square
  if (imgAspect >= 1) rx = 1 / imgAspect;   // landscape → show full height, crop width
  else ry = imgAspect;                       // portrait  → show full width,  crop height
  tex.center.set(0.5, 0.5);                  // rotate/scale about the photo centre
  tex.rotation = rot;
  tex.repeat.set(rx / zoom, ry / zoom);
  tex.offset.set(t?.x ?? 0, t?.y ?? 0);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
}

// The customer photo for a photo-cake frame: a mesh sharing the frame's geometry (so it aligns
// flat-on-top and curved-on-side automatically), drawn BEHIND the frame overlay (renderOrder −1,
// a hair into the cake). `map` = the photo (cover-fit + zoom/pan), `alphaMap` = the window mask
// silhouette → the photo is clipped to the frame's window shape; the overlay's opaque border hides
// the mask seam. Suspends on its own textures (StickerFace already wraps StickerTexture in Suspense).
// A generic "add a photo here" placeholder for an empty frame: a soft grey fill with a centred
// camera glyph (vertically symmetric, so texture flip never matters), clipped to the frame shape so
// an unfilled frame reads as a photo slot rather than a hollow black ring. Built once, cached.
let _placeholderTex = null;
function placeholderTexture() {
  if (_placeholderTex) return _placeholderTex;
  const S = 256, c = document.createElement('canvas'); c.width = S; c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#eceaf0'; x.fillRect(0, 0, S, S);                 // soft grey field
  x.fillStyle = '#c3bcc9';                                          // camera body (rounded rect, centred)
  const bx = S * 0.30, by = S * 0.36, bw = S * 0.40, bh = S * 0.28, r = S * 0.04;
  x.beginPath();
  x.moveTo(bx + r, by); x.arcTo(bx + bw, by, bx + bw, by + bh, r); x.arcTo(bx + bw, by + bh, bx, by + bh, r);
  x.arcTo(bx, by + bh, bx, by, r); x.arcTo(bx, by, bx + bw, by, r); x.closePath(); x.fill();
  x.fillStyle = '#eceaf0'; x.beginPath(); x.arc(S / 2, S / 2, S * 0.085, 0, Math.PI * 2); x.fill();  // lens hole
  x.fillStyle = '#c3bcc9'; x.beginPath(); x.arc(S / 2, S / 2, S * 0.04, 0, Math.PI * 2); x.fill();   // lens centre
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (_placeholderTex = t);
}

// The empty-frame placeholder mesh: the camera glyph clipped to the mask shape.
function PlaceholderBacking({ geo, maskUrl }) {
  const mask = useMaskAlpha(maskUrl);
  const tex = useMemo(() => placeholderTexture(), []);
  return (
    <mesh geometry={geo} renderOrder={-1} frustumCulled={false}>
      <meshStandardMaterial map={tex} alphaMap={mask} transparent alphaTest={0.5} roughness={0.9} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function PhotoBacking({ geo, photoUrl, maskUrl, transform }) {
  const photo = useTexture(photoUrl);
  const mask  = useMaskAlpha(maskUrl);        // clips by the mask's shape (alpha→green), any outline
  photo.colorSpace = THREE.SRGBColorSpace;
  const imgAspect = useMemo(() => {
    const img = photo.image;
    const w = img?.naturalWidth || img?.width, h = img?.naturalHeight || img?.height;
    return (w && h) ? w / h : 1;
  }, [photo]);
  useMemo(() => applyPhotoTransform(photo, transform, imgAspect),
    [photo, transform?.x, transform?.y, transform?.zoom, transform?.rot, imgAspect]);
  return (
    <mesh geometry={geo} renderOrder={-1} frustumCulled={false}>
      <meshStandardMaterial
        map={photo}
        alphaMap={mask}
        transparent
        alphaTest={0.5}
        roughness={0.85}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// Procedural frame border: the mask silhouette in the border colour, sharing the frame's geometry
// but scaled up by (1 + width) and drawn BEHIND the photo, so it peeks out around the photo as an
// even-width ring that follows any shape (heart, circle, square…). width 0 → same size as the photo
// → fully covered → no visible border. No baked border art needed; the one mask drives both.
function BorderBacking({ geo, maskUrl, color, width }) {
  const mask = useMaskAlpha(maskUrl);         // ring follows the mask's shape (alpha→green), any outline
  return (
    <mesh geometry={geo} scale={1 + (width ?? 0)} renderOrder={-2} frustumCulled={false}>
      <meshStandardMaterial
        color={color || '#ffffff'}
        alphaMap={mask}
        transparent
        alphaTest={0.5}
        roughness={0.85}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// Optional decorative border art (glitter, piped cream, watercolour) — a baked PNG drawn on top of
// the photo. When present it IS the border (the procedural ring is suppressed); fixed thickness.
function OverlayMesh({ geo, url, selected }) {
  const tex = useTexture(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh geometry={geo} renderOrder={1} frustumCulled={false}>
      <meshStandardMaterial
        map={tex}
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

function StickerTexture({ imageUrl, selected, curved, curveRadius, foldable, fold, spine, standUp, recolor, color, photoUrl, photoMask, photoTransform, photoOverlay, borderWidth, onSeat }) {
  const texture = useStickerImageTexture(imageUrl, recolor, color);
  // Seat a standing sticker on its visible base (measured from the texture's opaque content) so a
  // wide butterfly on a square canvas doesn't float. When standing (standUp) the wings rise in a V,
  // so the seat must account for that rise — the spine/body becomes the true lowest point.
  const seatRise  = (foldable && standUp) ? Math.sin((fold ?? DEFAULT_FOLD_DEG) * Math.PI / 180) : 0;
  const seatSpine = spine ?? DEFAULT_SPINE;
  useEffect(() => {
    if (!onSeat || !imageUrl) return;
    let live = true;
    // Prefer the already-loaded texture image — no extra fetch (r2.dev rate-limits, so a second
    // download for measuring can fail and fall the seat back to half-plane → constant lift). Only if
    // THIS image is CORS-tainted (e.g. a non-CORS thumbnail poisoned the cache) do we reload clean.
    const img = texture?.image;
    if (img && (img.naturalWidth || img.width)) {
      try { onSeat(Math.max(computeSeatHalf(img, seatSpine, seatRise), 0.02 * STICKER_SIZE)); return () => { live = false; }; }
      catch (_) { /* tainted → CORS fallback below */ }
    }
    requestStickerSeatHalf(imageUrl, { spine: seatSpine, rise: seatRise }, half => { if (live) onSeat(half); });
    return () => { live = false; };
  }, [texture, imageUrl, onSeat, seatRise, seatSpine]);
  // Geometry is config-driven: a foldable element hinges into a folded plane (the fold wins over
  // wall-curving). Standing → wings rise UP in a V from the spine (riseRad = fold), so the body is
  // the support; laid flat / on a wall → hinge into Z-depth (foldRad). curveRadius is capped at 0.3
  // world units so the bend is visible (the physical tier radius ~1.2 → only ~0.008-unit depth).
  const geo = useMemo(() => {
    if (foldable) {
      const f = (fold ?? DEFAULT_FOLD_DEG) * Math.PI / 180, sp = spine ?? DEFAULT_SPINE;
      return standUp ? createFoldedPlane(STICKER_SIZE, f, sp, f)
                     : createFoldedPlane(STICKER_SIZE, f, sp, 0);
    }
    return (curved && curveRadius)
      ? createCurvedPlane(STICKER_SIZE, STICKER_SIZE, Math.min(curveRadius, 0.3))
      : new THREE.PlaneGeometry(STICKER_SIZE, STICKER_SIZE);
  }, [foldable, fold, spine, standUp, curved, curveRadius]);
  // Photo-cake frame (config-gated on photoMask, no element-type branch): the shape is the mask, the
  // border is procedural (or a decorative overlay), and the customer photo is clipped to the mask.
  // The plain image_url mesh is NOT drawn for a frame — the mask is the shape, not a visible image.
  if (photoMask) {
    return (
      <>
        {photoOverlay
          ? <OverlayMesh geo={geo} url={photoOverlay} selected={selected} />
          : ((borderWidth ?? 0) > 0 &&
              <BorderBacking geo={geo} maskUrl={photoMask} color={color} width={borderWidth} />)}
        {photoUrl
          ? <PhotoBacking geo={geo} photoUrl={photoUrl} maskUrl={photoMask} transform={photoTransform} />
          : <PlaceholderBacking geo={geo} maskUrl={photoMask} />}
      </>
    );
  }
  return (
    <mesh geometry={geo}>
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

// Bend a GLB sticker around the tier wall so it hugs the curved side. Bakes the
// bbox-fit (scale + center) into fresh geometry, then wraps it on a cylinder of
// local radius `bendR` (axis at local z = -bendR, +Z = radially outward):
//   x → arc angle (a = x / bendR), z → radial offset, y → height.
// Edges curve inward following the convex wall; the back recedes into the cake
// (occluded by the opaque tier) so it reads as a relief emerging from the side.
// Convention: the GLB faces +Z (profile in X-Y, width along X, up along Y).
function bendStickerScene(scene, fitScale, center, bendR, seatOffset = 0) {
  scene.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const out = new THREE.Group();
  const v = new THREE.Vector3(), m = new THREE.Matrix4();
  scene.traverse(o => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone();
    const pos = geo.attributes.position;
    m.multiplyMatrices(inv, o.matrixWorld); // mesh → scene-local
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      const fx = (v.x - center.x) * fitScale; // fit transform StickerModel applies
      const fy = (v.y - center.y) * fitScale;
      const fz = (v.z - center.z) * fitScale;
      const a = fx / bendR, rho = bendR + fz + seatOffset;
      pos.setXYZ(i, rho * Math.sin(a), fy, rho * Math.cos(a) - bendR);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, o.material);
    mesh.raycast = () => {};
    out.add(mesh);
  });
  return out;
}

// Strip degenerate / noise triangles from a cloned GLB scene (mutates in place): drops tris
// that are near-zero area, far larger than the mesh average, or extreme slivers. Improves
// render quality for auto-generated meshes — applied to every GLB element (was topper-only).
function cleanGlbScene(clone) {
  clone.traverse(obj => {
    if (!obj.isMesh || !obj.geometry?.index) return;
    const geo = obj.geometry.clone();
    obj.geometry = geo;
    const pos = geo.attributes.position;
    const idx = geo.index.array;
    const triCount = idx.length / 3;
    const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
    const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _e3 = new THREE.Vector3();
    let totalArea = 0;
    for (let i = 0; i < idx.length; i += 3) {
      _a.fromBufferAttribute(pos, idx[i]); _b.fromBufferAttribute(pos, idx[i + 1]); _c.fromBufferAttribute(pos, idx[i + 2]);
      _e1.subVectors(_b, _a); _e2.subVectors(_c, _a);
      totalArea += _e1.clone().cross(_e2).length() * 0.5;
    }
    const avgArea = totalArea / triCount;
    const maxArea = avgArea * 50;
    const minArea = 1e-7;
    const newIdx = [];
    for (let i = 0; i < idx.length; i += 3) {
      _a.fromBufferAttribute(pos, idx[i]); _b.fromBufferAttribute(pos, idx[i + 1]); _c.fromBufferAttribute(pos, idx[i + 2]);
      _e1.subVectors(_b, _a); _e2.subVectors(_c, _a); _e3.subVectors(_c, _b);
      const area = _e1.clone().cross(_e2).length() * 0.5;
      const maxEdge = Math.max(_e1.length(), _e2.length(), _e3.length());
      const minEdge = Math.min(_e1.length(), _e2.length(), _e3.length());
      const aspectRatio = maxEdge / (minEdge + 1e-10);
      if (area >= minArea && area <= maxArea && aspectRatio <= 150) newIdx.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(newIdx), 1));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
  });
  return clone;
}

function StickerModel({ imageUrl, selected, color, groupColors, gradient, clipY, bendRadius, baseRotation, seatProud = false, fondant = false, roughness = null, metalness = null, onSeat }) {
  const { scene } = useGLTF(imageUrl);
  const clipPlane = useRef(null);

  const clonedScene = useMemo(() => {
    const clone = cleanGlbScene(scene.clone(true));
    clone.updateMatrixWorld(true);
    // Bake the config facing offset (placement_config.rotation, e.g. toppers' [0,-π/2,0]) into
    // the geometry so EVERY downstream consumer — bounding-box fit, side-wall bend, and the flat
    // render — sees a model that already faces +z. (The bend path assumes +z, so a group-level
    // rotation wouldn't fix it; baking does.)
    if (baseRotation && (baseRotation[0] || baseRotation[1] || baseRotation[2])) {
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...baseRotation));
      clone.traverse(obj => {
        if (!obj.isMesh || !obj.geometry) return;
        obj.geometry = obj.geometry.clone();
        obj.geometry.applyMatrix4(m);
        obj.geometry.computeBoundingBox();
        obj.geometry.computeBoundingSphere();
      });
    }
    clone.traverse(obj => {
      if (!obj.isMesh) return;
      obj.raycast = () => {};
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(mat => { mat.depthWrite = true; mat.needsUpdate = true; });
    });
    // Shared fondant surface (config: useSharedFondantTexture): overlay the one shared grain normal
    // map so any flat recolourable part reads as matte fondant under ANY colour. Clone geometry +
    // material per instance (never mutate the cached GLB); box-UV the UV-less parts; keep metalness
    // so metallic accents survive. Colour itself is still set later by the recolour effect.
    if (fondant) {
      const normal = getFondantNormalMap();
      clone.traverse(obj => {
        if (!obj.isMesh || !obj.geometry) return;
        obj.geometry = obj.geometry.clone();
        applyBoxUVs(obj.geometry, 0.18);   // grain size: world units per texture repeat (larger = coarser)
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        const next = mats.map(m => {
          const nm = m.clone();
          nm.normalMap = normal;
          nm.normalScale = new THREE.Vector2(1.5, 1.5);   // grain strength (tune; was 0.5, too faint to see)
          nm.roughness = Math.max(nm.roughness ?? 0.5, 0.88);  // matte; metalness untouched
          nm.needsUpdate = true;
          return nm;
        });
        obj.material = Array.isArray(obj.material) ? next : next[0];
      });
    }
    // Config-driven material finish (placement_config.roughness/metalness): override the GLB's baked
    // values so one asset can read as metallic or matte from config. Clone the material per instance
    // (never mutate the cached GLB); colour is still set by the recolour effect.
    if (roughness != null || metalness != null) {
      clone.traverse(obj => {
        if (!obj.isMesh) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        const next = mats.map(m => {
          const nm = m.clone();
          if (roughness != null) nm.roughness = roughness;
          if (metalness != null) nm.metalness = metalness;
          nm.needsUpdate = true;
          return nm;
        });
        obj.material = Array.isArray(obj.material) ? next : next[0];
      });
    }
    return clone;
  }, [scene, baseRotation, fondant, roughness, metalness]);

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

  const { scale, position, center, depthScaled, seatHalf, gradBBox } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(clonedScene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const ctr = new THREE.Vector3();
    box.getCenter(ctr);
    const sc = STICKER_SIZE / Math.max(size.x, size.y, size.z, 0.01);
    glbXRadiusCache[imageUrl] = (size.x / 2) * sc;
    // The gradient blends in the model's local frame (same baked geometry the vertex shader reads),
    // so it stays put regardless of placement/instance scale.
    return { scale: sc, position: [-ctr.x * sc, -ctr.y * sc, -ctr.z * sc], center: ctr, depthScaled: size.z * sc, seatHalf: (size.y * sc) / 2,
      gradBBox: { min: box.min.clone(), size: size.clone(), center: ctr.clone() } };
  }, [clonedScene, imageUrl]);

  // Report this model's true half-height (normalized, before the instance scale) so the parent can
  // seat its BOTTOM on the surface instead of lifting by a fixed STICKER_SIZE/2. Default = no float;
  // any lift is explicit (yOffset / config). For an upright model size.y is the max dim, so seatHalf
  // ≈ STICKER_SIZE/2 and nothing changes; a flat model reports a small value and stops floating.
  useEffect(() => { onSeat?.(seatHalf); }, [seatHalf]);

  // On the side wall, bend the model around the tier so it hugs the curve. Seat its BACK on
  // the wall (push out by half its depth) so a deep model — e.g. a topper head — sits proud
  // instead of half-buried in the tier.
  // seatOffset positions the model's depth radially: proud → back on the wall (pokes out a full
  // depth, for deep toppers); flush hug (default) → centred on the wall (back half tucks into the
  // opaque wall, front half against it) so it doesn't stand off the silhouette. Config, not type.
  const bentScene = useMemo(
    () => (bendRadius ? bendStickerScene(clonedScene, scale, center, bendRadius, seatProud ? depthScaled / 2 : 0) : null),
    [clonedScene, scale, center, bendRadius, depthScaled, seatProud],
  );

  // Selection = a white outline (inverted hull), NOT a colour tint — a tint reads as "recoloured".
  // A clone of the rendered scene with white BACK-side material, scaled slightly larger, peeks out
  // around the silhouette. Built lazily; only mounted while selected.
  const outlineScene = useMemo(() => {
    const src = bentScene ?? clonedScene;
    const o = src.clone(true);
    o.traverse(obj => {
      if (!obj.isMesh) return;
      obj.material = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.BackSide, toneMapped: false });
      obj.raycast = () => {};
    });
    return o;
  }, [clonedScene, bentScene]);
  const bentCenter = useMemo(() => {
    if (!bentScene) return null;
    const c = new THREE.Vector3();
    new THREE.Box3().setFromObject(bentScene).getCenter(c);
    return c;
  }, [bentScene]);
  const OUTLINE_K = 1.025;   // hull enlargement → outline thickness (thin: detailed figurines look haloed at 1.07)

  // GLB Recompose: when the instance carries per-group colours, recolour each mesh by its authored
  // userData.group (set in admin), leaving untagged meshes at their baked colour. The single `color`
  // path applies only when there are NO groups (ordinary one-colour elements) — so a multi-part
  // recompose model is never flattened to one colour. Config-driven, no element-type branch.
  const hasGroups = !!groupColors && Object.keys(groupColors).length > 0;
  useEffect(() => {
    clonedScene.traverse(obj => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const grp = obj.userData?.group;
      const groupColor = hasGroups && grp ? groupColors[grp] : undefined;
      mats.forEach(mat => {
        if (groupColor) {
          if (!mat.map) mat.color = new THREE.Color(groupColor);
        } else if (!hasGroups && !mat.map && color) {
          mat.color = new THREE.Color(color);
        }
        // User-chosen multi-colour blend (config-gated via allowed_actions.gradient). Overrides the
        // solid colour per-pixel in the shader; no-op / restores solid when fewer than 2 stops.
        applyGradient(mat, gradient, gradBBox);
        if (mat.emissive !== undefined) { mat.emissive = new THREE.Color('#000000'); mat.emissiveIntensity = 0; }
        mat.needsUpdate = true;
      });
    });
  }, [clonedScene, color, gradient, gradBBox, groupColors, hasGroups]);

  if (bentScene) {
    return (
      <group>
        <primitive object={bentScene} />
        {selected && bentCenter && (
          <group position={[bentCenter.x, bentCenter.y, bentCenter.z]}>
            <group scale={OUTLINE_K}>
              <group position={[-bentCenter.x, -bentCenter.y, -bentCenter.z]}>
                <primitive object={outlineScene} />
              </group>
            </group>
          </group>
        )}
      </group>
    );
  }
  return (
    <group>
      <primitive object={clonedScene} scale={scale} position={position} />
      {selected && (
        <primitive object={outlineScene} scale={scale * OUTLINE_K}
          position={[-center.x * scale * OUTLINE_K, -center.y * scale * OUTLINE_K, -center.z * scale * OUTLINE_K]} />
      )}
    </group>
  );
}

function StickerFace({ imageUrl, selected, color, groupColors, gradient, clipY, curved, curveRadius, bendRadius, baseRotation, seatProud = false, fondant = false, roughness = null, metalness = null, flipX = false, foldable = false, fold, spine, standUp = false, recolor, photoUrl, photoMask, photoTransform, photoOverlay, borderWidth, onSeat }) {
  if (!imageUrl) return null;
  const isGlb = /\.(glb|gltf)(\?|$)/i.test(imageUrl);
  const inner = (
    // While this element's GLB/texture loads, LoadingPing registers it with the shared
    // loading count (it draws nothing); a single canvas overlay shows ONE spinner for the
    // whole page (see loadingRegistry). Suspense clears the ping when the asset resolves
    // (cached assets resolve synchronously → never counted). Type/zone-agnostic.
    <TextureErrorBoundary>
      <Suspense fallback={<LoadingPing />}>
        {isGlb
          ? <StickerModel imageUrl={imageUrl} selected={selected} color={color} groupColors={groupColors} gradient={gradient} clipY={clipY} bendRadius={bendRadius} baseRotation={baseRotation} seatProud={seatProud} fondant={fondant} roughness={roughness} metalness={metalness} onSeat={onSeat} />
          : <StickerTexture imageUrl={imageUrl} selected={selected} curved={curved} curveRadius={curveRadius} foldable={foldable} fold={fold} spine={spine} standUp={standUp} recolor={recolor} color={color} photoUrl={photoUrl} photoMask={photoMask} photoTransform={photoTransform} photoOverlay={photoOverlay} borderWidth={borderWidth} onSeat={onSeat} />
        }
      </Suspense>
    </TextureErrorBoundary>
  );
  // Mirror across the vertical axis about the model's own centre (StickerModel/StickerTexture
  // both centre their content at the origin). THREE flips winding for the negative determinant,
  // so faces/lighting stay correct. Selection box is a sibling, so it isn't mirrored.
  return flipX ? <group scale={[-1, 1, 1]}>{inner}</group> : inner;
}


function DraggableSideSticker({ sticker, radius, baseY, height, shp = { kind: 'round', radius }, reliefSampler = null, selected, onSelect, onLongPress, onMove, onGroupMove, onMoveMany, moveSet, allStickers, onOrbitEnable, toolbar }) {
  const { camera, gl } = useThree();
  const didDrag           = useRef(false);
  const startPos          = useRef({ x: 0, y: 0 });
  const startHit          = useRef(null);
  const startSticker      = useRef(null);
  const groupStart        = useRef(null);
  const pointerDownTime   = useRef(0);
  const pressedRef        = useRef(false);

  const isRect = shp.kind === 'rect';
  const isGlb = /\.(glb|gltf)(\?|$)/i.test(sticker.imageUrl ?? '');
  // A hero hug (single_per_slot, hugging a side) sizes to THIS tier's wall height, so it shrinks
  // on smaller tiers automatically — r is the stand size only and is ignored here. Scattered decor
  // (not single_per_slot) keeps its absolute r. `hugMul` is the per-instance +/- nudge (default 1);
  // we never persist the computed scale, only this multiplier + the static hugFill.
  const rawScale = isDynamicHug(sticker)
    ? hugScale(height, STICKER_SIZE, sticker.hugFill ?? DEFAULT_HUG_FILL) * (sticker.hugMul ?? 1)
    : (sticker.scale ?? 1);   // user-controlled; not clamped (like piping size)
  // A photo frame on the side is bounded so it never spills past the wall (incl. its border ring).
  const sideFrameMax = sticker.photoMask
    ? frameSideMaxScale(height, (sticker.photoFill ?? 1) * (1 + (sticker.borderWidth ?? 0)))
    : Infinity;
  const effScale = Math.min(rawScale, sideFrameMax);
  // Base seat = fixed gap off the BASE wall. The drag hit-test (below) projects onto this base cylinder;
  // the visible position adds the live surface relief so the decor rests on the displaced wall.
  const off    = SIDE_STICKER_SURFACE_OFFSET + (sticker.radialOffset ?? 0);
  // Round: angle theta around the cylinder, decal curved to the wall. Rect: perimeter
  // fraction u along the rounded-rect wall, decal flat (the wall is flat).
  let cx, cz, yaw, curveRadius;
  if (isRect) {
    const pl = rectSidePlacement(shp, sticker.u ?? 0, off);
    cx = pl.x; cz = pl.z; yaw = pl.yaw; curveRadius = 0;
  } else {
    // Rest on the LIVE wall surface: the highest relief under the element's footprint (so a wide flower
    // clears the ribs it spans while a sprinkle nestles). Smooth/flat walls → sampler null → lift 0.
    const half = (STICKER_SIZE * effScale) / 2;
    const lift = reliefSampler
      ? maxReliefUnder(reliefSampler,
          Math.atan2(Math.cos(sticker.theta), Math.sin(sticker.theta)),
          Math.min(1, Math.max(0, (sticker.y - baseY) / height)),
          half / radius, half / height)
      : 0;
    const surfaceR = radius + off + lift;
    cx = surfaceR * Math.sin(sticker.theta); cz = surfaceR * Math.cos(sticker.theta);
    yaw = sticker.theta; curveRadius = surfaceR;
  }
  // Round cakes: bend a GLB sticker around the tier wall so it hugs the curve.
  // Local radius = surfaceR / group scale, so after the group's scale it wraps at
  // the true wall radius (bigger stickers span more arc → curve more).
  const bendRadius = (isGlb && !isRect && curveRadius)
    ? curveRadius / (effScale || 1)
    : undefined;

  // Keep the decal on the cake wall: sticker.y is its CENTRE, so its bottom edge sits half a
  // (scaled) sticker below it. Clamp so the bottom never crosses the tier base into the board.
  const halfH = (STICKER_SIZE / 2) * effScale;
  const clampWallY = y => wallClampY(y, baseY, height, halfH);
  const posY = clampWallY(sticker.y);

  return (
    <group
      position={[cx, posY, cz]}
      rotation={[0, yaw, 0]}
      scale={effScale}
    >
      {/* X-axis tilt: leans the pick up (+) or down (−) along the cake side */}
      <group rotation={[sticker.tiltAngle ?? 0, 0, 0]}>
      <StickerFace imageUrl={sticker.imageUrl} selected={selected} color={sticker.color} groupColors={sticker.groupColors} gradient={sticker.gradient} curved={!isGlb && !isRect} curveRadius={curveRadius} bendRadius={bendRadius} baseRotation={sticker.baseRotation} seatProud={sticker.sideProud === true} fondant={sticker.useSharedFondantTexture} roughness={sticker.roughness} metalness={sticker.metalness} flipX={sticker.flipX} foldable={sticker.foldable} fold={sticker.fold} spine={sticker.spine} recolor={sticker.recolor} photoUrl={sticker.photoUrl} photoMask={sticker.photoMask} photoTransform={sticker.photoTransform} photoOverlay={sticker.photoOverlay} borderWidth={sticker.borderWidth} />
      {/* selection rectangle removed — emissive tint + toolbar are the selection cue */}
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
          startHit.current     = isRect
            ? boxHit(pointerRay(e, gl.domElement, camera), shp.halfW, shp.halfD)
            : cylinderHit(pointerRay(e, gl.domElement, camera), radius + off);
          startSticker.current = { theta: sticker.theta, y: sticker.y };

          if (!isRect && moveSet && moveSet.length > 1) {
            const setIds = new Set(moveSet);
            groupStart.current = {};
            allStickers.forEach(s => { if (setIds.has(s.id)) groupStart.current[s.id] = { theta: s.theta, y: s.y }; });
          } else if (!isRect && sticker.groupId) {
            groupStart.current = {};
            allStickers.forEach(s => {
              if (s.groupId === sticker.groupId)
                groupStart.current[s.id] = { theta: s.theta, y: s.y };
            });
          } else {
            groupStart.current = null;
          }

          const canvas = gl.domElement;
          const clampY = clampWallY;   // keep the bottom edge on the wall, not in the board
          function onMoveHandler(ev) {
            const dx = ev.clientX - startPos.current.x;
            const dy = ev.clientY - startPos.current.y;
            if (dx * dx + dy * dy > 25) didDrag.current = true;
            if (!didDrag.current || !startHit.current) return;
            if (isRect) {
              // Rect wall: the sticker centre follows the cursor's perimeter point directly.
              const bh = boxHit(pointerRay(ev, gl.domElement, camera), shp.halfW, shp.halfD);
              if (!bh) return;
              onMove(sticker.id, { u: nearestU(shp, bh.x, bh.z), y: clampY(bh.y) });
              return;
            }
            const hit = cylinderHit(pointerRay(ev, gl.domElement, camera), radius + off);
            if (!hit) return;
            const deltaTheta = hit.theta - startHit.current.theta;
            const deltaY     = hit.y     - startHit.current.y;
            if (moveSet && moveSet.length > 1 && groupStart.current && onMoveMany) {
              onMoveMany(moveSet, groupStart.current, { deltaTheta, deltaY });
            } else if (sticker.groupId && groupStart.current && onGroupMove) {
              onGroupMove(sticker.groupId, groupStart.current, { deltaTheta, deltaY });
            } else {
              onMove(sticker.id, {
                theta: startSticker.current.theta + deltaTheta,
                y: clampY(startSticker.current.y + deltaY),
              });
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

function DraggableTopSticker({ sticker, topY, topRadius = Infinity, shp = { kind: 'round', radius: topRadius }, selected, onSelect, onLongPress, onMove, onGroupMove, onMoveMany, moveSet, allStickers, onOrbitEnable, toolbar }) {
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

  const isStand = sticker.placementMode === 'stand';
  // Perch: a figure seated on the top edge. Its centre sits AT the edge height (legs hang over the
  // side, upper body above) — no auto seat-lift, and no clip plane (clipping would slice the figure).
  const isPerch = sticker.placementMode === 'perch';
  // Verge: rests its base on the rim lip and reclines radially OUTWARD, the rest cantilevered over
  // the edge into the air (butterflies, flowers). Seats on its base like `stand` (no straddle); the
  // outward lean + edge contact is what makes part of it overhang. World-oriented, never billboarded.
  const isVerge = sticker.placementMode === 'verge';
  const isGlb2d = /\.(glb|gltf)(\?|$)/i.test(sticker.imageUrl ?? '');
  // Seat the model's actual BOTTOM on the surface: lift by its measured half-height (reported by
  // StickerModel once the GLB loads), not a fixed STICKER_SIZE/2. Default = rests on the surface;
  // float is opt-in via yOffset (the Height control) / config. Fallback to the constant pre-measure.
  const [seatHalf, setSeatHalf] = useState(null);
  // Verge seat anchor is config-driven (placement_config.verge.seat → instance.vergeSeat): 'center'
  // (default) rests the MID-SPINE on the rim edge so the body drapes over the lip; 'base' seats the
  // BODY base on the surface and leans from there. Other modes are unaffected.
  const isVergeBase = isVerge && sticker.vergeSeat === 'base';
  // Base-seated upright modes: stand, a base-seat verge, and a foldable card on a perch edge — all
  // stand on their BODY base. A centre-seat verge / perch sit centred at the rim edge height instead.
  const standSeat = isStand || isVergeBase || (isPerch && sticker.foldable === true);
  // A photo frame on top is bounded so it (incl. its border ring) never overflows the rim/edges.
  const topFrameMax = sticker.photoMask
    ? frameTopMaxScale(shp, sticker.photoShape, (sticker.photoFill ?? 1) * (1 + (sticker.borderWidth ?? 0)))
    : Infinity;
  const effScale = Math.min(sticker.scale ?? 1, topFrameMax);
  const py = topY + (sticker.yOffset ?? 0) + (
    standSeat ? (seatHalf ?? STICKER_SIZE / 2) * effScale + FLAT_STICKER_Y_OFFSET
    : (isPerch || isVerge) ? 0   // centre at the rim edge height — perch straddles, centre-seat verge's mid-spine on the lip
    : FLAT_STICKER_Y_OFFSET);

  // Shared children: face + toolbar Html + invisible hit mesh
  const innerContent = (e_onDown) => (
    <>
      <StickerFace imageUrl={sticker.imageUrl} selected={selected} color={sticker.color} groupColors={sticker.groupColors} gradient={sticker.gradient} clipY={(isStand || isPerch || isVerge) ? undefined : py} baseRotation={sticker.baseRotation} fondant={sticker.useSharedFondantTexture} roughness={sticker.roughness} metalness={sticker.metalness} flipX={sticker.flipX} foldable={sticker.foldable} fold={sticker.fold} spine={sticker.spine} standUp={(isStand || isPerch || isVerge) && sticker.foldable === true} recolor={sticker.recolor} photoUrl={sticker.photoUrl} photoMask={sticker.photoMask} photoTransform={sticker.photoTransform} photoOverlay={sticker.photoOverlay} borderWidth={sticker.borderWidth} onSeat={setSeatHalf} />
      {/* selection rectangle removed — emissive tint + toolbar are the selection cue */}
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

    // Drag moves the whole group/cluster together. groupId always does; a clusterId does too UNLESS
    // this ball is individually selected (ctrl-click drill-in) — then it moves alone.
    const groupKey = sticker.groupId || (!selected ? (sticker.clusterId ?? null) : null);
    if (moveSet && moveSet.length > 1) {
      const setIds = new Set(moveSet);
      groupStart.current = {};
      allStickers.forEach(s => { if (setIds.has(s.id)) groupStart.current[s.id] = { x: s.x, z: s.z }; });
    } else if (groupKey) {
      groupStart.current = {};
      allStickers.forEach(s => {
        if ((s.groupId || s.clusterId) === groupKey)
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
        if (moveSet && moveSet.length > 1 && groupStart.current && onMoveMany) {
          const rawDx = hit.x - startHit.current.x;
          const rawDz = hit.z - startHit.current.z;
          onMoveMany(moveSet, groupStart.current, { dx: rawDx, dz: rawDz });
        } else if (groupKey && groupStart.current && onGroupMove) {
          const rawDx = hit.x - startHit.current.x;
          const rawDz = hit.z - startHit.current.z;
          onGroupMove(groupKey, groupStart.current, { dx: rawDx, dz: rawDz });
        } else {
          // Incremental delta from last frame so the collision direction never flips
          // when the total drag overshoots the sibling centre.
          const prevHit = lastHitRef.current ?? startHit.current;
          const incrDx  = hit.x - prevHit.x;
          const incrDz  = hit.z - prevHit.z;
          let newX = lastValidPos.current.x + incrDx;
          let newZ = lastValidPos.current.z + incrDz;
          // Edge-seated modes live ON the rim → dragging moves them AROUND the rim perimeter
          // (snapToRim), never inward onto the top surface (where a CENTRE-seated element would bury
          // its lower half in the cake). A perch straddles the edge, and a centre-seat verge rests its
          // mid-spine on the lip — both rim-lock. A BASE-seat verge sits flat on the top surface, so
          // it drags freely on the top like `stand` (no burial). Stand reaches the rim with margin 0;
          // a flat decal keeps its footprint on the cake. All derived from mode/seat + size on the
          // instance — never a config flag. (Future: faux-ball verge → edge_drag:'outward' allows
          // dragging OUT over the lip while still clamping inward to the rim; see PLACEMENT_CONFIG.md.)
          const isEdgeMode = isPerch || (isVerge && !isVergeBase);
          const edgeMargin = (isStand || isEdgeMode) ? 0 : (STICKER_SIZE / 2) * (sticker.scale ?? 1);
          const clampPt = (x, z) => isEdgeMode ? snapToRim(shp, x, z) : topClampInset(shp, x, z, edgeMargin);
          ({ x: newX, z: newZ } = clampPt(newX, newZ));
          const siblings = allStickers.filter(s => s.id !== sticker.id && s.zone === sticker.zone && s.tierIndex === sticker.tierIndex);
          const selfR = (glbXRadiusCache[sticker.imageUrl] ?? STICKER_SIZE / 4) * (sticker.scale ?? 1);
          if (sticker.clusterBall) {
            // Manual faux-ball arrangement: physically seat the ball — on the cake surface (de-overlapped
            // so it touches but never penetrates) or cradled on ≥3 balls when dropped onto a real pocket.
            // It never balances on 1–2 balls and never floats. Gated on the config clusterBall flag.
            const balls = siblings.filter(s => s.clusterBall).map(s => {
              const sR = (glbXRadiusCache[s.imageUrl] ?? STICKER_SIZE / 4) * (s.scale ?? 1);
              return { x: s.x, z: s.z, y: topY + (s.yOffset ?? 0) + sR, r: sR };
            });
            const seat = manualSeat(newX, newZ, selfR, balls, topY);
            lastValidPos.current = { x: seat.x, z: seat.z };
            onMove(sticker.id, { x: seat.x, z: seat.z, yOffset: seat.y - topY - selfR });
          } else {
            for (const sib of siblings) {
              const sibR  = (glbXRadiusCache[sib.imageUrl] ?? STICKER_SIZE / 4) * (sib.scale ?? 1);
              const minDist = selfR + sibR;
              const ex = newX - sib.x, ez = newZ - sib.z;
              const dist = Math.sqrt(ex * ex + ez * ez);
              if (dist < minDist && dist > 0.001) {
                newX = sib.x + ex * (minDist / dist);
                newZ = sib.z + ez * (minDist / dist);
                ({ x: newX, z: newZ } = clampPt(newX, newZ));
              }
            }
            lastValidPos.current = { x: newX, z: newZ };
            onMove(sticker.id, { x: newX, z: newZ });
          }
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

  // Stand & perch & verge: upright render — outer=position+scale, middle=Y-spin (facing), inner=X-tilt
  // (lean). Same orientation pipeline; they differ in py (perch straddles the edge, no seat-lift),
  // clip (perch/verge aren't clipped), facing, and lean direction (see below). Stand/perch 2D images
  // billboard to face the camera; a verge is fixed in world space so it reclines over the actual edge.
  if (isStand || isPerch || isVerge) {
    // Billboard must be INSIDE the world-positioned group, not wrapping it.
    // If Billboard wraps the position group, it sits at origin and rotates its
    // local frame — so any x/z offset becomes wrong world-space position.
    // Lean/tilt must pivot about the BASE (the contact point), not the geometry centre — otherwise
    // leaning swings the base up off the cake. Translate down to the base, rotate, translate back
    // (cancels when untilted; no-op for perch where seatLift = 0).
    const seatLift = standSeat ? (seatHalf ?? STICKER_SIZE / 2) : 0;
    // Verge auto-orients radially OUTWARD: yaw so the element's local +Z points away from the cake
    // centre (re-derived from its x/z, so it reorients as it's dragged round the rim — round cakes
    // exactly, rect approximated as radial-from-centre), then the tilt tips its top toward that
    // outward +Z (+angle = lean over the edge). Stand/perch keep the caller's Y-spin and lean on −X.
    const radialYaw = isVerge ? Math.atan2(sticker.x ?? 0, sticker.z ?? 0) : 0;
    const yaw   = radialYaw + (sticker.rotation ?? 0);
    const tiltX = isVerge ? (sticker.tiltAngle ?? 0) : -(sticker.tiltAngle ?? 0);
    const inner = (
      <group rotation={[0, yaw, 0]}>
        <group position={[0, -seatLift, 0]}>
          <group rotation={[tiltX, 0, 0]}>
            <group position={[0, seatLift, 0]}>
              {innerContent(onDown)}
            </group>
          </group>
        </group>
      </group>
    );
    return (
      <group position={[sticker.x, py, sticker.z]} scale={effScale}>
        {(isGlb2d || isVerge) ? inner : <Billboard lockX={true} lockY={false} lockZ={true}>{inner}</Billboard>}
      </group>
    );
  }
  // Flat mode (sticker laid horizontal on top surface)
  return (
    <group
      position={[sticker.x, py, sticker.z]}
      rotation={[-Math.PI / 2, 0, sticker.rotation ?? 0]}
      scale={effScale}
    >
      {innerContent(onDown)}
    </group>
  );
}

export function preloadTopper(url) {
  if (url) useGLTF.preload(url);
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
          fontSize: 9, fontWeight: 700, color: '#1a1a1a',
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
          border: '1.5px solid #999999', background: '#fff', color: '#1a1a1a',
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

function CameraPositionSync({ position }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(position[0], position[1], position[2]);
  }, [position[0], position[1], position[2]]);
  return null;
}

// Smoothly lerps the camera to a target position when snapCameraRef.current() is called.
function CameraSnapper({ snapCameraRef, orbitRef }) {
  const { camera } = useThree();
  const targetPos = useRef(null);

  useEffect(() => {
    if (!snapCameraRef) return;
    snapCameraRef.current = (pos) => { targetPos.current = new THREE.Vector3(...pos); };
  }, [snapCameraRef]);

  useFrame(() => {
    if (!targetPos.current) return;
    camera.position.lerp(targetPos.current, 0.08);
    orbitRef?.current?.update();
    if (camera.position.distanceTo(targetPos.current) < 0.05) {
      camera.position.copy(targetPos.current);
      orbitRef?.current?.update();
      targetPos.current = null;
    }
  });

  return null;
}


// `frontZ` is the cake's front-edge distance along +Z (the front is +Z for every shape):
// round → radius, rect → depth/2. The label sits a fixed gap beyond that edge.
function FrontMarker({ frontZ }) {
  return (
    <Text
      position={[0, 0.002, frontZ + 0.82]}
      rotation={[-Math.PI / 2, 0, 0]}
      fontSize={0.11}
      color="#c8b8a2"
      anchorX="center"
      anchorY="middle"
      letterSpacing={0.06}
    >
      FRONT
    </Text>
  );
}

function CakeScene({
  config, selectedTier, onTierClick, onDeselect,
  selectedTextId, onTextSelect, onTextMove, onTextContentChange, textToolbar,
  selectedAgeId, onAgeSelect, onAgeMove,
  orbitRef,
  selectedPiping, highlightPipingId, onTopPipingSelect, onBottomPipingSelect,
  pipingTarget, onPipingStyleSelect, onPipingCancel, pipingStyles,
  pipingToolbar,
  selectedStickerIds, onStickerSelect, onStickerLongPress, onStickerMove, onGroupMove, onMoveMany, stickerToolbar,
  onWritingClick, onWritingMove, writingSelected = false,
  penDrawMode = false, penStyle, onAddStroke,
  tierDataRef,
}) {
  const { tiers, texts = [], ages = [], stickers = [], writing = null, piping = [] } = config;
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
      // Cream-pen catchers (present only in draw mode): pressing on the cake draws, so
      // suspend rotate; pressing empty space still rotates.
      const overPen = hits.some(h => h.object.userData.isPenCatcher);
      if (orbitRef.current) orbitRef.current.enabled = !overSticker && !overPen;
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
      <ambientLight intensity={0.8} />
      <directionalLight position={[6, 14, 8]} intensity={1.5} castShadow />
      <directionalLight position={[-4, 4, -4]} intensity={0.4} />
      <color attach="background" args={['#f4f4f5']} />
      <Environment preset="apartment" backgroundBlurriness={1} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow
        onClick={e => { e.stopPropagation(); onDeselect(); }}>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#fce8d5" roughness={0.85} />
      </mesh>

      {bottomTier.shape === 'rect' ? (
        <RoundedBox position={[0, 0.05, 0]} args={[bottomTier.width + 0.9, 0.1, bottomTier.depth + 0.9]} radius={0.06} smoothness={4} castShadow receiveShadow
          onClick={e => { e.stopPropagation(); onDeselect(); }}>
          <meshStandardMaterial color="#d4af37" roughness={0.15} metalness={0.75} />
        </RoundedBox>
      ) : (
        <mesh position={[0, 0.05, 0]} castShadow receiveShadow
          onClick={e => { e.stopPropagation(); onDeselect(); }}>
          <cylinderGeometry args={[bottomTier.radius + 0.6, bottomTier.radius + 0.6, 0.1, 64]} />
          <meshStandardMaterial color="#d4af37" roughness={0.15} metalness={0.75} />
        </mesh>
      )}

      <FrontMarker frontZ={bottomTier.shape === 'rect' ? bottomTier.depth / 2 : bottomTier.radius} />

      {tierData.map((tier, i) => (
        <group key={i}>
          <CakeTier
            radius={tier.radius}
            height={tier.height}
            color={tier.color}
            gradient={tier.gradient ?? null}
            yBase={tier.baseY}
            shape={tier.shape ?? 'round'}
            width={tier.width}
            depth={tier.depth}
            cornerR={tier.cornerR}
            frostingType={tier.frostingType}
            frostingStyle={tier.frostingStyle}
            styleParams={tier.styleParams}
            selected={selectedTier === i}
            topPipings={tier.topPipings ?? (tier.topPiping ? [tier.topPiping] : [])}
            bottomPipings={tier.bottomPipings ?? (tier.bottomPiping ? [tier.bottomPiping] : [])}
            highlightPipingId={highlightPipingId}
            onTopPipingClick={(e, layerId) => { e.stopPropagation(); onTopPipingSelect(i, layerId); }}
            onBottomPipingClick={(e, layerId) => { e.stopPropagation(); onBottomPipingSelect(i, layerId); }}
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


      {writing?.text?.trim() && (() => {
        const topTier = tierData[tierData.length - 1];
        const writingOrbitEnable = enabled => {
          if (enabled) orbitBlockSet.current.delete('__writing__'); else orbitBlockSet.current.add('__writing__');
          if (orbitRef.current) orbitRef.current.enabled = orbitBlockSet.current.size === 0;
        };
        // Board geometry mirrors the board mesh drawn above (round: +0.6 r · rect: +0.9 each side).
        const isRectBoard = bottomTier.shape === 'rect';
        const boardRadius = isRectBoard ? Math.max(bottomTier.width + 0.9, bottomTier.depth + 0.9) / 2 : bottomTier.radius + 0.6;
        const boardShp = isRectBoard
          ? { kind: 'rect', halfW: (bottomTier.width + 0.9) / 2, halfD: (bottomTier.depth + 0.9) / 2 }
          : { kind: 'round', radius: bottomTier.radius + 0.6 };
        return (
          <CreamWriting
            writing={writing}
            topY={stackY}
            topRadius={topTier.radius}
            shape={topTier.shape ?? 'round'}
            width={topTier.width}
            depth={topTier.depth}
            shp={tierShape(topTier)}
            tiers={tierData}
            boardRadius={boardRadius}
            boardY={0.1}
            boardShp={boardShp}
            onClick={onWritingClick}
            onMove={onWritingMove}
            onOrbitEnable={writingOrbitEnable}
            selected={writingSelected}
          />
        );
      })()}

      <CreamPen
        piping={piping}
        drawMode={penDrawMode}
        penStyle={penStyle}
        tierData={tierData}
        board={{
          shape: bottomTier.shape === 'rect' ? 'rect' : 'round',
          radius: bottomTier.shape === 'rect'
            ? Math.max(bottomTier.width + 0.9, bottomTier.depth + 0.9) / 2
            : bottomTier.radius + 0.6,
          width: (bottomTier.width ?? 0) + 0.9,
          depth: (bottomTier.depth ?? 0) + 0.9,
          y: 0.1,
        }}
        onAddStroke={onAddStroke}
      />

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
            shp={tierShape(hostTier)}
            selected={selectedTextId === t.id}
            onSelect={onTextSelect}
            onMove={(id, pos) => onTextMove(id, {
                ...(pos.u != null ? { u: pos.u } : { theta: pos.theta }),
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

      {ages.map(a => {
        const topTier = tierData[tierData.length - 1];
        return (
          <AgeNumber
            key={a.id}
            age={a}
            topY={stackY}
            topRadius={topTier.radius}
            shape={topTier.shape ?? 'round'}
            width={topTier.width}
            depth={topTier.depth}
            shp={tierShape(topTier)}
            selected={selectedAgeId === a.id}
            onClick={() => onAgeSelect?.(a.id)}
            onMove={pos => onAgeMove?.(a.id, pos)}
            onOrbitEnable={enabled => {
              if (enabled) orbitBlockSet.current.delete(a.id); else orbitBlockSet.current.add(a.id);
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
        // When this sticker is part of a multi-selection, dragging it moves the whole
        // selection together (selection-driven). Otherwise the draggable falls back to its
        // groupId path (manual groups) or a plain single move.
        // Pattern parts (patternId) always move individually even when the whole pattern is selected,
        // so each piece can be fine-tuned; genuine multi-selects still drag as a group.
        const moveSet = (isSelected && (selectedStickerIds?.size ?? 0) > 1 && !sticker.patternId)
          ? [...selectedStickerIds] : null;
        if (isSide) {
          return (
            <DraggableSideSticker
              key={sticker.id}
              sticker={sticker}
              radius={tier.radius}
              baseY={tier.baseY}
              height={tier.height}
              shp={tierShape(tier)}
              reliefSampler={tierReliefSampler(tier)}
              selected={isSelected}
              onSelect={(id, ctrlKey) => onStickerSelect(id, ctrlKey)}
              onLongPress={onStickerLongPress}
              onMove={onStickerMove}
              onGroupMove={onGroupMove}
              onMoveMany={onMoveMany}
              moveSet={moveSet}
              allStickers={stickers}
              onOrbitEnable={orbitEnable}
              toolbar={isSelected ? stickerToolbar : null}
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
            topRadius={tier.radius}
            shp={tierShape(tier)}
            selected={isSelected}
            onSelect={(id, ctrlKey) => onStickerSelect(id, ctrlKey)}
            onLongPress={onStickerLongPress}
            onMove={onStickerMove}
            onGroupMove={onGroupMove}
            onMoveMany={onMoveMany}
            moveSet={moveSet}
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
  const { tiers, stickers = [], writing = null, piping = [] } = config;

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
          gradient={tier.gradient ?? null}
          yBase={tier.baseY}
          shape={tier.shape ?? 'round'}
          width={tier.width}
          depth={tier.depth}
          cornerR={tier.cornerR}
          frostingType={tier.frostingType}
          frostingStyle={tier.frostingStyle}
          styleParams={tier.styleParams}
          selected={false}
          topPipings={tier.topPipings ?? (tier.topPiping ? [tier.topPiping] : [])}
          bottomPipings={tier.bottomPipings ?? (tier.bottomPiping ? [tier.bottomPiping] : [])}
          onTopPipingClick={() => {}}
          onBottomPipingClick={() => {}}
          onClick={() => {}}
        />
      ))}
      {stickers.map(sticker => {
        const tier = tierData[sticker.tierIndex] ?? tierData[0];
        const isSide = sticker.zone === 'side' || sticker.zone === 'middle_tier';
        if (isSide) {
          const tshp = tierShape(tier);
          const off = SIDE_STICKER_SURFACE_OFFSET + (sticker.radialOffset ?? 0);
          const sampler = tierReliefSampler(tier);
          const thumbIsGlb = /\.(glb|gltf)(\?|$)/i.test(sticker.imageUrl ?? '');
          let px, pz, yaw, r = 0;
          if (tshp.kind === 'rect') {
            const pl = rectSidePlacement(tshp, sticker.u ?? 0, off);
            px = pl.x; pz = pl.z; yaw = pl.yaw;
          } else {
            // rest on the live wall surface (highest relief under the element's footprint); flat wall → 0
            const half = (STICKER_SIZE * (sticker.scale ?? 1)) / 2;
            const lift = sampler
              ? maxReliefUnder(sampler,
                  Math.atan2(Math.cos(sticker.theta), Math.sin(sticker.theta)),
                  Math.min(1, Math.max(0, (sticker.y - tier.baseY) / tier.height)),
                  half / tier.radius, half / tier.height)
              : 0;
            r = tier.radius + off + lift;
            px = r * Math.sin(sticker.theta); pz = r * Math.cos(sticker.theta); yaw = sticker.theta;
          }
          return (
            <group key={sticker.id} position={[px, sticker.y, pz]} rotation={[0, yaw, 0]} scale={sticker.scale}>
              <group rotation={[sticker.tiltAngle ?? 0, 0, 0]}>
                <StickerFace imageUrl={sticker.imageUrl} selected={false} color={sticker.color} curved={!thumbIsGlb && tshp.kind !== 'rect'} curveRadius={r} baseRotation={sticker.baseRotation} fondant={sticker.useSharedFondantTexture} roughness={sticker.roughness} metalness={sticker.metalness} foldable={sticker.foldable} fold={sticker.fold} spine={sticker.spine} recolor={sticker.recolor} photoUrl={sticker.photoUrl} photoMask={sticker.photoMask} photoTransform={sticker.photoTransform} photoOverlay={sticker.photoOverlay} borderWidth={sticker.borderWidth} />
              </group>
            </group>
          );
        }
        const topY = tier.baseY + tier.height;
        const isPerchPv = sticker.placementMode === 'perch';
        const isVergePv = sticker.placementMode === 'verge';
        // Stand base-seats; perch & a centre-seat verge centre-seat (mid-spine on the rim edge, then
        // recline outward). A base-seat verge (verge.seat='base') base-seats like stand.
        const baseSeatedPv = sticker.placementMode === 'stand' || (isVergePv && sticker.vergeSeat === 'base');
        const py   = topY + (sticker.yOffset ?? 0) + (baseSeatedPv ? STICKER_SIZE / 2 * (sticker.scale ?? 1) : (isPerchPv || isVergePv) ? 0 : FLAT_STICKER_Y_OFFSET);
        if (baseSeatedPv || isPerchPv || isVergePv) {
          const seatLiftPv = baseSeatedPv ? STICKER_SIZE / 2 : 0;
          const yawPv   = (isVergePv ? Math.atan2(sticker.x ?? 0, sticker.z ?? 0) : 0) + (sticker.rotation ?? 0);
          const tiltXPv = isVergePv ? (sticker.tiltAngle ?? 0) : -(sticker.tiltAngle ?? 0);
          return (
            <group key={sticker.id} position={[sticker.x, py, sticker.z]} scale={sticker.scale}>
              <group rotation={[0, yawPv, 0]}>
                <group position={[0, -seatLiftPv, 0]}>
                  <group rotation={[tiltXPv, 0, 0]}>
                    <group position={[0, seatLiftPv, 0]}>
                      <StickerFace imageUrl={sticker.imageUrl} selected={false} color={sticker.color} groupColors={sticker.groupColors} clipY={undefined} baseRotation={sticker.baseRotation} fondant={sticker.useSharedFondantTexture} roughness={sticker.roughness} metalness={sticker.metalness} foldable={sticker.foldable} fold={sticker.fold} spine={sticker.spine} standUp={(baseSeatedPv || isPerchPv || isVergePv) && sticker.foldable === true} recolor={sticker.recolor} photoUrl={sticker.photoUrl} photoMask={sticker.photoMask} photoTransform={sticker.photoTransform} photoOverlay={sticker.photoOverlay} borderWidth={sticker.borderWidth} />
                    </group>
                  </group>
                </group>
              </group>
            </group>
          );
        }
        return (
          <group key={sticker.id} position={[sticker.x, py, sticker.z]} rotation={[-Math.PI / 2, 0, sticker.rotation ?? 0]} scale={sticker.scale}>
            <StickerFace imageUrl={sticker.imageUrl} selected={false} color={sticker.color} clipY={py} baseRotation={sticker.baseRotation} fondant={sticker.useSharedFondantTexture} roughness={sticker.roughness} metalness={sticker.metalness} foldable={sticker.foldable} fold={sticker.fold} spine={sticker.spine} recolor={sticker.recolor} photoUrl={sticker.photoUrl} photoMask={sticker.photoMask} photoTransform={sticker.photoTransform} photoOverlay={sticker.photoOverlay} borderWidth={sticker.borderWidth} />
          </group>
        );
      })}

      {/* Freehand cream-pen strokes — committed only (drawMode off = no catchers/draw). */}
      <CreamPen piping={piping} />

      {/* Typed cream writing — static (no drag/select handlers). */}
      {writing?.text?.trim() && (() => {
        const topTier = tierData[tierData.length - 1];
        const bottomTier = tierData[0];
        const isRectBoard = bottomTier.shape === 'rect';
        const boardRadius = isRectBoard ? Math.max(bottomTier.width + 0.9, bottomTier.depth + 0.9) / 2 : bottomTier.radius + 0.6;
        const boardShp = isRectBoard
          ? { kind: 'rect', halfW: (bottomTier.width + 0.9) / 2, halfD: (bottomTier.depth + 0.9) / 2 }
          : { kind: 'round', radius: bottomTier.radius + 0.6 };
        return (
          <CreamWriting
            writing={writing}
            topY={stackY}
            topRadius={topTier.radius}
            shape={topTier.shape ?? 'round'}
            width={topTier.width}
            depth={topTier.depth}
            shp={tierShape(topTier)}
            tiers={tierData}
            boardRadius={boardRadius}
            boardY={0.1}
            boardShp={boardShp}
            selected={false}
          />
        );
      })()}

      {/* Gold age numbers — static (no drag/select). */}
      {(config.ages ?? []).map(a => {
        const topTier = tierData[tierData.length - 1];
        return (
          <AgeNumber
            key={a.id}
            age={a}
            topY={stackY}
            topRadius={topTier.radius}
            shape={topTier.shape ?? 'round'}
            width={topTier.width}
            depth={topTier.depth}
            shp={tierShape(topTier)}
            selected={false}
          />
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

// On-screen, read-only cake preview. Hand it an authored `design` (tiers/colours/etc., fields
// optional) and it draws the cake on a turntable with no edit UI. It resolves the design via the
// SAME `toCanvasConfig` the live editor uses (one defaulting rule, INVARIANTS #3) and renders the
// SAME `CakeThumbnailScene` as the thumbnail capture (one renderer, #2). Unlike CakeThumbnailCanvas
// (fixed 400×400, parked off-screen for PNG capture) this fills its parent and is meant to be seen.
export function CakePreview({ design, autoRotate = true, style }) {
  const config = useMemo(() => toCanvasConfig(design ?? { tiers: [] }), [design]);
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
      <Canvas
        gl={{ preserveDrawingBuffer: true, alpha: true }}
        onCreated={({ gl }) => { gl.localClippingEnabled = true; }}
        camera={{ position: CAMERA_POSITION, fov: CAMERA_FOV }}
        style={{ width: '100%', height: '100%' }}
      >
        <Suspense fallback={null}>
          <CakeThumbnailScene config={config} />
        </Suspense>
        <OrbitControls enableZoom={false} enablePan={false} autoRotate={autoRotate} autoRotateSpeed={1.4} target={[0, 2, 0]} />
      </Canvas>
    </div>
  );
}

export default function CakeCanvas({
  config, selectedTier, onTierClick, onDeselect,
  selectedTextId, onTextSelect, onTextMove, onTextContentChange, textToolbar,
  selectedAgeId, onAgeSelect, onAgeMove,
  autoRotate = false,
  selectedPiping, highlightPipingId, onTopPipingSelect, onBottomPipingSelect,
  pipingTarget, onPipingStyleSelect, onPipingCancel, pipingStyles = [],
  pipingToolbar,
  selectedStickerIds, onStickerSelect, onStickerLongPress, onStickerMove, onGroupMove, onMoveMany, stickerToolbar,
  hitTestRef,
  snapCameraRef,
  cameraPosition = CAMERA_POSITION,
  onWritingClick, onWritingMove, writingSelected = false,
  penDrawMode = false, penStyle, onAddStroke,
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
          if (topContains(tierShape(tier), topTarget.x, topTarget.z)) {
            const dist = ray.origin.distanceTo(topTarget);
            if (dist < bestDist) {
              bestDist = dist;
              best = { zone: 'top_surface', tierIndex: i, x: topTarget.x, z: topTarget.z };
            }
          }
        }

        const shp = tierShape(tier);
        if (shp.kind === 'rect') {
          const bh = boxHit(ray, shp.halfW, shp.halfD);
          if (bh && bh.y >= tier.baseY && bh.y <= topY) {
            const dist = ray.origin.distanceTo(new THREE.Vector3(bh.x, bh.y, bh.z));
            if (dist < bestDist) {
              bestDist = dist;
              best = { zone: 'side', tierIndex: i, u: nearestU(shp, bh.x, bh.z), y: bh.y };
            }
          }
        } else {
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
      <CameraPositionSync position={cameraPosition} />
      <CameraSnapper snapCameraRef={snapCameraRef} orbitRef={orbitRef} />
      <CakeScene
        config={config}
        selectedTier={selectedTier}
        onTierClick={i  => { if (!pointerRef.current.dragged) onTierClick(i); }}
        onDeselect={()  => { if (!pointerRef.current.dragged) onDeselect(); }}
        selectedPiping={selectedPiping}
        highlightPipingId={highlightPipingId}
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
        selectedAgeId={selectedAgeId}
        onAgeSelect={i => { if (!pointerRef.current.dragged) onAgeSelect?.(i); }}
        onAgeMove={onAgeMove}
        onTextContentChange={onTextContentChange}
        textToolbar={textToolbar}
        orbitRef={orbitRef}
        selectedStickerIds={selectedStickerIds}
        onStickerSelect={(id, ctrlKey) => onStickerSelect?.(id, ctrlKey)}
        onStickerLongPress={(id) => onStickerLongPress?.(id)}
        onStickerMove={onStickerMove}
        onGroupMove={onGroupMove}
        onMoveMany={onMoveMany}
        stickerToolbar={stickerToolbar}
        onWritingClick={onWritingClick}
        onWritingMove={onWritingMove}
        writingSelected={writingSelected}
        penDrawMode={penDrawMode}
        penStyle={penStyle}
        onAddStroke={onAddStroke}
        tierDataRef={tierDataRef}
      />
      <OrbitControls
        makeDefault
        ref={orbitRef}
        enableZoom={false}
        enablePan={false}
        autoRotate={autoRotate && selectedTier === null && selectedTextId === null && !pipingTarget}
        autoRotateSpeed={0.8}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 2, 0]}
      />
    </Canvas>
  );
}
