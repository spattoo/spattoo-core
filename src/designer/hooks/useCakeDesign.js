import { useState, useMemo } from 'react';
import { TIER_RADII, BOTTOM_BASE, BOTTOM_H, TIER_HEIGHT_STEP, ZONES, PLACEMENT_MODES } from '../constants.js';
import { tierShape } from '../geometry/surface.js';
import { facingOffsetRadians, edgeSeatSeed, deOverlapSeat } from '../placement.js';
import { FROSTING_TYPES, DEFAULT_FROSTING, frostingAllowsStyle } from '../frostings.js';
import { DEFAULT_STYLE } from '../creamStyles.js';
import { LUSTER_DUST_DEFAULTS, LUSTER_DUST_NEW_SPLASH } from '../shared/textures/lusterDust.js';

export { TIER_RADII };   // re-export so existing imports from this file keep working
// Frosting types now live in the frostings registry; re-export so existing importers
// (FrostingPicker, admin CreateTemplate) keep resolving them from here.
export { FROSTING_TYPES };

// Default digit face for age numbers — a clean, rounded single-stroke face; the fat tube does most
// of the balloon look. The Age popup lets the customer switch faces.
const DEFAULT_AGE_FONT = 'ems_readability';

const DEFAULT_DESIGN = {
  tiers: [
    { color: '#f5b8c8', frostingType: DEFAULT_FROSTING, frostingStyle: DEFAULT_STYLE, topPipings: [], bottomPipings: [] },
  ],
  texts: [],
  ages: [],        // gold 3D balloon-number toppers standing on the cake top (see AgeNumber)
  stickers: [],
  writing: null,   // one cream-pen message piped on the cake top (see CreamWriting)
  piping: [],      // freehand cream-pen strokes (see CreamPen / creamPen.js)
};

// Pure resolver: a design (authored shape, fields optional) → the canvas/scene config the
// renderer consumes (radius/height/frosting defaults filled in). This is the SINGLE place tier
// geometry defaults live — the live editor's `canvasConfig` useMemo and the read-only `CakePreview`
// both call it, so the two never drift (INVARIANTS #3). Keep it pure (no hooks/state).
export function toCanvasConfig(design) {
  return {
    tiers: (design.tiers ?? []).map((t, i) => {
      const isRect = t.shape === 'rect';
      const width  = t.width ?? 2.16;   // default half-sheet footprint
      const depth  = t.depth ?? 1.56;
      return {
        // For rect, radius is the bounding half-extent so radius-based incidental
        // placement (board, toolbar offsets, topper scale) keeps working.
        radius:       isRect ? Math.max(width, depth) / 2 : (t.radius ?? TIER_RADII[i] ?? 0.35),
        height:       t.height  ?? (BOTTOM_H - i * TIER_HEIGHT_STEP),
        color:        t.color,
        gradient:     t.gradient ?? null,
        frostingType: t.frostingType ?? DEFAULT_FROSTING,
        frostingStyle: t.frostingStyle ?? DEFAULT_STYLE,
        styleParams:  t.styleParams ?? null,   // the style's per-tier param overrides (Depth/Waviness…) — was dropped here, so the controls did nothing
        dusting:      t.dusting ?? null,        // luster-dust splashes + appearance (per-tier wall treatment)
        topPipings:    t.topPipings ?? (t.topPiping ? [t.topPiping] : []),
        bottomPipings: t.bottomPipings ?? (t.bottomPiping ? [t.bottomPiping] : []),
        ...(isRect && { shape: 'rect', width, depth, cornerR: t.cornerR ?? 0 }),
      };
    }),
    texts:    design.texts ?? [],
    ages:     design.ages ?? [],
    stickers: design.stickers ?? [],
    writing:  design.writing ?? null,
    piping:   design.piping ?? [],
  };
}

// Back-compat: convert a legacy `design.topper` (single hero slot) into a sticker appended to
// the stickers list. Topper === a GLB element on the top surface (placement 'stand') or side
// ('hug'). Old topper.scale was a multiplier on CakeTopper's tier-relative base (~5× the
// sticker base), so multiply by ~5 to preserve the rendered size.
function migrateTopperToSticker(templateDesign) {
  const base = templateDesign.stickers ?? [];
  const tp = templateDesign.topper;
  if (!tp?.image_url) return base;
  const isSide = tp.placement === 'side';
  return [...base, {
    id: tp.id ?? Date.now(),
    elementId: tp.elementId ?? tp.id ?? null,
    imageUrl: tp.image_url,
    name: tp.name ?? 'Topper',
    zone: isSide ? 'side' : 'top_surface',
    tierIndex: tp.tierIndex ?? Math.max(0, (templateDesign.tiers?.length ?? 1) - 1),
    placementMode: isSide ? 'hug' : 'stand',
    u: tp.u ?? null,
    theta: tp.theta ?? 0,
    y: tp.y ?? (BOTTOM_BASE + BOTTOM_H * 0.45),
    x: tp.x ?? 0,
    z: tp.z ?? 0,
    scale: (tp.scale ?? 1) * 5,
    baseRotation: [0, -Math.PI / 2, 0],   // legacy CakeTopper faced toppers with this offset
    yOffset: 0, rotation: 0, radialOffset: 0, tiltAngle: 0, groupId: null,
    color: tp.color ?? null,
    allowedActions: { resize: true, duplicate: true, color: false, delete: true, move: true, tilt: true },
  }];
}

