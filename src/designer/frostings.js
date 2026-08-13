// ── Frosting finishes — the ONE declarative source of truth ───────────────────
//
// The cake-body "frosting type" axis (buttercream / whipped / fondant; naked deferred to v2). Unlike PLACED
// elements (open, admin-authored as DB rows over a generic renderer — see INVARIANTS #1), frosting
// is a small CLOSED set where each finish is a bespoke recipe that drives real shaders/geometry.
// So it lives in code — but as ONE declarative registry, not flags/branches scattered across the
// render, the hook and the picker.
//
// Each entry is DATA:
//   label                       — picker label (single source; no duplicate label tables).
//   material                    — MeshPhysical descriptor (roughness/sheen/clearcoat/…) + a `grain`
//                                 KEY. Absent for finishes that render their own way (naked).
//   edge                        — 'sharp' | { kind:'round', frac } — the tier wall's top profile.
//   render                      — reserved (v2): strategy KEY for finishes with a custom body (naked sponge).
//   capabilities.gradient       — may this finish carry an ombre gradient? (cream techniques only.)
//
// The `grain` / `render` strings are KEYS the render layer resolves against its own small registry
// of generators — that's the data↔code seam (the unavoidable code stays behind a name). A future
// per-baker BACKEND config can overlay this base (enabled set, brand colours) without touching any
// consumer: keep this the only place the finishes are described.
//
// MATERIAL IS THE PARENT of the material→style relationship. `styles` is an ORDERED list of style KEYS
// the material offers — a direct lookup, never a scan of all styles (scales to many styles: only a
// material's own listed keys are resolved). `smooth` is the IMPLICIT, always-first default for every
// material and is NOT listed here; an empty `styles` = "smooth only" (fondant). This is the SEED; the
// `materials` DB table overlays the list/label per material via applyMaterialConfig (seed + overlay,
// same as cake_textures → creamStyles). The material PHYSICS below stay code (a shader recipe can't
// live in a row); only the configurable list/label is overlaid.

import { CREAM_STYLES, DEFAULT_STYLE, styleDef } from './creamStyles.js';
import { applyGlazeDefaults } from './shared/glaze/glazeMaterial.js';

export const FROSTINGS = {
  buttercream: {
    label: 'Buttercream',
    // A cake's vertical WALLS washed paler/desaturated than its up-facing top (round + number alike). The
    // cause is ADDITIVE WHITE = direct specular from the two directional lights + sheen — NOT the HDRI
    // (envMapIntensity 0 changes it by nothing; measured, see CakeCanvas.jsx:997). The walls catch the
    // directional lights' specular lobe; a glossy roughness spreads it across the whole face. Fix mirrors
    // the measured decal-print result (roughness↑, sheen↓ recovered the saturation): buttercream goes
    // matte — roughness 0.95, sheen 0, clearcoat 0 (clearcoat is a second specular lobe). Verified in a
    // render: top-vs-wall saturation gap 0.102 → 0.023 (near-Lambertian, hue can't vary by facing).
    // (Tunable look calibration, no persisted config.)
    material: { roughness: 0.95, metalness: 0, sheen: 0.00, sheenRoughness: 0.55, sheenColor: '#fff3e0', clearcoat: 0.00, clearcoatRoughness: 0.45, envMapIntensity: 0.65, grain: 'cream', grainStrength: 0.50, grainDensity: 1.0 },
    edge: 'sharp',
    capabilities: { gradient: true },
    styles: ['wave', 'swirl', 'rustic'],
  },
  whipped: {
    label: 'Whipped',
    material: { roughness: 1.00, metalness: 0, sheen: 0.20, sheenRoughness: 0.95, sheenColor: '#ffffff', clearcoat: 0.00, clearcoatRoughness: 1.00, envMapIntensity: 0.30, grain: 'foam', grainStrength: 1.10, grainDensity: 0.4 },
    edge: 'sharp',
    capabilities: { gradient: true },
    styles: ['wave', 'swirl', 'rustic'],
  },
  fondant: {
    label: 'Fondant',
    material: { roughness: 0.62, metalness: 0, sheen: 0.40, sheenRoughness: 0.85, sheenColor: '#ffffff', clearcoat: 0.08, clearcoatRoughness: 0.75, envMapIntensity: 0.45, grain: 'fondant', grainStrength: 0.22, grainDensity: 1.6 },
    edge: { kind: 'round', frac: 0.10 },
    capabilities: { gradient: false },
    styles: [],
  },
  glaze: {
    label: 'Chocolate Glaze',
    // A poured mirror/chocolate glaze — a WET, glossy coat: low roughness + a full clearcoat lacquer +
    // a strong room reflection, no sheen, no micro-grain (a glaze is smooth, not creamy). These are the
    // values dialled in the admin Glaze Studio. The marble COLOUR is not here — it is a design-instance
    // field (tier.glaze) rendered by the object-space shader (shared/glaze/glazeMaterial.js), exactly as
    // the ombre gradient's colours live on the instance, not on the material.
    material: { roughness: 0.18, metalness: 0, sheen: 0.00, sheenRoughness: 0.5, sheenColor: '#ffffff', clearcoat: 1.00, clearcoatRoughness: 0.22, envMapIntensity: 1.15 },
    // Glaze rolls over its own edge: the SAME rounded-rim path fondant uses (buildRoundedTopCylinder /
    // buildOutlinePrism read this), so the rim auto-rounds on every shape — round, heart, number alike.
    edge: { kind: 'round', frac: 0.06 },
    // Its colours are the marble palette (tier.glaze.colors), NOT the cream ombre gradient — so the
    // gradient capability stays off; a glaze is never a cream technique.
    capabilities: { gradient: false },
    // `render` KEY resolved by the render layer (CakeTier) → apply the glaze shader. This is the data↔code
    // seam (like `grain`): the consumer keys off render:'glaze', never off the literal frosting name.
    render: 'glaze',
    styles: [],
  },
  // 'naked' is deferred to v2 (needs its own design pass on which decorations a bare-sponge cake
  // allows). Its render path (NakedLayers in CakeTier) is kept dormant for reference; just not
  // offered in the picker. Re-add an entry here (with render:'sponge') to bring it back.
};

