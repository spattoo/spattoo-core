import { useState, useMemo } from 'react';

const DEFAULT_DESIGN = {
  tiers: [
    { color: '#f5b8c8', topPiping: null, bottomPiping: null },
  ],
  texts: [],
  stickers: [],
  topper: null,
};

export const TIER_RADII  = [1.2, 0.9, 0.65, 0.45];
export const FROSTING_TYPES = [
  { value: 'buttercream', label: 'Buttercream' },
  { value: 'whipped',     label: 'Whipped' },
  { value: 'fondant',     label: 'Fondant' },
  { value: 'naked',       label: 'Naked' },
];
const BOTTOM_BASE = 0.1;
const BOTTOM_H    = 1.45;

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
      return {
        ...prev,
        texts: [...prev.texts, { ...original, id: Date.now(), theta: original.theta + 0.3 }],
      };
    });
  }

  function removeText(id) {
    setDesign(prev => ({ ...prev, texts: prev.texts.filter(t => t.id !== id) }));
  }

  function addSticker(element, zone, tierIndex, placementMode, position = {}) {
    const isGlb = /\.(glb|gltf)(\?|$)/i.test(element.image_url ?? '');
    setDesign(prev => ({
      ...prev,
      stickers: [...prev.stickers, {
        id:            Date.now(),
        elementId:     element.id,
        imageUrl:      element.image_url,
        name:          element.name,
        zone,
        tierIndex:     tierIndex ?? 0,
        placementMode: placementMode ?? 'hug',
        theta:         position.theta ?? 0,
        y:             position.y    ?? (BOTTOM_BASE + BOTTOM_H * 0.45),
        x:             position.x    ?? 0,
        z:             position.z    ?? 0,
        scale:         isGlb ? 2.5 : 1,
        yOffset:       0,
        rotation:      0,
        color:         null,
        allowedActions: {
          resize:    element.allowed_actions?.resize    ?? true,
          duplicate: element.allowed_actions?.duplicate ?? true,
          color:     element.allowed_actions?.color     ?? false,
          delete:    true,
        },
      }],
    }));
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

  function duplicateSticker(id) {
    setDesign(prev => {
      const original = prev.stickers.find(s => s.id === id);
      if (!original) return prev;
      const offset = original.zone === 'top_surface'
        ? { x: original.x + 0.15 }
        : { theta: original.theta + 0.3 };
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
        };
      }),
      texts:    templateDesign.texts    ?? [],
      stickers: templateDesign.stickers ?? [],
      topper: templateDesign.topper ? { ...templateDesign.topper, scale: templateDesign.topper.scale ?? 1 } : null,
    });
  }

  const canvasConfig = useMemo(() => ({
    tiers: design.tiers.map((t, i) => ({
      radius:       t.radius  ?? TIER_RADII[i] ?? 0.35,
      height:       t.height  ?? (1.45 - i * 0.08),
      color:        t.color,
      frostingType: t.frostingType ?? 'buttercream',
      topPiping:    t.topPiping ?? null,
      bottomPiping: t.bottomPiping ?? null,
    })),
    texts:    design.texts,
    stickers: design.stickers,
    topper:   design.topper ?? null,
  }), [design]);

  return {
    design,
    setTierColor, setTopPiping, setBottomPiping,
    addTier, removeTier,
    addText, updateText, duplicateText, removeText,
    addSticker, updateSticker, removeSticker, duplicateSticker,
    setTopper, setTopperScale,
    loadDesign,
    canvasConfig,
  };
}
