import { createRoot } from 'react-dom/client';
import './scene.js';
import { SceneEnv, SceneLights } from '../src/designer/canvas/CakeCanvas.jsx';
import { Canvas } from '@react-three/fiber';
import { useMemo, useState, useEffect } from 'react';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildPipingStroke, NOZZLE_BY_KEY, DEFAULT_NOZZLE, PEN_FEEL } from '../src/designer/geometry/creamPen.js';
import { ropeSection, pipedBodyRadius, pipedParams, buildStyledWall, buildStyledTop, bakeCreaseAO } from '../src/designer/geometry/creamWall.js';
import { styleDef, CREAM_STYLES } from '../src/designer/creamStyles.js';
import { configureStrokeMeshes, useStrokeMesh } from '../src/designer/canvas/strokeMesh.js';
import { frostingDef } from '../src/designer/frostings.js';

/* ONE vertical stroke, on its own, lit the way the cake is.
 *
 * ⚠️ THE PAGE THAT SHOULD HAVE EXISTED FIRST. The piped cream wall went through nine rounds of "that
 * is not what a star nozzle leaves", every one of them judged on a whole tier — where a stroke is a
 * few pixels wide and every fault looks like every other fault. A tip's output is one stroke. Judge
 * one stroke.
 *
 * `?noz=` picks the tip (any key in creamPen's NOZZLES), `?t=` its radius, `?roll=` turns it.
 * `?cake=1` puts the same stroke on a cake's SIDE, placed by the wall's own maths — so what a tip
 * leaves and where the wall puts it can be looked at together or apart.
 */
const q = new URLSearchParams(location.search);
/* ⚠️ THE DEFAULTS ARE THE CALIBRATED ONES, not the first tip in the registry. Loading this page
 * with no query at all now renders the stroke that was matched to the photograph beside it:
 *
 *   aspect          4.35 reference → 4.4 ours      (height / mean width, both measured off pixels)
 *   creases on face 4 reference → 4 ours           (a crease at fraction f of a tube's projected
 *                                                   width sits at asin(2f − 1) from the centre)
 *   luminance range 55% of max reference → ~55%    (scanned across the middle)
 *   ripple          1.55% rms reference → ~2%      (width against its own smooth trend)
 */
const noz = q.get('noz') || 'lobe12';
const onCake = q.get('cake') === '1';
const R = 1.35;                                     // tier radius when the stroke is shown on a cake
const P = pipedParams({ nozzle: noz, width: Number(q.get('width') || 0.5), overlap: Number(q.get('ov') ?? 0.85) });
// On a cake the stroke is the size the wall would make it; on its own it is sized to fill the frame.
const t = Number(q.get('t') || (onCake ? ropeSection(R, P).w : 0.275));
/* ⚠️ The camera sits on +z and the sweep's frame puts the profile's local x on world x, so a POINT
 * only faces the viewer at a quarter turn. On a cake this is the SAME roll the wall applies to every
 * stroke (its own angle), which is what keeps the tip presenting the same face all the way round. */
const roll = Number(q.get('roll') ?? Math.PI / 2);
const stack = Number(q.get('stack') || 0);   // ?stack=N — N flat stars, laid one on another

/* ⚠️ A STACK OF FLAT STARS — the construction Sandeep described, built literally rather than
 * approximated by a sweep. Cut a sharp star out of card, lay it on the floor, and keep laying more
 * on top: that stack IS a piped stroke. `?stack=N` builds exactly that, N thin star SLABS, so the
 * structure can be looked at instead of argued about. Each slab is the same sharp star polygon —
 * no rounding, no relaxing, no gaussian slots — and they are stacked with a whisper of turn and
 * size between them, which is the only thing a hand adds.
 */
/* ⚠️ `notch` IS THE ANGLE OF THE V, AND IT IS NOT THE DEPTH. Deepening a star narrows its valleys,
 * but it does so by thinning the whole stroke — the inner radius falls and the silhouette comes in
 * with it. What a piped line has is a NARROW V between BROAD points: the cut occupies a small
 * fraction of each point's share of the circle, and the rest of that share stays out at full radius.
 * So the point is an ARC at r = 1 and the V is a wedge cut into the gap between two of them.
 *
 * `notch` is that wedge's angular width as a fraction of one point's span. Small = a narrow slot
 * between fat lobes; 1 = the classic star polygon, where the cut starts the moment the last one ends.
 */
