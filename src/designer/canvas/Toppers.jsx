import { useMemo, useState, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { topperSheets, topperBox, topperStick } from '../geometry/topperPiece.js';
import { garnishPlacement, garnishDragTo } from '../geometry/garnishPlacement.js';
import { loadTopperFace } from '../geometry/topperFaces.js';
import { CardStock, cardAlbedo } from './CardStock.jsx';
import { useDragPlacement } from '../hooks/useDragPlacement.js';
import { planeHit } from '../utils/raycasting.js';

// ── Card toppers on the cake ─────────────────────────────────────────────────────────────────────
//
// A topper is a card composed in the topper composer and stood on the cake. Like a garnish it is an
// OBJECT — it has a position, an orientation and a size — so it can be moved and it signs the
// movable contract.
//
// ⚠️ IT IS PLACED BY `garnishPlacement`, NOT BY A PLACEMENT OF ITS OWN. A garnish and a topper are
// the same problem: a flat piece made off the cake, stood or laid on a round tier top, positioned by
// an angle and a fraction out from the middle. Writing a second placement for the same job is how
// two decorations start disagreeing about what `radius` means, and the movable contract's first law
// is that ONE place says where a thing is.
//
// ⚠️ AND THIS COMPONENT ADDS NO TRANSFORM OF ITS OWN. Everything comes from the placement. If you
// find yourself adding an offset here, the offset belongs in the placement instead.
//
// ⚠️ THE SHAPES COME FROM `topperPiece.js`, the same function the composer asks. A private copy here
// is two answers to one question, and this is the one the customer sees (INVARIANTS #15).

const BLOCK_KEY = '__block';
const blockFont = new FontLoader().parse(helvetikerBold);

/* How far apart consecutive sheets sit, as a fraction of the card's own thickness.
 *
 * ⚠️ IT IS A THIRD, NOT A TWENTIETH, AND THAT IS A DEPTH-BUFFER FACT RATHER THAN A TASTE. It started
 * at 0.06 — the same order as the composer's own `CARD_THICK * 0.1` — and a "10" on a cake came out
 * SPECKLED, its white offset band punching through the red digits in patches. The composer gets away
 * with a smaller step because it looks through an orthographic camera parked right in front of the
 * card; a cake is seen by a perspective camera several units away, where the depth buffer's
 * precision at that distance cannot separate two faces a thousandth of a unit apart.
 *
 * A whole topper still spans about one card thickness front to back, so it is one flat card. */
const LAYER_STEP = 1 / 3;

/* Faces resolve asynchronously and a cake cannot wait for them.
 *
 * ⚠️ SO A MISSING FACE DRAWS IN THE BLOCK ONE RATHER THAN DRAWING NOTHING. A topper that vanishes
 * for a moment while a font arrives reads as a bug, and worse, a THUMBNAIL captured in that moment
 * is silently missing its topper for good. `loadTopperFace` caches, so this settles after the first
 * cake that uses a face.
 */
function useFaces(toppers) {
  const [fonts, setFonts] = useState({ [BLOCK_KEY]: blockFont });
  const wanted = useMemo(() => {
    const keys = new Set();
    for (const t of toppers) {
      for (const o of t.payload?.objects ?? []) if (o.kind === 'text' && o.face) keys.add(o.face);
    }
    return [...keys];
  }, [toppers]);

  useEffect(() => {
    let alive = true;
    for (const key of wanted) {
      if (key === BLOCK_KEY || fonts[key]) continue;
      loadTopperFace(key).then(f => alive && setFonts(m => (m[key] ? m : { ...m, [key]: f }))).catch(() => {});
    }
    return () => { alive = false; };
  }, [wanted, fonts]);

  return fonts;
}

export default function Toppers({
  toppers = [], tierData = [], onSelect, onMove, onOrbitEnable, selectedId = null,
}) {
  const fonts = useFaces(toppers);
  const top = tierData[tierData.length - 1];
  if (!top || !toppers.length) return null;
  const bottom = tierData[0] ?? top;

  /* Which surface a topper belongs to — the same question a garnish answers, answered the same way.
     Absent `tierIndex` means the TOP, never tier zero: defaulting to the bottom would move every
     topper already placed down the cake. */
  const surfaceFor = (t) => {
    if (t.zone === 'board') return { radius: (bottom.radius ?? top.radius) * 1.35, topY: 0.1, boardY: 0.1 };
    const i = Number.isInteger(t.tierIndex) ? t.tierIndex : tierData.length - 1;
    const tier = tierData[Math.max(0, Math.min(tierData.length - 1, i))] ?? top;
    return { radius: tier.radius, topY: tier.baseY + tier.height, boardY: 0.1 };
  };

  return (
    <>
      {toppers.map(t => (
        <Topper key={t.id} t={t} cake={surfaceFor(t)} fonts={fonts}
          onSelect={onSelect} onMove={onMove} onOrbitEnable={onOrbitEnable}
          selected={selectedId === t.id} />
      ))}
    </>
  );
}

function Topper({ t, cake, fonts, onSelect, onMove, onOrbitEnable, selected }) {
  const { camera, gl } = useThree();

  /* Built once per topper, not per frame: cutting a word walks every curve of every glyph. Keyed on
     the payload and the fonts, which are the only inputs that change the MESH — moving or turning a
     topper changes where it is drawn, not what it is. */
  const built = useMemo(() => {
    const fontOf = (o) => fonts[o.face] ?? blockFont;
    const box = topperBox(t.payload, fontOf);
    if (!box || !(box.w > 0)) return null;

    /* The composer works in its own units; the cake works in tier radii. One scale takes the whole
       composition across, so the pieces keep their relationship to each other — scaling each object
       by its own size would pull the composition apart. */
    const world = (cake.radius ?? 1.2) * 0.9 * (t.scale ?? 1);
    const k = world / box.w;
    const depth = Math.max(0.006, world * 0.012);

    /* ⚠️ BOTTOM-CENTRE ORIGIN: x centred, y RESTING ON ZERO — never centred on y.
     *
     * This is `garnishPlacement`'s contract, stated at the top of `garnishPiece.js` ("centred on x,
     * resting on y = 0") and relied on by both modes. A standing piece is dropped at `topY` and
     * expected to grow UPWARD from there, so a y-centred mesh is buried to its waist in the cake. A
     * lying piece is deliberately stepped back half a height to bring its middle onto the anchor,
     * so a y-centred mesh is pushed half a height PAST where the design says it is.
     *
     * Both were wrong here, and only the standing one was obvious: laid flat, a small topper near
     * the middle still looks fine, which is the same reason garnishPlacement's own version of this
     * bug survived for so long — its note above the `lie` branch says so. Caught by putting one on
     * a real cake in `dev/topper-on-cake.jsx`; no unit test sees a mesh's origin. */
    /* The stick, if this topper has one. Not a sheet — see topperPiece.js — so it is built here and
       carried alongside them. */
    const stick = topperStick(box, t.payload?.stick);

    /* ⚠️ WITH A STICK, THE ORIGIN IS THE STICK'S END. `garnishPlacement` puts the origin at the
       surface and sinks it, so whatever sits at the origin is what goes into the icing: seating by
       the card's edge and letting the stick dangle below would make "how far in" change nothing
       visible. Without a stick the card's own bottom edge is still the origin. */
    const originY = stick ? stick.bottomY : box.cy - box.h / 2;

    const sheets = topperSheets(t.payload, fontOf).map((sheet) => {
      const geos = sheet.parts.map((p) => {
        const at = (q) => new THREE.Vector2((q.x + sheet.x - box.cx) * k, (q.y + sheet.y - originY) * k);
        const shape = new THREE.Shape(p.outer.map(at));
        shape.holes = (p.holes ?? []).map(h => new THREE.Path(h.map(at)));
        const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
        /* ⚠️ The stacking again: coplanar sheets interpenetrate, so each is nudged forward by a
           fraction of the card's own thickness. Small enough that the finished topper is still one
           flat card, decisive enough for the depth test. */
        g.translate(0, 0, sheet.layer * depth * LAYER_STEP);
        return g;
      });
      return { geos, colour: sheet.colour, finish: sheet.finish };
    });

    /* A rod, not a sheet: built here rather than extruded from contours. Behind the card in z, so
       the overlap that attaches it is hidden exactly as it is on a real one. */
    let stickGeo = null;
    if (stick) {
      stickGeo = new THREE.CylinderGeometry(stick.radius * k, stick.radius * k, (stick.len + stick.tuck) * k, 14);
      // The cylinder is built about its own middle; slide it so its ends land where the stick's do.
      stickGeo.translate(0, ((stick.len + stick.tuck) / 2 - stick.len) * k, -depth * 0.9);
    }

    return {
      sheets,
      stickGeo,
      // What the placement must bury: the stick's buried length, in the cake's units.
      sink: stick ? stick.buried * k : undefined,
      size: { w: box.w * k, h: box.h * k },
    };
  }, [t.payload, t.scale, cake.radius, fonts]);

  /* ⚠️ EVERY HOOK BEFORE ANY EARLY RETURN — a topper whose payload failed to build must not skip a
     hook its neighbours call. React treats a changed hook order as fatal; `check:hooks` gates it. */
  const { grabProps } = useDragPlacement({
    camera, gl, onOrbitEnable,
    onClick: () => onSelect?.(t.id),
    onMove: onMove ? patch => onMove(t.id, patch) : null,
    resolve: (ray) => {
      const hit = planeHit(ray, new THREE.Plane(new THREE.Vector3(0, 1, 0), -cake.topY));
      if (!hit) return null;
      const u = Math.atan2(hit.z, hit.x) / (Math.PI * 2);
      const v = Math.hypot(hit.x, hit.z) / (cake.radius || 1);
      return garnishDragTo(t, cake, u, v);
    },
  });

  useEffect(() => () => {
    for (const s of built?.sheets ?? []) for (const g of s.geos) g.dispose();
    built?.stickGeo?.dispose();
  }, [built]);

  if (!built) return null;
  const place = garnishPlacement(t, cake, { ...built.size, sink: built.sink });

  return (
    <group position={place.position} rotation={place.rotation}>
      {/* Drawn first, so the card's own sheets cover the tuck. Wood rather than card: a stick is the
          one part of a topper nobody paints, and a matte pale beech is what a cake-pop stick is. */}
      {built.stickGeo && (
        <mesh geometry={built.stickGeo} castShadow receiveShadow {...grabProps}>
          <meshStandardMaterial color={cardAlbedo('#D8BE93')} roughness={0.85} metalness={0} />
        </mesh>
      )}
      {built.sheets.map((sheet, si) => sheet.geos.map((g, i) => (
        <mesh key={`${si}-${i}`} geometry={g} castShadow receiveShadow {...grabProps}>
          {/* ⚠️ THE SAME MATERIAL THE STUDIO DRAWS, from one file. Both used to hold their own copy
              of the reference light and their own matte standard material — identical then, and two
              things to keep in step forever (INVARIANTS #15). The studio is where the card is
              CHOSEN, so it is the worst place in the app for a shade to drift. */}
          <CardStock colour={sheet.colour} finish={sheet.finish} selected={selected} />
        </mesh>
      )))}
    </group>
  );
}
