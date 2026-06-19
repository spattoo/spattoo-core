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

export const FROSTINGS = {
  buttercream: {
    label: 'Buttercream',
    material: { roughness: 0.50, metalness: 0, sheen: 0.60, sheenRoughness: 0.55, sheenColor: '#fff3e0', clearcoat: 0.20, clearcoatRoughness: 0.45, envMapIntensity: 0.65, grain: 'cream', grainStrength: 0.50, grainDensity: 1.0 },
    edge: 'sharp',
    capabilities: { gradient: true },
  },
  whipped: {
    label: 'Whipped',
    material: { roughness: 1.00, metalness: 0, sheen: 0.20, sheenRoughness: 0.95, sheenColor: '#ffffff', clearcoat: 0.00, clearcoatRoughness: 1.00, envMapIntensity: 0.30, grain: 'foam', grainStrength: 1.10, grainDensity: 0.4 },
    edge: 'sharp',
    capabilities: { gradient: true },
  },
  fondant: {
    label: 'Fondant',
    material: { roughness: 0.62, metalness: 0, sheen: 0.40, sheenRoughness: 0.85, sheenColor: '#ffffff', clearcoat: 0.08, clearcoatRoughness: 0.75, envMapIntensity: 0.45, grain: 'fondant', grainStrength: 0.22, grainDensity: 1.6 },
    edge: { kind: 'round', frac: 0.10 },
    capabilities: { gradient: false },
  },
  // 'naked' is deferred to v2 (needs its own design pass on which decorations a bare-sponge cake
  // allows). Its render path (NakedLayers in CakeTier) is kept dormant for reference; just not
  // offered in the picker. Re-add an entry here (with render:'sponge') to bring it back.
};

// Display order for pickers (drives the chip row sequence).
export const FROSTING_ORDER = ['buttercream', 'whipped', 'fondant'];

// [{ value, label }] derived from the registry — labels live in ONE place.
export const FROSTING_TYPES = FROSTING_ORDER.map(value => ({ value, label: FROSTINGS[value].label }));

export const DEFAULT_FROSTING = 'buttercream';

// Resolve a finish (falls back to the default), and read a capability.
export const frostingDef = (type) => FROSTINGS[type] ?? FROSTINGS[DEFAULT_FROSTING];
export const frostingSupportsGradient = (type) => !!frostingDef(type).capabilities?.gradient;