// Display order for pickers (drives the chip row sequence).
export const FROSTING_ORDER = ['buttercream', 'whipped', 'fondant', 'glaze'];

// [{ value, label }] derived from the registry — labels live in ONE place.
export const FROSTING_TYPES = FROSTING_ORDER.map(value => ({ value, label: FROSTINGS[value].label }));

export const DEFAULT_FROSTING = 'buttercream';

// Resolve a finish (falls back to the default), and read a capability.
export const frostingDef = (type) => FROSTINGS[type] ?? FROSTINGS[DEFAULT_FROSTING];
export const frostingSupportsGradient = (type) => !!frostingDef(type).capabilities?.gradient;

// The ORDERED styles a material offers, as [{ value, label }] for the picker. Direct lookup of the
// material's own list (no scan of all styles). `smooth` is prepended (implicit default). Keys are
// FILTERED to styles that actually resolve in the registry (CREAM_STYLES, incl. DB-overlaid textures)
// — so a dropped/not-yet-loaded style key is simply omitted (inert), never a broken option. Dupes are
// removed so an accidental 'smooth' in the list can't double it.
export function stylesForFrosting(type) {
  const seen = new Set();
  const out = [];
  for (const key of [DEFAULT_STYLE, ...(frostingDef(type).styles ?? [])]) {
    if (seen.has(key) || !CREAM_STYLES[key]) continue;   // dedupe + drop unresolved keys
    seen.add(key);
    out.push({ value: key, label: styleDef(key).label });
  }
  return out;
}

// May this material carry a surface style beyond smooth? (Drives whether the style picker shows.)
export const frostingAllowsStyles = (type) => stylesForFrosting(type).length > 1;

// Does this material offer this specific style? (smooth is always allowed.) Used to CLAMP a tier's
// style when its material changes, so e.g. switching buttercream+wave → fondant can't leave a wave
// wall on a smooth-only material. One pure source for the rule — picker + state clamp both read it.
export const frostingAllowsStyle = (type, style) =>
  stylesForFrosting(type).some(o => o.value === style);

// Overlay the DB-authored `materials` rows onto the in-code seed. Each row: { key, label,
// config:{ styles, material?, glaze? } }. The shader RECIPE (grain/edge/render KEYS) stays code, but the
// TUNING NUMBERS are overlaid so admin can retune a finish without a release (INVARIANTS §1a): label,
// the style list, the MeshPhysical scalar knobs (config.material), and the glaze palette/pattern defaults
// (config.glaze). Materials absent from the DB keep their seed (designer works offline / before seeding).
export function applyMaterialConfig(rows) {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    if (!row?.key) continue;
    const seed = FROSTINGS[row.key];
    if (!seed) continue;                                  // the shader recipe is code-only; ignore unknown keys
    FROSTINGS[row.key] = {
      ...seed,
      label: row.label ?? seed.label,
      styles: Array.isArray(row.config?.styles) ? row.config.styles : seed.styles,
      // Merge the authored scalar knobs onto the seed's material (a partial override keeps the rest).
      material: row.config?.material ? { ...seed.material, ...row.config.material } : seed.material,
    };
    // The glaze finish also carries its palette + pattern DEFAULTS (what a new glaze tier seeds from).
    if (row.config?.glaze) applyGlazeDefaults(row.config.glaze);
  }
}