function starSlabShape(points, depth, notch = 0.42, per = 7) {
  const shape = new THREE.Shape();
  const span = (Math.PI * 2) / points, half = span / 2, nw = notch * half;
  const at = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
  let first = true;
  for (let k = 0; k < points; k++) {
    const c = k * span;
    for (let j = 0; j <= per; j++) {            // the point: an arc at full radius
      const [x, y] = at(c - half + nw + (2 * (half - nw)) * (j / per), 1);
      if (first) { shape.moveTo(x, y); first = false; } else shape.lineTo(x, y);
    }
    const [vx, vy] = at(c + half, 1 - depth);   // the V, cut into the gap
    shape.lineTo(vx, vy);
  }
  shape.closePath();
  return shape;
}

function StarStack({ points, depth, notch, n, height, thickness, wobble, turn, roll, ao, x = 0, z = 0 }) {
  const geos = useMemo(() => {
    const shape = starSlabShape(points, depth, notch);
    const slab = height / n;
    return Array.from({ length: n }, (_, i) => {
      const g = new THREE.ExtrudeGeometry(shape, { depth: slab, bevelEnabled: false, curveSegments: 1 });
      g.rotateX(-Math.PI / 2);                                  // lay the star flat, extrude upward
      const wob = 1 + wobble * (Math.sin(i * 0.31) * 0.6 + Math.sin(i * 0.13 + 1.7) * 0.4);
      g.scale(thickness * wob, 1, thickness * wob);
      g.rotateY(roll + i * turn);            // a POINT faces the viewer, and the stack turns a hair as it rises
      g.translate(x, -height / 2 + i * slab, z);
      /* ⚠️ THE SAME TWO THINGS THE SWEPT PATH NEEDED, and without them the stack reads as one merged
       * panel exactly as the sweep did. `ExtrudeGeometry` SHARES the vertices at the shape's corners,
       * so `computeVertexNormals` averages the two faces meeting there and rolls every edge over into
       * a smooth shoulder; and the scene's light is nearly a uniform dome, so faces a few degrees
       * apart shade identically unless something darkens the creases. Flat shading gives each face
       * its own normal; the AO is measured from the crease to the crest, the same as the wall's. */
      bakeAO(g, thickness, ao, x, z);
      return g;
    });
  }, [points, depth, notch, n, height, thickness, wobble, turn, roll, ao, x, z]);
  return geos.map((g, i) => (
    <mesh key={i} geometry={g} castShadow receiveShadow>
      <meshPhysicalMaterial color="#F6EBD8" flatShading vertexColors {...creamMaterial()} /></mesh>
  ));
}

/* ⚠️ `?rough=` / `?sheen=` / `?coat=` OVERRIDE THE CREAM, because a shape can be right and still be
 * invisible. Buttercream ships near-Lambertian (roughness 0.95, sheen 0, clearcoat 0) and under a
 * soft environment a Lambertian surface gives two faces fifteen degrees apart almost the same
 * brightness — so a star's flanks read as ONE merged panel however sharp the geometry between them
 * is. These let the material be ruled in or out without touching the frosting table. */
function creamMaterial() {
  const m = frostingDef('buttercream').material;
  return {
    roughness: Number(q.get('rough') ?? m.roughness), metalness: 0,
    sheen: Number(q.get('sheen') ?? m.sheen), sheenRoughness: m.sheenRoughness, sheenColor: m.sheenColor,
    clearcoat: Number(q.get('coat') ?? m.clearcoat), clearcoatRoughness: m.clearcoatRoughness,
  };
}

/* `?n=` strokes, centred on the camera's side of the cake and spaced the way the wall spaces them. */
function strokeAngles() {
  const n = Math.max(1, Math.round(Number(q.get('n') || 1)));
  const step = (Math.PI * 2) / ropeSection(R, P).ropes;
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * step);
}

