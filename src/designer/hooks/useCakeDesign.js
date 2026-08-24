import { useState, useMemo } from 'react';
import { TIER_RADII, BOTTOM_BASE, BOTTOM_H, TIER_HEIGHT_STEP, ZONES, PLACEMENT_MODES } from '../constants.js';
import { tierShape } from '../geometry/surface.js';
import { isGlyphFamily, glyphTierDims } from '../geometry/glyphShape.js';
import { cakeShapeDef, tierGeometry } from '../cakeShapes.js';
import { facingOffsetRadians, edgeSeatSeed, insertSeat, deOverlapSeat, zoneSeatFields, zoneInsert, surfaceFitMax } from '../placement.js';
import { FROSTING_TYPES, DEFAULT_FROSTING, frostingAllowsStyle } from '../frostings.js';
import { materialSurface } from '../materials.js';
import { DEFAULT_STYLE } from '../creamStyles.js';
import { LUSTER_DUST_DEFAULTS, LUSTER_DUST_NEW_SPLASH } from '../shared/textures/lusterDust.js';
import { GOLD_LEAF_DEFAULTS, GOLD_LEAF_NEW_FLAKE, GOLD_LEAF_COLORS } from '../shared/textures/goldLeafFlakes.js';
import { SECOND_CREAM_DEFAULTS, SECOND_CREAM_PRESETS } from '../geometry/secondCreamLayer.js';
import { GLAZE_DEFAULTS } from '../shared/glaze/glazeMaterial.js';
import { STRIPE_DEFAULTS } from '../shared/color/stripeMaterial.js';
import { pickTierFields, writingsOf } from '../utils/designSnapshot.js';

export { TIER_RADII };   // re-export so existing imports from this file keep working

// A design tier does not carry its own radius — the stack's widths are positional (TIER_RADII[i]) and
// only get resolved on the way to the canvas. Anything that needs the REAL width of a tier before
// then (seeding an edible sheet at its fit, say) has to resolve it the same way, so this is the one
// place that knows how. Reading `t.radius ?? 0` instead would size a sheet against a cake that does
// not exist.
export function tierRadius(t, i) {
  return t?.radius ?? TIER_RADII[i] ?? 0.35;
}
// Frosting types now live in the frostings registry; re-export so existing importers
// (FrostingPicker, admin CreateTemplate) keep resolving them from here.
export { FROSTING_TYPES };

// Default digit face for age numbers — a clean, rounded single-stroke face; the fat tube does most
// of the balloon look. The Age popup lets the customer switch faces.
const DEFAULT_AGE_FONT = 'ems_readability';

// `shape` is written out explicitly even though 'round' is also what an ABSENT shape resolves to
// (cakeShapeDef falls back to round). The absent case has to keep working — every design saved before
// shapes existed omits it — but a design this code AUTHORS should say what it is rather than lean on a
// fallback, so a reader of the JSON sees the shape and setTierShape has a field to overwrite.
const DEFAULT_DESIGN = {
  tiers: [
    { shape: 'round', color: '#f5b8c8', frostingType: DEFAULT_FROSTING, frostingStyle: DEFAULT_STYLE, topPipings: [], bottomPipings: [], creamLayers: [] },
  ],
  texts: [],
  ages: [],        // gold 3D balloon-number toppers standing on the cake top (see AgeNumber)
  stickers: [],
  writings: [],    // cream-pen messages piped on the cake (see CreamWriting) — one per placement
  piping: [],      // freehand cream-pen strokes (see CreamPen / creamPen.js)
};

// The cake a shape STARTS you with — the ONE definition of "new cake, shape X". `New` resets the design
// to this, and the shape picker previews a tile with it, so the cake in the grid is the cake you get.
//
// A shape is a form, not just an outline: if its catalog row authors a STACK, the starter cake is that
// stack. That is the entire difference between "Cylinder" and "2T Cylinder" — the same footprint, a
// different cake — and it did not exist while a row could only carry a curve. An empty stack means one
// tier at the designer's default, which is what every shape meant before, so old rows are untouched.
//
// Sizes come from the row; colour/frosting/style stay the designer's defaults, because a shape authors
// the cake's FORM, not its decoration.
export function starterDesign(shape = 'round') {
  const def = cakeShapeDef(shape);
  const base = DEFAULT_DESIGN.tiers[0];
  // A round tier is sized by RADIUS; every other footprint by width/depth (toCanvasConfig reads only the
  // one its family uses and silently ignores the other). The authored stack speaks width/depth for all of
  // them — the studio shows the same two sliders whatever the shape — so a circle's width is its diameter
  // and must be translated here. Miss this and a 12-inch round seeds as the default 6-inch one, with
  // nothing on screen to say why.
  const isRound = def.family === 'circle';
  const sized = t => (isRound
    ? { radius: t.width / 2, height: t.height }
    : { width: t.width, depth: t.depth, height: t.height });
  // The shape's geometry is written ONTO each tier (not left to a catalog lookup), so the cake this
  // starts is self-describing from the first frame — the same reason a saved snapshot carries it.
  const geom = { shapeFamily: def.family, shapeConfig: def.config ?? {} };
  const stack = def.tiers ?? [];
  const tiers = stack.length
    ? stack.map(t => ({ ...base, shape, ...geom, ...sized(t) }))
    : [{ ...base, shape, ...geom }];
  return { ...DEFAULT_DESIGN, tiers };
}

