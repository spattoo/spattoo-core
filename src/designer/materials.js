// ── Decoration surface materials — the "material" a PLACED decoration wears (satin, glossy, matte…) ──────
//
// A DIFFERENT axis from cake-body FROSTINGS (frostings.js): frostings coat the cake; these are the surface
// FINISH of a placed GLB decoration (a satin ribbon, a glossy topper). A decoration references one by a
// readable KEY tag — `placement_config.material: "satin"` — and the renderer resolves it to a `surface`
// finish it applies to the GLB's material (see StickerModel, canvas/CakeCanvas.jsx).
//
// ONE catalog, gated by `applies_to` (['body'] | ['element'] | ['body','element']) — the SAME `materials`
// DB table backs both axes (fondant applies to BOTH: coat a cake OR a fondant bow — authored once, not
// duplicated). A decoration only ever resolves through `materialsFor('element')`, so a body-only material
// (buttercream) can never land on a decoration and an element-only one (satin) can never land on the cake.
//
// This is the SEED; the `materials` DB table overlays `label`/`applies_to`/`config.surface` via
// applyDecorMaterialConfig (seed + overlay, the same contract as frostings/cream styles). `surface` is just
// NUMBERS, so — unlike a frosting's bespoke shader recipe — it lives fine in a row (this advances the
// "material physics → DB overlay" gap INVARIANTS.md §1 flags, for the simple numeric case).
//
// `surface` fields map 1:1 to MeshPhysicalMaterial: roughness, metalness, sheen, sheenColor, sheenRoughness,
// clearcoat, clearcoatRoughness, envMapIntensity, anisotropy, anisotropyRotation. ALL optional — only the
// ones set are overridden on the GLB's baked material. Anisotropy needs the GLB to carry a TANGENT attribute
// (baked in the asset pipeline) or the silk streak mottles.

export const DECOR_MATERIALS = {
  satin: {
    label: 'Satin',
    applies_to: ['element'],
    // Anisotropic silk sheen: LOW roughness for a defined streak + anisotropy (needs baked tangents) as the
    // primary satin cue; a fixed WHITE sheen (a config value can't derive per-recolour — validated to hold
    // across black/red); low clearcoat + modest env so the black base stays dark (satin = contrast).
    surface: {
      roughness: 0.28, metalness: 0,
      anisotropy: 1.0, anisotropyRotation: 1.57,
      sheen: 0.35, sheenColor: '#ffffff', sheenRoughness: 0.28,
      clearcoat: 0.12, clearcoatRoughness: 0.4,
      envMapIntensity: 0.45,
    },
  },
};

// The context a material may be used in. A decoration resolves ONLY 'element'; the cake-body frosting picker
// resolves 'body' (frostings.js is that seed today — this gate lets dual-use materials like fondant join it).
function appliesTo(m, context) {
  return Array.isArray(m?.applies_to) && m.applies_to.includes(context);
}

// Resolve a `placement_config.material` KEY → its surface finish, ONLY if the material may go on an element.
// Returns null for an unknown key or a body-only material — so a bad/mis-scoped tag renders the GLB's own
// baked material rather than throwing. (Config-driven, no element-type branch.)
export function materialSurface(key) {
  if (!key) return null;
  const m = DECOR_MATERIALS[key];
  return m && appliesTo(m, 'element') ? m.surface : null;
}

// The materials available for a context, as [{ key, label }] in a stable order — for pickers (e.g. a future
// decoration-finish selector). Body materials come from FROSTINGS; element materials from here.
export function materialsFor(context) {
  return Object.entries(DECOR_MATERIALS)
    .filter(([, m]) => appliesTo(m, context))
    .map(([key, m]) => ({ key, label: m.label }));
}

// Overlay the DB `materials` rows (the ones that carry a `config.surface` + `applies_to` including 'element')
// onto the code seed — same seed+overlay contract as applyMaterialConfig (frostings). Mutates DECOR_MATERIALS
// in place so every consumer (resolved lazily) sees the overlay. Rows without a surface are frosting-only and
// ignored here. Safe to call repeatedly (re-applies).
export function applyDecorMaterialConfig(rows) {
  for (const row of rows ?? []) {
    const surface = row?.config?.surface;
    const appliesToArr = row?.config?.applies_to ?? row?.applies_to;
    if (!surface || !(Array.isArray(appliesToArr) && appliesToArr.includes('element'))) continue;
    const existing = DECOR_MATERIALS[row.key] ?? {};
    DECOR_MATERIALS[row.key] = {
      ...existing,
      label: row.label ?? existing.label ?? row.key,
      applies_to: appliesToArr,
      // merge so a partial row override doesn't drop seeded fields
      surface: { ...(existing.surface ?? {}), ...surface },
    };
  }
}