/* ⚠️ A CREASE IS DARK BECAUSE IT IS OCCLUDED, and nothing in the render was doing occlusion.
 *
 * Measured before reaching for this: sheen, roughness and clearcoat all change the stroke by
 * NOTHING. That is not a surprise once stated — the scene's light is very nearly a uniform dome, and
 * under a uniform dome a surface's brightness barely depends on which way it faces. So two flanks
 * fifteen degrees apart come out the same shade and the star reads as one merged panel, however
 * sharp the geometry between them is. The normals were already right; there was simply no cue.
 *
 * What makes a crease dark in a photograph is that its own walls block most of the sky from it.
 * That is ambient occlusion, and it can be baked straight onto the vertices here: a vertex's depth
 * inside the section is exactly how occluded it is. No texture, no UVs, no post pass.
 *
 * `?ao=` scales it; 0 is the render as it was.
 */
/* ⚠️ The SHARED bake, not a copy of it (INVARIANTS #15). All this adds is where the crease sits:
 * for a swept tip that comes from the tip's own profile, and for the flat-star stack it is the
 * star's own `1 − depth`. */
function bakeAO(geo, thickness, ao, cx = 0, cz = 0) {
  const rMin = stack ? 1 - Number(q.get('depth') || 0.55)
    : (() => { let m = 1; for (const [px, py] of (NOZZLE_BY_KEY[noz] ?? NOZZLE_BY_KEY[DEFAULT_NOZZLE]).profile) m = Math.min(m, Math.hypot(px, py)); return m; })();
  return bakeCreaseAO(geo, thickness, thickness * rMin, ao, cx, cz);
}

function Stroke({ x = 0, z = 0, roll: r }) {
  /* ⚠️ BOTTOM TO TOP. `buildPipingStroke` puts the foot flare at a stroke's START and the lift-off
   * at its END, and on a cake side the fat foot belongs at the board. */
  const pts = Array.from({ length: 5 }, (_, i) => new THREE.Vector3(x, -1.0 + i * 0.5, z));
  /* ⚠️ THE PEN'S OWN LIFE STAYS ON, and switching it off is what made this page's stroke read as an
   * extruded plastic column beside the photograph: dead-straight parallel ribs, a hard faceted cone
   * at each end. Only `speedWidth` is off, and only because it reads the SPACING of hand-captured
   * points — these are machine-even, so it would compute a flat 1. Twist, swell and the lift-off are
   * the difference between a rope and a rod, and each has a knob here so it can be swept. */
  const geo = buildPipingStroke(pts, noz, t, {
    speedWidth: 0,
    twistTurnsPerDia: Number(q.get('twist') ?? PEN_FEEL.twistTurnsPerDia),
    swellAmp: Number(q.get('swell') ?? PEN_FEEL.swellAmp),
    tailDias: Number(q.get('tail') ?? 0.45),      // measured: the taper is the top ~10%, not a third
    footDias: Number(q.get('foot') ?? 0.7),
  }, null, r, Number(q.get('ao') ?? 0.80));
  if (!geo) return null;
  return <mesh geometry={geo} castShadow receiveShadow>
    <meshPhysicalMaterial color="#F6EBD8" vertexColors {...creamMaterial()} /></mesh>;
}

/* The cake under it, placed by `pipedBodyRadius` — the same call the wall makes. At press 0 the
 * stroke is TANGENT to this cylinder: its inner edge is the cake's side. */
function Cake() {
  /* ⚠️ In stack mode the cake is sized to the STACK, not to the style's own stroke. `?t=` sets the
   * stack's radius, and a body built for a different width leaves the stroke half sunk into it —
   * which is the one thing this page exists to show is wrong. */
  const rBody = stack ? R - 2 * t : pipedBodyRadius(R, P);
  return (
    <mesh position={[0, -0.25, 0]} receiveShadow castShadow>
      <cylinderGeometry args={[rBody, rBody, 2.6, 96]} />
      <meshPhysicalMaterial color="#F0D9DC" {...creamMaterial()} />
    </mesh>
  );
}

/* ⚠️ `?style=` RENDERS THE SHIPPING FUNCTION, not a hand-built row of strokes. Everything above
 * places strokes the way this page thinks the wall does; this asks buildStyledWall for the real one,
 * with the row's real params, so a look that passes here is a look the designer will actually draw.
 * A whole day went into a wall judged only through a stand-in. `?style=piped_rope`. */
