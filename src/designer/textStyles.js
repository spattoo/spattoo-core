// ── Text styles — the catalog for how an editable {name}/{number} placeholder LOOKS ────────────
//
// A template element's `placement_config.text_slots[].style_key` names one of these. The look (font,
// fill, hatch, outline) is a SHARED preset, not a per-template blob: a new template is artwork + slot
// rects + a style pick, and restyling one preset updates every template that references it.
//
// Same shape and same data↔code seam as creamStyles/cake_textures: each entry's `algorithm` is a KEY
// the renderer (shared/textures/textSlots.js → ALGORITHMS) resolves to a drawing strategy. A brand-new
// look needs a strategy in code; tuning an existing one (colours, hatch, outline, typeface) is pure
// config — a `text_styles` DB row, no deploy.
//
// This module is the SEED/fallback. `applyTextStyleConfig(rows)` overlays the DB rows fetched by the
// host's apiClient (CakeDesigner), exactly like applyTextureConfig. A host with no such method — or an
// empty table — keeps rendering off the seed, so the designer never hard-fails on a missing style.

import { DEFAULT_TEXT_STYLE } from './shared/textures/textSlots.js';

// The seed: one neutral style so an element authored against a style that has since been deactivated
// (or a host that can't reach the API) still renders its placeholder instead of dropping the value.
export const TEXT_STYLES = {
  default: { label: 'Default', ...DEFAULT_TEXT_STYLE },
};

// Overlay DB-authored rows onto the seed. A row's `config` carries the tunables; `algorithm` is the
// strategy key. Unknown/extra rows simply become new entries — a new style needs no code change.
export function applyTextStyleConfig(rows) {
  for (const row of rows || []) {
    if (!row?.key) continue;
    TEXT_STYLES[row.key] = {
      label: row.label ?? row.key,
      algorithm: row.algorithm ?? DEFAULT_TEXT_STYLE.algorithm,
      ...(row.config || {}),
    };
  }
}

// The style a slot renders with. Unknown key → the seed default, never undefined: a placeholder whose
// style row vanished must still draw the customer's value (a blank plaque is worse than a wrong font).
export function textStyleOf(slot) {
  return TEXT_STYLES[slot?.style_key] || TEXT_STYLES.default;
}