// Pure resolver: a design (authored shape, fields optional) → the canvas/scene config the
// renderer consumes (radius/height/frosting defaults filled in). This is the SINGLE place tier
// geometry defaults live — the live editor's `canvasConfig` useMemo and the read-only `CakePreview`
// both call it, so the two never drift (INVARIANTS #3). Keep it pure (no hooks/state).
export function toCanvasConfig(design) {
  return {
    tiers: (design.tiers ?? []).map((t, i) => {
      // The tier's geometry is resolved from the tier itself (its shapeFamily/shapeConfig), falling back
      // to the catalog by KEY for legacy designs. Passing only `shape === 'rect'` through was the bug that
      // made every authored shape (heart, hexagon…) arrive at the renderer as a plain cylinder — the key
      // was silently dropped right here. shapeFamily/shapeConfig are forwarded onto the canvas tier below
      // so every downstream tierShape() call reads the same self-contained geometry.
      const geom = tierGeometry(t);
      const family = geom.family;
      const isRound = family === 'circle';
      const isRect  = family === 'rounded_rect';
      const isGlyph = isGlyphFamily(family);
      const r = tierRadius(t, i);
      // A glyph cake's (number/letter) footprint AND vertical thickness are DERIVED (from its typed
      // characters + its size config), not authored on the tier — so resolve them once here and every
      // downstream reader (stacking, board, camera, cream) speaks the true box. The mesh extrudes by the
      // same thickness (tierShape → CakeTier).
      const glyphDims = isGlyph ? glyphTierDims(family, geom.config) : null;
      // A sheet defaults to the half-sheet footprint; any other non-round shape defaults to the round
      // tier's own diameter, so switching a cake's shape doesn't also resize it.
      const width  = glyphDims ? glyphDims.width  : (t.width ?? (isRect ? 2.16 : r * 2));
      const depth  = glyphDims ? glyphDims.depth  : (t.depth ?? (isRect ? 1.56 : r * 2));
      return {
        // Self-contained geometry forwarded onto the canvas tier, so tierShape() resolves the same
        // family/config everywhere it's called downstream (CakeTier, CakeCanvas, placement) without a
        // second catalog lookup.
        shapeFamily:  geom.family,
        shapeConfig:  geom.config,
        // For any non-round footprint, radius is the bounding half-extent so radius-based incidental
        // placement (board, toolbar offsets, topper scale) keeps working.
        radius:       isRound ? r : Math.max(width, depth) / 2,
        height:       glyphDims ? glyphDims.height : (t.height ?? (BOTTOM_H - i * TIER_HEIGHT_STEP)),
        color:        t.color,
        gradient:     t.gradient ?? null,
        // ⚠️ FORWARDED HERE OR IT NEVER RENDERS. The canvas reads this config, not the design — wiring
        // CakeCanvas/CakeTier/TierBody to `tier.stripes` and stopping short of this line produces a
        // feature that saves, reloads and reports as present while drawing nothing at all.
        stripes:      t.stripes ?? null,
        glaze:        t.glaze ?? null,          // chocolate-glaze marble palette + pattern (frostingType 'glaze')
        frostingType: t.frostingType ?? DEFAULT_FROSTING,
        frostingStyle: t.frostingStyle ?? DEFAULT_STYLE,
        styleParams:  t.styleParams ?? null,   // the style's per-tier param overrides (Depth/Waviness…) — was dropped here, so the controls did nothing
        dusting:      t.dusting ?? null,        // luster-dust splashes + appearance (per-tier wall treatment)
        grass:        t.grass ?? null,          // piped grass on the top surface (per-tier surface treatment)
        foil:         t.foil ?? null,           // gold-leaf flakes + finish (per-tier wall treatment)
        topPipings:    t.topPipings ?? (t.topPiping ? [t.topPiping] : []),
        bottomPipings: t.bottomPipings ?? (t.bottomPiping ? [t.bottomPiping] : []),
        creamLayers:   t.creamLayers ?? [],   // raised two-tone bands (second cream layer)
        ...(!isRound && { shape: t.shape, width, depth, cornerR: t.cornerR ?? 0 }),
      };
    }),
    texts:    design.texts ?? [],
    ages:     design.ages ?? [],
    stickers: design.stickers ?? [],
    writings: normalizeWritings(design),
    boardGrass: design.boardGrass ?? null,   // piped grass ringing the cake on the board
    nameBlocks: design.nameBlocks ?? null,   // fondant letter blocks spelling a name
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
    yOffset: 0, rotation: 0, radialOffset: 0, tiltAngle: 0, rollAngle: 0, groupId: null,
    color: tp.color ?? null,
    // Resize is opt-in (see the main placement path). A legacy topper carries no allowed_actions, so
    // it lands non-resizable like any unconfigured element; it can still be MOVED and edited.
    allowedActions: { resize: false, duplicate: true, color: false, delete: true, move: true, tilt: true },
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

// ── One message, or several ─────────────────────────────────────────────────────────────────────
// `writings` is a LIST because a message belongs to a surface: `surface` is part of the writing, so
// a single object could only ever be on the top OR the side OR the board. A cake wanting "9" on the
// side and a name on the board needs two, and there was no way to ask for the second — clicking
// Texts again just reopened the first.
//
// Everything written before this carries a single nullable `writing` OBJECT, and that shape is baked
// into saved orders and templates, which are not ours to rewrite. So it is promoted on the way IN,
// here, and nothing downstream reads both shapes.
const newWritingId = () => crypto.randomUUID();
const withWritingId = (w) => (w?.id ? w : { ...w, id: newWritingId() });
// Ids only — NOT a merge with DEFAULT_WRITING. Defaults are seeded when a message is created and
// re-merged on every edit (as setWriting always did); folding them in on the way IN instead would
// rewrite a saved design on load, so what came back from a template would no longer equal what was
// saved. Reading a field a stored writing never had is the renderer's job (`w.thickness ?? 0.03`).
function normalizeWritings(design) {
  return writingsOf(design).map(withWritingId);
}

// Each piping carries a stable layerId so a tier can hold multiple stacked piping
// layers per zone and every layer stays addressable across edits/renders.
const newLayerId = () => crypto.randomUUID();
const withLayerId = (piping) => (piping.layerId ? piping : { ...piping, layerId: newLayerId() });
const zoneKey = (zone) => (zone === ZONES.RIM || zone === ZONES.TOP ? 'topPipings' : 'bottomPipings');

// Default per-instance shape for a second cream layer (a raised two-tone band with a
// customer-drawn torn edge). `edge` is the height-per-angle profile h(θ); `order`
// drives the radial stack (set on add/duplicate) so a later band sits proud of the
// one beneath. Lives on tier.creamLayers — NOT a sticker, NOT a piping ring.
const SECOND_CREAM_LAYER_DEFAULT = {
  color: '#d96a86',
  edge: SECOND_CREAM_PRESETS['Gentle wave'](),
  lift: SECOND_CREAM_DEFAULTS.lift,
  fillSide: SECOND_CREAM_DEFAULTS.fillSide,
  noise: SECOND_CREAM_DEFAULTS.noise,
  height: SECOND_CREAM_DEFAULTS.height,   // band thickness from its anchor; customer's Height slider

  seed: 1,
  gold: { on: false, color: '#e6be4a' },   // GOLD_LEAF_COLORS.gold — the approved bright edible-leaf gold
};

// Passed as storageBaseUrl option — only used to migrate old-format templates
// that stored decoration type 'swirl_ring'/'base_border' instead of piping objects.
const LEGACY_PIPING_SLUG = 'elements/3D-images/piping-cream4.glb';

// The colour a newly-placed instance starts at. Pure + exported so the rule is pinned by tests — it is
// subtle and getting it wrong repaints artwork nobody asked to repaint.
//
// A `recolor` descriptor means "the customer MAY change these pixels", NOT "repaint this now". So a
// recolourable 2D sticker starts from its OWN artwork (colour null → the renderer's `needsRecolor` is
// false → the image is drawn as-is), and only `recolor.default` opts it into an at-load repaint — e.g.
// `Cream layer`, whose artwork is pink but which ships cream.
//
// Everything WITHOUT a recolor descriptor still seeds from the element's `default_color`, which has
// other jobs: GLB material tint, and the procedural border colour on a photo frame.
//
// (Before this, the two unrelated fields were coupled: any element with `recolor` AND a `default_color`
// was repainted the instant it was placed. A palm tree with a green default_color rendered uniformly
// green — trunk, leaves and flower — because `opaque` repaints every pixel and keeps only brightness.)
export function initialStickerColor(element, extra = {}) {
  if (extra.color != null) return extra.color;                 // an explicit choice always wins (re-pack, clone)
  const recolor = element?.placement_config?.recolor;
  if (recolor) return recolor.default ?? null;                 // absent → artwork's own colours
  return element?.default_color ?? null;
}

// Normalise a saved/template design into the editor's design shape: array-format
// pipings tagged with layerIds, legacy piping + topper→sticker migrations, and
// per-tier defaults. Exported so READ-ONLY consumers (the order 3D viewer) feed
// CakePreview the SAME shape the editor uses — toCanvasConfig assumes this, and a
// raw snapshot may be legacy or under-defaulted.
export function normalizeDesign(templateDesign, storageBaseUrl = '') {
  const legacyGlbUrl = storageBaseUrl ? `${storageBaseUrl}/${LEGACY_PIPING_SLUG}` : null;
  return {
    tiers: (templateDesign.tiers ?? []).map(t => {
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
        // Dimensions + wall treatments (gradient/dust/foil) restored from the snapshot so
        // edit-in-3D / template load / view brings them back. Same round-trip field list as
        // buildDesignSnapshot — see OPTIONAL_TIER_FIELDS.
        ...pickTierFields(t),
      };
    }),
    texts:    templateDesign.texts ?? [],
    ages:     templateDesign.ages  ?? [],
    // Migrate a legacy single `topper` into the unified sticker list: a topper is just a
    // GLB element standing on the top surface (or hugging the side). Placement is now fully
    // config-driven, so there is no separate topper slot or renderer.
    stickers: migrateTopperToSticker(templateDesign),
    writings: normalizeWritings(templateDesign),
    piping:   templateDesign.piping ?? [],
    // The board's own finishes — a grass ring at the cake's foot, a name in fondant cubes. Both were
    // missing here, so a template carrying them loaded as a bare cake (see designSnapshot.test.js).
    boardGrass: templateDesign.boardGrass ?? null,
    nameBlocks: templateDesign.nameBlocks ?? null,
  };
}

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

  // Chocolate-glaze marble config per tier — the poured-glaze palette + pattern (colors / flow / warp /
  // contrast / streak / drip). Sibling to tier.gradient: it lives on the INSTANCE and is rendered by the
  // object-space glaze shader (shared/glaze/glazeMaterial.js). ≥2 colours = a marble; 1 = a solid glaze.
  // Seeds from GLAZE_DEFAULTS (one chocolate) on first edit so a partial patch never drops sibling fields.
  function setTierGlaze(index, patch) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => i === index
        ? { ...t, glaze: { ...GLAZE_DEFAULTS, ...(t.glaze ?? {}), ...patch } }
        : t),
    }));
  }

  /* Tier STRIPES — several colours stacked up the wall, scraped smooth (shared/color/stripeMaterial.js).
   *
   * A PATCH, like setTierGlaze and unlike setTierGradient: stripes carry five fields
   * (palette / count / weights / softness / wobble) and the UI edits them one at a time, so a
   * positional signature would make every slider re-send the other four and drift them.
   *
   * Seeded from a preset on first edit, never from an empty object — a stripe set missing `softness`
   * renders with whatever the material defaults to, which is a look the baker did not choose.
   *
   * ⚠️ `color` is deliberately left alone. It stays the solid fallback for every surface that does not
   * read stripes — the saved thumbnail, an old client, the storefront card — so a striped cake never
   * degrades to white. Passing null clears the stripes and that fallback is what shows.
   */
  function setTierStripes(index, patch) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => {
        if (i !== index) return t;
        if (patch === null) { const { stripes, ...rest } = t; return rest; }
        return { ...t, stripes: { ...STRIPE_DEFAULTS, ...(t.stripes ?? {}), ...patch } };
      }),
    }));
  }

  function setTierCornerR(index, cornerR) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => i === index ? { ...t, cornerR } : t),
    }));
  }

  // The tier's footprint, by KEY. Shape is per-TIER, not per-cake: the geometry already resolves each
  // tier's shape independently (surface.js/tierShape), so a heart on a round base costs no extra path —
  // forbidding it would be a constraint invented in the state layer, not one the renderer has.
  //
  // Only the key is written. Size (radius/width/depth) is deliberately NOT reset: re-shaping a tier the
  // customer already sized should change its outline, not silently shrink her cake — toCanvasConfig
  // derives whatever the new family needs from the size that is already there.
  function setTierShape(index, shape) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => i === index ? { ...t, shape } : t),
    }));
  }

  // Patch a tier's self-contained shape geometry params (e.g. a number cake's typed digits). The customer
  // authors these on their own cake, so it writes to the TIER's shapeConfig — tierGeometry prefers that
  // over the catalog default, which is exactly what makes "type your number" a per-cake edit.
  function setTierShapeConfig(index, patch) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => i === index ? { ...t, shapeConfig: { ...(t.shapeConfig || {}), ...patch } } : t),
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

  // Generic per-tier layer-array mutation: map tier[index][key] through `fn`. Shared by
  // piping-layer and cream-layer ops so the "addressable stacked layers" logic lives in
  // ONE place (INVARIANTS #3) instead of a copy per layer type.
  function mutateTierLayers(index, key, fn) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => i === index ? { ...t, [key]: fn(t[key] ?? []) } : t),
    }));
  }

  // ── Layer-aware piping ops (multiple piping styles stacked per zone) ──────────
  function addPipingLayer(index, zone, piping) {
    mutateTierLayers(index, zoneKey(zone), arr => [...arr, withLayerId(piping)]);
  }

  function updatePipingLayer(index, zone, layerId, mutate) {
    mutateTierLayers(index, zoneKey(zone), arr =>
      arr.map(p => p.layerId === layerId ? { ...mutate(p), layerId } : p));
  }

  function removePipingLayer(index, zone, layerId) {
    mutateTierLayers(index, zoneKey(zone), arr => arr.filter(p => p.layerId !== layerId));
  }

  // ── Second cream layer ops (stacked raised two-tone bands per tier) ───────────
  // Each entry carries its own edge/colour/lift/gold; `order` = its radial stack slot.
  function addCreamLayer(index, layer = {}) {
    mutateTierLayers(index, 'creamLayers', arr =>
      [...arr, withLayerId({ ...SECOND_CREAM_LAYER_DEFAULT, ...layer, order: arr.length })]);
  }

  function updateCreamLayer(index, layerId, mutate) {
    mutateTierLayers(index, 'creamLayers', arr =>
      arr.map(l => l.layerId === layerId ? { ...mutate(l), layerId } : l));
  }

  function removeCreamLayer(index, layerId) {
    mutateTierLayers(index, 'creamLayers', arr => arr.filter(l => l.layerId !== layerId));
  }

  // Duplicate → a new layer one slot prouder (order = current count), so it stacks
  // over the source instead of z-fighting it. Copies edge/colour/gold; drops layerId.
  function duplicateCreamLayer(index, layerId) {
    mutateTierLayers(index, 'creamLayers', arr => {
      const src = arr.find(l => l.layerId === layerId);
      if (!src) return arr;
      const { layerId: _drop, ...rest } = src;
      return [...arr, withLayerId({ ...rest, order: arr.length })];
    });
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

  // ── Piped grass on a tier's top ─────────────────────────────────────────────
  // A per-tier SURFACE TREATMENT, stored like dusting and foil rather than as stickers. Grass is a
  // few thousand tufts; as stickers that would be a few thousand rows in the snapshot, every one of
  // them individually selectable and draggable, for something nobody wants to move a blade of.
  // Here it is one small object and the canvas instances it.
  //
  // Absent/null = no grass, so every existing design is unchanged and the field costs nothing until
  // a baker asks for it. `setTierGrass(i, null)` removes it.
  function setTierGrass(index, grass) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => i === index ? { ...t, grass } : t),
    }));
  }

  // ── Fondant letter blocks ───────────────────────────────────────────────────
  // Design-level like `writing` and `boardGrass`: a name spelled at the cake's foot belongs to the
  // CAKE, not to one tier of it. `blocks` is the arrangement — an explicit list once the name is
  // set, so a dragged block simply is where it is, with no run to re-derive it from.
  function setNameBlocks(nb) { setDesign(prev => ({ ...prev, nameBlocks: nb })); }

  // `changes` may be a function of the current value — the same contract the grass setters use, and
  // for the same reason: a drag or an edit computed from the last render can be stale.
  function updateNameBlocks(changes) {
    setDesign(prev => (prev.nameBlocks
      ? { ...prev, nameBlocks: { ...prev.nameBlocks, ...(typeof changes === 'function' ? changes(prev.nameBlocks) : changes) } }
      : prev));
  }

  // ── Grass on the BOARD ──────────────────────────────────────────────────────
  // Design-level, not per-tier, because the board is. `tier.grass` sits on a tier's top and a stack
  // has one per tier; the board ring stands on the one board, around the bottom tier — so it belongs
  // beside `writing` and `piping`, which are also facts about the cake rather than a layer of it.
  //
  // Separate from `tier.grass` rather than a `zone` on it, because the football-cake look wants BOTH
  // at once: a pitch on top and tufts ringing the base. A single zoned object would force a choice.
  function setBoardGrass(grass) {
    setDesign(prev => ({ ...prev, boardGrass: grass }));
  }

  // `changes` may be a FUNCTION of the current grass, not just a patch object. That matters for the
  // clump list: computing the next one from `design` as the component last rendered it means two
  // quick presses of "+ Add clump" both read the same list and the second overwrites the first.
  // Resolving inside the updater reads the live value instead.
  function updateBoardGrass(changes) {
    setDesign(prev => (prev.boardGrass
      ? { ...prev, boardGrass: { ...prev.boardGrass, ...(typeof changes === 'function' ? changes(prev.boardGrass) : changes) } }
      : prev));
  }

  // Same contract as updateBoardGrass — `changes` may be a function of this tier's current grass.
  function updateGrass(index, changes) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => (i === index && t.grass)
        ? { ...t, grass: { ...t.grass, ...(typeof changes === 'function' ? changes(t.grass) : changes) } }
        : t),
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

  // ── Gold leaf ("food foil") — a per-tier finish, sibling to dusting: a LIST of torn flakes
  // {u,v,rot,size,seed,surface} + a colour/finish. A tap adds one flake; the first flake seeds the foil
  // object from the food-foil element's config (DB-authored finish + chosen colour). NOT a sticker.
  // `surface` ('side' | 'top_surface', default 'side') is which tier surface the flake sits on; (u,v) is
  // interpreted per surface (side = angle/height; top = angle/radial-frac) — see particleFinish.
  function addFoilFlake(index, u, v, seed = {}) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => {
        if (i !== index) return t;
        const base = t.foil ?? {
          color: seed.color ?? GOLD_LEAF_COLORS.gold,
          finish: { ...GOLD_LEAF_DEFAULTS, ...(seed.finish ?? {}) },
          flakes: [],
        };
        const fseed = (base.flakes.length * 977 + Math.round(u * 9973) + Math.round(v * 7919)) % 100000 + 1;
        return { ...t, foil: { ...base, flakes: [...base.flakes, { u, v, surface: seed.surface ?? 'side', ...GOLD_LEAF_NEW_FLAKE, size: seed.size ?? GOLD_LEAF_NEW_FLAKE.size, rot: Math.round((u * 360) % 360), seed: fseed }] } };
      }),
    }));
  }

  function updateFoil(index, changes) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => (i === index && t.foil) ? { ...t, foil: { ...t.foil, ...changes } } : t),
    }));
  }

  function updateFoilFlake(index, flakeIndex, patch) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => (i === index && t.foil?.flakes)
        ? { ...t, foil: { ...t.foil, flakes: t.foil.flakes.map((f, j) => j === flakeIndex ? { ...f, ...patch } : f) } }
        : t),
    }));
  }

  function removeFoilFlake(index, flakeIndex) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => {
        if (i !== index || !t.foil?.flakes) return t;
        const flakes = t.foil.flakes.filter((_, j) => j !== flakeIndex);
        return { ...t, foil: flakes.length ? { ...t.foil, flakes } : null };
      }),
    }));
  }

  function clearFoil(index) {
    setDesign(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => i === index ? { ...t, foil: null } : t),
    }));
  }

  // A new tier INHERITS the shape of the one below it — stacking a round tier on a heart base is a
  // deliberate act, not something that should happen because the customer pressed "add tier". She can
  // still change it afterwards (setTierShape); the inheritance is the default, not a lock.
  function addTier() {
    setDesign(prev => {
      if (prev.tiers.length >= 4) return prev;
      const below = prev.tiers[prev.tiers.length - 1];
      return { ...prev, tiers: [...prev.tiers, { shape: below?.shape ?? 'round', color: '#ffffff', frostingType: DEFAULT_FROSTING, frostingStyle: DEFAULT_STYLE, topPipings: [], bottomPipings: [], creamLayers: [] }] };
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

  // ── Number toppers — gold balloon-number toppers standing on the cake top ──────
  // Called "Number topper" everywhere a baker can see it. The KEY stays `ages`, and the adder
  // `addAge`, because both are written into every saved design snapshot — renaming them is a data
  // migration in exchange for a word nobody reads. See the label in CakeDesigner for why it is not
  // called an age: a 5 on a cake is usually somebody's age, and the product should not sound like
  // it is collecting one when it plainly is not.
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
    let defaultScale = element.placement_config?.r ?? (isGlb ? 2.5 : element.placement_config?.photo?.mask ? 3.5 : 1);
    // A sheet lands at its FIT, not at an authored default. An edible disc is bought and printed to
    // cover the cake top — a customer who has to drag a dial to get there has been asked to do the
    // one thing the product already knows the answer to. And there is no single authored number that
    // would work: the right size is the cake's, and the top tier of a three-tier stack is not the
    // width of a single.
    const sheetCfg = element.placement_config?.sheet;
    if (sheetCfg && zone === ZONES.TOP_SURFACE) {
      defaultScale = null;   // resolved below, once the tier being placed on is known
    }
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
      let seatFanYaw = 0, seatInsertDepth = null;   // insert: per-instance fan spin + burial depth
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
      // Insert is a per-zone MODIFIER (not a mode) — it composes with whatever upright pose
      // `placementMode` carries (stand on top, hug on a wall). When the dropped-into zone has an
      // `insert` modifier, bake the per-instance lean (±jitter), a small fan spin and the burial depth
      // onto the instance. Placed at the drop/scatter position (NOT forced to the front edge like
      // perch/verge); scatter flows through addSticker unchanged, so each scattered piece gets its own
      // jittered angle. Shared insertSeat helper (both add + chooser-move paths call it).
      const insertCfg = exact ? null : zoneInsert(element.placement_config, zone);
      if (insertCfg) {
        const seed = insertSeat(insertCfg);
        seatTilt        = seed.tiltAngle;
        seatFanYaw      = seed.fanYaw;
        seatInsertDepth = seed.depthFrac;
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
      // A sheet's default size is the CAKE's, so it can only be resolved here — inside the updater,
      // where the tier being placed on is known. Radius is resolved through tierRadius for the same
      // reason: a design tier carries no width of its own.
      const seededScale = defaultScale ?? (() => {
        const i = tierIndex ?? 0;
        const t = prev.tiers[i] ?? prev.tiers[0];
        const fitted = surfaceFitMax(
          { zone, sheetShape: sheetCfg?.shape ?? null, sheetFill: sheetCfg?.fill ?? 1 },
          t ? { ...t, radius: tierRadius(t, i) } : null,
        );
        return fitted ?? 1;
      })();
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
          // Side seating depth, per zone (placement.js zoneSeatFields → zoneSeat): 'proud' = back-on-wall
          // so a solid body stands off the wall (bow, toppers, cluster balls); 'flush' = centred (thin
          // decals, and scattered decor which nestles better tucked in). Default is config-driven off the
          // `scatter` flag (scatter→flush, else proud) with an explicit per-zone `seat` override; no
          // element-type branch. The SAME helper re-derives this on the chooser's zone-switch move, so an
          // added and a moved instance seat identically. Only the side bend path reads it (verge/stand
          // seat by their own logic).
          sideProud:     zoneSeatFields(element.placement_config, zone).sideProud,
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
          // Raised-fondant relief for a 2D image sticker (placement_config.relief) — present → the renderer
          // bakes displacement + normal maps from the image and lifts it into a 3D cut-out (rounded bevel,
          // real shadow) on a subdivided mesh. Absent → the sticker renders flat.
          relief:        element.placement_config?.relief ?? null,
          // Per-element print finish for a 2D image sticker (placement_config.print_finish): { saturation,
          // emissive, gain } — an albedo chroma pre-boost + decal self-illumination so the print survives the
          // lit render wash, plus a print EXPOSURE scale for the opposite case (an upright topper faces the key
          // light head-on and OVER-exposes, where neither of the other two can dim it). Applies to BOTH flat
          // and relief 2D stickers (not nested under relief). Absent → the renderer's module defaults
          // (DECAL_SAT / DECAL_EMISSIVE / DECAL_GAIN).
          printFinish:   element.placement_config?.print_finish ?? null,
          // Photo-cake frame (config-gated on placement_config.photo.mask, no element-type branch): the
          // MASK is the shape (heart/circle/square…) and drives both the photo clip and the procedural
          // border. The customer's photo (photoUrl) is clipped to it; the border is a colour ring of
          // borderWidth (0 = none, recoloured via `color`), unless a decorative overlay (photoOverlay)
          // supplies fancy border art. Absent → renders as a plain decal.
          photoMask:      element.placement_config?.photo?.mask ?? null,
          photoOverlay:   element.placement_config?.photo?.overlay ?? null,   // optional decorative border art
          photoShape:     element.placement_config?.photo?.shape ?? null,     // 'round'|'rect'|'other' — top-fit max-size rule
          photoFill:      element.placement_config?.photo?.fill ?? 1,         // shape extent as a fraction of the plane (measured) — exact fit-to-rim
          // An EDIBLE SHEET: printed artwork the baker lays on the cake (the football disc). Same
          // fit-to-the-boundary rule as a photo frame, different provenance — the artwork IS the
          // picture, so there is no mask and no border ring. See placement.js surfaceFit.
          sheetShape:     element.placement_config?.sheet?.shape ?? null,      // 'round' | 'rect'
          sheetFill:      element.placement_config?.sheet?.fill ?? 1,          // artwork extent within its square plane
          borderWidth:    element.placement_config?.photo?.border?.width ?? 0.06,  // thin default; 0 = no border
          photoUrl:       null,                       // customer upload (set at design time); distinct from imageUrl (the mask/shape)
          photoTransform: { x: 0, y: 0, zoom: 1, rot: 0 },   // pan (UV fraction) + zoom + 2D rotation (deg); cover-fit baseline at zoom 1
          // Editable text placeholders (config-gated on placement_config.text_slots, no element-type
          // branch): the artwork carries named slots ({number}, {name}, …) whose VALUES the customer
          // types. The value is composited into the texture at design time, so it is never an asset —
          // the same element serves "2", "47" and "Amara". Absent → renders as a plain decal.
          textSlots:      element.placement_config?.text_slots ?? null,
          // Seeded from each slot's authored default, then owned by the customer (like photoUrl).
          textValues:     Object.fromEntries(
                            (element.placement_config?.text_slots ?? []).map(sl => [sl.key, sl.default ?? '']),
                          ),
          u:             position.u ?? null,   // rect side: perimeter fraction (round uses theta)
          theta:         seatTheta,            // round side: seat angle around the wall
          y:             seatY,                // side: seat height on the wall
          x:             px,
          z:             pz,
          scale:         extra.scale ?? seededScale,   // scatter passes a small per-instance radius; a sheet lands at its fit
          // The GLB's authored facing offset (e.g. toppers need [0,-90,0]° to face front).
          // Authored in degrees (calibrator convention); facingOffsetRadians resolves the unit to
          // the radians THREE/baseRotation use. Config-driven, applied by the renderer; null = +z.
          baseRotation:  facingOffsetRadians(element.placement_config),
          yOffset:       extra.yOffset ?? seatYOffset,   // perch/verge: calibrated seat; cluster: ball stacking lift
          rotation:      seatFanYaw,     // insert modifier: small per-instance fan spin (else 0 — user Y-spin adds on top)
          radialOffset:  0,
          tiltAngle:     seatTilt,       // perch: seated straddle-lean; verge: outward recline; insert modifier: lean±jitter
          // The OTHER lean axis: tiltAngle tips an element front/back, rollAngle tips it left/right
          // (and on a wall, spins it in the plane of that wall — a jersey sitting diagonally). Always
          // starts upright: no placement mode seeds a sideways lean, and a config that wanted one
          // would seed it here beside seatTilt.
          rollAngle:     0,
          // Insert modifier: fraction of the element's LENGTH sunk into the surface (render scales by
          // measured length), and the RENDER'S "is inserted" signal — non-null iff the zone carried an
          // insert modifier (0 is valid: buried-but-flush). null otherwise. See placement.js zoneInsert
          // / insertSeat / PLACEMENT_CONFIG.md.
          insertDepth:   seatInsertDepth,
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
          // See initialStickerColor: `recolor` = the customer MAY change these colours, not "repaint now".
          color:         initialStickerColor(element, extra),
          // GLB Recompose: customer-recolourable part groups. `placement_config._model.groups` (the
          // editable controls) is the source of truth; copy the editable ones onto the instance and
          // seed each group's current colour from its default. Render recolours meshes by
          // userData.group; absent/empty → the single-colour `color` path is used (unchanged).
          groups:        (element.placement_config?._model?.groups ?? []).filter(g => g.editable),
          // Seed each group's colour from its default. TWO sources, ONE path:
          //   • a GLB part-group carries its default on the group itself (_model.groups[].default)
          //   • a hue_regions sticker carries them on the recolour descriptor
          //     (recolor.group_defaults, index-keyed) — this is how an uploaded decoration renders in
          //     the colours its uploader chose, WITHOUT baking them into the pixels. The artwork stays
          //     original; the colours stay data; and the customer can still change them (unless the
          //     uploader locked them). Absent/empty → the artwork's own colours, unchanged.
          groupColors:   {
                           ...Object.fromEntries(
                             (element.placement_config?._model?.groups ?? [])
                               .filter(g => g.editable)
                               .map(g => [g.key, g.default ?? '#ffffff'])),
                           ...(element.placement_config?.recolor?.group_defaults ?? {}),
                         },
          // Shared fondant surface: opt-in per element (absent → use the GLB's own texture/material).
          useSharedFondantTexture: element.placement_config?.useSharedFondantTexture === true,
          // GLB material finish, config-driven (placement_config.roughness/metalness). null = keep the
          // GLB's own baked material. Lets one sphere read as metallic (low roughness / high metalness)
          // or matte (high roughness / 0 metalness) from config — applied on the shared art path.
          // `extra` wins so a customer's finish choice survives a re-pack (clusters pass it through,
          // like the palette), the same precedence every field above uses.
          roughness:     extra.roughness ?? element.placement_config?.roughness ?? null,
          metalness:     extra.metalness ?? element.placement_config?.metalness ?? null,
          // Surface FINISH for a 3D GLB decoration. Resolved from a MATERIAL TAG
          // (placement_config.material: "satin") against the decoration-materials registry — the full
          // MeshPhysical finish (roughness/sheen/clearcoat/anisotropy/…) lives ONCE in that registry, so
          // many elements share it by name (DRY). `materialSurface` returns null for an unknown or body-only
          // material (never lets a cake-body material land on a decoration). Falls back to an inline
          // placement_config.surface object for a one-off. Applied on the GLB finish path (StickerModel);
          // recolour still tints the base colour. Config-driven, no element-type branch.
          surface:       extra.surface ?? materialSurface(element.placement_config?.material) ?? element.placement_config?.surface ?? null,
          allowedActions: {
            // Resize is OPT-IN: an element is resizable (canvas corner grips AND the popup/toolbar
            // SizeDial — one capability, all inputs gated together, INVARIANTS 5b) only when its config
            // explicitly sets allowed_actions.resize. Default OFF, so a placed element without the flag
            // can be MOVED but not resized, and 3D/2D behave identically — no element-type branch. The
            // admin turns resize on per element.
            resize:    element.allowed_actions?.resize    ?? false,
            duplicate: element.allowed_actions?.duplicate ?? true,
            color:     element.allowed_actions?.color     ?? false,
            gradient:  element.allowed_actions?.gradient  ?? false,
            // Was hardcoded `true`, which made admin's "deletable" checkbox DEAD CONFIG — the one
            // capability that ignored the element. Defaults to true, so an element that never set the
            // flag is deletable exactly as before; only an explicit `false` pins it to the cake.
            delete:    element.allowed_actions?.delete    ?? true,
            // Defaults TRUE, for the same reason `delete` two lines up does: every decoration on
            // every cake moves today, and a capability that arrives defaulting to false silently
            // freezes all of them. Only an explicit `false` pins one down.
            //
            // It defaulted to false while NOTHING read it, so the value is meaningless in every
            // sticker and every design_snapshot written before now — which is exactly why the canvas
            // reads the ELEMENT rather than this copy. See isStickerMovable in CakeDesigner.
            move:      element.allowed_actions?.move      ?? true,
            // Opt-IN, matching how admin authors capabilities everywhere (ManageElements /
            // PhotoFrameStudio default `tilt: false`). The old `?? true` contradicted that convention,
            // so every element — including a promoted decoration whose type never asked for it — got a
            // Tilt control in the popup. Tilt now appears only when a type explicitly enables it.
            tilt:      element.allowed_actions?.tilt      ?? false,
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

  // Cream-pen writing. Each message is its own instance with its own surface, so "Texts" ADDS
  // rather than reopening: addWriting returns the new id, because the caller has to select the card
  // it just created and cannot find it by content (a new message is empty, and so is any other).
  function addWriting(changes = {}) {
    const id = newWritingId();
    setDesign(prev => ({ ...prev, writings: [...(prev.writings ?? []), { ...DEFAULT_WRITING, ...changes, id }] }));
    return id;
  }
  function updateWriting(id, changes) {
    setDesign(prev => ({
      ...prev,
      writings: (prev.writings ?? []).map(w => w.id === id ? { ...DEFAULT_WRITING, ...w, ...changes } : w),
    }));
  }
  function removeWriting(id) {
    setDesign(prev => ({ ...prev, writings: (prev.writings ?? []).filter(w => w.id !== id) }));
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

  // Start over as the shape the customer picked (CakeDesigner's New flow). Defaulting to round keeps
  // every existing caller — resetDesign() with no argument — behaving exactly as it did.
  //
  // A shape is the cake you START with, not only the outline it is cut from: if its catalog row authors a
  // STACK, the new cake is that stack. That is the whole difference between "Cylinder" and "2T Cylinder",
  // which are the same footprint and were previously the same cake. An empty stack means one tier at the
  // designer's default size — what every shape meant before this existed.
  //
  // Sizes come from the row; everything else (colour, frosting, style) is the designer's default, because
  // a shape authors the CAKE'S FORM, not its decoration.
  function resetDesign(shape = 'round', { shapeConfig } = {}) {
    // An authored row carries its own full, self-contained design (snapshot shape) — load it exactly as
    // a template would, so a starter saved with a stack/frosting/decoration comes back intact and
    // normalised. Seed round/rect (and any legacy row without a stored design) are built on the fly.
    const def = cakeShapeDef(shape);
    let design = def.design ?? starterDesign(shape);
    // A glyph cake's characters (number `digits` / letter `letters`) are chosen at pick time (the New-cake
    // prompt) and arrive as a `shapeConfig` patch. Merge it onto the bottom tier HERE, as part of the same
    // design that loads, so the cake renders the customer's string on the first frame — not a second
    // setState that would race the reset. Generic: any family's config key merges the same way.
    if (shapeConfig && Object.keys(shapeConfig).length) {
      design = { ...design, tiers: design.tiers.map((t, i) => i === 0 ? { ...t, shapeConfig: { ...(t.shapeConfig ?? {}), ...shapeConfig } } : t) };
    }
    if (def.design) loadDesign(design);
    else setDesign(design);
  }

  function addStickerBatch(stickers) {
    setDesign(prev => ({ ...prev, stickers: [...prev.stickers, ...stickers] }));
  }

  function loadDesign(templateDesign) {
    setDesign(normalizeDesign(templateDesign, storageBaseUrl));
  }

  const canvasConfig = useMemo(() => toCanvasConfig(design), [design]);

  return {
    design,
    setTierColor, setTierFrostingType, setTierFrostingStyle, setTierStyleParam, setTierGradient, setTierGlaze, setTierStripes, setTierCornerR, setTierShape, setTierShapeConfig, setTopPiping, setBottomPiping,
    addPipingLayer, updatePipingLayer, removePipingLayer,
    addCreamLayer, updateCreamLayer, removeCreamLayer, duplicateCreamLayer,
    addDustSplash, updateDusting, clearDusting, removeLastDustSplash, updateDustSplash, removeDustSplash,
    setTierGrass, updateGrass, setBoardGrass, updateBoardGrass,
    setNameBlocks, updateNameBlocks,
    addFoilFlake, updateFoil, updateFoilFlake, removeFoilFlake, clearFoil,
    addTier, removeTier,
    addText, updateText, duplicateText, removeText,
    addWriting, updateWriting, removeWriting,
    addAge, updateAge, duplicateAge, removeAge,
    addSticker, updateSticker, removeSticker, duplicateSticker,
    groupStickers, ungroupStickers, moveGroupStickers, moveStickersBy, scaleStickers, scaleGroupBy,
    addStroke, removeStroke, clearPiping,
    resetDesign,
    addStickerBatch,
    loadDesign,
    canvasConfig,
  };
}