const styleKey = q.get('style');
/* ⚠️ A MODELLED style's mesh comes from the ASSETS BASE, the same as in the app — `?assets=` points
 * this page at a local copy of the bucket rather than at R2, so the whole chain the designer uses
 * (style row → R2 key → URL → GLTFLoader → buildStyledWall) is what gets judged here, not a
 * shortcut past it. Without the flag there is no base, the mesh is unresolvable and the style
 * renders as a smooth wall — which is exactly what it does in the app in that situation. */
configureStrokeMeshes(q.get('assets') || '');

function StyledTier() {
  const row = CREAM_STYLES[styleKey] ?? null;
  const H = Number(q.get('h') || 1.2), Rt = Number(q.get('r') || 0.9);
  const vals = useMemo(() => {
    const out = {};
    /* Every param the row declares, overridable by a query key of the same name — so a value can be
     * swept against the reference without editing the row and reloading the module graph. */
    for (const p of styleDef(styleKey).params ?? []) {
      out[p.key] = q.has(p.key) ? Number(q.get(p.key)) : p.default;
    }
    out.nozzle = q.get('noz') || row?.nozzle;
    return out;
  }, []);
  const strokeGeo = useStrokeMesh(row?.strokeGlb);
  const wall = useMemo(() => {
    const g = buildStyledWall(row?.wall, Rt, H, { ...vals, strokeGeo });
    if (!g) { console.log('[wall] null — no geometry (modelled style still loading its mesh?)'); return null; }
    /* ⚠️ THE PAGE SAYS WHAT IT DREW. Vite's watcher died three times in one afternoon and served
     * stale modules each time, so "the render disagrees with the measurement" was usually neither —
     * it was a picture of code that no longer existed. This prints the numbers actually used. */
    const pos = g.getAttribute('position');
    let lo = Infinity, hi = 0;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getY(i)) > H * 0.4) continue;
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      if (r < lo) lo = r; if (r > hi) hi = r;
    }
    const info = { nozzle: vals.nozzle, width: vals.width, overlap: vals.overlap, ao: vals.ao,
      surfaceMin: +lo.toFixed(3), surfaceMax: +hi.toFixed(3), tierR: Rt,
      tris: (g.index ? g.index.count : pos.count) / 3,
      hasColour: !!g.getAttribute('color') };
    console.log('[wall]', JSON.stringify(info));
    if (typeof window !== 'undefined') window.__wall = info;
    return g;
  }, [vals, strokeGeo]);
  const top  = useMemo(() => buildStyledTop(row?.wall, row?.top, Rt, H, vals), [vals]);
  const mat = { color: '#F6EBD8', ...creamMaterial() };
  if (!wall) return null;
  return <group position={[0, -0.2, 0]}>
    <mesh geometry={wall} castShadow receiveShadow>
      <meshPhysicalMaterial {...mat} vertexColors={!!wall?.getAttribute?.('color')} /></mesh>
    {top && <mesh geometry={top} position={[0, H / 2, 0]} castShadow receiveShadow>
      <meshPhysicalMaterial {...mat} /></mesh>}
  </group>;
}

/* ⚠️ THE REFERENCE SITS IN THE PAGE, so a render cannot be looked at without it. Two days went by
 * with the photograph in one window and the render in another, and the comparing done by hand —
 * by Sandeep, who had to paste the two windows side by side to show me differences I had the
 * images to see myself. `?ref=1` is on by default for a single stroke, which is the one view that
 * is directly comparable to the photo. `?ref=0` turns it off. */
const showRef = q.get('ref') !== '0' && !onCake && !styleKey && !stack && !q.get('glb');

/* ⚠️ `?glb=<url>` PUTS A REAL MESH ROUND THE TIER, as a straight comparison against the procedural
 * wall — not as a shipping path. One generated vertical stroke, instanced round the side: it is
 * scaled so its height matches the tier's and its own width then sets how many go round, which is
 * the same rule the procedural wall follows. `?gn=` overrides the count.
 *
 * ⚠️ It is 3M triangles for ONE stroke. Twenty of those is sixty million, which is why this can
 * only ever be a look, never the thing we ship — but it answers "does the geometry work on a cake"
 * without any of our own maths in the way. */