// One freehand stroke. `points` are the SEATED centerline in cake/world space
// ([[x,y,z]…]) — the draw layer already offset each hit along the surface normal, so
// the renderer just sweeps the nozzle profile through them.
const DEFAULT_STROKE = {
  nozzle: 'star5', color: '#ffffff', thickness: 0.03, softness: 0.7,
  tierIndex: null, points: [],
};

// Cream-pen writing defaults — created the first time the user types a message.
const DEFAULT_WRITING = {
  text: '', font: 'ems_allure', color: '#ffffff',
  thickness: 0.03, fit: 0.8, softness: 0.7,
  curve: 0, lineSpacing: 1.4,
  surface: 'top',            // 'top' | 'side' | 'board'
  yaw: 0, offsetX: 0, offsetZ: 0, lift: 0.02,
  boardX: undefined, boardZ: undefined,   // board placement (default seeded in CreamWriting)
  sideAngle: 0, sideY: undefined,         // side placement (default = mid of bottom tier)
};

// Each piping carries a stable layerId so a tier can hold multiple stacked piping
// layers per zone and every layer stays addressable across edits/renders.
const newLayerId = () => crypto.randomUUID();
const withLayerId = (piping) => (piping.layerId ? piping : { ...piping, layerId: newLayerId() });
const zoneKey = (zone) => (zone === ZONES.RIM || zone === ZONES.TOP ? 'topPipings' : 'bottomPipings');

// Passed as storageBaseUrl option — only used to migrate old-format templates
// that stored decoration type 'swirl_ring'/'base_border' instead of piping objects.
const LEGACY_PIPING_SLUG = 'elements/3D-images/piping-cream4.glb';

