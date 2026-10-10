import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { extractGeo } from './shellGeo.js';
import { rosetteSeats } from '../geometry/rosetteCoat.js';
import { silhouette, maxTileStep } from '../geometry/tileCoverage.js';
import { coatShade } from '../geometry/coatShade.js';
import { creamMaterialProps } from '../geometry/creamMaterial.js';
import { SafeGlb } from './TextureErrorBoundary.jsx';

// ── A cake covered end to end in one piped piece ────────────────────────────────────────────────
//
// Sandeep, with a photograph of a rose-covered cake: *"cream piping is filled on entire cake."*
// Offered on an element whose `placement_config.can_coat` is ticked.
//
// ⚠️ THIS IS THE ONE RENDERER, and it is in core for that reason. It was prototyped inside
// PipingCalibrator, where a studio carrying its own copy of geometry is the mistake CLAUDE.md names
// outright — *"the tuned version and the rendered version drift"* — and which that same file already
// records costing a day when it kept its own `buildShellGeo`. The calibrator imports this.
//
// ⚠️ ONE INSTANCED MESH PER SURFACE, NOT ONE MESH PER PIECE. A coat is ~200 pieces and every one is
// the same shape in a different place. Building them separately measured 17.6M vertices on a single
// tier and the page never finished drawing; instanced, it is one upload. Three surfaces because the
// lid, the wall and the shoulder each bake their own rotation into the geometry, so they cannot
// share a matrix list — which is also the shape per-piece colour needs.

/* The three surfaces, and which authored rotation each uses.
 *
 * ⚠️ THE PEN'S FRAME ON ALL THREE, NEVER THE RING'S. A coat seats every piece by the SURFACE
 * NORMAL — up is out of the cake on the wall, up is up on the lid — which is the pen's frame, not
 * the ring's "upright in world, yawed outward". Feeding a ring figure to a wall is the bug recorded
 * on `side_rotation` in PLACEMENT_CONFIG.md: every piece came out back-on and it was reported as
 * the pen using a different nozzle from the element chosen.
 *
 * The shoulder takes the SIDE's figure: its normal bisects up and outward, so in the pen's frame it
 * is asking the wall's question rather than the lid's. */
const SURFACES = Object.freeze([
  { kind: 'top',  rot: 'top' },
  { kind: 'side', rot: 'side' },
  { kind: 'rim',  rot: 'side' },
]);

/* How much of a model counts as "the shape" when measuring it. A percentile of the vertices rather
 * than the bounding box: a spike or a tail makes the box far bigger than the cream, and every piece
 * is then seated as though it were that big. */
const SOLID_COVER = 0.9;
const DEG = Math.PI / 180;

/** The piece as it sits on one surface: rotated, re-centred, scaled, and measured. */
function prepare(baseGeo, rotDeg, pieceRadius) {
  if (!baseGeo) return null;
  const g = baseGeo.clone();
  const [rx, ry, rz] = rotDeg ?? [0, 0, 0];
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(rx * DEG, ry * DEG, rz * DEG)));
  g.computeBoundingBox();

  /* Extents from a percentile of the vertices, and the SCALE from the same ruler — mixing two was
   * the original fault. */
  const pos = g.getAttribute('position');
  const lo = (1 - SOLID_COVER) / 2, hi = 1 - lo;
  const ext = [0, 1, 2].map(axis => {
    const v = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) v[i] = pos.getComponent(i, axis);
    v.sort();
    const a = v[Math.floor(lo * (v.length - 1))], b = v[Math.ceil(hi * (v.length - 1))];
    return { min: a, max: b, size: b - a };
  });
  const scale = (2 * pieceRadius) / (Math.max(ext[0].size, ext[2].size) || 1);

  /* ⚠️ RE-CENTRED ON ALL THREE AXES AFTER THE ROTATION, not just seated on Y. This is the tilted-
   * shell bug PLACEMENT_CONFIG.md already records: extractGeo centres X/Z BEFORE any rotation, so
   * after one the piece hangs off its own origin — it dangles past the board at the bottom of the
   * wall and leaves cake showing on whichever side it moved away from. X and Z go to the centre
   * because the seat is the middle of the patch a piece covers; Y goes to the minimum because that
   * is the face resting on the cake. */
  g.translate(-(ext[0].min + ext[0].max) / 2, -ext[1].min, -(ext[2].min + ext[2].max) / 2);
  g.computeBoundingBox();

  /* The spacing this particular piece tiles at, MEASURED — a disc tiles at 0.81 of its width and a
   * sharp star needs 0.54, so no constant serves both. See tileCoverage.js. */
  const tile = maxTileStep(silhouette(g.getAttribute('position').array));

  return {
    geo: g, scale, tile: tile.ratioX,
    fitted: [ext[0].size * scale, ext[1].size * scale, ext[2].size * scale],
  };
}