function GlbWall({ url }) {
  /* ⚠️ LOADED BY HAND, NOT THROUGH `useGLTF`. A suspending loader that never resolves renders
   * nothing and logs nothing, which is twenty minutes of looking at a blank canvas. This reports
   * what it is doing. */
  const [scene, setScene] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    const t0 = performance.now();
    console.log('[glb] loading', url);
    /* ⚠️ A `.bin` IS THE DECIMATED MESH, and it is what actually renders. The raw GLB is 3,021,560
     * triangles for ONE stroke: it downloads and parses in 155ms and then the canvas stays blank
     * with no error at all, which is the GPU declining the upload. `scripts` note in the feature
     * doc; the format is [u32 verts][u32 indices][f32 positions][u32 indices], positions only —
     * normals are computed here, which is also what gives it the smooth shading the source lacks. */
    if (url.endsWith('.bin')) {
      fetch(url).then(r => r.arrayBuffer()).then((ab) => {
        const head = new Uint32Array(ab, 0, 2), nv = head[0], ni = head[1];
        const pos = new Float32Array(ab, 8, nv * 3);
        const idx = new Uint32Array(ab, 8 + nv * 12, ni);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setIndex(new THREE.BufferAttribute(idx, 1));
        g.computeVertexNormals();
        console.log('[glb] mesh', nv, 'verts', ni / 3, 'tris in', Math.round(performance.now() - t0), 'ms');
        const o = new THREE.Mesh(g); const sc = new THREE.Group(); sc.add(o); setScene(sc);
      }).catch((e) => { console.error('[glb] FAILED', e); setErr(String(e)); });
      return;
    }
    new GLTFLoader().load(url,
      (g) => { console.log('[glb] parsed in', Math.round(performance.now() - t0), 'ms'); setScene(g.scene); },
      (e) => { if (e.total) console.log('[glb]', Math.round(100 * e.loaded / e.total) + '%'); },
      (e) => { console.error('[glb] FAILED', e); setErr(String(e)); });
  }, [url]);
  const H = Number(q.get('h') || 1.2), Rt = Number(q.get('r') || 0.9);
  const { geo, scale, width } = useMemo(() => {
    if (!scene) return { geo: null, scale: 1, width: 1 };
    let g = null;
    scene.traverse((o) => { if (!g && o.isMesh) g = o.geometry; });
    g.computeBoundingBox();
    const bb = g.boundingBox, size = new THREE.Vector3(); bb.getSize(size);
    const sc = H / size.y;
    // Centre it on its own axis so instancing round the tier is about the stroke, not the file.
    const c = new THREE.Vector3(); bb.getCenter(c);
    const gg = g.clone(); gg.translate(-c.x, -bb.min.y, -c.z);
    console.log('[glb] raw bbox', size.toArray().map(v => +v.toFixed(3)),
      ' scale', +sc.toFixed(3), ' scaled width', +(size.x * sc).toFixed(3),
      ' tris', (g.index ? g.index.count : g.attributes.position.count) / 3);
    return { geo: gg, scale: sc, width: size.x * sc };
  }, [scene, H]);
  const mat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#F6EBD8', ...creamMaterial() }), []);
  if (err || !geo) return null;
  const n = Math.max(4, Math.round(Number(q.get('gn') || (2 * Math.PI * (Rt - width / 2)) / width)));
  console.log('[glb] placing', n, 'instances at R', +(Rt - width / 2).toFixed(3), ' tier H', H);
  if (typeof window !== 'undefined') window.__glb = { n, R: Rt - width / 2, H, scale,
    tris: geo.index ? geo.index.count / 3 : 0, bbox: geo.boundingBox && geo.boundingBox.toArray?.() };
  return <group position={[0, -H / 2, 0]}>
    <mesh position={[0, H / 2, 0]}>
      <cylinderGeometry args={[Rt - width / 2, Rt - width / 2, H, 96]} />
      <meshPhysicalMaterial color="#F0D9DC" {...creamMaterial()} />
    </mesh>
    {Array.from({ length: n }, (_, i) => {
      const th = (i / n) * Math.PI * 2, R = Rt - width / 2;
      return <mesh key={i} geometry={geo} material={mat} scale={scale}
        position={[R * Math.cos(th), 0, R * Math.sin(th)]} rotation={[0, -th, 0]} />;
    })}
  </group>;
}