export function useCakeDesign({ storageBaseUrl = '' } = {}) {
  const [design, setDesign] = useState(DEFAULT_DESIGN);

  function setTierColor(index, color) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => i === index ? { ...t, color } : t),
    }));
  }

  // Frosting TYPE (material) per tier — buttercream | whipped | fondant | naked. Resolved through
  // the frostings registry in CakeTier (material + edge + capabilities); the colour stays on tier.color.
  function setTierFrostingType(index, frostingType) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => {
        if (i !== index) return t;
        // Clamp the style to the new material's offered set (smooth always allowed) so a material
        // switch can't leave an unsupported wall (e.g. wave on fondant).
        const frostingStyle = frostingAllowsStyle(frostingType, t.frostingStyle ?? DEFAULT_STYLE)
          ? t.frostingStyle : DEFAULT_STYLE;
        return { ...t, frostingType, frostingStyle };
      }),
    }));
  }

  // Frosting STYLE (surface technique) per tier — smooth | wave | swirl | rustic. Composes with
  // frostingType in CakeTier (material from type, wall geometry from style). The colour is unchanged.
  function setTierFrostingStyle(index, frostingStyle) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => i === index ? { ...t, frostingStyle } : t),
    }));
  }

  // Per-tier override of a single STYLE parameter (depth, waviness, …). Stored sparsely on
  // tier.styleParams; absent keys fall back to the style's schema default in resolveStyleParams.
  function setTierStyleParam(index, key, value) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => i === index
        ? { ...t, styleParams: { ...(t.styleParams ?? {}), [key]: value } }
        : t),
    }));
  }

  // Tier gradient — same instance-level model as piping/stickers (eligibility is gated in the UI by
  // TIER_CAPS.gradient; the stops + balance live on the tier as tier.gradient = { mode, colors,
  // balance }). `color` stays the solid/stop-0 fallback. ≥2 stops = a gradient; fewer drops it back
  // to the solid colour. Rendered via the shared applyGradient helper (shared/color/gradientMaterial.js).
  function setTierGradient(index, colors, mode = 'vertical', balance = 0.5) {
    const clean = (colors ?? []).filter(Boolean);
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => {
        if (i !== index) return t;
        return clean.length >= 2
          ? { ...t, gradient: { mode, colors: clean, balance }, color: clean[0] }
          : { ...t, gradient: undefined, color: clean[0] ?? t.color };
      }),
    }));
  }

  function setTierCornerR(index, cornerR) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => i === index ? { ...t, cornerR } : t),
    }));
  }

  // Back-compat single-piping setters: replace the whole zone with [piping] (or clear it).
  // Preserve an existing layerId so repeated edits don't remount the GLB ring.
  function setTopPiping(index, piping) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => i === index ? { ...t, topPipings: piping ? [withLayerId(piping)] : [] } : t),
    }));
  }

  function setBottomPiping(index, piping) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => i === index ? { ...t, bottomPipings: piping ? [withLayerId(piping)] : [] } : t),
    }));
  }

  // ── Layer-aware piping ops (multiple piping styles stacked per zone) ──────────
  function addPipingLayer(index, zone, piping) {
    const key = zoneKey(zone);
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => i === index ? { ...t, [key]: [...(t[key] ?? []), withLayerId(piping)] } : t),
    }));
  }

  function updatePipingLayer(index, zone, layerId, mutate) {
    const key = zoneKey(zone);
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => i === index
        ? { ...t, [key]: (t[key] ?? []).map(p => p.layerId === layerId ? { ...mutate(p), layerId } : p) }
        : t),
    }));
  }

  function removePipingLayer(index, zone, layerId) {
    const key = zoneKey(zone);
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => i === index
        ? { ...t, [key]: (t[key] ?? []).filter(p => p.layerId !== layerId) }
        : t),
    }));
  }

  // Luster dust — a per-tier wall treatment (NOT a sticker): a list of flicked splash points plus the
  // shared appearance. A tap on the wall adds a splash {u,v} (aim defaults from LUSTER_DUST_NEW_SPLASH);
  // `updateDusting` tunes colour/appearance; clearing removes the whole dusting. The first splash seeds
  // the dusting object from the studio-approved defaults.
  function addDustSplash(index, u, v) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => {
        if (i !== index) return t;
        const base = t.dusting ?? { ...LUSTER_DUST_DEFAULTS, splashes: [] };
        return { ...t, dusting: { ...base, splashes: [...base.splashes, { u, v, ...LUSTER_DUST_NEW_SPLASH }] } };
      }),
    }));
  }

  function updateDusting(index, changes) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => (i === index && t.dusting) ? { ...t, dusting: { ...t.dusting, ...changes } } : t),
    }));
  }

  function clearDusting(index) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => i === index ? { ...t, dusting: null } : t),
    }));
  }

  function updateDustSplash(index, splashIndex, patch) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => (i === index && t.dusting?.splashes)
        ? { ...t, dusting: { ...t.dusting, splashes: t.dusting.splashes.map((sp, j) => j === splashIndex ? { ...sp, ...patch } : sp) } }
        : t),
    }));
  }

  function removeDustSplash(index, splashIndex) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => {
        if (i !== index || !t.dusting?.splashes) return t;
        const splashes = t.dusting.splashes.filter((_, j) => j !== splashIndex);
        return { ...t, dusting: splashes.length ? { ...t.dusting, splashes } : null };
      }),
    }));
  }

  function removeLastDustSplash(index) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => {
        if (i !== index || !t.dusting?.splashes?.length) return t;
        const splashes = t.dusting.splashes.slice(0, -1);
        return { ...t, dusting: splashes.length ? { ...t.dusting, splashes } : null };
      }),
    }));
  }

  function addTier() {
    setDesign(prev => {
      if (prev.tiers.length >= 4) return prev;
      return { ...prev, tiers: [...prev.tiers, { color: '#ffffff', frostingType: DEFAULT_FROSTING, frostingStyle: DEFAULT_STYLE, topPipings: [], bottomPipings: [] }] };
    });
  }

  function removeTier(index) {
    setDesign(prev => {
      if (prev.tiers.length <= 1) return prev;
      return { ...prev, tiers: prev.tiers.filter((_, i) => i !== index) };
    });
  }

  function addText() {
    setDesign(prev => ({
      ...prev,
      texts: [...prev.texts, {
        id:       Date.now(),
        content:  'Your Text',
        theta:    0,
        y:        BOTTOM_BASE + BOTTOM_H * 0.45,
        color:    '#ffffff',
        fontSize: 0.28,
        bold:     false,
      }],
    }));
  }

  function updateText(id, changes) {
    setDesign(prev => ({
      ...prev,
      texts: prev.texts.map(t => t.id === id ? { ...t, ...changes } : t),
    }));
  }

  function duplicateText(id) {
    setDesign(prev => {
      const original = prev.texts.find(t => t.id === id);
      if (!original) return prev;
      const offset = original.u != null ? { u: (((original.u + 0.04) % 1) + 1) % 1 } : { theta: original.theta + 0.3 };
      return {
        ...prev,
        texts: [...prev.texts, { ...original, id: Date.now(), ...offset }],
      };
    });
  }

  function removeText(id) {
    setDesign(prev => ({ ...prev, texts: prev.texts.filter(t => t.id !== id) }));
  }

  // ── Age numbers — gold balloon-number toppers standing on the cake top ──────────
  // Reuses the cream tube-sweep geometry (buildCreamWriting) + gold material; a fat tube on a
  // single-stroke digit reads as a metallic number candle. `value` is a digit string ('5','25');
  // size = standing height (world units), thickness = tube radius (balloon chunkiness), font picks
  // the digit shape, offsetX/offsetZ place it on the top plane (drag), yaw rotates it.
  function addAge() {
    setDesign(prev => ({
      ...prev,
      ages: [...prev.ages, {
        id:        Date.now(),
        value:     '1',
        font:      DEFAULT_AGE_FONT,
        size:      0.95,
        thickness: 0.085,
        finish:    'gold',
        offsetX:   0,
        offsetZ:   0,
        yaw:       0,
      }],
    }));
  }

  function updateAge(id, changes) {
    setDesign(prev => ({
      ...prev,
      ages: prev.ages.map(a => a.id === id ? { ...a, ...changes } : a),
    }));
  }

  function duplicateAge(id) {
    setDesign(prev => {
      const original = prev.ages.find(a => a.id === id);
      if (!original) return prev;
      return { ...prev, ages: [...prev.ages, { ...original, id: Date.now(), offsetX: (original.offsetX ?? 0) + 0.12 }] };
    });
  }

  function removeAge(id) {
    setDesign(prev => ({ ...prev, ages: prev.ages.filter(a => a.id !== id) }));
  }

  // `extra` carries identity that isn't derived from the element: an explicit `id`
  // (so a caller spawning several parts in one tick avoids Date.now() collisions) and
  // pattern membership (`patternId` ties a decor_pattern's parts together for the orphan
  // guard; `patternDeletable` mirrors the pattern's placement_config.parts_deletable).
  function addSticker(element, zone, tierIndex, placementMode, position = {}, extra = {}) {
    const isGlb = /\.(glb|gltf)(\?|$)/i.test(element.image_url ?? '');
    const defaultScale = element.placement_config?.r ?? (isGlb ? 2.5 : element.placement_config?.photo?.mask ? 3.5 : 1);
    // Edge-seated modes (perch, verge) seat onto the front rim edge and carry a calibrated lean —
    // computed by the shared edgeSeatSeed helper (same seed the chooser's move path uses, so both
    // paths land identically). Verge leans about the rim tangent at render (radial-outward); perch
    // straddles the edge with a fixed world-X lean.
    const isEdgeSeated = placementMode === PLACEMENT_MODES.PERCH || placementMode === PLACEMENT_MODES.VERGE;
    // `exact`: place the instance at the given position VERBATIM — skip all seeding/de-overlap. Used by
    // the ball cluster, which has already packed exact tangent positions (de-overlap would un-pack them).
    const exact = extra.exact === true;
    const newId = extra.id ?? Date.now();   // returned so callers can select the just-added sticker
    setDesign(prev => {
      let px = position.x ?? 0;
      let seatTilt = 0, seatYOffset = 0;   // overridden by edgeSeatSeed for perch/verge below
      let pz = position.z ?? 0;
      // Seat angle/height for round side placements (hug/default). Resolved below so a re-added
      // instance never lands exactly on a coincident sibling.
      let seatTheta = position.theta ?? 0;
      let seatY = position.y ?? (BOTTOM_BASE + BOTTOM_H * 0.45);
      if (!exact && placementMode === PLACEMENT_MODES.STAND && zone === ZONES.TOP_SURFACE) {
        // De-overlap off coincident stand siblings so both toppers have separate, selectable centres
        // (drag-time collision handles the rest). Shared rule — see deOverlapSeat.
        const shp = tierShape(prev.tiers[tierIndex ?? 0] ?? prev.tiers[0]);
        const siblings = prev.stickers.filter(
          s => s.zone === ZONES.TOP_SURFACE && s.tierIndex === (tierIndex ?? 0) && s.placementMode === PLACEMENT_MODES.STAND
        );
        ({ x: px, z: pz } = deOverlapSeat(shp, ZONES.TOP_SURFACE, { x: px, z: pz }, siblings));
      }
      if (!exact && isEdgeSeated) {
        // Edge-seated modes (perch, verge) ALWAYS start on the FRONT edge (toward the camera, +z) — in
        // the centre a perch would bury the figure / a verge would have nothing to lean over. Seed via
        // the shared helper, then nudge off a coincident same-mode sibling. The customer drags it
        // around the rim afterwards.
        const shp = tierShape(prev.tiers[tierIndex ?? 0] ?? prev.tiers[0]);
        const seed = edgeSeatSeed(element.placement_config, shp, placementMode);
        px = seed.x;
        pz = seed.z;
        seatTilt = seed.tiltAngle;
        seatYOffset = seed.yOffset;
        // De-overlap around the rim off a coincident same-mode sibling (shared rule — keeps it on the
        // perimeter via deOverlapSeat's rim branch).
        const siblings = prev.stickers.filter(s => s.placementMode === placementMode && s.tierIndex === (tierIndex ?? 0));
        ({ x: px, z: pz } = deOverlapSeat(shp, ZONES.RIM, { x: px, z: pz }, siblings));
      }
      // De-overlap every OTHER scatter placement (hug / default mode): a re-added instance must
      // not stack exactly on a coincident sibling (they'd look like one). Geometry-driven by zone,
      // never by element type/slug (INVARIANTS #1/#2). stand handles its own above.
      if (!exact && placementMode !== PLACEMENT_MODES.STAND) {
        const isSide = zone === ZONES.SIDE || zone === ZONES.MIDDLE_TIER;
        const isScatterSib = s => s.placementMode !== PLACEMENT_MODES.STAND;
        if (isSide && position.u == null) {
          // Round wall: walk the seat angle until clear of any coincident sibling (shared rule).
          const siblings = prev.stickers.filter(
            s => (s.zone === ZONES.SIDE || s.zone === ZONES.MIDDLE_TIER) && s.tierIndex === (tierIndex ?? 0) && isScatterSib(s)
          );
          ({ theta: seatTheta } = deOverlapSeat(null, zone, { theta: seatTheta, y: seatY }, siblings));
        } else if (zone === ZONES.TOP_SURFACE) {
          // Flat-on-top decals: cartesian nudge, kept inside the tier (shared rule).
          const shp = tierShape(prev.tiers[tierIndex ?? 0] ?? prev.tiers[0]);
          const siblings = prev.stickers.filter(
            s => s.zone === ZONES.TOP_SURFACE && s.tierIndex === (tierIndex ?? 0) && isScatterSib(s)
          );
          ({ x: px, z: pz } = deOverlapSeat(shp, ZONES.TOP_SURFACE, { x: px, z: pz }, siblings));
        }
      }
      return {
        ...prev,
        stickers: [...prev.stickers, {
          id:            newId,
          elementId:     element.id,
          imageUrl:      element.image_url,
          name:          element.name,
          zone,
          tierIndex:     tierIndex ?? 0,
          placementMode: placementMode ?? 'hug',
          // Static config copies (like placementMode/baseRotation) — NOT a computed scale.
          // A hero hug derives its size from the tier wall at render time (isDynamicHug);
          // hugFill tunes that fraction. Scattered decor leaves singlePerSlot falsy → keeps r.
          singlePerSlot: element.placement_config?.single_per_slot === true,
          // Density-scatter unit (sprinkles): packed instances managed by a density control. The
          // flag rides on each instance so the card can collapse them. Config-driven
          // (placement_config.scatter).
          scatter:       element.placement_config?.scatter === true,
          // Cluster-capable ball (placement_config.cluster): a single such ball pocket-snaps tangent to
          // its neighbours when dragged, so the customer can hand-build a cluster (manual mode).
          clusterBall:   !!element.placement_config?.cluster,
          // Side seating: default flush (true hug, centred on the wall); proud = back-on-wall so a
          // deep model stands off the wall (toppers). Config-driven; applied in the side bend path.
          // A cluster ball is a sphere: on the side it must rest PROUD on the wall (back-on-wall), never
          // centred/half-buried — so cluster elements are always side-proud regardless of side_proud.
          sideProud:     element.placement_config?.side_proud === true || !!element.placement_config?.cluster,
          hugFill:       element.placement_config?.hug_fill ?? null,
          // Folded sticker: a flat decal that splits at the body spine into two hinged wings
          // (e.g. a card butterfly). Capability is config-gated like parts_deletable — the
          // renderer only splits/folds when `foldable` is true; fold (deg) / spine (0–1) tune
          // it, falling back to DEFAULT_FOLD_DEG / DEFAULT_SPINE at render. Absent → flat plane.
          foldable:      element.placement_config?.foldable === true,
          fold:          element.placement_config?.fold ?? null,
          spine:         element.placement_config?.spine ?? null,
          // Verge seat anchor (placement_config.verge.seat): 'center' (default) rests the mid-spine on
          // the rim edge so the body drapes over the lip; 'base' seats the body base on the surface.
          // Read by the render's isVergeBase branch; null/absent → centre.
          vergeSeat:     element.placement_config?.verge?.seat ?? null,
          // Pixel-recolour region descriptor for a 2D image sticker (e.g. recolour only a card
          // butterfly's wings). Present → the renderer recolours those pixels to `color` (driven by
          // the same ColorWheel/allowed_actions.color as GLB tint). Absent → image renders as-is.
          recolor:       element.placement_config?.recolor ?? null,
          // Photo-cake frame (config-gated on placement_config.photo.mask, no element-type branch): the
          // MASK is the shape (heart/circle/square…) and drives both the photo clip and the procedural
          // border. The customer's photo (photoUrl) is clipped to it; the border is a colour ring of
          // borderWidth (0 = none, recoloured via `color`), unless a decorative overlay (photoOverlay)
          // supplies fancy border art. Absent → renders as a plain decal.
          photoMask:      element.placement_config?.photo?.mask ?? null,
          photoOverlay:   element.placement_config?.photo?.overlay ?? null,   // optional decorative border art
          photoShape:     element.placement_config?.photo?.shape ?? null,     // 'round'|'rect'|'other' — top-fit max-size rule
          photoFill:      element.placement_config?.photo?.fill ?? 1,         // shape extent as a fraction of the plane (measured) — exact fit-to-rim
          borderWidth:    element.placement_config?.photo?.border?.width ?? 0.06,  // thin default; 0 = no border
          photoUrl:       null,                       // customer upload (set at design time); distinct from imageUrl (the mask/shape)
          photoTransform: { x: 0, y: 0, zoom: 1, rot: 0 },   // pan (UV fraction) + zoom + 2D rotation (deg); cover-fit baseline at zoom 1
          u:             position.u ?? null,   // rect side: perimeter fraction (round uses theta)
          theta:         seatTheta,            // round side: seat angle around the wall
          y:             seatY,                // side: seat height on the wall
          x:             px,
          z:             pz,
          scale:         extra.scale ?? defaultScale,   // scatter passes a small per-instance radius
          // The GLB's authored facing offset (e.g. toppers need [0,-90,0]° to face front).
          // Authored in degrees (calibrator convention); facingOffsetRadians resolves the unit to
          // the radians THREE/baseRotation use. Config-driven, applied by the renderer; null = +z.
          baseRotation:  facingOffsetRadians(element.placement_config),
          yOffset:       extra.yOffset ?? seatYOffset,   // perch/verge: calibrated seat; cluster: ball stacking lift
          rotation:      0,
          radialOffset:  0,
          tiltAngle:     seatTilt,       // perch: seated straddle-lean; verge: outward recline (calibrated)
          groupId:       null,
          // Ball-cluster membership: every ball in one packed clump shares a clusterId, so the UI
          // presents the set as ONE card (members abstracted) and they move/remove together — a
          // distinct unit from a user group (groupId) or a decor_pattern (patternId).
          clusterId:     extra.clusterId ?? null,
          // Pattern membership: parts of one decor_pattern share a patternId, and carry the source
          // pattern element's id so the UI can present the set as ONE card (abstracting the parts)
          // with a persistent zone chooser — like a piping element. `patternDeletable` keeps the
          // delete path whole.
          patternId:        extra.patternId ?? null,
          patternElementId: extra.patternElementId ?? null,
          patternDeletable: extra.patternDeletable ?? false,
          // Mirror this instance across its own vertical axis (a pattern's symmetric second
          // part — e.g. the right unicorn eye from the same GLB). Applied as a -X scale in render.
          flipX:            extra.flipX ?? false,
          color:         extra.color ?? element.default_color ?? null,
          // GLB Recompose: customer-recolourable part groups. `placement_config._model.groups` (the
          // editable controls) is the source of truth; copy the editable ones onto the instance and
          // seed each group's current colour from its default. Render recolours meshes by
          // userData.group; absent/empty → the single-colour `color` path is used (unchanged).
          groups:        (element.placement_config?._model?.groups ?? []).filter(g => g.editable),
          groupColors:   Object.fromEntries(
                           (element.placement_config?._model?.groups ?? [])
                             .filter(g => g.editable)
                             .map(g => [g.key, g.default ?? '#ffffff'])),
          // Shared fondant surface: opt-in per element (absent → use the GLB's own texture/material).
          useSharedFondantTexture: element.placement_config?.useSharedFondantTexture === true,
          // GLB material finish, config-driven (placement_config.roughness/metalness). null = keep the
          // GLB's own baked material. Lets one sphere read as metallic (low roughness / high metalness)
          // or matte (high roughness / 0 metalness) from config — applied on the shared art path.
          // `extra` wins so a customer's finish choice survives a re-pack (clusters pass it through,
          // like the palette), the same precedence every field above uses.
          roughness:     extra.roughness ?? element.placement_config?.roughness ?? null,
          metalness:     extra.metalness ?? element.placement_config?.metalness ?? null,
          allowedActions: {
            resize:    element.allowed_actions?.resize    ?? true,
            duplicate: element.allowed_actions?.duplicate ?? true,
            color:     element.allowed_actions?.color     ?? false,
            gradient:  element.allowed_actions?.gradient  ?? false,
            delete:    true,
            move:      element.allowed_actions?.move      ?? false,
            tilt:      element.allowed_actions?.tilt      ?? true,
          },
        }],
      };
    });
    return newId;
  }

  function updateSticker(id, changes) {
    setDesign(prev => ({
      ...prev,
      stickers: prev.stickers.map(s => s.id === id ? { ...s, ...changes } : s),
    }));
  }

  function removeSticker(id) {
    setDesign(prev => ({ ...prev, stickers: prev.stickers.filter(s => s.id !== id) }));
  }

  function groupStickers(ids) {
    const groupId = crypto.randomUUID();
    setDesign(prev => ({
      ...prev,
      stickers: prev.stickers.map(s => ids.includes(s.id) ? { ...s, groupId } : s),
    }));
    return groupId;
  }

  function ungroupStickers(groupId) {
    setDesign(prev => ({
      ...prev,
      stickers: prev.stickers.map(s => s.groupId === groupId ? { ...s, groupId: null } : s),
    }));
  }

  // delta: { deltaTheta, deltaY } for side zone  /  { dx, dz } for top_surface zone
  function moveGroupStickers(groupId, startPositions, delta) {
    setDesign(prev => ({
      ...prev,
      stickers: prev.stickers.map(s => {
        // `groupId` here is the move KEY — a user group's groupId OR a ball cluster's clusterId
        // (both are distinct UUIDs, so a key matches exactly one set). Move-as-group for both.
        if (s.groupId !== groupId && s.clusterId !== groupId) return s;
        const start = startPositions[s.id];
        if (!start) return s;
        const updated = { ...s };
        if (delta.deltaTheta !== undefined) updated.theta = start.theta + delta.deltaTheta;
        if (delta.deltaY    !== undefined) updated.y     = start.y     + delta.deltaY;
        if (delta.dx        !== undefined) updated.x     = start.x     + delta.dx;
        if (delta.dz        !== undefined) updated.z     = start.z     + delta.dz;
        return updated;
      }),
    }));
  }

  // Move an explicit set of stickers by one delta — the selection-driven counterpart to
  // moveGroupStickers (which keys off groupId). Used when a multi-selection is dragged so
  // every selected sticker tracks the pointer together. delta is {dx,dz} (top) or
  // {deltaTheta,deltaY} (side), same convention as moveGroupStickers.
  function moveStickersBy(ids, startPositions, delta) {
    const idSet = new Set(ids);
    setDesign(prev => ({
      ...prev,
      stickers: prev.stickers.map(s => {
        if (!idSet.has(s.id)) return s;
        const start = startPositions[s.id];
        if (!start) return s;
        const updated = { ...s };
        if (delta.deltaTheta !== undefined) updated.theta = start.theta + delta.deltaTheta;
        if (delta.deltaY    !== undefined) updated.y     = start.y     + delta.deltaY;
        if (delta.dx        !== undefined) updated.x     = start.x     + delta.dx;
        if (delta.dz        !== undefined) updated.z     = start.z     + delta.dz;
        return updated;
      }),
    }));
  }

  // Set the same scale on every sticker in a set — "select both, resize, both match".
  function scaleStickers(ids, value) {
    const idSet = new Set(ids);
    setDesign(prev => ({
      ...prev,
      stickers: prev.stickers.map(s => idSet.has(s.id) ? { ...s, scale: value } : s),
    }));
  }

  // Proportionally resize a group: multiply every member's scale by `factor`, and scale each
  // member's offset from the group centroid so the whole arrangement (sizes + spacing) grows or
  // shrinks together — unlike scaleStickers, which flattens everything to one absolute size.
  // The centroid and spread are computed in each member's own surface coordinates: top-surface
  // members in (x, z); side / middle-tier members in y (theta is angular and left as-is).
  // Member scales clamp to the SizeDial range [0.25, 8].
  function scaleGroupBy(ids, factor) {
    const idSet = new Set(ids);
    if (!(factor > 0)) return;
    setDesign(prev => {
      const members = prev.stickers.filter(s => idSet.has(s.id));
      if (!members.length) return prev;
      const top  = members.filter(s => s.zone === ZONES.TOP_SURFACE);
      const side = members.filter(s => s.zone !== ZONES.TOP_SURFACE);
      const mean = (arr, sel) => arr.length ? arr.reduce((a, s) => a + (sel(s) ?? 0), 0) / arr.length : 0;
      const cx = mean(top, s => s.x), cz = mean(top, s => s.z);
      const cy = mean(side, s => s.y);
      return {
        ...prev,
        stickers: prev.stickers.map(s => {
          if (!idSet.has(s.id)) return s;
          const updated = { ...s, scale: Math.min(8, Math.max(0.25, (s.scale ?? 1) * factor)) };
          if (s.zone === ZONES.TOP_SURFACE) {
            updated.x = cx + ((s.x ?? 0) - cx) * factor;
            updated.z = cz + ((s.z ?? 0) - cz) * factor;
          } else {
            updated.y = cy + ((s.y ?? 0) - cy) * factor;
          }
          return updated;
        }),
      };
    });
  }

  function duplicateSticker(id) {
    setDesign(prev => {
      const original = prev.stickers.find(s => s.id === id);
      if (!original) return prev;
      // The copy starts ON the original, then de-overlaps off it (and any other same-surface sibling)
      // using the ONE shared surface-aware rule — so it lands visibly separate, in the right coordinate
      // system for its surface (x/z on top, around the rim, theta/u on a wall). No per-zone offset here.
      const shp = tierShape(prev.tiers[original.tierIndex ?? 0] ?? prev.tiers[0]);
      const siblings = prev.stickers.filter(s => s.zone === original.zone && s.tierIndex === original.tierIndex);
      const seat = deOverlapSeat(shp, original.zone, { x: original.x, z: original.z, theta: original.theta, y: original.y, u: original.u }, siblings);
      return {
        ...prev,
        stickers: [...prev.stickers, { ...original, id: Date.now(), ...seat }],
      };
    });
  }

  // Cream-pen writing — a single message on the cake top. Merges changes onto the
  // existing writing (seeding defaults on first edit); pass null/'' text to clear.
  function setWriting(changes) {
    setDesign(prev => ({ ...prev, writing: { ...DEFAULT_WRITING, ...prev.writing, ...changes } }));
  }
  function clearWriting() {
    setDesign(prev => ({ ...prev, writing: null }));
  }

  // Freehand cream-pen strokes. addStroke appends a finished stroke (seeding defaults);
  // removeStroke undoes the last; clearPiping wipes them all.
  function addStroke(stroke) {
    setDesign(prev => ({ ...prev, piping: [...prev.piping, { ...DEFAULT_STROKE, id: crypto.randomUUID(), ...stroke }] }));
  }
  function removeStroke() {
    setDesign(prev => ({ ...prev, piping: prev.piping.slice(0, -1) }));
  }
  function clearPiping() {
    setDesign(prev => ({ ...prev, piping: [] }));
  }

  function resetDesign() {
    setDesign(DEFAULT_DESIGN);
  }

  function addStickerBatch(stickers) {
    setDesign(prev => ({ ...prev, stickers: [...prev.stickers, ...stickers] }));
  }

  function loadDesign(templateDesign) {
    const legacyGlbUrl = storageBaseUrl
      ? `${storageBaseUrl}/${LEGACY_PIPING_SLUG}`
      : null;

    setDesign({
      tiers: templateDesign.tiers.map(t => {
        // New format stores arrays; old format a single object. Normalise to arrays and
        // tag each with a layerId so stacked layers stay addressable.
        let topPipings = t.topPipings ?? (t.topPiping ? [t.topPiping] : []);
        let bottomPipings = t.bottomPipings ?? (t.bottomPiping ? [t.bottomPiping] : []);
        if (!topPipings.length && legacyGlbUrl && (t.decorations ?? []).some(d => d.type === 'swirl_ring')) {
          const d = t.decorations.find(d => d.type === 'swirl_ring');
          topPipings = [{ glbUrl: legacyGlbUrl, name: 'Shell', color: d.color ?? '#f5e6c8' }];
        }
        if (!bottomPipings.length && legacyGlbUrl && (t.decorations ?? []).some(d => d.type === 'base_border')) {
          const d = t.decorations.find(d => d.type === 'base_border');
          bottomPipings = [{ glbUrl: legacyGlbUrl, name: 'Shell', color: d.color ?? '#f5e6c8' }];
        }
        return {
          color:        t.color ?? '#ffffff',
          ...(t.gradient && { gradient: t.gradient }),
          topPipings:    topPipings.map(withLayerId),
          bottomPipings: bottomPipings.map(withLayerId),
          ...(t.radius != null  && { radius: t.radius }),
          ...(t.height != null  && { height: t.height }),
          ...(t.shape   != null  && { shape: t.shape }),
          ...(t.width   != null  && { width: t.width }),
          ...(t.depth   != null  && { depth: t.depth }),
          ...(t.cornerR != null  && { cornerR: t.cornerR }),
        };
      }),
      texts:    templateDesign.texts    ?? [],
      ages:     templateDesign.ages     ?? [],
      // Migrate a legacy single `topper` into the unified sticker list: a topper is just a
      // GLB element standing on the top surface (or hugging the side). Placement is now fully
      // config-driven, so there is no separate topper slot or renderer.
      stickers: migrateTopperToSticker(templateDesign),
      writing: templateDesign.writing ?? null,
      piping: templateDesign.piping ?? [],
    });
  }

  const canvasConfig = useMemo(() => toCanvasConfig(design), [design]);

  return {
    design,
    setTierColor, setTierFrostingType, setTierFrostingStyle, setTierStyleParam, setTierGradient, setTierCornerR, setTopPiping, setBottomPiping,
    addPipingLayer, updatePipingLayer, removePipingLayer,
    addDustSplash, updateDusting, clearDusting, removeLastDustSplash, updateDustSplash, removeDustSplash,
    addTier, removeTier,
    addText, updateText, duplicateText, removeText,
    addAge, updateAge, duplicateAge, removeAge,
    addSticker, updateSticker, removeSticker, duplicateSticker,
    groupStickers, ungroupStickers, moveGroupStickers, moveStickersBy, scaleStickers, scaleGroupBy,
    setWriting, clearWriting,
    addStroke, removeStroke, clearPiping,
    resetDesign,
    addStickerBatch,
    loadDesign,
    canvasConfig,
  };
}
