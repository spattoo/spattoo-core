import { useState, useMemo } from 'react';
import { TIER_RADII, BOTTOM_BASE, BOTTOM_H, TIER_HEIGHT_STEP, STICKER_SIZE } from '../constants.js';
import { tierShape, topClamp } from '../geometry/surface.js';

export { TIER_RADII };   // re-export so existing imports from this file keep working

const DEFAULT_DESIGN = {
  tiers: [
    { color: '#f5b8c8', topPiping: null, bottomPiping: null },
  ],
  texts: [],
  stickers: [],
  topper: null,
};

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

  function setTopPiping(index, piping) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => i === index ? { ...t, topPiping: piping } : t),
    }));
  }

  function setBottomPiping(index, piping) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => i === index ? { ...t, bottomPiping: piping } : t),
    }));
  }

  function addTier() {
    setDesign(prev => {
      if (prev.tiers.length >= 4) return prev;
      return { ...prev, tiers: [...prev.tiers, { color: '#ffffff', topPiping: null, bottomPiping: null }] };
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

  function addSticker(element, zone, tierIndex, placementMode, position = {}) {
    const isGlb = /\.(glb|gltf)(\?|$)/i.test(element.image_url ?? '');
    const defaultScale = element.placement_config?.r ?? (isGlb ? 2.5 : 1);
    setDesign(prev => {
      let px = position.x ?? 0;
      let pz = position.z ?? 0;
      if (placementMode === 'stand' && zone === 'top_surface') {
        // Nudge by a fixed STICKER_SIZE gap so both toppers have different centres
        // and are separately selectable. Scale is intentionally ignored — the user
        // will drag to the final position; drag-time collision handles visual overlap.
        const shp = tierShape(prev.tiers[tierIndex ?? 0] ?? prev.tiers[0]);
        const siblings = prev.stickers.filter(
          s => s.zone === 'top_surface' && s.tierIndex === (tierIndex ?? 0) && s.placementMode === 'stand'
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
      if (placementMode === 'faux_ball_single') {
        const isSide = zone === 'side' || zone === 'middle_tier';
        const siblings = prev.stickers.filter(
          s => s.placementMode === 'faux_ball_single' && s.tierIndex === (tierIndex ?? 0)
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
      return {
        ...prev,
        stickers: [...prev.stickers, {
          id:            Date.now(),
          elementId:     element.id,
          imageUrl:      element.image_url,
          name:          element.name,
          zone,
          tierIndex:     tierIndex ?? 0,
          placementMode: placementMode ?? 'hug',
          u:             position.u ?? null,   // rect side: perimeter fraction (round uses theta)
          theta:         (placementMode === 'faux_ball_single' && (zone === 'side' || zone === 'middle_tier')) ? px : (position.theta ?? 0),
          y:             (placementMode === 'faux_ball_single' && (zone === 'side' || zone === 'middle_tier')) ? pz : (position.y ?? (BOTTOM_BASE + BOTTOM_H * 0.45)),
          x:             (placementMode === 'faux_ball_single' && (zone === 'side' || zone === 'middle_tier')) ? 0 : px,
          z:             (placementMode === 'faux_ball_single' && (zone === 'side' || zone === 'middle_tier')) ? 0 : pz,
          scale:         defaultScale,
          yOffset:       0,
          rotation:      0,
          radialOffset:  0,
          tiltAngle:     0,
          groupId:       null,
          color:         element.default_color ?? null,
          allowedActions: {
            resize:    element.allowed_actions?.resize    ?? true,
            duplicate: element.allowed_actions?.duplicate ?? true,
            color:     element.allowed_actions?.color     ?? false,
            delete:    true,
          },
        }],
      };
    });
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

  function duplicateSticker(id) {
    setDesign(prev => {
      const original = prev.stickers.find(s => s.id === id);
      if (!original) return prev;
      const offset = original.zone === 'top_surface'
        ? { x: original.x + 0.15 }
        : (original.u != null ? { u: (((original.u + 0.04) % 1) + 1) % 1 } : { theta: original.theta + 0.3 });
      return {
        ...prev,
        stickers: [...prev.stickers, { ...original, id: Date.now(), ...offset }],
      };
    });
  }

  function setTopper(topper) {
    setDesign(prev => ({
      ...prev,
      topper: topper ? { ...topper, scale: prev.topper?.scale ?? 1 } : null,
    }));
  }

  function setTopperScale(scale) {
    setDesign(prev => ({
      ...prev,
      topper: prev.topper ? { ...prev.topper, scale } : prev.topper,
    }));
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
        let topPiping = t.topPiping ?? null;
        let bottomPiping = t.bottomPiping ?? null;
        if (!topPiping && legacyGlbUrl && (t.decorations ?? []).some(d => d.type === 'swirl_ring')) {
          const d = t.decorations.find(d => d.type === 'swirl_ring');
          topPiping = { glbUrl: legacyGlbUrl, name: 'Shell', color: d.color ?? '#f5e6c8' };
        }
        if (!bottomPiping && legacyGlbUrl && (t.decorations ?? []).some(d => d.type === 'base_border')) {
          const d = t.decorations.find(d => d.type === 'base_border');
          bottomPiping = { glbUrl: legacyGlbUrl, name: 'Shell', color: d.color ?? '#f5e6c8' };
        }
        return {
          color:        t.color ?? '#ffffff',
          topPiping,
          bottomPiping,
          ...(t.radius != null  && { radius: t.radius }),
          ...(t.height != null  && { height: t.height }),
          ...(t.shape   != null  && { shape: t.shape }),
          ...(t.width   != null  && { width: t.width }),
          ...(t.depth   != null  && { depth: t.depth }),
          ...(t.cornerR != null  && { cornerR: t.cornerR }),
        };
      }),
      texts:    templateDesign.texts    ?? [],
      stickers: templateDesign.stickers ?? [],
      topper: templateDesign.topper ? { ...templateDesign.topper, scale: templateDesign.topper.scale ?? 1 } : null,
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
        topPiping:    t.topPiping ?? null,
        bottomPiping: t.bottomPiping ?? null,
        ...(isRect && { shape: 'rect', width, depth, cornerR: t.cornerR ?? 0 }),
      };
    }),
    texts:    design.texts,
    stickers: design.stickers,
    topper:   design.topper ?? null,
  }), [design]);

  return {
    design,
    setTierColor, setTierCornerR, setTopPiping, setBottomPiping,
    addTier, removeTier,
    addText, updateText, duplicateText, removeText,
    addSticker, updateSticker, removeSticker, duplicateSticker,
    groupStickers, ungroupStickers, moveGroupStickers,
    setTopper, setTopperScale,
    resetDesign,
    addStickerBatch,
    loadDesign,
    canvasConfig,
  };
}
