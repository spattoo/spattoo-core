import { useRef, useMemo, useEffect, useState, Suspense } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Text3D, Text, Center, Html, useGLTF, useTexture, Billboard, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
// SEC-WEB-7 — every drei <Text> MUST pass this as `font`. Without an explicit font,
// troika-three-text resolves one at runtime and fetches it (plus its index data)
// from cdn.jsdelivr.net, putting a third-party CDN on the designer's critical path
// and an extra origin in the CSP. `?inline` makes Vite emit it as a data: URI, so
// it costs no origin and no request. It is byte-identical to the file troika was
// already downloading (Noto Sans Regular) — see fonts/README.md — so nothing about
// the rendered text changes.
import textFont from './fonts/NotoSans-Regular.woff?inline';
import CakeTier from './CakeTier';
import { TextureErrorBoundary, SafeEnvironment } from './TextureErrorBoundary.jsx';
import { LoadingPing } from './loadingRegistry.js';
import CreamWriting from './CreamWriting.jsx';
import AgeNumber from './AgeNumber.jsx';
import CreamPen from './CreamPen.jsx';
import FinishHandles from './FinishHandles.jsx';
import { printExposure } from '../shared/printExposure.js';
import SelectionBox from './SelectionBox.jsx';
import ResizeHandles from './ResizeHandles.jsx';
import { Drip, TopFlowers, SideFlowers } from './Decorations';
import {
  STICKER_SIZE,
  PICKER_ORIGIN_X, PICKER_STEP_X, PICKER_ORIGIN_Z, PICKER_STEP_Z,
  CAMERA_POSITION, CAMERA_POSITION_MOBILE, CAMERA_FOV,
  FLAT_STICKER_Y_OFFSET,
  DESIGNER_GROUND,
  // The board's top face. constants.js names it as "the cake board surface" and the tier stack
  // starts on it, which is why the board mesh (height 0.1, centred at 0.05) tops out exactly here.
  BOTTOM_BASE,
} from '../constants.js';
import { pointerRay, cylinderHit, cylinderHitPoint, planeHit, buildRay } from '../utils/raycasting.js';
import GrassPatch from './GrassPatch.jsx';
import RainbowArch from './RainbowArch.jsx';
import { rainbowHandleAt } from '../geometry/rainbow.js';
import FondantCloud from './FondantCloud.jsx';
import { cloudHandleAt, cloudDragTo, cloudPlacement } from '../geometry/cloud.js';
import { rainbowDragTo } from '../geometry/rainbow.js';
import { useDragPlacement } from '../hooks/useDragPlacement.js';
import { rainbowBands } from '../geometry/rainbow.js';
import NameBlocks from './NameBlocks.jsx';
import { corsUrl } from '../utils/assetUrl.js';
import { getFondantNormalMap, applyBoxUVs } from '../shared/textures/fondantTexture.js';
import { drawTextSlots, loadSlotFonts } from '../shared/textures/textSlots.js';
import { textStyleOf } from '../textStyles.js';
import { tierShape, topClamp, topClampInset, topContains, boxHit, nearestU, rectSidePlacement, perimeter, snapToRim, boundingRadius, isRoundWall, boardRingClamp } from '../geometry/surface.js';
import { manualSeat } from '../geometry/spherePacking.js';
import { fitDistance, fitDistanceTight, sitFromSlack, framedHeight, cakeAimTarget } from '../geometry/framing.js';
import { hugScale, isDynamicHug, wallClampY, frameTopMaxScale, frameSideMaxScale, sideSeatOffset, DEFAULT_HUG_FILL, DEFAULT_FOLD_DEG, DEFAULT_SPINE, DEFAULT_INSERT_DEPTH, occludedTopFrac, seatedHitBox } from '../placement.js';
import { recolorImageData, extractRegions, recolorRegions, dominantColorOfImage } from '../shared/color/imageRecolor.js';
import { buildReliefMaps } from '../shared/textures/reliefMaps.js';
import { buildSolidReliefGeometry } from '../geometry/solidRelief.js';
import { makeRefCountedCache } from '../shared/refCountedCache.js';
import { seatHalfDepth } from '../geometry/seating.js';
import { resolveSidePipingBands, sidePipingClearance } from './pipingMetrics.js';
import { buildSolidWallMaterial } from '../geometry/solidFinishes.js';
import { applyGradient } from '../shared/color/gradientMaterial.js';
import { styleDef, resolveStyleParams } from '../creamStyles.js';
import { frostingAllowsStyles } from '../frostings.js';
import { makeWallReliefSampler } from '../geometry/creamWall.js';
import { makeDripReliefSampler, dripRenderParams } from '../geometry/chocolateDrip.js';
import { toCanvasConfig } from '../hooks/useCakeDesign.js';
import TakeDirector from '../reel/TakeDirector.jsx';

// ── Board footprint ─────────────────────────────────────────────────────────────────────────────
// The board under a cake, sized to CONTAIN the bottom tier. A number cake sits on a RECTANGULAR board (a
// round drum leaves too much empty gold around a thin digit, and reference number cakes are rectangular),
// sized to the digit's bounding box; a sheet keeps its rounded box; every other shape gets a round drum
// sized to boundingRadius so an outline never overhangs. ONE definition so the visible mesh, cream writing
// and cream pen all agree where the board edge is — they each used to recompute it and could drift.
export function boardOf(bottomTier) {
  const shp = tierShape(bottomTier);
  const isGlyph = shp.kind === 'glyph';   // number/letter — a rect board sized to the glyph bbox
  const isRect = bottomTier.shape === 'rect' || isGlyph;
  const width = (isGlyph ? shp.halfW * 2 : (bottomTier.width ?? 0)) + 0.9;
  const depth = (isGlyph ? shp.halfD * 2 : (bottomTier.depth ?? 0)) + 0.9;
  return isRect
    ? { kind: 'rect', width, depth, halfW: width / 2, halfD: depth / 2, radius: Math.max(width, depth) / 2 }
    : { kind: 'round', radius: boundingRadius(shp) + 0.6, width, depth };
}

// ── Dragging a generated decoration by the THING, not by a dot ──────────────────────────────────
// Rainbows and clouds borrowed the handle-dot mechanism from grass, dust and foil. Two problems with
// that here, and the second is the real one:
//
//   • The dot is white, and so is a cloud. It was there and could not be seen.
//   • Even found, it is a dot to hunt. Every other OBJECT on the cake — a number topper, a message,
//     a sticker — is dragged by grabbing the thing itself, and orbit takes the gesture instead.
//
// So the mesh takes the drag, through the same `useDragPlacement` the number topper and the cream
// writing use: press suspends orbit and captures the pointer, movement past a threshold becomes a
// drag, and a press that never moved is a tap. The ONLY thing that varies is `resolve` — which
// surface the ray meets and what it writes — which is exactly the contract that hook was written to.
//
// A hook cannot live inside a .map(), so this is a component rather than a few lines at the call
// site.
function DraggableGenerated({ resolve, onMove, onClick, onOrbitEnable, children }) {
  const { camera, gl } = useThree();
  const { grabProps } = useDragPlacement({ camera, gl, onMove, onClick, onOrbitEnable, resolve });
  return <group {...grabProps}>{children}</group>;
}

// The selection cue for a GENERATED decoration, from the points it is actually made of.
//
// A sticker's box traces its hit PLANE, because that plane is what receives the pointer and what
// steals a click from a neighbour — the border shows the truth rather than a flattering outline.
// These have no hit plane: the mesh itself takes the click, so the truth here IS the mesh's bounds.
//
// Returned in WORLD space and drawn by a sibling group at the origin, because a rainbow's geometry
// already carries its own position — there is no local frame to inherit.
function generatedBounds(points, pad = 0) {
  if (!points?.length) return null;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    lo[0] = Math.min(lo[0], p.x); hi[0] = Math.max(hi[0], p.x);
    lo[1] = Math.min(lo[1], p.y); hi[1] = Math.max(hi[1], p.y);
    lo[2] = Math.min(lo[2], p.z); hi[2] = Math.max(hi[2], p.z);
  }
  return {
    width:  hi[0] - lo[0] + pad * 2,
    height: hi[1] - lo[1] + pad * 2,
    depth:  Math.max(hi[2] - lo[2] + pad * 2, 0.02),
    centre: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2],
  };
}

// What a rainbow's falling foot lands ON, for the tier at `i`: the tier below, or — off the bottom
// tier — THE BOARD. The board does not grow the way the studio's does. It is a real thing the baker
// buys, sized to the cake and priced with it, so widening it silently is changing the order to fit
// the decoration.
//
// A rect board is measured across its NARROW way, so the arch lands on it at any angle rather than
// only over the corners.
//
// Exported because the edit card needs the same answer to say when the board, not the slider, is
// what is capping the size — and two ways of working that out is how the picture and the panel come
// to disagree.
export function rainbowSupportRadius(tierData, i, board) {
  if (i > 0) return tierData[i - 1]?.radius ?? null;
  if (!board) return null;
  return board.kind === 'rect' ? Math.min(board.width, board.depth) / 2 : board.radius;
}

// ── Where a board ring of grass reaches to ────────────────────────────────────
// The ring lives in the gap between the cake wall and the board's edge, and that gap is a different
// size on every cake — a 6" round on its board, a sheet on its board. So the control is a FRACTION
// of that gap, and this turns it into the outer bound grassSeats wants: a scale of the board's own
// outline, the same currency `inset` already speaks.
//
// A rect board is scaled uniformly, so on a strongly oblong sheet the ring is a little wider on the
// short sides than the long ones. That is the same approximation topContains makes everywhere else,
// and it is invisible next to the jitter already in the seats.
const BOARD_RING_OUTER_MAX = 0.96;   // never quite the board's edge — grass would hang off it
function boardRingInset(board, cakeShape, ringWidth = 1) {
  const w = Math.min(Math.max(ringWidth ?? 1, 0.05), 1);
  const inner = board.kind === 'rect'
    ? Math.max((cakeShape.halfW ?? 0) / board.halfW, (cakeShape.halfD ?? 0) / board.halfD)
    : boundingRadius(cakeShape) / board.radius;
  return inner + w * (BOARD_RING_OUTER_MAX - inner);
}

// How far a grass handle must float to stay visible. A clump is as tall as its blades, so a marker
// at the surface sits INSIDE it — still clickable (the grass mesh has no pointer handlers, so the
// ray passes straight through to the grab sphere) but invisible, with nothing to aim at. That reads
// as "the clump will not move", which is exactly how it was reported.
function grassHandleLift(tierData, boardGrass) {
  const heights = [
    ...tierData.map(t => (t.grass?.patches?.length ? (t.grass.height ?? 0) : 0)),
    boardGrass?.patches?.length ? (boardGrass.height ?? 0) : 0,
  ];
  return Math.max(0, ...heights) + 0.06;   // clear of the tallest blade, by a visible margin
}

// The cake itself, punched out of the ring. Exactly 1 — not a hair under, which would seat blades
// inside the wall they are supposed to be growing against, and not a hair over, which would leave a
// bare gold margin between the grass and the cake.
// `clearance` pushes the hole OUT past whatever is piped on the wall — INVARIANTS #3b. Without it a
// board ring plants its inner tufts against bare wall and grows straight through a bottom border,
// the same way letter blocks did. Expressed as a scale because that is what topContains takes.
function boardGrassHole(cakeShape, reach, clearance = 0) {
  return { shape: cakeShape, scale: reach > 0 ? (reach + clearance) / reach : 1 };
}

// The clearance a thing standing ON THE BOARD needs to miss this tier's piping. `height` is the
// thing's own vertical span from the board up — a tall clump overlaps a border a short one passes
// under. One question, one helper, whoever is asking (see INVARIANTS #3b).
function boardClearanceFor(tier, height) {
  if (!tier) return 0;
  const bands = resolveSidePipingBands({
    topPipings: tier.topPipings ?? [], bottomPipings: tier.bottomPipings ?? [],
    topY: tier.baseY + tier.height, yBase: tier.baseY, height: tier.height, radius: tier.radius,
  });
  return sidePipingClearance({ bands, yBottom: tier.baseY, yTop: tier.baseY + height });
}

// ── The scene a design resolves to ──────────────────────────────────────────────────────────────
// Where each tier sits, how tall the finished stack is, and the board underneath it. ONE resolver, so
// the live editor and the off-screen capture cannot end up standing the same cake at two heights.
// Everything is nullable for a cake with NO tiers — a real state (an empty preview), and better
// answered with nothing to draw than with a throw halfway through a render.
function resolveCakeScene(config) {
  let stackY = 0.1;
  const tierData = (config.tiers ?? []).map(tier => {
    const baseY = stackY;
    stackY += tier.height;
    return { ...tier, baseY };
  });
  // Fraction of each tier's top hidden under the tier resting on it — top-surface finish handles clamp
  // to the visible ring [topInnerFrac, 1] so a flake can't be dragged under the upper tier (shared
  // stacking helper, same rule the rim-ring limits use).
  tierData.forEach((td, i) => { td.topInnerFrac = occludedTopFrac(tierData, i); });
  const bottomTier = tierData[0] ?? null;
  return {
    tierData,
    stackY,
    bottomTier,
    topTier:   tierData[tierData.length - 1] ?? null,
    bottomShp: bottomTier ? tierShape(bottomTier) : null,
    board:     bottomTier ? boardOf(bottomTier) : null,
  };
}

// Image-based lighting (HDRI) lives in envMap.js — its own module because the four PREVIEW canvases
// need the same answer, and they are rendered by this file, so reaching back here would be a cycle.
// Re-exported so `configureEnvMap` stays part of this module's public surface for CakeDesigner.
export { configureEnvMap, envProps } from './envMap.js';
import { envProps as _envProps } from './envMap.js';

// Scene ENVIRONMENT config — data, with a default, so the look is tunable without a code change (the
// host may override via configureSceneEnv). `intensity` is the global IBL/reflection brightness: a WET
// finish (glaze) mirrors it back as its sheen, while a matte finish (buttercream) barely uses it — so
// this is the knob that makes a poured glaze read wet. `presetFallback` is the dev env when no self-hosted
// HDRI URL is configured. Per-finish reflection strength still layers on top via each material's own
// envMapIntensity (frostings.js).
export const SCENE_ENV = {
  intensity: 1.25,                // environmentIntensity — brighter than three's default 1.0 so glossy
                                  // finishes read wet; matte finishes are unaffected (they ignore IBL).
  presetFallback: 'apartment',    // dev fallback when cfAssetsBase (the self-hosted HDRI) is absent
};
export function configureSceneEnv(partial) { if (partial) Object.assign(SCENE_ENV, partial); }

// Shared three-point rig for every cake scene (live designer, snapshot capture, preview) so the look
// — and the captured snapshot — stay identical. Softened from the original ambient 0.8 / key 1.5,
// which overexposed the cake top + camera-facing wall and washed the diffuse colour toward white
// head-on (true colour only appeared once orbited). `shadows` enables the key's shadow (live scene
// only). The ONE light rig — edit here, every scene follows.
export function SceneLights({ shadows = false }) {
  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight position={[6, 14, 8]} intensity={1.1} castShadow={shadows} />
      <directionalLight position={[-4, 4, -4]} intensity={0.4} />
    </>
  );
}