function CoatSurface({ kind, part, seats, shades, palette, softness, onClick }) {
  /* Seat indices kept, because a shade is looked up by the seat's place in the WHOLE coat — the
     ombré is one continuous run over all three surfaces, so a per-surface index restarts it. */
  const mine = useMemo(
    () => seats.map((s, i) => ({ s, i })).filter(({ s }) => s.kind === kind),
    [seats, kind]);
  const ref = useRef();

  useEffect(() => {
    if (!ref.current || !part || !mine.length) return;
    const m = new THREE.Matrix4(), basis = new THREE.Matrix4(), q = new THREE.Quaternion();
    const sc = new THREE.Vector3(), c = new THREE.Color();
    mine.forEach(({ s, i: seatIdx }, i) => {
      sc.set(part.scale, part.scale, part.scale * (s.stretch ?? 1));
      const u = new THREE.Vector3(...s.u), n = new THREE.Vector3(...s.n), v = new THREE.Vector3(...s.v);
      /* (u, n, v) IN THAT ORDER — the piece was rotated with Y as its surface normal, so Y maps to
         n. The wrong column order lays every wall piece flat against the cake, and it looks
         plausible from directly in front. */
      basis.makeBasis(u, n, v);
      q.setFromRotationMatrix(basis);
      /* Variety is a roll about the normal; a different model per piece would defeat instancing,
         which is the only reason a coat renders at all. The golden angle gives every piece its own
         without storing one. */
      const roll = new THREE.Quaternion().setFromAxisAngle(n, (i * 2.399963) % (Math.PI * 2));
      m.compose(new THREE.Vector3(...s.p), roll.multiply(q), sc);
      ref.current.setMatrixAt(i, m);

      const t = Math.min(1, Math.max(0, shades[seatIdx] ?? 0));
      if (palette.length === 1) c.set(palette[0]);
      else {
        /* The gradient runs THROUGH every stop in order — two stops is one leg, three is two. */
        const span = (palette.length - 1) * Math.min(0.999999, t);
        const k = Math.floor(span);
        c.set(palette[k]).lerp(new THREE.Color(palette[k + 1] ?? palette[k]), span - k);
      }
      ref.current.setColorAt(i, c);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [part, mine, shades, palette]);

  if (!part || !mine.length) return null;
  /* No castShadow: the shadow pass re-renders every instance, and self-shadowing between pieces is
     not where the look comes from — the cream material's own sheen is. */
  return (
    <instancedMesh ref={ref} args={[part.geo, undefined, mine.length]} receiveShadow
                   onClick={onClick}>
      <meshPhysicalMaterial {...creamMaterialProps(softness)} />
    </instancedMesh>
  );
}

/**
 * @param coat   `{ glbUrl, colors: [hex, …], size }` as stored on a tier
 * @param shp    the tier's footprint from `tierShape()` — circle, rect or any outline
 * @param rot    `{ top: [x,y,z]deg, side: [x,y,z]deg }` from the element's placement_config
 */
/* ⚠️ WRAPPED, LIKE EVERY OTHER GLB USER IN THIS FOLDER. `useGLTF` suspends while it fetches and
 * throws if the file is missing or malformed — unguarded, either takes the whole canvas down with
 * it, and the cake a customer is editing goes with it. TopPipingRing and StampStroke each carry
 * SafeGlb for exactly this; a coat is no different, and is the more exposed case because it draws
 * on every surface at once. */
export default function CakeCoat(props) {
  if (!props?.coat?.glbUrl) return null;
  return <SafeGlb screen="CakeCoat"><CakeCoatImpl {...props} /></SafeGlb>;
}

function CakeCoatImpl({ coat, shp, tierHeight, baseY, rot, softness = 0.7, onCoatClick }) {
  const { scene } = useGLTF(coat?.glbUrl || '');
  const base = useMemo(() => (scene ? extractGeo(scene) : null), [scene]);

  const pieceRadius = Math.max(0.05, coat?.size ?? 0.26);
  const parts = useMemo(() => {
    if (!base) return null;
    const byRot = {
      top:  prepare(base.geo, rot?.top  ?? [0, 0, 0], pieceRadius),
      side: prepare(base.geo, rot?.side ?? rot?.top ?? [0, 0, 0], pieceRadius),
    };
    return byRot.top && byRot.side ? byRot : null;
  }, [base, rot?.top, rot?.side, pieceRadius]);

  const seats = useMemo(() => {
    if (!parts) return [];
    /* Overlap MEASURED off the piece, not defaulted. 0.95 is a margin for the rounding that makes
       each ring take a whole number of pieces, which can only ever push spacing up. */
    const step = Math.min(parts.side.tile, parts.top.tile) * 0.95;
    return rosetteSeats({
      shape: shp, tierHeight, baseY,
      pieceW: Math.max(parts.side.fitted[0], parts.top.fitted[0]),
      pieceH: parts.side.fitted[2],
      overlap: 1 - step,
      seed: 1,
    });
  }, [parts, shp, tierHeight, baseY]);

  const palette = useMemo(
    () => (coat?.colors?.length ? coat.colors : ['#f5e6c8']),
    [coat?.colors]);

  const shades = useMemo(
    () => coatShade(seats, { mode: palette.length > 1 ? 'ombre' : 'single', baseY, tierHeight,
                             balance: coat?.balance ?? 0.5 }),
    [seats, palette.length, baseY, tierHeight, coat?.balance]);

  if (!parts || !seats.length) return null;
  return (
    <>
      {SURFACES.map(({ kind, rot: which }) => (
        <CoatSurface key={kind} kind={kind} part={parts[which]} seats={seats}
                     shades={shades} palette={palette} softness={softness}
                     /* ⚠️ THE COAT IS THE CAKE'S SURFACE NOW, SO IT HAS TO BE SELECTABLE. A ring
                        carries onTopPipingClick; a coat covering every face and carrying none left
                        a customer with no way back to the card that made it — tapping the roses
                        did nothing. Every surface answers, because every surface is the coat. */
                     onClick={onCoatClick} />
      ))}
    </>
  );
}
