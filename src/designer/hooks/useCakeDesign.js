import { useState, useMemo } from 'react';
import { TIER_RADII, BOTTOM_BASE, BOTTOM_H, TIER_HEIGHT_STEP, STICKER_SIZE, ZONES, PLACEMENT_MODES } from '../constants.js';
import { tierShape, topClamp } from '../geometry/surface.js';
import { facingOffsetRadians } from '../placement.js';

export { TIER_RADII };   // re-export so existing imports from this file keep working

const DEFAULT_DESIGN = {
  tiers: [
    { color: '#f5b8c8', topPipings: [], bottomPipings: [] },
  ],
  texts: [],
  stickers: [],
  writing: null,   // one cream-pen message piped on the cake top (see CreamWriting)
  piping: [],      // freehand cream-pen strokes (see CreamPen / creamPen.js)
};

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

export const FROSTING_TYPES = [
  { value: 'buttercream', label: 'Buttercream' },
  { value: 'whipped',     label: 'Whipped' },
  { value: 'fondant',     label: 'Fondant' },
  { value: 'naked',       label: 'Naked' },
];

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

  function addTier() {
    setDesign(prev => {
      if (prev.tiers.length >= 4) return prev;
      return { ...prev, tiers: [...prev.tiers, { color: '#ffffff', topPipings: [], bottomPipings: [] }] };
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

  // `extra` carries identity that isn't derived from the element: an explicit `id`
  // (so a caller spawning several parts in one tick avoids Date.now() collisions) and
  // pattern membership (`patternId` ties a decor_pattern's parts together for the orphan
  // guard; `patternDeletable` mirrors the pattern's placement_config.parts_deletable).
  function addSticker(element, zone, tierIndex, placementMode, position = {}, extra = {}) {
    const isGlb = /\.(glb|gltf)(\?|$)/i.test(element.image_url ?? '');
    const defaultScale = element.placement_config?.r ?? (isGlb ? 2.5 : 1);
    // Perch calibration (tier-relative): the figurine calibrator writes these into placement_config.perch;
    // we seed them onto the instance so the figure is seated/leaning correctly the moment it's placed.
    const perchCfg = element.placement_config?.perch ?? {};
    const isPerchMode = placementMode === PLACEMENT_MODES.PERCH;
    const perchTilt = isPerchMode ? ((perchCfg.tilt_deg ?? 0) * Math.PI / 180) : 0;
    const perchYOffset = isPerchMode ? (perchCfg.y_offset ?? 0) : 0;
    const newId = extra.id ?? Date.now();   // returned so callers can select the just-added sticker
    setDesign(prev => {
      let px = position.x ?? 0;
      let pz = position.z ?? 0;
      // Seat angle/height for round side placements (hug/default). Resolved below so a re-added
      // instance never lands exactly on a coincident sibling. (faux_ball repurposes px/pz instead.)
      let seatTheta = position.theta ?? 0;
      let seatY = position.y ?? (BOTTOM_BASE + BOTTOM_H * 0.45);
      if (placementMode === PLACEMENT_MODES.STAND && zone === ZONES.TOP_SURFACE) {
        // Nudge by a fixed STICKER_SIZE gap so both toppers have different centres
        // and are separately selectable. Scale is intentionally ignored — the user
        // will drag to the final position; drag-time collision handles visual overlap.
        const shp = tierShape(prev.tiers[tierIndex ?? 0] ?? prev.tiers[0]);
        const siblings = prev.stickers.filter(
          s => s.zone === ZONES.TOP_SURFACE && s.tierIndex === (tierIndex ?? 0) && s.placementMode === PLACEMENT_MODES.STAND
        );
        for (const sib of siblings) {
          const ex = px - (sib.x ?? 0), ez = pz - (sib.z ?? 0);
          const d = Math.sqrt(ex * ex + ez * ez);
          if (d < STICKER_SIZE) {
            const dir = d > 0.001 ? { x: ex / d, z: ez / d } : { x: 1, z: 0 };
            px = (sib.x ?? 0) + dir.x * STICKER_SIZE;
            pz = (sib.z ?? 0) + dir.z * STICKER_SIZE;
          }
        }
        ({ x: px, z: pz } = topClamp(shp, px, pz, 0.88));
      }
      if (placementMode === PLACEMENT_MODES.PERCH) {
        // A perch ALWAYS starts on the FRONT edge (toward the camera, +z) — a perch in the centre
        // would bury the figure inside the cake. The renderer straddles it across the top edge; the
        // customer drags it around the rim afterwards. Nudge off a coincident perch sibling.
        const shp = tierShape(prev.tiers[tierIndex ?? 0] ?? prev.tiers[0]);
        const edge = shp.kind === 'rect' ? shp.halfD : shp.radius;
        px = 0;
        pz = edge - (perchCfg.edge_inset ?? 0);   // inset from the rim, from calibration
        for (const sib of prev.stickers.filter(s => s.placementMode === PLACEMENT_MODES.PERCH && s.tierIndex === (tierIndex ?? 0))) {
          if (Math.abs(px - (sib.x ?? 0)) < STICKER_SIZE && Math.abs(pz - (sib.z ?? 0)) < STICKER_SIZE) px += STICKER_SIZE;
        }
      }
      if (placementMode === PLACEMENT_MODES.FAUX_BALL_SINGLE) {
        const isSide = zone === ZONES.SIDE || zone === ZONES.MIDDLE_TIER;
        const siblings = prev.stickers.filter(
          s => s.placementMode === PLACEMENT_MODES.FAUX_BALL_SINGLE && s.tierIndex === (tierIndex ?? 0)
        );
        if (isSide && position.u != null) {
          // Rect wall: position is a perimeter fraction u (stored below) + height.
          px = 0; pz = position.y ?? 0;   // theta unused on rect
        } else if (isSide) {
          let pt = position.theta ?? 0, py2 = position.y ?? 0;
          for (const sib of siblings) {
            const minDist = defaultScale + (sib.scale ?? 0.12);
            const ax = Math.sin(pt), az = Math.cos(pt);
            const bx = Math.sin(sib.theta ?? 0), bz = Math.cos(sib.theta ?? 0);
            const ex = ax - bx, ey = py2 - (sib.y ?? 0), ez = az - bz;
            const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
            if (d < minDist && d > 0.001) {
              pt = Math.atan2(bx + ex * (minDist / d), bz + ez * (minDist / d));
              py2 = (sib.y ?? 0) + ey * (minDist / d);
            } else if (d < minDist) {
              pt += minDist * 0.5;
            }
          }
          // Store resolved theta/y back into position fields
          px = pt; pz = py2; // repurpose px/pz as theta/y for side
        } else {
          for (const sib of siblings) {
            const minDist = defaultScale + (sib.scale ?? 0.12);
            const ex = px - (sib.x ?? 0), ez = pz - (sib.z ?? 0);
            const d  = Math.sqrt(ex * ex + ez * ez);
            if (d < minDist) {
              const dir = d > 0.001 ? { x: ex / d, z: ez / d } : { x: 1, z: 0 };
              px = (sib.x ?? 0) + dir.x * minDist;
              pz = (sib.z ?? 0) + dir.z * minDist;
            }
          }
        }
      }
      // De-overlap every OTHER scatter placement (hug / default mode): a re-added instance must
      // not stack exactly on a coincident sibling (they'd look like one). Geometry-driven by zone,
      // never by element type/slug (INVARIANTS #1/#2). stand & faux_ball handle their own above.
      if (placementMode !== PLACEMENT_MODES.STAND && placementMode !== PLACEMENT_MODES.FAUX_BALL_SINGLE) {
        const isSide = zone === ZONES.SIDE || zone === ZONES.MIDDLE_TIER;
        const isScatterSib = s => s.placementMode !== PLACEMENT_MODES.STAND && s.placementMode !== PLACEMENT_MODES.FAUX_BALL_SINGLE;
        if (isSide && position.u == null) {
          // Round wall: step the seat angle around the tier until clear of any coincident sibling
          // (same tier, near-equal theta+y). ~29° per step; guard caps the walk.
          const angDist = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
          const siblings = prev.stickers.filter(
            s => (s.zone === ZONES.SIDE || s.zone === ZONES.MIDDLE_TIER) && s.tierIndex === (tierIndex ?? 0) && isScatterSib(s)
          );
          let guard = 0;
          while (guard++ < 64 && siblings.some(s => angDist(seatTheta, s.theta ?? 0) < 0.15 && Math.abs(seatY - (s.y ?? 0)) < 0.2)) {
            seatTheta += 0.5;
          }
          seatTheta = ((seatTheta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        } else if (zone === ZONES.TOP_SURFACE) {
          // Flat-on-top decals: same x/z nudge the stand path uses, kept inside the tier.
          const shp = tierShape(prev.tiers[tierIndex ?? 0] ?? prev.tiers[0]);
          const siblings = prev.stickers.filter(
            s => s.zone === ZONES.TOP_SURFACE && s.tierIndex === (tierIndex ?? 0) && isScatterSib(s)
          );
          for (const sib of siblings) {
            const ex = px - (sib.x ?? 0), ez = pz - (sib.z ?? 0);
            const d = Math.sqrt(ex * ex + ez * ez);
            if (d < STICKER_SIZE) {
              const dir = d > 0.001 ? { x: ex / d, z: ez / d } : { x: 1, z: 0 };
              px = (sib.x ?? 0) + dir.x * STICKER_SIZE;
              pz = (sib.z ?? 0) + dir.z * STICKER_SIZE;
            }
          }
          ({ x: px, z: pz } = topClamp(shp, px, pz, 0.88));
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
          // flag rides on each instance so the card can collapse them and the colour-wheel path can
          // tell scatter from a plain faux_ball. Config-driven (placement_config.scatter).
          scatter:       element.placement_config?.scatter === true,
          // Side seating: default flush (true hug, centred on the wall); proud = back-on-wall so a
          // deep model stands off the wall (toppers). Config-driven; applied in the side bend path.
          sideProud:     element.placement_config?.side_proud === true,
          hugFill:       element.placement_config?.hug_fill ?? null,
          u:             position.u ?? null,   // rect side: perimeter fraction (round uses theta)
          theta:         (placementMode === PLACEMENT_MODES.FAUX_BALL_SINGLE && (zone === ZONES.SIDE || zone === ZONES.MIDDLE_TIER)) ? px : seatTheta,
          y:             (placementMode === PLACEMENT_MODES.FAUX_BALL_SINGLE && (zone === ZONES.SIDE || zone === ZONES.MIDDLE_TIER)) ? pz : seatY,
          x:             (placementMode === PLACEMENT_MODES.FAUX_BALL_SINGLE && (zone === ZONES.SIDE || zone === ZONES.MIDDLE_TIER)) ? 0 : px,
          z:             (placementMode === PLACEMENT_MODES.FAUX_BALL_SINGLE && (zone === ZONES.SIDE || zone === ZONES.MIDDLE_TIER)) ? 0 : pz,
          scale:         extra.scale ?? defaultScale,   // scatter passes a small per-instance radius
          // The GLB's authored facing offset (e.g. toppers need [0,-90,0]° to face front).
          // Authored in degrees (calibrator convention); facingOffsetRadians resolves the unit to
          // the radians THREE/baseRotation use. Config-driven, applied by the renderer; null = +z.
          baseRotation:  facingOffsetRadians(element.placement_config),
          yOffset:       perchYOffset,   // perch: seat-height offset from the tier top (calibrated)
          rotation:      0,
          radialOffset:  0,
          tiltAngle:     perchTilt,      // perch: seated lean (calibrated)
          groupId:       null,
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
          color:         element.default_color ?? null,
          // GLB Recompose: customer-recolourable part groups. `placement_config._model.groups` (the
          // editable controls) is the source of truth; copy the editable ones onto the instance and
          // seed each group's current colour from its default. Render recolours meshes by
          // userData.group; absent/empty → the single-colour `color` path is used (unchanged).
          groups:        (element.placement_config?._model?.groups ?? []).filter(g => g.editable),
          groupColors:   Object.fromEntries(
                           (element.placement_config?._model?.groups ?? [])
                             .filter(g => g.editable)
                             .map(g => [g.key, g.default ?? '#ffffff'])),
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
        if (s.groupId !== groupId) return s;
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
      const offset = original.zone === ZONES.TOP_SURFACE
        ? { x: original.x + 0.15 }
        : (original.u != null ? { u: (((original.u + 0.04) % 1) + 1) % 1 } : { theta: original.theta + 0.3 });
      return {
        ...prev,
        stickers: [...prev.stickers, { ...original, id: Date.now(), ...offset }],
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
      // Migrate a legacy single `topper` into the unified sticker list: a topper is just a
      // GLB element standing on the top surface (or hugging the side). Placement is now fully
      // config-driven, so there is no separate topper slot or renderer.
      stickers: migrateTopperToSticker(templateDesign),
      writing: templateDesign.writing ?? null,
      piping: templateDesign.piping ?? [],
    });
  }

  const canvasConfig = useMemo(() => ({
    tiers: design.tiers.map((t, i) => {
      const isRect = t.shape === 'rect';
      const width  = t.width ?? 2.16;   // default half-sheet footprint
      const depth  = t.depth ?? 1.56;
      return {
        // For rect, radius is the bounding half-extent so radius-based incidental
        // placement (board, toolbar offsets, topper scale) keeps working.
        radius:       isRect ? Math.max(width, depth) / 2 : (t.radius ?? TIER_RADII[i] ?? 0.35),
        height:       t.height  ?? (BOTTOM_H - i * TIER_HEIGHT_STEP),
        color:        t.color,
        frostingType: t.frostingType ?? 'buttercream',
        topPipings:    t.topPipings ?? (t.topPiping ? [t.topPiping] : []),
        bottomPipings: t.bottomPipings ?? (t.bottomPiping ? [t.bottomPiping] : []),
        ...(isRect && { shape: 'rect', width, depth, cornerR: t.cornerR ?? 0 }),
      };
    }),
    texts:    design.texts,
    stickers: design.stickers,
    writing:  design.writing ?? null,
    piping:   design.piping ?? [],
  }), [design]);

  return {
    design,
    setTierColor, setTierCornerR, setTopPiping, setBottomPiping,
    addPipingLayer, updatePipingLayer, removePipingLayer,
    addTier, removeTier,
    addText, updateText, duplicateText, removeText,
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