// The ONE environment rule for every cake scene (live designer, snapshot capture, preview). The cake
// wall is a `meshPhysicalMaterial` and is image-based-lighting dependent — with NO env map it loses
// all IBL fill and reads its raw warm base under directional-only light (a taupe/brown wall). So when
// no HDRI URL is configured (local dev, no `cfAssetsBase`), fall back to the neutral `apartment`
// preset. IBL only — no `background` prop — so the rendered frame carries no sky behind the cake and
// the capture is free to choose its own (utils/thumbnail.js flattens onto white). Shared so the
// live scene and CakeThumbnailScene can never drift (they browned differently on dev before this).
export function SceneEnv() {
  // envProps picks self-hosted-or-preset; intensity is this scene's own, which the previews do not
  // share (they are small and lit for legibility, not for how a glaze reads wet).
  return <SafeEnvironment {..._envProps(SCENE_ENV.presetFallback)} environmentIntensity={SCENE_ENV.intensity} />;
}

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
  const key = `${wall}|${tier.radius}|${tier.height}|${JSON.stringify(params)}`;
  if (!_reliefSamplerCache.has(key)) _reliefSamplerCache.set(key, makeWallReliefSampler(wall, tier.radius, params, tier.height));
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
// Selection is drawn by SelectionBox around the whole word, never tinted into the glyph material —
// the violet emissive was additive and shifted the customer's chosen text colour.
function Glyph({ char, fs, faceColor, sideColor }) {
  return (
    <Center disableY disableZ>
      <Text3D font={helvetikerBold} size={fs} height={fs * 0.22} curveSegments={10}
        bevelEnabled bevelThickness={fs * 0.05} bevelSize={fs * 0.04} bevelSegments={5}>
        {char}
        <meshStandardMaterial attach="material-0" color={faceColor} roughness={0.78} metalness={0.0} />
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

  // A round wall wraps the cylinder (yaw = theta); EVERY faceted wall (rect + outline: heart, …)
  // sits flat on the perimeter at fraction u (yaw = the face's outward direction).
  const facetWall = !isRoundWall(shp);
  const surfaceR = radius + 0.015;
  let cx, cz, yaw;
  if (facetWall) {
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



  // Cumulative centre offset of each glyph along the baseline.
  const charOffset = i => {
    let cum = 0;
    for (let j = 0; j < i; j++) cum += charWidths[j];
    return cum + charWidths[i] / 2 - totalWidth / 2;
  };

  return (
    <group>
      {/* Round cake: letters laid along the cylinder arc (each in world space). */}
      {!facetWall && chars.map((char, i) => {
        const angle = textEl.theta + charOffset(i) / surfaceR;
        return (
          <group key={i} position={[surfaceR * Math.sin(angle), textEl.y, surfaceR * Math.cos(angle)]} rotation={[0, angle, 0]}>
            <Glyph char={char} fs={fs} faceColor={faceColor} sideColor={sideColor} />
          </group>
        );
      })}

      <group position={[cx, textEl.y, cz]} rotation={[0, yaw, 0]}>
        {/* Faceted wall (sheet/heart/…): letters laid flat along the wall, in the anchor's local frame. */}
        {facetWall && chars.map((char, i) => (
          <group key={i} position={[charOffset(i), 0, 0]}>
            <Glyph char={char} fs={fs} faceColor={faceColor} sideColor={sideColor} />
          </group>
        ))}
        {/* Traces the text's hit plane (below), exactly as a decoration's border does. */}
        {selected && <SelectionBox width={hitW} height={fs * 1.4} z={fs * 0.22} />}
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
          startHit.current     = facetWall
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
            if (!canMove) return;                     // pinned — allowed_actions.move === false
            if (facetWall) {
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


// Grid resolution of a RELIEF decal's mesh (per axis). Displacement is per-VERTEX, so this bounds how
// finely the baked height field can be sculpted. Tried at 192 (matching the admin studio's ~210 verts per
// world unit, vs 96's ~114) to see whether an under-resolved `edgeRound` shoulder was flattening the bevel:
// it made NO visible difference, so it isn't the constraint — the normal map carries the shoulder's shading,
// not the geometry. Kept at 96: 193² = 37,249 verts per relief sticker vs 97² = 9,409, for nothing.
const RELIEF_SEGMENTS = 96;

// Builds a flat-strip geometry that curves around a cylinder of the given radius.
// In the sticker's local space the cylinder axis is at z = -curveRadius, so the
// strip follows the cake surface naturally.
function createCurvedPlane(width, height, curveRadius, radialSegments = 16, verticalSegments = 1) {
  const halfAngle = width / (2 * curveRadius);
  const positions = [], normals = [], uvs = [], indices = [];
  for (let j = 0; j <= verticalSegments; j++) {
    const v = j / verticalSegments;
    const y = (v - 0.5) * height;
    for (let i = 0; i <= radialSegments; i++) {
      const u = i / radialSegments;
      const a = (u - 0.5) * 2 * halfAngle;
      positions.push(curveRadius * Math.sin(a), y, curveRadius * (Math.cos(a) - 1));
      normals.push(Math.sin(a), 0, Math.cos(a));
      uvs.push(u, v);
    }
  }
  const stride = radialSegments + 1;                       // verticalSegments rows → a full grid (for displacement)
  for (let j = 0; j < verticalSegments; j++) for (let i = 0; i < radialSegments; i++) {
    const a = j * stride + i, b = a + stride;
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

// Measure a 2D sticker's OPAQUE content vertically, in one alpha scan, so both consumers read the
// same pixels (a second scan would silently drift — see the deOverlapSeat lesson). Returns, in
// unscaled plane units from the plane centre:
//   • seatHalf — distance DOWN to the lowest opaque point in the SEATED frame, i.e. after the fold
//     `rise` lifts a low wing above the spine. A STANDING sticker seats its visible base on this, so
//     it doesn't float on its transparent margin.
//   • down / up — distance to the lowest / highest opaque point in the FLAT image (no rise). These
//     are the visible content's true vertical extent, used to clamp a WALL element by its flags
//     rather than by its transparent square (which would stop it short of the rim). = STICKER_SIZE/2
//     when the content fills the plane, so margin-free assets are unaffected.
// Cached per URL; a CORS-tainted canvas falls back to the full half-plane. Asset-derived, never
// type-aware. `rise` (= sin(fold) when standing) lifts a pixel by |x − spine|·rise, so a low wing
// pixel that hangs below the body in the flat image rises ABOVE the spine in 3D — making the body the
// true support and the wings clear. rise 0 → seatHalf === down.
function scanContentV(img, spine, rise) {
  const half = STICKER_SIZE / 2;
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (!w || !h) return { seatHalf: half, down: half, up: half };
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, w, h).data;          // throws if the canvas is CORS-tainted
  const xh = STICKER_SIZE * (spine - 0.5);
  let minSeatY = Infinity, minY = Infinity, maxY = -Infinity;
  for (let py = 0; py < h; py++) {
    const planeY = STICKER_SIZE * (0.5 - py / h);        // flipY: image top → plane top (+S/2)
    const row = py * w * 4;
    for (let px = 0; px < w; px++) {
      if (d[row + px * 4 + 3] > 8) {
        const planeX = STICKER_SIZE * (px / w - 0.5);
        const y3 = planeY + Math.abs(planeX - xh) * rise;   // seated (folded) height
        if (y3 < minSeatY) minSeatY = y3;
        if (planeY < minY) minY = planeY;                   // flat content extent
        if (planeY > maxY) maxY = planeY;
      }
    }
  }
  if (minY === Infinity) return { seatHalf: half, down: half, up: half };   // fully transparent
  return { seatHalf: -minSeatY, down: -minY, up: maxY };
}

// Load the asset for MEASURING in its own CORS image, so the pixel read can't hit a cache entry
// poisoned by a non-CORS <img> (e.g. a picker thumbnail) — which would taint the canvas and silently
// fall the seat back to half-plane (→ float). One fetch per URL, then cached. Uses the SAME `corsUrl`
// qualifier as every other loader (it used to hand-roll `?cors=seat`, which was a second copy of the
// rule AND a second cache entry — the identical bytes fetched twice).
const seatImgCache = {};   // corsUrl → { img, loaded, cbs }
function loadSeatImage(imageUrl, cb) {
  const url = corsUrl(imageUrl);
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

const MIN_SEAT = 0.02 * STICKER_SIZE;   // never seat on a hairline of stray pixels
const stickerContentVCache = {};
function requestStickerContentV(imageUrl, { spine = 0.5, rise = 0 } = {}, cb) {
  const key = `${imageUrl}|r${rise.toFixed(2)}|s${spine.toFixed(2)}`;
  if (key in stickerContentVCache) { cb(stickerContentVCache[key]); return; }
  loadSeatImage(imageUrl, img => {
    const half = STICKER_SIZE / 2;
    let v = { seatHalf: half, down: half, up: half };
    if (img) { try { v = scanContentV(img, spine, rise); } catch (_) { /* tainted → fallback */ } }
    v = { seatHalf: Math.max(v.seatHalf, MIN_SEAT), down: v.down, up: v.up };
    stickerContentVCache[key] = v;
    cb(v);
  });
}

// Returns the sticker's texture, pixel-recoloured to `color` when the element carries a
// `recolor` region descriptor (placement_config.recolor). useTexture still owns loading/suspense/
// caching; we derive a recoloured CanvasTexture from the loaded image only when asked. A tainted
// canvas (CORS) falls back to the original — recolour silently off, sticker still renders.
// How bright a print renders is decided by ONE rule, in ONE pure module: shared/printExposure.js.
// A print reads as its ARTWORK by construction (see that file for why the old "dull" and "over-bright"
// bugs were the same defect — a decal with no defined exposure — and why knobs could never close it).
// Push chroma away from per-pixel luma by `mul` (>1 = more saturated), clamped, alpha untouched. In place.
function saturateRGB(d, mul) {
  if (mul === 1) return;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    d[i]     = Math.max(0, Math.min(255, y + (r - y) * mul));
    d[i + 1] = Math.max(0, Math.min(255, y + (g - y) * mul));
    d[i + 2] = Math.max(0, Math.min(255, y + (b - y) * mul));
  }
}

// The exposure model's two material terms, as THREE colours. Both are MULTIPLIERS ON THE ALBEDO (never an
// additive white — additive white is what desaturates a print), so:
//     screen = diffuse × albedo × sceneLight  +  selfLit × albedo
// which at the reference light sums to exactly the artwork. Greys are built with `new THREE.Color(v,v,v)`,
// which writes the LINEAR working space directly (no sRGB transfer) — the space the shader multiplies in.
function printMaterialTerms(printFinish) {
  const { diffuse, selfLit } = printExposure(printFinish);
  return {
    color:    new THREE.Color(diffuse, diffuse, diffuse),
    emissive: new THREE.Color(selfLit, selfLit, selfLit),
  };
}

// A style's typeface is an uploaded webfont, and `ctx.fillText` with an unloaded FontFace SILENTLY
// falls back to sans-serif — which would then be BAKED into the texture. So the composite must wait for
// the fonts to resolve and re-derive once they do. Returns a tick that flips when they're ready.
function useSlotFontsReady(textSlots) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!textSlots?.length) return;
    let alive = true;
    loadSlotFonts(textSlots, textStyleOf).then(() => { if (alive) setTick(t => t + 1); });
    return () => { alive = false; };
  }, [textSlots]);
  return tick;
}

function useStickerImageTexture(imageUrl, recolor, color, groupColors, saturation, textSlots, textValues) {
  const sat = printExposure({ saturation }).saturation;   // print_finish.saturation; neutral (1) by default
  const base = useTexture(corsUrl(imageUrl));
  const fontsTick = useSlotFontsReady(textSlots);
  base.colorSpace = THREE.SRGBColorSpace;
  // A decal is viewed at a grazing angle all round the wall, where isotropic mip filtering smears it.
  // 8 matches the Relief Studio's albedo (and goldLeafTexture); the GPU clamps to its own max. The
  // recoloured CanvasTexture below copies this off `base`, so both paths stay in step.
  base.anisotropy = 8;
  const isMulti = recolor?.method === 'hue_regions';   // per-region colours via groupColors (keyed by region index)
  const gcKey = isMulti ? JSON.stringify(groupColors ?? null) : null;
  const tvKey = textSlots?.length ? JSON.stringify(textValues ?? null) : null;
  const recoloured = useMemo(() => {
    const needsRecolor = !!(recolor && (isMulti || color));
    const needsBoost = sat !== 1;
    const needsText = !!textSlots?.length;   // placement_config.text_slots → the customer's {name}/{number}
    if (!needsRecolor && !needsBoost && !needsText) return base;           // nothing to do → cached original
    const img = base.image;
    const w = img?.naturalWidth || img?.width, h = img?.naturalHeight || img?.height;
    if (!w || !h) return base;
    try {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      if (needsRecolor) {
        const id = ctx.getImageData(0, 0, w, h);
        if (isMulti) {
          // Auto colour regions: cluster the image's hues, recolour each to its groupColors[index] (an
          // untouched region → null → left as-is). Regions derive deterministically so index keys are stable.
          const regions = extractRegions(id.data, w, h, { minSat: recolor.sat, maxRegions: recolor.maxRegions });
          const targets = regions.map((_, i) => groupColors?.[i] ?? null);
          if (targets.some(Boolean)) recolorRegions(id.data, w, h, regions.map(r => r.hue), targets, { minSat: recolor.sat });
        } else {
          recolorImageData(id.data, w, h, color, recolor);
        }
        ctx.putImageData(id, 0, 0);
      }
      // The customer's value, inked onto the artwork. AFTER recolour (a recolour targets the ARTWORK's
      // regions — it must not repaint the typed glyph) and BEFORE the chroma boost, so the number takes
      // the same print finish as the art it sits on rather than reading duller than its own plaque.
      if (needsText) drawTextSlots(ctx, w, h, textSlots, textValues, textStyleOf);
      if (needsBoost) {
        const id2 = ctx.getImageData(0, 0, w, h);
        saturateRGB(id2.data, sat);   // pre-boost chroma to survive the lit-render wash (see DECAL_SAT note)
        ctx.putImageData(id2, 0, 0);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = base.anisotropy;
      tex.flipY = base.flipY;
      return tex;
    } catch (_) {
      return base;   // tainted canvas → original texture (no recolour/boost/text)
    }
  }, [base, recolor, color, isMulti, gcKey, sat, textSlots, tvKey, fontsTick]);
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
  const mask = useTexture(corsUrl(maskUrl));
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
  const photo = useTexture(corsUrl(photoUrl));
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
// Selection is drawn by SelectionBox, never mixed into this material — an additive emissive tint
// corrupts the overlay's own colours (see the decal note below).
function OverlayMesh({ geo, url }) {
  const tex = useTexture(corsUrl(url));
  tex.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh geometry={geo} renderOrder={1} frustumCulled={false}>
      <meshStandardMaterial
        map={tex}
        transparent
        alphaTest={0.05}
        roughness={0.75}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// Relief maps + solid-relief geometry are IDENTICAL across every instance of the same element at the
// same size — only the per-instance position differs. Bake once per signature and SHARE the result
// across all instances (24 scattered bows used to bake 24×). Ref-counted + idle-TTL so the shared
// GPU resources are pinned while any instance is mounted and reclaimed once unused (see refCountedCache).
const reliefMapsCache = makeRefCountedCache({
  dispose: v => { v?.normalMap?.dispose?.(); v?.displacementMap?.dispose?.(); },
});
const solidGeoCache = makeRefCountedCache({ dispose: v => v?.dispose?.() });

// Bake the relief displacement + normal maps from the loaded sticker image (placement_config.relief).
// Reuses the drei-cached image; null when the element has no relief. The bake is SHARED across
// instances via reliefMapsCache (keyed by image + bake params + mask), so disposal is the cache's job.
function useReliefMaps(imageUrl, relief) {
  // Same qualified URL as the albedo above, so drei's cache serves ONE fetch for both.
  const base = useTexture(corsUrl(imageUrl));
  // Authored flat-mask (placement_config.relief.flatMask): an inline data-URI PNG (black = flush). Decode it
  // ASYNC — a data URI needs no crossOrigin — then rebuild the maps with it. Absent → the sync path is
  // untouched. Keeping the decoded image in state (keyed on the data-URI) makes the maps re-derive on load.
  const flatMaskUri = relief?.flatMask ?? null;
  const [flatMaskImg, setFlatMaskImg] = useState(null);
  useEffect(() => {
    if (!flatMaskUri) { setFlatMaskImg(null); return; }
    let alive = true;
    const img = new Image();
    img.onload = () => { if (alive) setFlatMaskImg(img); };
    img.onerror = () => { if (alive) setFlatMaskImg(null); };
    img.src = flatMaskUri;
    return () => { alive = false; };
  }, [flatMaskUri]);
  // Signature: same image + same bake config + same mask state ⇒ one shared bake. The mask-ready flag
  // is in the key so the pre-mask (fully-raised) build and the post-mask build are DISTINCT entries —
  // the mask still re-derives on load, it just doesn't overwrite the shared entry.
  const img = base.image;
  const ready = relief && img && (img.naturalWidth || img.width);
  const key = ready
    ? `${imageUrl}|${JSON.stringify(relief.bake ?? {})}|${flatMaskUri ?? ''}|${flatMaskImg ? '1' : '0'}`
    : null;
  const maps = useMemo(() => (
    key ? reliefMapsCache.get(key, () => {
      try { return buildReliefMaps(img, relief.bake ?? {}, flatMaskImg); } catch (_) { return null; }
    }) : null
  ), [key]);
  useEffect(() => {
    if (!key) return;
    reliefMapsCache.retain(key);
    return () => reliefMapsCache.release(key);
  }, [key]);
  return maps;
}

// Front-most local Z of a rendered geometry — how far the selection border must stand off so it
// clears the element it outlines (a curved decal dips away from the viewer, a solid slab pushes
// toward them). `extraLift` covers lift the geometry does not carry: relief displacement is applied
// in the vertex shader, so it is absent from the bounding box.
function frontZOf(geometry, extraLift = 0) {
  if (!geometry) return extraLift;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  return (geometry.boundingBox?.max?.z ?? 0) + extraLift;
}

function StickerTexture({ imageUrl, curved, curveRadius, foldable, fold, spine, standUp, recolor, color, groupColors, relief = null, stickerScale = 1, reliefRadius = null, roughness = null, metalness = null, printFinish = null, photoUrl, photoMask, photoTransform, photoOverlay, borderWidth, textSlots = null, textValues = null, onSeat, onDepth, onVExtent }) {
  const texture = useStickerImageTexture(imageUrl, recolor, color, groupColors, printFinish?.saturation, textSlots, textValues);
  const reliefMaps = useReliefMaps(imageUrl, relief);
  const reliefOn = !!(relief && reliefMaps);
  // The live tier radius the relief is bent around. `reliefRadius` is Infinity for a flat top
  // surface / sheet wall, so guard with isFinite — a raw `> 0` would sail straight through.
  const liveReliefRadius = Number.isFinite(reliefRadius) && reliefRadius > 0 ? reliefRadius : 0;
  // ONE lift→world formula, shared by the displaced shell (its displacementScale), the solid slab
  // (its extrude thickness) and the selection border (its clearance). Three copies of this rule
  // drifted apart once already; it lives here now.
  const reliefLift = useMemo(
    () => (relief ? (relief.lift ?? 0.07) * liveReliefRadius / (stickerScale || 1) : 0),
    [relief, liveReliefRadius, stickerScale],
  );
  // Solid relief SLAB (placement_config.relief.solid): render the sticker as a REAL extruded solid
  // (flat printed front + side walls + flat back, bent around the wall) instead of a displaced shell,
  // so it reads solid from a grazing angle. Config-gated ONLY on relief.solid — no element-type branch.
  // The silhouette comes from the sticker's own loaded image alpha; `base` is the SAME drei-cached
  // texture useStickerImageTexture/useReliefMaps already fetched (one download), and Suspense guarantees
  // its image is decoded here — so the geometry builds synchronously.
  const base = useTexture(corsUrl(imageUrl));
  const solidOn = !!(relief?.solid && reliefOn);
  // Same silhouette (image) + same thickness/curve/scale/edge ⇒ one shared solid geometry across all
  // instances (a flat-top variant and a side-curved variant per element). Cached + ref-counted like
  // the relief maps, so disposal is the cache's job.
  const solidImg = base?.image;
  const solidReady = solidOn && solidImg && (solidImg.naturalWidth || solidImg.width);
  const solidKey = solidReady
    ? `${imageUrl}|${reliefLift}|${(curved && curveRadius) ? curveRadius : 'flat'}|${stickerScale}|${relief.solidEdge ?? 0}`
    : null;
  const solidGeo = useMemo(() => (
    solidKey ? solidGeoCache.get(solidKey, () => {
      try {
        return buildSolidReliefGeometry(solidImg, {
          size: STICKER_SIZE,
          // The solid's raised height is the SAME lift→world value the displaced path feeds
          // displacementScale, so it matches the old shell on any cake size / sticker scale (#8).
          thickness: reliefLift,
          curveRadius: (curved && curveRadius) ? curveRadius : null,   // null → flat slab (top surface / sheet wall)
          scale: stickerScale,
          edgeRadius: relief.solidEdge ?? 0,   // 0..1 of depth → rounded fondant rim (0 = sharp edge)
        });
      } catch (_) { return null; }
    }) : null
  ), [solidKey]);
  useEffect(() => {
    if (!solidKey) return;
    solidGeoCache.retain(solidKey);
    return () => solidGeoCache.release(solidKey);
  }, [solidKey]);
  // Seat a standing sticker on its visible base (measured from the texture's opaque content) so a
  // wide butterfly on a square canvas doesn't float. When standing (standUp) the wings rise in a V,
  // so the seat must account for that rise — the spine/body becomes the true lowest point.
  const seatRise  = (foldable && standUp) ? Math.sin((fold ?? DEFAULT_FOLD_DEG) * Math.PI / 180) : 0;
  const seatSpine = spine ?? DEFAULT_SPINE;
  useEffect(() => {
    if ((!onSeat && !onVExtent) || !imageUrl) return;
    let live = true;
    // ONE scan yields the seat (standing base) AND the visible vertical extent (wall clamp). Prefer
    // the already-loaded texture image — no extra fetch (r2.dev rate-limits, so a second download for
    // measuring can fail and fall the seat back to half-plane → constant lift). Only if THIS image is
    // CORS-tainted (e.g. a non-CORS thumbnail poisoned the cache) do we reload clean.
    const emit = v => { if (!live) return; onSeat?.(Math.max(v.seatHalf, MIN_SEAT)); onVExtent?.({ down: v.down, up: v.up }); };
    const img = texture?.image;
    if (img && (img.naturalWidth || img.width)) {
      try { emit(scanContentV(img, seatSpine, seatRise)); return () => { live = false; }; }
      catch (_) { /* tainted → CORS fallback below */ }
    }
    requestStickerContentV(imageUrl, { spine: seatSpine, rise: seatRise }, emit);
    return () => { live = false; };
  }, [texture, imageUrl, onSeat, onVExtent, seatRise, seatSpine]);
  // Geometry is config-driven: a foldable element hinges into a folded plane (the fold wins over
  // wall-curving). Standing → wings rise UP in a V from the spine (riseRad = fold), so the body is
  // the support; laid flat / on a wall → hinge into Z-depth (foldRad).
  const geo = useMemo(() => {
    if (foldable) {
      const f = (fold ?? DEFAULT_FOLD_DEG) * Math.PI / 180, sp = spine ?? DEFAULT_SPINE;
      return standUp ? createFoldedPlane(STICKER_SIZE, f, sp, f)
                     : createFoldedPlane(STICKER_SIZE, f, sp, 0);
    }
    // The decal must curve at the WALL radius in WORLD space, but the parent group scales the mesh by
    // `stickerScale` — so build at local radius `curveRadius / stickerScale`, exactly as the GLB path
    // does (`bendRadius`). The old `Math.min(curveRadius, 0.3)` cap predates element scaling: it
    // exaggerated the bend so a decal on a wide tier didn't look flat, but the group's scale then
    // multiplied the world curve radius (0.3 × 3 = 0.9 against a ~0.45 wall), so the decal was a much
    // flatter arc than the wall and its edges bowed off it at the silhouette tangent — worse the bigger
    // the element. That is a BASE-geometry bug, not a relief one; relief only made it easy to see.
    // Relief needs a DENSE grid so the displacement map can sculpt real lift; flat stickers stay low-poly.
    return (curved && curveRadius)
      ? createCurvedPlane(STICKER_SIZE, STICKER_SIZE, curveRadius / (stickerScale || 1), reliefOn ? RELIEF_SEGMENTS : 16, reliefOn ? RELIEF_SEGMENTS : 1)
      : new THREE.PlaneGeometry(STICKER_SIZE, STICKER_SIZE, reliefOn ? RELIEF_SEGMENTS : 1, reliefOn ? RELIEF_SEGMENTS : 1);
  }, [foldable, fold, spine, standUp, curved, curveRadius, stickerScale, reliefOn]);
  // How far this element stands proud of its hit plane, so the selection border clears it. A flat
  // decal is flush (0); a solid slab carries its thickness in the geometry; a displaced relief adds
  // its lift in the vertex shader, after the bounding box was computed.
  useEffect(() => {
    const drawn = (solidOn && solidGeo) ? solidGeo : geo;
    onDepth?.(frontZOf(drawn, (reliefOn && !solidOn) ? reliefLift : 0));
  }, [onDepth, geo, solidGeo, solidOn, reliefOn, reliefLift]);
  // Relief normal strength → Vector2; a negative Y is the "flip green" toggle (bake.flipY) at the material.
  const reliefNScale = useMemo(() => {
    const ns = relief?.normalScale ?? 0.8;
    return new THREE.Vector2(ns, relief?.bake?.flipY ? -ns : ns);
  }, [relief]);
  // Print exposure (shared/printExposure.js) — the SAME two terms drive every printed surface below (flat
  // decal, displaced relief, solid front cap), so a print reads as its artwork whichever one it lands on.
  const print = useMemo(() => printMaterialTerms(printFinish), [printFinish]);
  // Solid-slab materials as an EXPLICIT array (not two `attach="material-N"` children): on a plain
  // <mesh> whose default `material` is a single Material, `attach="material-0"` writes index 0/1 onto
  // that object instead of building an array — so the mesh silently keeps its default white material
  // and the albedo never lands on the front cap. Passing `material={[front, side]}` sets the array
  // directly. [0] = printed albedo on the caps (the relief physical material minus displacement — the
  // geometry IS the lift now), [1] = matte fondant on the side walls. Disposed on change/unmount.
  const solidMats = useMemo(() => {
    if (!solidOn) return null;
    const front = new THREE.MeshPhysicalMaterial({
      map: texture,
      color: print.color.clone(),
      normalMap: reliefMaps.normalMap, normalScale: reliefNScale,
      roughness: relief.roughness ?? 0.95, metalness: 0,
      sheen: relief.sheen ?? 0, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.85,
      envMapIntensity: relief.envIntensity ?? 0.4,
      toneMapped: relief.toneMapped ?? false,
      emissive: print.emissive.clone(), emissiveMap: texture,
      emissiveIntensity: 1,   // the strength lives in `emissive` (the exposure model's selfLit term)
      side: THREE.DoubleSide,
    });
    // Side/back walls read as ONE solid fondant colour matching the front — not plain white. Two sources,
    // chosen by config (never by element type):
    //   • RECOLOURABLE element (`recolor` present) → always auto-sample the FINAL albedo, which already
    //     carries the customer's recolour + saturation boost. The customer recolours the print and the slab
    //     follows; an authored `solidColor` must NOT freeze the walls against the hue they just picked.
    //   • Otherwise → the author's `relief.solidColor` wins (explicit intent), else the auto-sample.
    // A tainted/greyscale image makes the sample null → the instance colour, else a neutral fondant tone.
    const autoHex = dominantColorOfImage(texture.image, { mul: 1.0 });
    const wallHex = (recolor ? null : relief.solidColor) || autoHex || color || '#efe6da';
    // `relief.solidWallColor: 'print'` samples the print at each point of the silhouette instead of painting
    // the walls one flat hue — the tree's trunk edge brown, its leaf edges green. Absent/'dominant' keeps the
    // flat wall, so every already-authored element renders exactly as before. An authored `solidColor` is an
    // explicit flat override and still wins (on a recolourable element it's ignored, as ever — see above).
    const flatOverride = !recolor && !!relief.solidColor;
    const printWalls = relief.solidWallColor === 'print' && !flatOverride;
    // Side/back walls: the dominant colour + the author-chosen FINISH (fondant/chocolate/…) built by the
    // ONE shared factory the studio also uses (surface feel only; colour stays the print's). Its cloned
    // grain normal, if any, is disposed in the cleanup below. Walls keep ExtrudeGeometry's world-space UVs
    // (see solidRelief) so a grain tiles along them.
    const wall = buildSolidWallMaterial(relief.solidFinish, wallHex, printExposure(printFinish).selfLit,
      { printMap: printWalls ? texture : null });
    return [front, wall];
  }, [solidOn, texture, reliefMaps, reliefNScale, relief, printFinish, print, color, recolor]);
  // Dispose the wall's CLONES (index 1) — its fondant normal and, in `local` wall mode, its print-map clone
  // (a distinct GPU upload keyed to uv1). NEVER the front's shared reliefMaps.normalMap / `texture`, which
  // are owned by the drei cache and other meshes. `map === emissiveMap` on the wall, so dispose once.
  useEffect(() => () => {
    if (!solidMats) return;
    solidMats[1]?.normalMap?.dispose?.();
    solidMats[1]?.map?.dispose?.();
    solidMats.forEach(m => m.dispose());
  }, [solidMats]);
  // Photo-cake frame (config-gated on photoMask, no element-type branch): the shape is the mask, the
  // border is procedural (or a decorative overlay), and the customer photo is clipped to the mask.
  // The plain image_url mesh is NOT drawn for a frame — the mask is the shape, not a visible image.
  if (photoMask) {
    return (
      <>
        {photoOverlay
          ? <OverlayMesh geo={geo} url={photoOverlay} />
          : ((borderWidth ?? 0) > 0 &&
              <BorderBacking geo={geo} maskUrl={photoMask} color={color} width={borderWidth} />)}
        {photoUrl
          ? <PhotoBacking geo={geo} photoUrl={photoUrl} maskUrl={photoMask} transform={photoTransform} />
          : <PlaceholderBacking geo={geo} maskUrl={photoMask} />}
      </>
    );
  }
  // Solid relief SLAB (placement_config.relief.solid): the extruded silhouette — flat printed front,
  // side walls, flat back, bent around the wall — with a two-material array: [0] the printed albedo on
  // the caps (reusing the relief physical material minus displacement — the geometry IS the lift now),
  // [1] a matte fondant on the side walls. Reads solid from every angle. Falls back to the displaced
  // shell below if the geometry couldn't build (e.g. a CORS-tainted image → alpha unreadable).
  if (solidOn && solidGeo && solidMats) {
    // Two-material array (see solidMats): caps (group 0) = printed albedo — opaque, since the extrude
    // silhouette already IS the alpha shape (no transparent margin maps onto the cap, so no alphaTest is
    // needed → a clean solid edge). Side walls (group 1) = matte fondant, the depth the slab shows edge-on.
    return <mesh geometry={solidGeo} material={solidMats} />;
  }
  // Raised fondant cut-out (placement_config.relief): real GPU displacement + normal detail + a fondant
  // finish on the dense mesh. Config-gated; a flat sticker falls through to the standard decal material.
  if (reliefOn) {
    // `relief.lift` is a FRACTION of the LIVE wall/tier radius (`reliefRadius`), NOT an absolute world
    // length and NOT tied to the sticker's size. THREE applies displacement along the object-space normal
    // *before* the model matrix, so the group's `scale` would multiply it — divide it back out here and the
    // world lift is exactly `lift * reliefRadius`: independent of the element's scale (a 3× sticker can't
    // balloon the lift) and of the cake size (INVARIANTS.md #8/#8a; never hardcode a radius — the studio
    // authored `lift` on its 1.2-radius tier, but the cake is any size). Both predecessors were wrong: the
    // absolute value ignored cake size, the fraction-of-sticker-size cancelled against `scale`.
    // `reliefRadius` is a LIVE cake dimension — every call site passes its tier's radius. There is no valid
    // world-space constant to substitute if it's missing (that is precisely the bug #8 forbids), so a
    // non-finite value means a wiring bug: shout in dev and render flat rather than fake a plausible-but-
    // wrong thickness that nobody notices.
    if (!liveReliefRadius && import.meta.env?.DEV) {
      console.error('[relief] reliefRadius must be the live tier radius; got', reliefRadius, '— rendering flat.');
    }
    return (
      <mesh geometry={geo}>
        <meshPhysicalMaterial
          map={texture}
          // Print exposure — shared/printExposure.js. `color` is the light-driven share of the albedo.
          color={print.color}
          transparent alphaTest={0.5} alphaToCoverage
          normalMap={reliefMaps.normalMap} normalScale={reliefNScale}
          displacementMap={reliefMaps.displacementMap} displacementScale={reliefLift}
          // MATTE and SHEENLESS by default, exactly like the flat decal below — a raised fondant cut-out IS
          // fondant, and the two paths must not disagree about what fondant looks like.
          //
          // Both terms add WHITE on top of the albedo, and additive white is what desaturates a print (it
          // lifts the darkest channel off zero; it does not clip — measured 0% pinned). Measured on the real
          // decal, texture saturation 0.907:
          //     baseline (roughness 0.7, sheen 0.12) → 0.345   (62% lost)
          //     sheen 0                              → 0.397
          //     roughness 0.95                       → 0.479
          //     both, no specular                    → 0.607   ← matches a flat decal (0.629)
          // Note it is NOT the HDRI: envMapIntensity 0 changes the result by literally nothing. The white is
          // the DIRECT specular from the two directional lights, which envMapIntensity does not scale.
          // ~33% loss (0.907 → 0.61) is irreducible — light times albedo, plus thin edges blending into the
          // cake. The other ~44% was this material, and only this material.
          //
          // The flat path learned the same lesson once already (0.75 → 0.95, see its note). The relief path
          // was cloned from it and took `roughness`/`sheen` from the Relief Studio's sliders (0.7 / 0.12).
          // Fixing the defaults is only half the job: every element authored there carries EXPLICIT values
          // that override these, so placement_config.relief.{roughness,sheen} must be dropped/re-authored.
          roughness={relief.roughness ?? 0.95} metalness={0}
          sheen={relief.sheen ?? 0} sheenColor={'#ffffff'} sheenRoughness={0.85}
          envMapIntensity={relief.envIntensity ?? 0.4}
          // Selection never changes the material. The additive violet SELECTION_COLOR emissive corrupted a
          // saturated albedo by construction (orange → magenta — B pushed hard, G barely), and tone-mapping-
          // while-selected didn't compress it enough. The cue is SelectionBox, a border drawn beside the
          // element — non-destructive, so the print keeps its true colour while selected.
          toneMapped={relief.toneMapped ?? false}
          // `emissiveMap` = the albedo, so this is the ARTWORK itself as self-illumination (hue and chroma
          // survive — it is a MULTIPLIER on the albedo, not an additive white). It carries the orientation-
          // INDEPENDENT share of the exposure, which is what stops a raised sticker blowing out where it
          // faces the light, or reading dull where it doesn't. Strength lives in the colour; intensity is 1.
          emissive={print.emissive}
          emissiveMap={texture}
          emissiveIntensity={1}
          side={THREE.DoubleSide}
        />
      </mesh>
    );
  }
  return (
    <mesh geometry={geo}>
      <meshPhysicalMaterial
        map={texture}
        // Print exposure — shared/printExposure.js. `color` is the light-driven share of the albedo.
        color={print.color}
        // A print is INK, and ink has no specular highlight of its own. The dielectric specular is an
        // ADDITIVE WHITE that is not multiplied by the albedo, so it cannot be scaled by the exposure model
        // — and being additive it wrecks exactly the DARK pixels (measured: it lifted the artwork's browns
        // 1.19× while leaving pale areas at 1.03×, i.e. it flattens contrast and desaturates). Sheen belongs
        // to the CAKE's surface, not to the picture printed on it. 0 = the print renders as its artwork.
        specularIntensity={0}
        transparent
        alphaTest={0.05}
        // Matte by default (fondant-like) so the bright environment doesn't reflect a whitish sheen
        // that washes out the printed colour — the old 0.75 read glossy and desaturated head-on.
        // Honors the element's placement_config.roughness/metalness override (parity with StickerModel).
        // envMapIntensity damps how much the HDRI lifts/desaturates the albedo.
        roughness={roughness ?? 0.95}
        metalness={metalness ?? 0}
        // Same reason as specularIntensity: the HDRI's reflection is additive white on top of the print.
        envMapIntensity={0}
        // The print bypasses the scene's ACES tone mapping (which desaturates) so the decal shows its
        // true colours — the cake stays filmic, the artwork stays vivid. A little emissive still lifts
        // it in shadow. Selection does not tint the material (the additive violet SELECTION_COLOR corrupted
        // saturated albedos — see the relief path note); SelectionBox draws the cue beside the element.
        toneMapped={false}
        // The orientation-INDEPENDENT share of the exposure: the artwork as self-illumination (emissiveMap
        // = the albedo), so it cannot be blown out by where the decal sits. Strength is in the colour.
        emissive={print.emissive}
        emissiveMap={texture}
        emissiveIntensity={1}
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

function StickerModel({ imageUrl, color, groupColors, gradient, clipY, bendRadius, baseRotation, seatProud = false, fondant = false, roughness = null, metalness = null, surface = null, onSeat, onDepth, onVExtent }) {
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
    // Config-driven material finish. A decoration carries either a full `surface` finish (resolved from
    // placement_config.material via the materials registry — roughness/sheen/clearcoat/anisotropy/…), OR the
    // legacy simple placement_config.roughness/metalness overrides. Either overrides the GLB's baked material.
    // Clone per instance (never mutate the cached GLB); colour is still set by the recolour effect. A finish
    // with a sheen/clearcoat/anisotropy needs MeshPhysicalMaterial — a GLB usually loads as
    // MeshStandardMaterial (no such lobes), so we upgrade it (copying the standard visual fields, NOT .copy()
    // which mishandles the undefined physical fields on a Standard source). Anisotropy (the silk streak) needs
    // the GLB to carry a TANGENT attribute (baked in the asset pipeline) or it falls back to screen-space and
    // mottles.
    const finish = surface ?? ((roughness != null || metalness != null) ? { roughness, metalness } : null);
    const needsPhysical = !!finish && (finish.sheen != null || finish.clearcoat != null || finish.anisotropy != null);
    if (finish) {
      clone.traverse(obj => {
        if (!obj.isMesh) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        const next = mats.map(m => {
          let nm;
          if (needsPhysical && !m.isMeshPhysicalMaterial) {
            nm = new THREE.MeshPhysicalMaterial();
            THREE.MeshStandardMaterial.prototype.copy.call(nm, m);   // standard visual fields only
          } else {
            nm = m.clone();
          }
          if (finish.roughness != null)          nm.roughness = finish.roughness;
          if (finish.metalness != null)          nm.metalness = finish.metalness;
          if (finish.sheen != null)              nm.sheen = finish.sheen;
          if (finish.sheenRoughness != null)     nm.sheenRoughness = finish.sheenRoughness;
          if (finish.sheenColor != null)         nm.sheenColor = new THREE.Color(finish.sheenColor);
          if (finish.clearcoat != null)          nm.clearcoat = finish.clearcoat;
          if (finish.clearcoatRoughness != null) nm.clearcoatRoughness = finish.clearcoatRoughness;
          if (finish.envMapIntensity != null)    nm.envMapIntensity = finish.envMapIntensity;
          if (finish.anisotropy != null)         nm.anisotropy = finish.anisotropy;
          if (finish.anisotropyRotation != null) nm.anisotropyRotation = finish.anisotropyRotation;
          nm.needsUpdate = true;
          return nm;
        });
        obj.material = Array.isArray(obj.material) ? next : next[0];
      });
    }
    return clone;
  }, [scene, baseRotation, fondant, roughness, metalness, surface]);

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

  const { scale, position, center, depthScaled, seatHalf, halfW, gradBBox } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(clonedScene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const ctr = new THREE.Vector3();
    box.getCenter(ctr);
    const sc = STICKER_SIZE / Math.max(size.x, size.y, size.z, 0.01);
    glbXRadiusCache[imageUrl] = (size.x / 2) * sc;
    // The gradient blends in the model's local frame (same baked geometry the vertex shader reads),
    // so it stays put regardless of placement/instance scale. `halfW`/`seatHalf` are the model's
    // PER-AXIS half-extents (width/height), so the selection hit-plane is a tight rectangle around a
    // non-square model — a tall-narrow bow gets a tall-narrow box, not a STICKER_SIZE square.
    return { scale: sc, position: [-ctr.x * sc, -ctr.y * sc, -ctr.z * sc], center: ctr, depthScaled: size.z * sc,
      seatHalf: (size.y * sc) / 2, halfW: (size.x * sc) / 2,
      gradBBox: { min: box.min.clone(), size: size.clone(), center: ctr.clone() } };
  }, [clonedScene, imageUrl]);

  // Report this model's true half-height (normalized, before the instance scale) so the parent can
  // seat its BOTTOM on the surface instead of lifting by a fixed STICKER_SIZE/2. Default = no float;
  // any lift is explicit (yOffset / config). For an upright model size.y is the max dim, so seatHalf
  // ≈ STICKER_SIZE/2 and nothing changes; a flat model reports a small value and stops floating.
  // A GLB fills its own box (no transparent margin), so its visible vertical extent IS its half-
  // height, symmetric about the origin — the wall clamp then behaves exactly as the old full-square did.
  useEffect(() => { onSeat?.(seatHalf); }, [seatHalf]);

  // On the side wall, bend the model around the tier so it hugs the curve. Seat its BACK on
  // the wall (push out by half its depth) so a deep model — e.g. a topper head — sits proud
  // instead of half-buried in the tier.
  // seatOffset positions the model's depth radially: proud → back on the wall (pokes out a full
  // depth, for deep toppers); flush hug (default) → centred on the wall (back half tucks into the
  // opaque wall, front half against it) so it doesn't stand off the silhouette. Config, not type.
  const bentScene = useMemo(
    () => (bendRadius ? bendStickerScene(clonedScene, scale, center, bendRadius, seatProud ? seatHalfDepth(depthScaled) : 0) : null),
    [clonedScene, scale, center, bendRadius, depthScaled, seatProud],
  );

  // The rendered model's 3D bounds, measured in the LOCAL frame it renders in — a sibling of the
  // element, so the box inherits its position/facing/tilt/scale for free. A BENT model is measured in
  // its bent frame (wraps the wall); a FLAT one is the scaled/centred bbox. Feeds the 3D selection box
  // (so the cue wraps the model from every camera angle, not a flat plane that slides off a curve) and
  // the grip depth. Replaces the old inverted-hull outline (a white BackSide clone) that haloed
  // figurines. `frontZ` = the front-most point, so the resize grips clear a proud model.
  const box3 = useMemo(() => {
    if (bentScene) {
      // Union the meshes' OWN geometry bounds (local frame) — NOT setFromObject, whose world matrices
      // read effScale-scaled coords once the scene is mounted, flip-flopping the box's size per render.
      const b = new THREE.Box3();
      bentScene.traverse(o => { if (o.isMesh && o.geometry) { o.geometry.computeBoundingBox?.(); if (o.geometry.boundingBox) b.union(o.geometry.boundingBox); } });
      if (!b.isEmpty()) {
        const s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
        return { w: s.x, h: s.y, d: s.z, cy: c.y, cz: c.z, frontZ: b.max.z };
      }
    }
    return { w: 2 * halfW, h: 2 * seatHalf, d: depthScaled, cy: 0, cz: 0, frontZ: depthScaled / 2 };
  }, [bentScene, halfW, seatHalf, depthScaled]);
  useEffect(() => { onDepth?.(box3.frontZ); }, [onDepth, box3]);
  useEffect(() => { onVExtent?.({ down: seatHalf, up: seatHalf, halfW, box: box3 }); }, [seatHalf, halfW, box3]);

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

  if (bentScene) return <primitive object={bentScene} />;
  return <primitive object={clonedScene} scale={scale} position={position} />;
}

function StickerFace({ imageUrl, color, groupColors, gradient, clipY, curved, curveRadius, bendRadius, baseRotation, seatProud = false, fondant = false, roughness = null, metalness = null, surface = null, printFinish = null, flipX = false, foldable = false, fold, spine, standUp = false, recolor, relief = null, stickerScale = 1, reliefRadius = null, photoUrl, photoMask, photoTransform, photoOverlay, borderWidth, textSlots = null, textValues = null, onSeat, onDepth, onVExtent }) {
  if (!imageUrl) return null;
  const isGlb = /\.(glb|gltf)(\?|$)/i.test(imageUrl);
  const inner = (
    // While this element's GLB/texture loads, LoadingPing registers it with the shared
    // loading count (it draws nothing); a single canvas overlay shows ONE spinner for the
    // whole page (see loadingRegistry). Suspense clears the ping when the asset resolves
    // (cached assets resolve synchronously → never counted). Type/zone-agnostic.
    <TextureErrorBoundary screen="CakeCanvas">
      <Suspense fallback={<LoadingPing />}>
        {isGlb
          ? <StickerModel imageUrl={imageUrl} color={color} groupColors={groupColors} gradient={gradient} clipY={clipY} bendRadius={bendRadius} baseRotation={baseRotation} seatProud={seatProud} fondant={fondant} roughness={roughness} metalness={metalness} surface={surface} onSeat={onSeat} onDepth={onDepth} onVExtent={onVExtent} />
          : <StickerTexture imageUrl={imageUrl} curved={curved} curveRadius={curveRadius} foldable={foldable} fold={fold} spine={spine} standUp={standUp} recolor={recolor} relief={relief} stickerScale={stickerScale} reliefRadius={reliefRadius} color={color} groupColors={groupColors} roughness={roughness} metalness={metalness} printFinish={printFinish} photoUrl={photoUrl} photoMask={photoMask} photoTransform={photoTransform} photoOverlay={photoOverlay} borderWidth={borderWidth} textSlots={textSlots} textValues={textValues} onSeat={onSeat} onDepth={onDepth} onVExtent={onVExtent} />
        }
      </Suspense>
    </TextureErrorBoundary>
  );
  // Mirror across the vertical axis about the model's own centre (StickerModel/StickerTexture
  // both centre their content at the origin). THREE flips winding for the negative determinant,
  // so faces/lighting stay correct. Selection box is a sibling, so it isn't mirrored.
  return flipX ? <group scale={[-1, 1, 1]}>{inner}</group> : inner;
}


// `canMove` defaults TRUE. Every decoration on every cake moves today, so a capability that arrived
// defaulting to false would freeze the lot — and the caller derives it from the ELEMENT, never from
// the sticker's own allowedActions, which carries a stale `move: false` on everything placed before
// the flag was wired. See isStickerMovable in CakeDesigner.
//
// Gated in the MOVE handler rather than at pointer-down on purpose: selection, long-press, the
// toolbar and orbit-blocking all still behave exactly as before. A pinned decoration can still be
// picked up, looked at and edited — it just does not go anywhere.
function DraggableSideSticker({ sticker, radius, baseY, height, shp = { kind: 'round', radius }, reliefSampler = null, pipingBands = [], selected, onSelect, onLongPress, onMove, onGroupMove, onMoveMany, moveSet, allStickers, onOrbitEnable, toolbar, resize = null, canMove = true }) {
  const { camera, gl } = useThree();
  const didDrag           = useRef(false);
  const startPos          = useRef({ x: 0, y: 0 });
  const startHit          = useRef(null);
  const startSticker      = useRef(null);
  const groupStart        = useRef(null);
  const pointerDownTime   = useRef(0);
  const pressedRef        = useRef(false);
  // How far the element stands proud of its hit plane, reported up by StickerFace — the selection
  // border clears this so a deep GLB or a raised relief doesn't swallow it.
  const [depth, setDepth] = useState(0);
  // The element's VISIBLE vertical extent (below/above centre), reported up by StickerFace. The wall
  // clamp uses this so a banner is stopped by its flags, not by its transparent square. Null until
  // measured → the clamp falls back to the full square.
  const [vext, setVext] = useState(null);

  // A round wall wraps a cylinder (theta); every faceted wall — rect AND any outline (heart,
  // butterfly, number, …) — seats on the perimeter at fraction u. Branch on this, never on
  // `=== 'rect'`, or an outline decal lands on an imaginary bounding-radius circle off the wall.
  const facetWall = !isRoundWall(shp);
  const isGlb = /\.(glb|gltf)(\?|$)/i.test(sticker.imageUrl ?? '');
  // Insert on the side is a MODIFIER on the wall pose (not its own mode): the base is pushed INTO the
  // wall (a negative radial seat) so the piece pokes out at an angle (the tilt is already applied by
  // the sticker.tiltAngle group below). Signalled by insertDepth != null (0 is valid = flush). Best
  // for a GLB bar oriented to extend along its outward face.
  const isInsert = sticker.insertDepth != null;
  const insertDepthFrac = sticker.insertDepth ?? DEFAULT_INSERT_DEPTH;
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
  // Base seat = a gap off the BASE wall PROPORTIONAL to this tier's live radius, so the decal hugs
  // identically on every cake size (INVARIANTS.md #8 — an absolute gap is a bigger slot the smaller
  // the tier). The drag hit-test (below) projects onto this base cylinder; the visible position adds
  // the live surface relief so the decor rests on the displaced wall.
  // The decal's VISIBLE content band on the wall: sticker.y is its CENTRE, content reaches `down`
  // below / `up` above (scaled). Until measured, fall back to the full square (old behaviour).
  const down = (vext ? vext.down : STICKER_SIZE / 2) * effScale;
  const up   = (vext ? vext.up   : STICKER_SIZE / 2) * effScale;
  const clampWallY = y => wallClampY(y, baseY, height, down, up);
  const posY = clampWallY(sticker.y);
  // Auto cream-clearance: a PROUD solid (bow, topper) whose band overlaps an existing side piping
  // band would interpenetrate it — the band projects off the wall too. Re-seat the decoration's back
  // onto the deepest overlapping band's OUTER face (measured, config-driven off sideProud; the manual
  // Depth nudge still stacks on top). Flat/flush decals and bare walls get 0 → unchanged.
  const pipingClear = (sticker.sideProud === true)
    ? sidePipingClearance({ bands: pipingBands ?? [], yBottom: posY - down, yTop: posY + up })
    : 0;
  // `radialOffset` is the customer's "Depth" nudge — still an absolute world value on top (see #8 TODO).
  // Insert sinks the base into the wall by `depth` of its size (fraction of the live sticker size — #8).
  const insertSink = isInsert ? insertDepthFrac * STICKER_SIZE * effScale : 0;
  const off    = sideSeatOffset(radius) + pipingClear + (sticker.radialOffset ?? 0) - insertSink;
  // Round: angle theta around the cylinder, decal curved to the wall. Faceted wall (rect/heart/…):
  // perimeter fraction u, decal flat against the local facet (the outward normal it faces).
  let cx, cz, yaw, curveRadius;
  if (facetWall) {
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
  const bendRadius = (isGlb && !facetWall && curveRadius)
    ? curveRadius / (effScale || 1)
    : undefined;


  // Same box rule as the top sticker, from the one helper. A wall element is never base-seated
  // (wallClampY already keeps its whole square on the wall). A GLB narrows the box to its measured
  // dense footprint (tight, non-square); a 2D decal keeps the full square (INVARIANTS #5a).
  const glbFoot = isGlb && vext?.halfW != null;
  const hitBox = seatedHitBox({ size: STICKER_SIZE, ...(glbFoot ? { halfW: vext.halfW, halfH: vext.up } : {}) });
  // The border sits at the model's MID-depth, not its proud front face: a deep GLB (a bent/proud bow)
  // otherwise floats the flat border ~a full depth off the wall, so orbiting the cake slides it off
  // the decoration. Half-depth keeps the border on the body while still clearing most of it.
  const boxZ = isGlb ? depth * 0.5 : depth;

  return (
    <group
      position={[cx, posY, cz]}
      rotation={[0, yaw, 0]}
      scale={effScale}
    >
      {/* Both lean axes. X leans the pick up (+) or down (−) along the cake side; Z rolls it in the
          PLANE of the wall, which is how a jersey ends up sitting diagonally — the one thing the wall
          had no control for at all. One Euler, so a combined lean is a single predictable rotation. */}
      <group rotation={[sticker.tiltAngle ?? 0, 0, sticker.rollAngle ?? 0]}>
      <StickerFace imageUrl={sticker.imageUrl} color={sticker.color} groupColors={sticker.groupColors} gradient={sticker.gradient} curved={!isGlb && !facetWall} curveRadius={curveRadius} bendRadius={bendRadius} baseRotation={sticker.baseRotation} seatProud={sticker.sideProud === true} fondant={sticker.useSharedFondantTexture} roughness={sticker.roughness} metalness={sticker.metalness} surface={sticker.surface} printFinish={sticker.printFinish} flipX={sticker.flipX} foldable={sticker.foldable} fold={sticker.fold} spine={sticker.spine} recolor={sticker.recolor} relief={sticker.relief} stickerScale={effScale} reliefRadius={curveRadius} photoUrl={sticker.photoUrl} photoMask={sticker.photoMask} photoTransform={sticker.photoTransform} photoOverlay={sticker.photoOverlay} borderWidth={sticker.borderWidth} textSlots={sticker.textSlots} textValues={sticker.textValues} onDepth={setDepth} onVExtent={setVext} />
      {/* Selection cue: a border tracing this element's HIT PLANE (the square below) — the region
          that actually intercepts pointer events, transparent margin included. That is what tells a
          customer why the decoration underneath won't respond. Corner grips resize it, through the
          same bounds the edit popup's SizeDial uses (capability-gated on allowed_actions.resize). */}
      {selected && (glbFoot && vext?.box
        ? <SelectionBox width={vext.box.w} height={vext.box.h} centerY={vext.box.cy} depth={vext.box.d} centerZ={vext.box.cz} />
        : <SelectionBox width={hitBox.width} height={hitBox.height} centerY={hitBox.centerY} z={boxZ} />)}
      {selected && resize && sticker.allowedActions?.resize !== false && (() => {
        const c = resize.controlFor(sticker);
        return c ? (
          <ResizeHandles width={hitBox.width} height={hitBox.height} centerY={hitBox.centerY} z={boxZ}
            value={c.value} bounds={c} onOrbitEnable={onOrbitEnable}
            onResize={v => resize.onResize(sticker, v)} />
        ) : null;
      })()}
      {selected && toolbar && (
        <Html position={[0, STICKER_SIZE / 2 + 0.18, 0.02]} center zIndexRange={[200, 0]}>
          {toolbar}
        </Html>
      )}
      <mesh
        userData={{ isStickerHitPlane: true }}
        position={[0, hitBox.centerY, 0.001]}
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
          startHit.current     = facetWall
            ? boxHit(pointerRay(e, gl.domElement, camera), shp.halfW, shp.halfD)
            : cylinderHit(pointerRay(e, gl.domElement, camera), radius + off);
          startSticker.current = { theta: sticker.theta, y: sticker.y };

          if (!facetWall && moveSet && moveSet.length > 1) {
            const setIds = new Set(moveSet);
            groupStart.current = {};
            allStickers.forEach(s => { if (setIds.has(s.id)) groupStart.current[s.id] = { theta: s.theta, y: s.y }; });
          } else if (!facetWall && sticker.groupId) {
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
            if (facetWall) {
              // Faceted wall (rect/heart/…): the sticker centre follows the cursor's perimeter point.
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
        <planeGeometry args={[hitBox.width, hitBox.height]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      </group>
    </group>
  );
}

/* `hole` — a shape to keep OUT of, or null. Only the board passes one: its usable area is a ring,
 * the board's footprint minus the cake's. Everything else on a flat surface clamps to a solid shape.
 * A decoration dragged into the hole would walk under an opaque cake and be lost with nothing to
 * grab, so the clamp pushes it back out. See boardRingClamp. */
function DraggableTopSticker({ sticker, topY, topRadius = Infinity, shp = { kind: 'round', radius: topRadius }, hole = null, selected, onSelect, onLongPress, onMove, onGroupMove, onMoveMany, moveSet, allStickers, onOrbitEnable, toolbar, resize = null, canMove = true }) {
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
  // Insert is a MODIFIER on an upright pose (usually `stand`), not its own mode: the base is sunk
  // BELOW the top surface by its burial depth (see py) while the model stays upright + world-oriented
  // like a stand/verge. Signalled by insertDepth != null (0 is valid = flush). Because the pose is
  // `stand`, isStand is true and the upright render branch below already fires — insert just adds the
  // burial/lean inside it (this is what unbroke "chocolate bar sleeps on top": insert was a sibling
  // mode the upright branch didn't cover, so it fell to Flat mode; now it composes WITH stand).
  const isInsert = sticker.insertDepth != null;
  const insertDepthFrac = sticker.insertDepth ?? DEFAULT_INSERT_DEPTH;
  const isGlb2d = /\.(glb|gltf)(\?|$)/i.test(sticker.imageUrl ?? '');
  // Seat the model's actual BOTTOM on the surface: lift by its measured half-height (reported by
  // StickerModel once the GLB loads), not a fixed STICKER_SIZE/2. Default = rests on the surface;
  // float is opt-in via yOffset (the Height control) / config. Fallback to the constant pre-measure.
  const [seatHalf, setSeatHalf] = useState(null);
  // A GLB also reports its dense footprint half-WIDTH so the box narrows to a non-square model.
  const [glbHalfW, setGlbHalfW] = useState(null);
  const [glbBox, setGlbBox] = useState(null);   // rendered 3D bounds → 3D selection box
  // How far the element stands proud of its hit plane (see DraggableSideSticker).
  const [depth, setDepth] = useState(0);
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
    // Insert: base seated BELOW the top by `depth` of its length (2·depth·half-height), so the buried
    // part sits inside the (opaque) cake and the rest stands out. depth 0 == rest on top like stand.
    isInsert ? (seatHalf ?? STICKER_SIZE / 2) * effScale * (1 - 2 * insertDepthFrac) + FLAT_STICKER_Y_OFFSET
    : standSeat ? (seatHalf ?? STICKER_SIZE / 2) * effScale + FLAT_STICKER_Y_OFFSET
    : (isPerch || isVerge) ? 0   // centre at the rim edge height — perch straddles, centre-seat verge's mid-spine on the lip
    : FLAT_STICKER_Y_OFFSET);

  // The clickable/drawn box. A base-seated element's plane stops at its seat, so the empty strip
  // below its artwork is neither drawn nor clickable — it would otherwise hang inside the cake and,
  // being billboarded toward the camera, win the raycast against the tier behind it.
  const glbFoot = isGlb2d && glbHalfW != null;
  const hitBox = seatedHitBox({ standSeat, seatHalf, size: STICKER_SIZE, ...(glbFoot ? { halfW: glbHalfW, halfH: seatHalf } : {}) });

  // Shared children: face + toolbar Html + invisible hit mesh
  const innerContent = (e_onDown) => (
    <>
      <StickerFace imageUrl={sticker.imageUrl} color={sticker.color} groupColors={sticker.groupColors} gradient={sticker.gradient} clipY={(isStand || isPerch || isVerge || isInsert) ? undefined : py} baseRotation={sticker.baseRotation} fondant={sticker.useSharedFondantTexture} roughness={sticker.roughness} metalness={sticker.metalness} surface={sticker.surface} printFinish={sticker.printFinish} flipX={sticker.flipX} foldable={sticker.foldable} fold={sticker.fold} spine={sticker.spine} standUp={(isStand || isPerch || isVerge) && sticker.foldable === true} recolor={sticker.recolor} relief={sticker.relief} stickerScale={effScale} reliefRadius={topRadius} photoUrl={sticker.photoUrl} photoMask={sticker.photoMask} photoTransform={sticker.photoTransform} photoOverlay={sticker.photoOverlay} borderWidth={sticker.borderWidth} textSlots={sticker.textSlots} textValues={sticker.textValues} onSeat={setSeatHalf} onVExtent={v => { setGlbHalfW(v?.halfW ?? null); setGlbBox(v?.box ?? null); }} onDepth={setDepth} />

      {/* Selection cue: a border tracing this element's HIT PLANE (the square below) — the region
          that actually intercepts pointer events, transparent margin included. That is what tells a
          customer why the decoration underneath won't respond. Corner grips resize it, through the
          same bounds the edit popup's SizeDial uses (capability-gated on allowed_actions.resize). */}
      {selected && (glbFoot && glbBox
        ? <SelectionBox width={glbBox.w} height={glbBox.h} centerY={glbBox.cy} depth={glbBox.d} centerZ={glbBox.cz} />
        : <SelectionBox width={hitBox.width} height={hitBox.height} centerY={hitBox.centerY} z={depth} />)}
      {selected && resize && sticker.allowedActions?.resize !== false && (() => {
        const c = resize.controlFor(sticker);
        return c ? (
          <ResizeHandles width={hitBox.width} height={hitBox.height} centerY={hitBox.centerY} z={depth}
            value={c.value} bounds={c} onOrbitEnable={onOrbitEnable}
            onResize={v => resize.onResize(sticker, v)} />
        ) : null;
      })()}
      {selected && toolbar && (
        <Html position={[0, STICKER_SIZE / 2 + 0.18, 0.02]} center zIndexRange={[200, 0]}>
          {toolbar}
        </Html>
      )}
      <mesh userData={{ isStickerHitPlane: true }} position={[0, hitBox.centerY, 0.001]}
        onPointerEnter={e => { e.stopPropagation(); onOrbitEnable(false); }}
        onPointerLeave={e => { e.stopPropagation(); if (!pressedRef.current) onOrbitEnable(true); }}
        onPointerDown={e_onDown} onClick={e => e.stopPropagation()}>
        <planeGeometry args={[hitBox.width, hitBox.height]} />
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
      if (!canMove) return;                           // pinned — allowed_actions.move === false
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
          const clampPt = (x, z) => isEdgeMode ? snapToRim(shp, x, z)
            : hole ? boardRingClamp(shp, hole, x, z, edgeMargin)
            : topClampInset(shp, x, z, edgeMargin);
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
  // `isInsert` is a MODIFIER — normally it rides `stand` (so isStand already selects this branch), but
  // it's OR'd in so any inserted element renders upright (buried base) and never falls to Flat mode.
  if (isStand || isPerch || isVerge || isInsert) {
    // Billboard must be INSIDE the world-positioned group, not wrapping it.
    // If Billboard wraps the position group, it sits at origin and rotates its
    // local frame — so any x/z offset becomes wrong world-space position.
    // Lean/tilt must pivot about the BASE (the contact point), not the geometry centre — otherwise
    // leaning swings the base up off the cake. Translate down to the base, rotate, translate back
    // (cancels when untilted; no-op for perch where seatLift = 0).
    // Base-pivot the tilt for stand-seated modes AND insert (an inserted bar leans about its buried
    // base, so the exposed part swings and the base stays put).
    const seatLift = (standSeat || isInsert) ? (seatHalf ?? STICKER_SIZE / 2) : 0;
    // Verge auto-orients radially OUTWARD: yaw so the element's local +Z points away from the cake
    // centre (re-derived from its x/z, so it reorients as it's dragged round the rim — round cakes
    // exactly, rect approximated as radial-from-centre), then the tilt tips its top toward that
    // outward +Z (+angle = lean over the edge). Stand/perch keep the caller's Y-spin and lean on −X.
    // Insert keeps just its own Y-spin (the baked per-instance fan) — no radial auto-face.
    const radialYaw = isVerge ? Math.atan2(sticker.x ?? 0, sticker.z ?? 0) : 0;
    const yaw   = radialYaw + (sticker.rotation ?? 0);
    const tiltX = (isVerge || isInsert) ? (sticker.tiltAngle ?? 0) : -(sticker.tiltAngle ?? 0);
    // Left/right lean. It rides INSIDE the base-pivot groups below with tiltX, deliberately: the
    // pivot translates down by seatLift, rotates, translates back, so the element leans about the
    // point where it touches the cake. Rolled outside that, a leaning figure swings a foot into the
    // air. Billboarding does not interfere — it is locked to Y only, so an inner lean survives it.
    const rollZ = sticker.rollAngle ?? 0;
    const inner = (
      <group rotation={[0, yaw, 0]}>
        <group position={[0, -seatLift, 0]}>
          <group rotation={[tiltX, 0, rollZ]}>
            <group position={[0, seatLift, 0]}>
              {innerContent(onDown)}
            </group>
          </group>
        </group>
      </group>
    );
    return (
      <group position={[sticker.x, py, sticker.z]} scale={effScale}>
        {(isGlb2d || isVerge || isInsert) ? inner : <Billboard lockX={true} lockY={false} lockZ={true}>{inner}</Billboard>}
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
// round → radius; every other shape (rect, number, outline) → halfD (outlines fill [-1,1]², so
// the front-most point — a heart's tip — sits at halfD). The label sits a fixed gap beyond that edge.
function FrontMarker({ frontZ }) {
  return (
    <Text
      font={textFont}          // SEC-WEB-7 — bundled; omitting it re-introduces the jsdelivr fetch
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

// Live spin-paint target for the second cream layer: an invisible cylinder around the
// active tier. Dragging writes the layer's torn edge at the hit angle/height; with
// auto-rotate on, a useFrame re-samples each frame so a held pointer "scrapes" the edge
// all the way around as the cake turns. The angle convention matches the band geometry
// (a = atan2(z, x)), so the painted edge lands exactly where the pointer is. Orbit-rotate
// is suspended over it (CakeScene's capture-phase handler) while auto-rotate keeps spinning.
function CreamPaintTarget({ tier, onPaint }) {
  const { camera, gl } = useThree();
  const pressed = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const R = tier.radius + 0.04;   // hit just outside the proud band

  const sample = (clientX, clientY) => {
    const p = cylinderHitPoint(buildRay(clientX, clientY, gl.domElement, camera), R);
    if (!p) return;
    let a = Math.atan2(p.z, p.x); if (a < 0) a += Math.PI * 2;
    const frac = Math.max(0, Math.min(1, (p.y - tier.baseY) / tier.height));
    onPaint(a / (Math.PI * 2), frac);
  };

  useFrame(() => { if (pressed.current) sample(last.current.x, last.current.y); });
  // Window pointerup guarantees release even if the up lands off the mesh (capture/auto-rotate).
  useEffect(() => {
    const onUp = () => { pressed.current = false; };
    window.addEventListener('pointerup', onUp);
    return () => window.removeEventListener('pointerup', onUp);
  }, []);

  return (
    <mesh position={[0, tier.baseY + tier.height / 2, 0]} userData={{ isCreamPaint: true }}
      onPointerDown={e => {
        e.stopPropagation();
        pressed.current = true; last.current = { x: e.clientX, y: e.clientY };
        try { gl.domElement.setPointerCapture(e.pointerId); } catch (_) {}
        sample(e.clientX, e.clientY);
      }}
      onPointerMove={e => { if (pressed.current) { last.current = { x: e.clientX, y: e.clientY }; sample(e.clientX, e.clientY); } }}
      onPointerUp={e => { pressed.current = false; try { gl.domElement.releasePointerCapture(e.pointerId); } catch (_) {} }}>
      <cylinderGeometry args={[R, R, tier.height, 64, 1, true]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function CakeScene({
  /* Non-null while the reel panel is open: the hex the baker picked as the reel's ground.
   *
   * It paints the SKY AND THE FLOOR THE SAME COLOUR, which is the whole point. Left as two colours
   * the 30×30 floor plane ends inside a portrait frame and draws a hard diagonal horizon across the
   * top of every reel — and worse, picking a dark ground gave a dark sky over a near-white floor,
   * so the two dark swatches were unusable. One colour edge to edge is a cyclorama: no seam, and the
   * cake's own shadow is the only thing telling you there is a floor at all.
   *
   * It also doubles as "we are filming", which is why the front marker keys off it. */
  filmGround = null,
  // Photo only: no sky, no floor — the cake on nothing. See the two uses below.
  filmCutout = false,
  // Photo only: frame the cake that is there, not the headroom a topper might want.
  filmTight = false,
  config, selectedTier, onTierClick, onDeselect,
  selectedTextId, onTextSelect, onTextMove, onTextContentChange, textToolbar,
  selectedAgeId, onAgeSelect, onAgeMove,
  orbitRef,
  selectedPiping, highlightPipingId, onTopPipingSelect, onBottomPipingSelect,
  pipingTarget, onPipingStyleSelect, onPipingCancel, pipingStyles,
  pipingToolbar,
  // Drag a single-mode piping piece round its ring: (tierIndex, zone, layerId, index, angle) => void.
  // Same capability contract as isStickerMovable below, read off the piping LAYER (layer.id is the
  // element id) rather than the sticker.
  onPipingInstanceMove = null,
  isPipingMovable = () => true,
  selectedStickerIds, onStickerSelect, onStickerLongPress, onStickerMove, onGroupMove, onMoveMany, stickerToolbar,
  // Is THIS decoration allowed to be dragged? A function rather than a flag on the sticker, because
  // the answer comes from the ELEMENT (admin master data), and the sticker's own allowedActions
  // carries a stale `move: false` on everything placed before the capability was wired. Reading the
  // catalogue also means an admin unticking Movable takes effect on decorations already on cakes,
  // not only on the next one placed — which is what a capability flag ought to mean.
  //
  // Defaults to movable when the host does not supply it: this component is used by previews and
  // the thumbnail scene, and none of them should invent a restriction.
  isStickerMovable = () => true,
  // { controlFor(sticker) -> {value,min,max,step}, onResize(sticker, value) } — the ONE size path,
  // shared with the edit popup's SizeDial (see placement.js stickerSizeControl). Absent = no grips.
  stickerResize = null,
  onWritingClick, onWritingMove, selectedWritingId = null,
  penDrawMode = false, penStyle, onAddStroke,
  grassMode = false, grassSelected = null, onGrassMove, onGrassSelect,
  blocksMode = false, blocksSelected = null, onBlockMove, onBlockSelect,
  selectedGenerated = null,   // { kind: 'cloud'|'rainbow', id } — which one wears the selection box
  dustMode = false, dustSelected = null, onDustMove, onDustSelect,
  foilMode = false, foilSelected = null, onFoilMove, onFoilSelect,
  creamPaint = null, onCreamPaint,
  tierDataRef,
}) {
  // Only what the EDITING surface itself draws (handles, catchers) is read here — everything that is
  // part of the cake is read by CakeContent, from the same config.
  const { boardGrass = null, nameBlocks = null } = config;
  // A decoration selects via native pointerup + pointer capture, which breaks its r3f `stopPropagation`
  // — so the r3f `click` still leaks to the tier/board underneath and toggles the cake's selection off,
  // wiping the decoration you just picked (needs a second click). We already know at pointer-down (the
  // capture raycast below) whether the gesture is on a decoration/grip; record it so the tier and
  // background click handlers ignore a click that a decoration owns. No per-type logic.
  const gestureOnStickerRef = useRef(false);
  // What FitCakeToView measures: the cake, and only the cake.
  const cakeGroupRef = useRef();
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
      // A resize grip sits proud of (and often beyond) the flat hit plane, so pressing one may NOT
      // hit `isStickerHitPlane`. Without this, orbit stays enabled and OrbitControls' bubble listener
      // starts a rotate before the grip's `beginResize` (also bubble) can suspend it — capture beats
      // bubble, so the gate itself must recognise the grip. Dragging a grip resizes, never rotates.
      const overGrip = hits.some(h => h.object.userData.isResizeGrip);
      // A single-mode piping piece: pressing it drags it round its ring, so orbit must stand down for
      // the same reason a decoration does. Only tagged when the ring is actually draggable, so a
      // normal ring still rotates the cake when you press it.
      const overPiping = hits.some(h => h.object.userData.isPipingHandle);
      // Cream-pen catchers (present only in draw mode): pressing on the cake draws, so
      // suspend rotate; pressing empty space still rotates.
      const overPen = hits.some(h => h.object.userData.isPenCatcher);
      // Dragging a finish handle (luster-dust splash / gold-leaf flake) must not rotate the cake.
      const overDust = hits.some(h => h.object.userData.isDustHandle || h.object.userData.isFoilHandle
        || h.object.userData.isGrassHandle || h.object.userData.isBlockHandle);
      // Painting the second-cream edge suspends ROTATE only (so the drag paints), but
      // leaves controls enabled so auto-rotate keeps spinning the cake under the pointer.
      const overCream = hits.some(h => h.object.userData.isCreamPaint);
      // This gesture belongs to a decoration/grip → the tier & background click handlers must ignore
      // the click it leaks (see gestureOnStickerRef). Set fresh every pointer-down.
      gestureOnStickerRef.current = overSticker || overGrip;
      if (orbitRef.current) {
        orbitRef.current.enabled = !overSticker && !overPen && !overDust && !overGrip && !overPiping;
        orbitRef.current.enableRotate = !overCream;
      }
    }
    canvas.addEventListener('pointerdown', onCaptureDown, { capture: true });
    return () => canvas.removeEventListener('pointerdown', onCaptureDown, { capture: true });
  }, [gl, camera, scene]);

  // Where the cake stands, resolved ONCE and handed to CakeContent — so the board this scene draws is
  // the same board the cake's own contents are placed against (see resolveCakeScene).
  const cakeScene = resolveCakeScene(config);
  const { tierData, bottomShp, board } = cakeScene;
  tierDataRef.current = tierData;

  return (
    <>
      <SceneLights shadows />
      {/* ⚠️ NOT `{!filmCutout && <color attach="background" …/>}`. That was the first version and it
          does not work: R3F's attach does NOT put the old value back when the element unmounts, so
          the scene kept the last ground it was given and a "cutout" rendered a solid grey rectangle
          with every pixel at alpha 255. The build was clean, the prop arrived as `true`, and the
          only way to see it was to read scene.background out of a running page.
          Absence has to be a VALUE somebody sets, so one component owns the background outright. */}
      <SceneBackground colour={filmCutout ? null : (filmGround || DESIGNER_GROUND)} />
      <SceneEnv />

      {/* ⚠️ The floor goes with the sky. A cutout with the floor still in shot is a cake sitting on
          a grey slab on a transparent background, which is not a cutout — it is a worse photo than
          the one with a proper ground. The contact shadow goes too, and that is the honest cost:
          nothing for it to fall on. */}
      {!filmCutout && <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow
        onClick={e => { e.stopPropagation(); if (!gestureOnStickerRef.current) onDeselect(); }}>
        {/* ⚠️ MUCH bigger while filming, and not for the reason it looks like.
            Matching the floor's colour to the sky's is not enough to hide the join: the floor is a
            lit standard material and the background is a flat clear colour, so the two render
            differently however equal their hex. The 30×30 plane's far edge landed inside a portrait
            frame and drew a hard diagonal across the top of every reel.
            Pushing the edge far past the frame turns the floor into a cyclorama — it fills the shot
            edge to edge and the only thing left telling you there is a floor at all is the cake's
            own shadow, which is exactly what a photographer would want. Two triangles either way. */}
        <planeGeometry args={filmGround ? [400, 400] : [30, 30]} />
        {/* Was #fce8d5 — warm, saturated, and almost exactly the same LIGHTNESS as an ivory cake, so
            a white cake had nothing to separate from and read as flat. The fix is a wider value gap,
            and the direction came from the TEMPLATE THUMBNAILS: they flatten onto white and the same
            cake reads perfectly there, because an ivory cake against near-white becomes the darker,
            more saturated object.
            So lighter and much less saturated, rather than darker. It also closes a gap that existed
            anyway — the studio and the thumbnail looked like two different products.
            ⚠️ Check a DARK cake (chocolate, navy) before calling this done: white-on-warm was simply
            the first failure to show up, and a fix at one end can break the other. */}
        {/* ⚠️ A SHADOW CATCHER WHILE FILMING, not a painted floor.
            A lit plane and a flat sky never match, however carefully their hex values agree — the
            plane is shaded and the background is not — so every take had a faint horizon across it.
            The reel's 9:16 crop usually kept it out of shot; a 4:3 photo cannot. shadowMaterial
            renders NOTHING except where a shadow falls, so floor and sky are literally the same
            pixels and there is no join to see, while the cake keeps the contact shadow that stops it
            floating. Off-camera the floor is still a real surface — it is what a click lands on to
            deselect, and it is not trying to disappear. */}
        {filmGround
          /* 0.30. At 0.16 the shadow was invisible and I nearly concluded nothing was casting one
             — the probe had been sampling BELOW the board, and the key light sits at [6,14,8] so the
             shadow falls to its LEFT. Measure where the light puts it, not where you expect it. */
          ? <shadowMaterial opacity={0.30} />
          : <meshStandardMaterial color="#faf7f4" roughness={0.85} />}
      </mesh>}

      {/* The front marker sits on the CAKE's front edge (not the board): rect → its depth, a number → its
          own half-depth, round → its radius. */}
      {/* ⚠️ Not while filming. It is an editing aid — it tells the baker which way the cake faces
          while they work — and it was being burned into finished reels, where it reads as a stray
          watermark nobody can explain. */}
      {bottomShp && !filmGround
        && <FrontMarker frontZ={isRoundWall(bottomShp) ? bottomShp.radius : bottomShp.halfD} />}

      {/* THE CAKE. Every element the design contains is drawn by CakeContent — the same component the
          off-screen capture and the read-only previews render, so what a customer sees and what the
          saved thumbnail shows are the same cake by construction. Everything BELOW this point is
          editing furniture: handles, catchers, pickers, present only while the cake is being worked on. */}
      {/* Wrapped so the camera can MEASURE it (FitCakeToView). The group holds the cake and nothing
          else — the floor is a 30x30 plane and the handles float above it, and either inside this
          group would swamp the bounds and frame the room instead of the cake. */}
      <group ref={cakeGroupRef}>
      <CakeContent
        config={config}
        scene={cakeScene}
        edit={{
          orbitRef, gestureOnStickerRef,
          selectedTier, onTierClick, onDeselect,
          selectedPiping, highlightPipingId, onTopPipingSelect, onBottomPipingSelect, pipingToolbar,
          onPipingInstanceMove, isPipingMovable,
          selectedTextId, onTextSelect, onTextMove, onTextContentChange, textToolbar,
          selectedAgeId, onAgeSelect, onAgeMove,
          selectedStickerIds, onStickerSelect, onStickerLongPress, onStickerMove, onGroupMove, onMoveMany,
          stickerToolbar, stickerResize, isStickerMovable,
          onWritingClick, onWritingMove, selectedWritingId,
          penDrawMode, penStyle, onAddStroke,
          // In `edit`, not a prop of CakeContent. The tier loop that draws the box lives in the
          // SHARED renderer — the one the thumbnail also uses (INVARIANTS #2) — and a selection cue
          // must never reach a captured picture. `edit` is null on that path, so it cannot.
          selectedGenerated, onCloudClick, onRainbowClick, onCloudMove, onRainbowMove,
        }}
      />
      </group>
      <FitCakeToView groupRef={cakeGroupRef} orbitRef={orbitRef} reserveTop={!filmTight} />

      {creamPaint && tierData[creamPaint.tierIndex] && (
        <CreamPaintTarget
          tier={tierData[creamPaint.tierIndex]}
          onPaint={(theta01, frac) => onCreamPaint?.(creamPaint.tierIndex, creamPaint.layerId, theta01, frac)}
        />
      )}

      {/* …and are dragged by the very same handles as grass clumps: a point on a surface, grabbed
          across its whole body. `r` is half a block, so you grab the cube itself rather than hunting
          a dot; `lift` clears the block's height so the marker is never inside what it marks. */}
      {blocksMode && nameBlocks?.blocks?.length > 0 && (
        <FinishHandles
          tierData={tierData}
          getPoints={t => (nameBlocks.zone === 'top' && t === tierData[tierData.length - 1]
            ? nameBlocks.blocks.map(b => ({ ...b, surface: 'top_surface', r: (nameBlocks.size ?? 0.3) * 0.6 }))
            : null)}
          board={board}
          boardPoints={nameBlocks.zone === 'board'
            ? nameBlocks.blocks.map(b => ({ ...b, r: (nameBlocks.size ?? 0.3) * 0.6 }))
            : null}
          selected={blocksSelected} onMove={onBlockMove} onSelect={onBlockSelect}
          catcherFlag="isBlockCatcher" handleFlag="isBlockHandle"
          lift={(nameBlocks.size ?? 0.3) + 0.06}
          color="#ffffff" selColor="#1a1a1a" dotScale={1.5} showMarker />
      )}



      {/* Grass CLUMPS are dragged with the same machinery as dust and foil — a placed mark on a
          surface, moved by its handle. showMarker is on because a clump the size of a thumbnail is
          easy to lose against a field of grass, and the dot is only present while the card is open. */}
      {grassMode && <FinishHandles tierData={tierData}
        getPoints={t => (t.grass?.patches?.length ? t.grass.patches.map(p => ({ ...p, surface: 'top_surface' })) : null)}
        board={board} boardPoints={boardGrass?.patches ?? null}
        selected={grassSelected} onMove={onGrassMove} onSelect={onGrassSelect}
        catcherFlag="isGrassCatcher" handleFlag="isGrassHandle"
        // Float the handles clear of the tallest grass on the cake, so a marker is never buried
        // inside the clump it marks. One number for both surfaces — a handle floating slightly high
        // over the shorter one is unnoticeable; a handle inside a mound is the whole bug.
        lift={grassHandleLift(tierData, boardGrass)}
        // White and near-black: both read against green. The usual selColor is a dark GREEN,
        // which would be the one colour invisible against the thing it marks.
        color="#ffffff" selColor="#1a1a1a" dotScale={1.6} showMarker />}

      {dustMode && <FinishHandles tierData={tierData} getPoints={t => t.dusting?.splashes} selected={dustSelected}
        onMove={onDustMove} onSelect={onDustSelect} catcherFlag="isDustCatcher" handleFlag="isDustHandle" />}
      {foilMode && <FinishHandles tierData={tierData} getPoints={t => t.foil?.flakes} selected={foilSelected}
        onMove={onFoilMove} onSelect={onFoilSelect} catcherFlag="isFoilCatcher" handleFlag="isFoilHandle"
        color="#f0d878" selColor="#3D5A44" />}{/* no marker dot — default; grab the shard directly */}

      {pipingTarget && (
        <CreamStylePicker styles={pipingStyles} onSelect={onPipingStyleSelect} onCancel={onPipingCancel} />
      )}
    </>
  );
}

// A missing callback means "this surface does not edit", not a crash — see CakeContent's `edit`.
const NOOP = () => {};

// ── Everything a design contains ────────────────────────────────────────────────────────────────
// The ONE renderer for a cake's CONTENTS (INVARIANTS #2), shared by the live editor, by the off-screen
// capture behind template thumbnails and order snapshots, and by every read-only preview.
//
// It exists because the capture used to be a SECOND, hand-copied scene. It drew tiers and decorations
// and silently skipped everything added to the cake after it was written — piped grass, fondant letter
// blocks, second-cream layers, 3D text. A saved template's picture then showed a DIFFERENT cake from
// the one on screen, and nothing failed to say so: the football template came back with a bald top.
// A new element type now lands here once, and every surface that shows a cake gets it.
//
// `edit` carries the whole interactive surface — selection, drag callbacks, toolbars — and is OPTIONAL.
// Without it every element renders static, which is exactly what a capture and a preview want, so no
// element renderer has to know which surface it is being drawn on. What `edit` does NOT cover is the
// editing FURNITURE (drag handles, catchers, pickers): that is not part of the cake, so it stays in
// CakeScene and never risks being photographed. Nor is the ROOM — the floor and the studio background
// are where a cake is SHOWN, not what it is. The board is on this side of that line: no cake stands on
// its own, and it is what every board-level finish is placed against.
function CakeContent({ config, scene, edit = null }) {
  const { texts = [], ages = [], stickers = [], writings = [], piping = [], boardGrass = null, nameBlocks = null } = config;
  const { tierData, stackY, bottomTier, bottomShp, topTier, board } = scene;
  const {
    orbitRef = null, gestureOnStickerRef = null,
    selectedTier = null, onTierClick = NOOP, onDeselect = NOOP,
    selectedPiping = null, highlightPipingId = null, pipingToolbar = null,
    onTopPipingSelect = NOOP, onBottomPipingSelect = NOOP,
    onPipingInstanceMove = null, isPipingMovable = () => true,
    selectedTextId = null, onTextSelect = NOOP, onTextMove = NOOP, onTextContentChange = NOOP, textToolbar = null,
    selectedAgeId = null, onAgeSelect, onAgeMove,
    selectedStickerIds = null, onStickerSelect = NOOP, onStickerLongPress, onStickerMove = NOOP,
    onGroupMove, onMoveMany, stickerToolbar = null, stickerResize = null, isStickerMovable = () => true,
    onWritingClick, onWritingMove, selectedWritingId = null,
    penDrawMode = false, penStyle, onAddStroke,
    selectedGenerated, onCloudClick: onCloudClickEdit, onRainbowClick: onRainbowClickEdit,
    onCloudMove, onRainbowMove,
  } = edit ?? {};

  // Orbit stands down while ANY single element is under the pointer or being dragged, so the set is
  // what makes "any". With no orbitRef (a capture, a still preview) there is no orbit to stand down
  // and every one of these calls is a no-op — which is why the element renderers below need no branch.
  const orbitBlockSet = useRef(new Set());
  const orbitEnableFor = id => enabled => {
    if (enabled) orbitBlockSet.current.delete(id); else orbitBlockSet.current.add(id);
    if (orbitRef?.current) orbitRef.current.enabled = orbitBlockSet.current.size === 0;
  };

  const minTextY = 0.1 + 0.18;
  const maxTextY = stackY - 0.18;

  const onBoardClick = e => { e.stopPropagation(); if (!gestureOnStickerRef?.current) onDeselect(); };

  return (
    <>
      {/* The board. Part of the CAKE, not of the room it is photographed in: no cake stands on its
          own, and every real cake picture has one under it — so it is drawn here, where the capture
          and the previews get it too, rather than only in the editor's studio. It is also what every
          board-level finish (a ring of grass, letter blocks at the foot, writing on the board) is
          placed against, so drawing it anywhere else left those standing on nothing. */}
      {board && (board.kind === 'rect' ? (
        <RoundedBox position={[0, 0.05, 0]} args={[board.width, 0.1, board.depth]} radius={0.06} smoothness={4} castShadow receiveShadow
          onClick={onBoardClick}>
          <meshStandardMaterial color="#d4af37" roughness={0.15} metalness={0.75} />
        </RoundedBox>
      ) : (
        <mesh position={[0, 0.05, 0]} castShadow receiveShadow onClick={onBoardClick}>
          <cylinderGeometry args={[board.radius, board.radius, 0.1, 64]} />
          <meshStandardMaterial color="#d4af37" roughness={0.15} metalness={0.75} />
        </mesh>
      ))}

      {/* Grass STANDING ON THE BOARD, ringing the cake — the base of the football cake. Bounded
          outward by the board and inward by the cake wall, which is why grassSeats needed a `hole`:
          two different outlines, where a top-surface band only ever hollows out its own.
          `ringWidth` is how far across the board-to-cake gap it reaches, so it means the same thing
          on a 6" round and a sheet. Seated at board height (the tier stack starts at 0.1). */}
      {boardGrass && board && (
        <GrassPatch
          {...boardGrass}
          shape={board}
          topY={0.1}
          patchRadius={board.radius}
          inset={boardRingInset(board, bottomShp, boardGrass.ringWidth)}
          hole={boardGrassHole(bottomShp, boundingRadius(bottomShp),
            boardClearanceFor(bottomTier, boardGrass.height ?? 0.16))}
        />
      )}

      {tierData.map((tier, i) => (
        <group key={i}>
          <CakeTier
            radius={tier.radius}
            height={tier.height}
            color={tier.color}
            gradient={tier.gradient ?? null}
            stripes={tier.stripes ?? null}
            glaze={tier.glaze ?? null}
            yBase={tier.baseY}
            shape={tier.shape ?? 'round'}
            shapeFamily={tier.shapeFamily ?? null}
            shapeConfig={tier.shapeConfig ?? null}
            width={tier.width}
            depth={tier.depth}
            cornerR={tier.cornerR}
            frostingType={tier.frostingType}
            frostingStyle={tier.frostingStyle}
            styleParams={tier.styleParams}
            dusting={tier.dusting ?? null}
            foil={tier.foil ?? null}
            selected={selectedTier === i}
            topPipings={tier.topPipings ?? (tier.topPiping ? [tier.topPiping] : [])}
            bottomPipings={tier.bottomPipings ?? (tier.bottomPiping ? [tier.bottomPiping] : [])}
            creamLayers={tier.creamLayers ?? []}
            highlightPipingId={highlightPipingId}
            pipingMovable={isPipingMovable}
            onPipingInstanceMove={onPipingInstanceMove
              ? (zone, layerId, index, angle, wallY) => onPipingInstanceMove(i, zone, layerId, index, angle, wallY)
              : null}
            onTopPipingClick={(e, layerId) => { e.stopPropagation(); onTopPipingSelect(i, layerId); }}
            onBottomPipingClick={(e, layerId) => { e.stopPropagation(); onBottomPipingSelect(i, layerId); }}
            onClick={e => { e.stopPropagation(); if (!gestureOnStickerRef?.current) onTierClick(i); }}
          />
          {/* Piped grass on this tier's top. Outside CakeTier because it is not part of the cake's
              body or its borders — it is a treatment laid ON the finished top, the way the football
              cake has smooth buttercream underneath and grass over it. Rendered from the resolved
              tierData so it fits the tier's real footprint, round or sheet. */}
          {tier.grass && (
            <GrassPatch
              shape={tierShape(tier)}
              topY={tier.baseY + tier.height}
              patchRadius={tier.radius}
              {...tier.grass}
            />
          )}
          {/* Fondant rainbows belonging to THIS tier. The generator asks for { radius, topY, boardY }
              and has never cared whether that describes a whole cake or one tier of one — so tier 2's
              rainbow is the same code given tier 2's numbers: its radius, its top, and the surface it
              STANDS on, which is the board for the bottom tier and the tier below's top for any other.
              Every ratio then scales to that tier.

              `boardY` is the tier's own base, which for tier 0 IS the board — so this is one
              expression rather than a branch, and a rainbow on an upper tier lands its falling foot
              on the tier below without anything here knowing that is what it is doing. */}
          {/* CLICK THE THING ITSELF. A rainbow and a cloud are OBJECTS, not finishes: the handle-dot
              mechanism they borrowed from grass, dust and foil only shows its dot once the card is
              already open, and the mesh carried no pointer handlers at all — so there was nothing to
              click, and a click fell through to the cake behind. Which reads as "it cannot be moved".
              stopPropagation, or the tier underneath also takes the click and selects itself. */}
          {(tier.rainbows ?? []).map(rb => (
            <DraggableGenerated
              key={`rb-hit-${rb.id}`}
              onClick={() => onRainbowClickEdit?.(i, rb.id)}
              onOrbitEnable={orbitEnableFor(`__rainbow__${rb.id}`)}
              onMove={patch => onRainbowMove?.(i, rb.id, patch)}
              // The pointer meets the TIER'S TOP, and the arch's position is read from where it
              // lands: how far round the cake, and how far out from the middle. Exactly the pair the
              // handle machinery used to supply as (u, v) — the same map, from a ray instead.
              resolve={ray => {
                const topY = tier.baseY + tier.height;
                const hit = planeHit(ray, new THREE.Plane(new THREE.Vector3(0, 1, 0), -topY));
                if (!hit) return null;
                const u = Math.atan2(hit.x, hit.z) / (Math.PI * 2);
                const v = Math.min(1, Math.hypot(hit.x, hit.z) / (tier.radius || 1));
                return rainbowDragTo(rb, { radius: tier.radius }, u, v);
              }}>
            {selectedGenerated?.kind === 'rainbow' && selectedGenerated.id === rb.id && (() => {
              const b = generatedBounds(
                rainbowBands(rb, { radius: tier.radius, topY: tier.baseY + tier.height, boardY: tier.baseY,
                                   supportRadius: rainbowSupportRadius(tierData, i, board) })
                  .bands.flatMap(x => x.path), 0.04);
              return b && (
                <group position={b.centre} rotation={[0, rb.yaw ?? 0, 0]}>
                  <SelectionBox width={b.width} height={b.height} depth={b.depth} />
                </group>
              );
            })()}
            <RainbowArch
              key={rb.id}
              params={rb}
              cake={{ radius: tier.radius, topY: tier.baseY + tier.height, boardY: tier.baseY,
                      // What a falling foot lands ON: the tier below, or — off the bottom tier —
                      // THE BOARD. The board does not grow here the way it does in the studio. It is
                      // a real thing the baker buys, sized to the cake and priced with it, so
                      // widening it silently is changing the order to fit the decoration.
                      //
                      // A rect board is measured across its narrow way, so the arch lands on it at
                      // any angle rather than only over the corners.
                      supportRadius: rainbowSupportRadius(tierData, i, board) }}
              yaw={rb.yaw ?? 0}
            />
            </DraggableGenerated>
          ))}
          {/* Fondant clouds belonging to THIS tier. Same tier-scoped cake object as the rainbow —
              the generator asks for { radius, topY, boardY } and does not care whether that is a
              whole cake or one tier of one. A cloud on the board is a cloud on the BOTTOM tier
              standing outside it, which is why there is no separate board list to keep in step. */}
          {(tier.clouds ?? []).map(cl => (
            <DraggableGenerated
              key={`cl-hit-${cl.id}`}
              onClick={() => onCloudClickEdit?.(i, cl.id)}
              onOrbitEnable={orbitEnableFor(`__cloud__${cl.id}`)}
              onMove={patch => onCloudMove?.(i, cl.id, patch)}
              // A cloud on the TOP is read off the tier's lid; one on the board or the wall off the
              // board, because that is the surface it stands on. Measured against the BOARD's radius
              // in those two cases: a cloud beside the cake is past the tier's own rim, and a scale
              // that stopped at the rim would refuse to follow the pointer outward.
              resolve={ray => {
                const onTop = (cl.surface ?? 'top') === 'top';
                const planeY = onTop ? tier.baseY + tier.height : (board ? 0.1 : tier.baseY);
                const hit = planeHit(ray, new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY));
                if (!hit) return null;
                const against = onTop ? (tier.radius || 1) : (board?.radius ?? tier.radius ?? 1);
                const u = Math.atan2(hit.x, hit.z) / (Math.PI * 2);
                const v = Math.min(1, Math.hypot(hit.x, hit.z) / against);
                return cloudDragTo(cl, { radius: tier.radius, handleRadius: against }, u, v);
              }}>
              {selectedGenerated?.kind === 'cloud' && selectedGenerated.id === cl.id && (() => {
                const pl = cloudPlacement(cl, { radius: tier.radius, topY: tier.baseY + tier.height, boardY: tier.baseY });
                const pts = pl.lobes.flatMap(l => [
                  { x: l.position.x - l.r, y: l.position.y - l.r, z: l.position.z - l.r },
                  { x: l.position.x + l.r, y: l.position.y + l.r, z: l.position.z + l.r },
                ]);
                const b = generatedBounds(pts, 0.03);
                return b && (
                  <group position={b.centre}>
                    <SelectionBox width={b.width} height={b.height} depth={b.depth} />
                  </group>
                );
              })()}
              <FondantCloud
                key={cl.id}
                params={cl}
                cake={{ radius: tier.radius, topY: tier.baseY + tier.height, boardY: tier.baseY }}
              />
            </DraggableGenerated>
          ))}
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

      {/* Typed cream writing — one per message, because `surface` belongs to the writing: a cake can
          carry "9" on the side and a name on the board at the same time. An empty one renders
          nothing (it is a card waiting to be typed into), which is why the text guard is per-item
          rather than around the map. Orbit is keyed per id so dragging one message does not free the
          camera for another. */}
      {topTier && board && writings.map(w => w?.text?.trim() ? (
        <CreamWriting
          key={w.id}
          writing={w}
          topY={stackY}
          topRadius={topTier.radius}
          shape={topTier.shape ?? 'round'}
          width={topTier.width}
          depth={topTier.depth}
          shp={tierShape(topTier)}
          tiers={tierData}
          boardRadius={board.radius}
          boardY={0.1}
          boardShp={board}
          onClick={() => onWritingClick?.(w.id)}
          onMove={moves => onWritingMove?.(w.id, moves)}
          onOrbitEnable={orbitEnableFor(`__writing__${w.id}`)}
          selected={selectedWritingId === w.id}
        />
      ) : null)}

      {/* Fondant letter blocks. On the board they ring the cake's foot; on top they sit on the
          highest tier. Each block is its own placement, so the arrangement IS the data — see
          nameBlockRun. */}
      {nameBlocks?.blocks?.length > 0 && topTier && board && (
        <NameBlocks
          {...nameBlocks}
          blocks={nameBlocks.blocks}
          surfaceRadius={nameBlocks.zone === 'top' ? topTier.radius : board.radius}
          y={nameBlocks.zone === 'top' ? stackY : 0.1}
        />
      )}

      {/* Freehand cream-pen strokes. Committed strokes are part of the cake and always drawn; the
          catchers that CATCH a new stroke appear only in draw mode, which no capture is ever in. */}
      <CreamPen
        piping={piping}
        drawMode={penDrawMode}
        penStyle={penStyle}
        tierData={tierData}
        board={board ? { shape: board.kind, radius: board.radius, width: board.width, depth: board.depth, y: 0.1 } : undefined}
        onAddStroke={onAddStroke}
      />

      {bottomTier && texts.map(t => {
        const hostTier = tierData.find(td => t.y >= td.baseY && t.y < td.baseY + td.height)
          ?? bottomTier;
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
            onOrbitEnable={orbitEnableFor(t.id)}
          />
        );
      })}

      {topTier && ages.map(a => (
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
          onOrbitEnable={orbitEnableFor(a.id)}
        />
      ))}

      {bottomTier && stickers.map(sticker => {
        const tier = tierData[sticker.tierIndex] ?? bottomTier;
        const isSide = sticker.zone === 'side' || sticker.zone === 'middle_tier';
        const orbitEnable = orbitEnableFor(sticker.id);

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
              pipingBands={resolveSidePipingBands({
                topPipings:    tier.topPipings ?? (tier.topPiping ? [tier.topPiping] : []),
                bottomPipings: tier.bottomPipings ?? (tier.bottomPiping ? [tier.bottomPiping] : []),
                topY: tier.baseY + tier.height, yBase: tier.baseY, height: tier.height, radius: tier.radius,
              })}
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
              resize={stickerResize}
              canMove={isStickerMovable(sticker)}
            />
          );
        }
        /* BOARD — the same flat-surface renderer on a different plane.
         *
         * A board decoration stands on the drum beside the cake, so it wants exactly what a
         * top-surface one wants (a height, a footprint to stay inside, a base seat) with three
         * values swapped: the board's top instead of the tier's, the board's outline instead of the
         * tier's, and a HOLE where the cake stands. Giving it its own renderer would have been a
         * second copy of the drag, the seat, the hit test and the toolbar. */
        const isBoard = sticker.zone === 'board';
        const boardShp = isBoard && board
          ? (board.kind === 'rect'
              ? { kind: 'rect', halfW: board.halfW, halfD: board.halfD }
              : { kind: 'round', radius: board.radius })
          : null;

        // top_surface (and board)
        const topY = isBoard ? BOTTOM_BASE : tier.baseY + tier.height;
        return (
          <DraggableTopSticker
            key={sticker.id}
            sticker={sticker}
            topY={topY}
            topRadius={isBoard ? (board?.radius ?? tier.radius) : tier.radius}
            shp={isBoard ? (boardShp ?? tierShape(tier)) : tierShape(tier)}
            // The cake's own footprint is what a board decoration must not stand in.
            hole={isBoard ? tierShape(bottomTier) : null}
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
            resize={stickerResize}
            canMove={isStickerMovable(sticker)}
          />
        );
      })}
    </>
  );
}

// The cake as it is PHOTOGRAPHED: no floor, no editing furniture — the cake, on its board, on a
// transparent field, which is what the thumbnail crop, the order snapshot and the inline previews all
// want. The cake itself is the shared CakeContent with no `edit`, so this scene cannot fall behind
// what the editor draws — which is the whole reason it no longer has a copy of it.
//
// The board is IN the picture. No cake stands on its own and every real cake photograph has one, so a
// capture without it reads as a cake floating in mid-air — and board-level finishes (a grass ring,
// letter blocks at the foot) had nothing to stand on. Only the ROOM is left out: the floor plane and
// the studio background belong to the editor, not to the cake.
function CakeThumbnailScene({ config }) {
  return (
    <>
      <SceneLights />
      {/* Same env rule as the live scene (SceneEnv): the configured HDRI, else the neutral
          `apartment` fallback so the wall isn't left IBL-less (brown) on local dev. IBL only —
          no `background` prop — so the capture stays transparent. */}
      <SceneEnv />
      <CakeContent config={config} scene={resolveCakeScene(config)} />
    </>
  );
}

/* ── What is behind the cake — including nothing ─────────────────────────────────────────────────
 *
 * ONE owner for the scene's background, because "no background" has to be something a caller can
 * ASK for. The declarative `<color attach="background">` cannot say it: null is not a colour, and
 * unmounting the element does not clear the value R3F already wrote.
 *
 * ⚠️ TWO THINGS MAKE A FRAME SEE-THROUGH AND BOTH ARE HERE. With scene.background null, three.js
 * falls through to the RENDERER's clear — whose alpha is 1 by default. Clearing the background
 * alone produced a cutout that was still a solid grey rectangle, and clearing the alpha alone did
 * nothing at all because the background painted over it.
 *
 * ⚠️ And in React rather than inside the capture. The PREVIEW has to be see-through too, or the
 * panel shows a frame with a ground in it while promising a file without one — and this feature's
 * whole claim is that the frame on screen is the file. Done at capture time it would have produced
 * a correct download that nobody could have predicted from the screen.
 */
function SceneBackground({ colour }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    scene.background = colour ? new THREE.Color(colour) : null;
    gl.setClearAlpha(colour ? 1 : 0);
    return () => { gl.setClearAlpha(1); };
  }, [gl, scene, colour]);
  return null;
}

// Reusable temps for the per-frame bbox fit (avoid per-frame allocation).
const _fitBox = new THREE.Box3();
const _fitSphere = new THREE.Sphere();
const _fitCenter = new THREE.Vector3();
const _fitDir = new THREE.Vector3();

// Frames the capture camera to the cake's ACTUAL rendered bounds (tiers + toppers +
// piping + decorations) so the snapshot fills the frame, centred, for any cake —
// instead of the old fixed [0,2,0] target + distance that left short cakes tiny and
// low. Geometry-driven (no element-type branching); recomputed each frame so it
// tracks live edits and async-loaded GLBs. Keeps the original front-above view angle.
// ── Keeping the whole cake in the picture, live ─────────────────────────────────────────────────
// The editor's camera stood at a constant distance, and a constant cannot frame every cake. It was
// tuned four times before this: in so a single tier was not a speck, back out so a three-tier stack
// kept its top, in again, and each time the cake it was NOT tuned against went wrong. The one that
// finally made it undeniable was two tiers with a tall topper — the tallest thing the app can make —
// which ran its board off the bottom of the screen.
//
// So the distance is measured, not chosen: fit the cake's own bounding sphere (framing.js). The
// capture camera has always done this; the editor is only now asking the same question.
//
// TWO THINGS MAKE THE LIVE CASE DIFFERENT from the capture's, and both are about the person using it:
//
//   The camera is THEIRS. They can orbit it, and re-fitting must never undo that. So only the
//   DISTANCE and the TARGET move; the direction from target to camera is read back and preserved,
//   which reads as the cake being zoomed to fit rather than the view being snatched away.
//
//   Measuring costs something. setFromObject walks every mesh, and a grass cake has thousands of
//   instances, so this runs on a stride rather than every frame, and only acts when the cake has
//   MATERIALLY changed size. Adding a tier re-frames; nudging a decoration does not, which also
//   means the view holds still during a drag.
const FIT_STRIDE = 12;          // frames between measurements — 5/sec at 60fps, invisible for an edit
const FIT_DEADBAND = 0.06;      // world units of change worth re-framing for
function FitCakeToView({ groupRef, orbitRef, enabled = true, reserveTop = true }) {
  const { camera, size } = useThree();
  // From the store rather than the ref: OrbitControls has `makeDefault`, and the store is populated
  // when the controls are actually ready. The ref alone is a timing bug — on the frames before it is
  // attached, the aim written here is discarded by the controls' own update, which goes on pointing
  // at the origin. That put the camera at the right DISTANCE aiming at the floor, and the visible
  // result was a two-tier cake with its top cut off: the fit looked broken when only the aim was.
  const controls = useThree(s => s.controls);
  const applied = useRef(null);
  const tick = useRef(0);

  useFrame(() => {
    if (!enabled) return;
    // Every frame until the cake has been framed once, on a stride after that. The first fit must
    // not wait: until it lands the camera is wherever it was left, and a stride's delay is a visible
    // jump from the wrong framing to the right one. Once settled, the deadband makes most ticks
    // free — but the MEASUREMENT is not, so it is the measurement that gets throttled.
    if (++tick.current % (applied.current ? FIT_STRIDE : 1)) return;
    const g = groupRef.current;
    // Nothing recorded until the controls exist, so the first real fit is not swallowed by the
    // deadband as "already applied".
    if (!g || !(controls ?? orbitRef?.current)) return;
    _fitBox.setFromObject(g);
    if (_fitBox.isEmpty()) return;

    // A CYLINDER, not a sphere: the widest reach across the board, and the height. The box's own X/Z
    // extents rotate with the cake, so the width is taken as the larger half-extent — which for a
    // round cake IS the radius, and for a sheet is its longest side, i.e. what could ever swing into
    // frame as it turns.
    const halfW = Math.max(_fitBox.max.x - _fitBox.min.x, _fitBox.max.z - _fitBox.min.z) / 2;
    // Height INCLUDING the headroom a topper will want, so a bare cake is framed like a finished one
    // and standing the first topper on it does not lurch the camera (see framedHeight).
    /* ⚠️ The reserve is right for the EDITOR and wrong for a photograph.
     * framedHeight keeps a topper's worth of height (MIN_FRAMED_TOP) above a bare cake so that
     * standing the first one on it does not lurch the camera. In the designer that is exactly right.
     * In a photo of a cake that has no topper it is dead space: the bare one-tier came out occupying
     * the bottom half of a 4:5 with the top half empty, which reads as a badly taken picture rather
     * than as a deliberate composition.
     *
     * Photo only. The reel dollies in to 0.78 of its starting distance, and the fit's 25% margin is
     * most of what keeps the cake inside the frame at the closest point — taking the reserve away
     * there would tighten the whole take, which is a look to judge by eye rather than a bug to fix. */
    const { halfH, centerY: cy } = framedHeight(_fitBox.min.y, _fitBox.max.y, reserveTop ? undefined : 0);
    const aspect = size.width / Math.max(size.height, 1);
    const prev = applied.current;
    // Aspect is in the deadband because a resized window changes the answer as surely as a new tier:
    // the frame it has to fit inside is different.
    if (prev && Math.abs(prev.halfW - halfW) < FIT_DEADBAND && Math.abs(prev.halfH - halfH) < FIT_DEADBAND
             && Math.abs(prev.cy - cy) < FIT_DEADBAND && Math.abs(prev.aspect - aspect) < 0.01) return;
    applied.current = { halfW, halfH, cy, aspect };

    const ctl = controls ?? orbitRef?.current;
    const target = ctl?.target;

    // Preserve the user's angles: take the direction they are currently looking from, and only
    // change how far along it the camera stands.
    _fitDir.copy(camera.position).sub(target ?? _fitBox.getCenter(_fitCenter)).normalize();
    if (!Number.isFinite(_fitDir.x) || _fitDir.lengthSq() < 0.5) {
      _fitDir.set(0, CAMERA_POSITION[1], CAMERA_POSITION[2]).normalize();   // first frame: no orbit yet
    }

    // The distance depends on how far the camera is TILTED, and the tilt is the user's to choose —
    // so it is read from where they are looking from, not assumed. Orbit down towards the table and
    // the cake covers less height, so the camera closes in; orbit up and it backs off.
    const elevation = Math.asin(Math.max(-1, Math.min(1, _fitDir.y)));
    const tight = fitDistanceTight(halfW, halfH, elevation, camera.fov, aspect);
    const dist = fitDistance(halfW, halfH, elevation, camera.fov, aspect);
    // The sit takes a share of the air the margin bought, and nothing else — so it can never push
    // the cake past the edge it was standing back from.
    const aimY = cy + sitFromSlack(tight, dist, camera.fov);

    if (target) target.set(0, aimY, 0);
    camera.position.set(0, aimY, 0).addScaledVector(_fitDir, dist);
    camera.updateProjectionMatrix();
    ctl?.update();
  });

  return null;
}

function FitCakeCamera({ groupRef, renderNowRef }) {
  const { camera, gl, scene } = useThree();
  const fit = () => {
    const g = groupRef.current;
    if (!g) return;
    _fitBox.setFromObject(g);
    if (_fitBox.isEmpty()) return;
    _fitBox.getBoundingSphere(_fitSphere);
    const c = _fitSphere.center;
    const R = _fitSphere.radius || 3;
    const halfFov = (CAMERA_FOV / 2) * Math.PI / 180;
    const dist = (R / Math.sin(halfFov)) * 1.08;   // 1.08 = small breathing margin
    _fitDir.set(0, CAMERA_POSITION[1] - 2, CAMERA_POSITION[2]).normalize();
    camera.position.copy(c).addScaledVector(_fitDir, dist);
    camera.lookAt(c);
    camera.updateProjectionMatrix();
  };
  useFrame(fit);

  // Draw a frame ON DEMAND, so a capture photographs the cake as it is NOW.
  //
  // Every frame this canvas draws comes from requestAnimationFrame, and a browser stops driving that
  // while its window is hidden or minimised. The capture reads the drawing buffer directly
  // (preserveDrawingBuffer), so with animation stopped it gets whatever was painted last — which can
  // predate the design it is supposed to be a picture of. Rendering here is a direct call and does
  // not care whether the browser is animating: measured with requestAnimationFrame stubbed out, the
  // buffer still holds the previous frame and this still produces a new one.
  //
  // It cannot rescue every case, and the limit is worth knowing: if the window was hidden from the
  // moment the page loaded, react-three-fiber never measures the container, so no renderer is ever
  // created and there is nothing here to ask. That capture comes back EMPTY rather than stale, and is
  // caught at the other end — captureThumbnailBlob refuses to encode a frame with nothing in it.
  useEffect(() => {
    if (!renderNowRef) return;
    renderNowRef.current = () => { fit(); gl.render(scene, camera); };
    return () => { renderNowRef.current = null; };
  });   // no dep array: `fit` closes over the current group, and this must never hold a stale one

  return null;
}

// `renderNowRef` is handed back to the caller, who calls it immediately before capturing. Optional:
// a host that never captures (or captures while visibly on screen) can leave it out and nothing
// changes. See FitCakeCamera for why a capture cannot simply trust that a frame exists.
export function CakeThumbnailCanvas({ config, containerRef, renderNowRef }) {
  const groupRef = useRef();
  return (
    <div ref={containerRef} style={{ position: 'absolute', left: -9999, top: -9999, width: 400, height: 400 }}>
      <Canvas
        gl={{ preserveDrawingBuffer: true, alpha: true }}
        onCreated={({ gl }) => { gl.localClippingEnabled = true; }}
        camera={{ position: CAMERA_POSITION, fov: CAMERA_FOV }}
        style={{ width: 400, height: 400 }}
      >
        <group ref={groupRef}><CakeThumbnailScene config={config} /></group>
        <FitCakeCamera groupRef={groupRef} renderNowRef={renderNowRef} />
      </Canvas>
    </div>
  );
}

// On-screen, read-only cake preview. Hand it an authored `design` (tiers/colours/etc., fields
// optional) and it draws the cake on a turntable with no edit UI. It resolves the design via the
// SAME `toCanvasConfig` the live editor uses (one defaulting rule, INVARIANTS #3) and renders the
// SAME `CakeThumbnailScene` as the thumbnail capture (one renderer, #2). Unlike CakeThumbnailCanvas
// (fixed 400×400, parked off-screen for PNG capture) this fills its parent and is meant to be seen.
// `enableZoom` is opt-in and defaults OFF: every existing caller is a small inline preview tile where a
// stray scroll must not resize the cake. A full-size stage (the Cake Shape Studio) turns it on.
//
// The LENS is overridable for the same reason. The default (42°, close) is a portrait lens for a
// thumbnail — flattering, but it splays a cake's near bottom edge outward, which reads as the cake
// bulging at the base. Judging a SHAPE needs a long lens (small fov, camera pulled back) so the
// silhouette on screen is the silhouette, not the perspective.
// Keeps the live camera in step with the `fov`/`cameraPosition` props.
//
// R3F reads <Canvas camera={…}> ONCE, when it creates the default camera; later prop changes are
// ignored. That is invisible while a preview shows one fixed cake, and a real bug the moment the cake
// can change under a mounted Canvas: the Cake Shape Studio's capture stage stays mounted while the
// operator switches shapes, so it kept the camera it was born with — framed for a one-tier round cake —
// and photographed a two-tier stack with its top cut off. The saved thumbnail was wrong even though the
// camera it asked for was right.
function CameraRig({ fov, position }) {
  const camera = useThree(s => s.camera);
  useEffect(() => {
    camera.position.set(...position);
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }, [camera, fov, position[0], position[1], position[2]]);   // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function CakePreview({
  design, autoRotate = true, style, enableZoom = false,
  fov = CAMERA_FOV, cameraPosition = CAMERA_POSITION, target = null,
}) {
  const config = useMemo(() => toCanvasConfig(design ?? { tiers: [] }), [design]);
  // Aim at THIS cake's middle by default, the same rule the editor uses (cakeAimTarget) — a preview
  // and the editor showing the same cake framed differently is the sort of difference nobody reports
  // and everybody notices. Was a hardcoded [0, 2, 0], which is above a one-tier cake entirely.
  // An explicit `target` still wins: the shape picker frames for a different question (see shapeView).
  const aim = useMemo(
    () => target ?? cakeAimTarget(config.tiers.map(t => t.height), cameraPosition),
    [target, config, cameraPosition],
  );
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
      <Canvas
        gl={{ preserveDrawingBuffer: true, alpha: true }}
        onCreated={({ gl }) => { gl.localClippingEnabled = true; }}
        camera={{ position: cameraPosition, fov }}
        style={{ width: '100%', height: '100%' }}
      >
        <CameraRig fov={fov} position={cameraPosition} />
        <Suspense fallback={null}>
          <CakeThumbnailScene config={config} />
        </Suspense>
        <OrbitControls enableZoom={enableZoom} enablePan={false} autoRotate={autoRotate} autoRotateSpeed={1.4} target={aim} />
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
  onPipingInstanceMove = null,
  isPipingMovable = () => true,
  selectedStickerIds, onStickerSelect, onStickerLongPress, onStickerMove, onGroupMove, onMoveMany, stickerToolbar,
  // { controlFor(sticker) -> {value,min,max,step}, onResize(sticker, value) } — the ONE size path,
  // shared with the edit popup's SizeDial (see placement.js stickerSizeControl). Absent = no grips.
  stickerResize = null,
  isStickerMovable,
  hitTestRef,
  snapCameraRef,
  // Filled with the reel recorder when the designer passes it — catalogue authors only, so for
  // every other baker this is undefined and TakeDirector never mounts.
  takeRef = null,
  onAngleChange = null,
  // The reel's ground while the panel is open, else null. See CakeScene.
  filmGround = null,
  filmCutout = false,
  filmTight = false,
  cameraPosition = CAMERA_POSITION,
  onWritingClick, onWritingMove, selectedWritingId = null,
  penDrawMode = false, penStyle, onAddStroke,
  grassMode = false, grassSelected = null, onGrassMove, onGrassSelect,
  blocksMode = false, blocksSelected = null, onBlockMove, onBlockSelect,
  selectedGenerated = null,   // { kind: 'cloud'|'rainbow', id } — which one wears the selection box
  dustMode = false, dustSelected = null, onDustMove, onDustSelect,
  foilMode = false, foilSelected = null, onFoilMove, onFoilSelect,
  creamPaint = null, onCreamPaint,
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
        if (!isRoundWall(shp)) {
          // Faceted wall (rect + any outline: heart, …): seed a perimeter fraction u, so the drop
          // sits on the ACTUAL wall — a heart seeded with theta would land on a bounding circle.
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
      /* ⚠️ alpha, so a photo can be captured as a CUTOUT.
       *
       * Transparency is decided when the context is CREATED and can never be turned on afterwards:
       * without this the drawing buffer has no alpha channel, setClearAlpha(0) is quietly ignored,
       * and a "transparent" photo downloads with a black rectangle behind the cake. Costs nothing
       * the rest of the time — a background colour is painted over it on every ordinary frame, which
       * is why the two off-screen capture canvases have always asked for it.
       *
       * preserveDrawingBuffer is what lets the reel and the photo read pixels back out at all. */
      gl={{ preserveDrawingBuffer: true, alpha: true }}
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
      {/* Fills takeRef with the recorder, the same way CameraSnapper fills snapCameraRef — the
          camera only exists inside the Canvas, so anything that drives it has to live in here and
          hand a function out. Renders nothing; costs nothing when takeRef is not passed. */}
      {takeRef && <TakeDirector takeRef={takeRef} orbitRef={orbitRef} onAngleChange={onAngleChange} />}
      <CakeScene
        filmGround={filmGround}
        filmCutout={filmCutout}
        filmTight={filmTight}
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
        onPipingInstanceMove={onPipingInstanceMove}
        isPipingMovable={isPipingMovable}
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
        stickerResize={stickerResize}
        isStickerMovable={isStickerMovable}
        onWritingClick={onWritingClick}
        onWritingMove={onWritingMove}
        selectedWritingId={selectedWritingId}
        penDrawMode={penDrawMode}
        penStyle={penStyle}
        onAddStroke={onAddStroke}
        creamPaint={creamPaint}
        onCreamPaint={onCreamPaint}
        grassMode={grassMode}
        grassSelected={grassSelected}
        onGrassMove={onGrassMove}
        onGrassSelect={onGrassSelect}
        selectedGenerated={selectedGenerated}
        onCloudClick={onCloudClick}
        onRainbowClick={onRainbowClick}
        blocksMode={blocksMode}
        blocksSelected={blocksSelected}
        onBlockMove={onBlockMove}
        onBlockSelect={onBlockSelect}
        dustMode={dustMode}
        dustSelected={dustSelected}
        onDustMove={onDustMove}
        onDustSelect={onDustSelect}
        foilMode={foilMode}
        foilSelected={foilSelected}
        onFoilMove={onFoilMove}
        onFoilSelect={onFoilSelect}
        tierDataRef={tierDataRef}
      />
      <OrbitControls
        makeDefault
        ref={orbitRef}
        enableZoom={false}
        enablePan={false}
        autoRotate={autoRotate && (creamPaint != null || (selectedTier === null && selectedTextId === null && !pipingTarget))}
        autoRotateSpeed={0.8}
        maxPolarAngle={Math.PI / 2.05}
        // NO `target` prop, deliberately. FitCakeToView owns both the aim and the distance now, and
        // it writes them onto these controls directly — a React-managed target would be re-applied on
        // every render and fight it. The history of this line is why: [0,2,0], then [0,1.55,0], then
        // a computed aim over a fixed distance, each right for the cake it was checked against and
        // wrong for the next one. Framing is measured from the cake, not declared here.
      />
    </Canvas>
  );
}