createRoot(document.getElementById('root')).render(
  <div style={{ height: '100%', background: '#fff', display: 'flex' }}>
    {showRef && (
      <div style={{ width: '38%', borderRight: '1px solid #eee', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', padding: 12 }}>
        <img src="/ref-piped-stroke.png" alt="reference: one piped stroke"
             style={{ maxHeight: '96%', maxWidth: '100%', objectFit: 'contain' }} />
      </div>
    )}
    {/* ⚠️ `height: 100%` IS LOAD-BEARING. R3F sizes its canvas from the parent it is handed, and a
        flex child with no height measures ZERO at mount — the canvas falls back to 300×150 in the
        corner and every render comes back a blank white frame with no error anywhere. */}
    <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
    <Canvas camera={(styleKey || q.get('glb')) ? { position: [Number(q.get('dist') || 3.4), Number(q.get('eye') || 0.8), 0], fov: Number(q.get('fov') || 34) }
      : onCake ? { position: [Number(q.get('dist') || 5.6), 0.9, 1.4], fov: Number(q.get('fov') || 34) } : { position: [0, 0, 4.2], fov: 32 }} shadows>
      <SceneEnv />
      <SceneLights shadows />
      {/* ⚠️ A DIRECTIONAL KEY WAS ADDED HERE AS A DIAGNOSTIC AND TAKEN STRAIGHT BACK OUT, because
          `check:harness-scene` refused it — which is the gate doing exactly its job. The question it
          answered is worth keeping though: after fifteen geometry changes that each measured closer
          to the photograph and each looked the same, one directional light made the SAME geometry
          read as solid, every rib gaining a lit side and a shaded side. This scene is a near-uniform
          dome, so a rib's two flanks shade alike and a groove is only ever as dark as the shade
          baked into it. The remaining gap is the light or a real AO map, not a tip parameter — and
          neither is a change to make inside a harness. See features/hand-piping.md. */}
      {q.get('glb') ? <GlbWall url={q.get('glb')} /> : styleKey ? <StyledTier /> : stack && onCake ? <>
        {/* The stack, laid ON the cake's side: tangent to it, and rolled so a POINT faces outward —
            the same placement the wall gives a swept stroke. `?n=` repeats it round the tier. */}
        <Cake />
        {strokeAngles().map((a, i) => (
          <StarStack key={i} points={Number(q.get('points') || 5)} depth={Number(q.get('depth') || 0.55)}
            notch={Number(q.get('notch') ?? 0.42)} n={stack} height={2.0} thickness={t}
            wobble={Number(q.get('wob') ?? 0.012)} turn={Number(q.get('turn') ?? 0.002)}
            roll={a} ao={Number(q.get('ao') ?? 0.8)}
            x={(R - t) * Math.cos(a)} z={(R - t) * Math.sin(a)} />
        ))}
      </> : stack ? (
        <StarStack points={Number(q.get('points') || 5)} depth={Number(q.get('depth') || 0.55)}
          notch={Number(q.get('notch') ?? 0.42)}
          n={stack} height={2.0} thickness={t}
          wobble={Number(q.get('wob') ?? 0.012)} turn={Number(q.get('turn') ?? 0.002)}
          roll={Number(q.get('roll') ?? Math.PI / 2)} ao={Number(q.get('ao') ?? 0.8)} />
      ) : onCake ? <>
        <Cake />
        {/* ⚠️ SPACED AND ROLLED BY THE WALL'S OWN NUMBERS. `ropeSection` says how many go round at
            this nozzle width, so `?n=` neighbours land exactly where the tier would put them — the
            point of the page is to see what the tip leaves, not a spacing invented for a demo. */}
        {strokeAngles().map((a, i) => (
          <Stroke key={i} x={(R - t) * Math.cos(a)} z={(R - t) * Math.sin(a)} roll={a} />
        ))}
      </> : <Stroke roll={roll} />}
      {q.get('orbit') === '1' && <OrbitControls />}
    </Canvas>
    </div>
  </div>
);
