import { describe, it, expect } from 'vitest';
import { toCanvasConfig } from './useCakeDesign.js';
import { OPTIONAL_TIER_FIELDS } from '../utils/designSnapshot.js';
import { WAFER_PRESETS, WAFER_CONTROLS, WAFER_DEFAULTS, WAFER_HEMS } from '../geometry/waferPaper.js';

/* ⚠️ THE TWO WAYS A TIER TREATMENT GOES MISSING, both of which have already happened here once.
 *
 * `toCanvasConfig` rebuilds every tier from an explicit ALLOW-LIST, so a new field is invisible to
 * the renderer until it is named — the coat set its state, passed every gate and drew nothing.
 * `OPTIONAL_TIER_FIELDS` is the other end: a field missing from it is dropped when a design is
 * saved, so the skirt survives until the baker reopens their own template. */
describe('a wafer skirt reaches the canvas and the save file', () => {
  const wafer = { count: 30, ripple: 0.3, colour: '#f2766d', hem: 'notch' };

  it('passes the skirt through to the canvas', () => {
    const design = { tiers: [{ radius: 1.2, height: 1.45, wafer }] };
    expect(toCanvasConfig(design).tiers[0].wafer).toEqual(wafer);
  });

  it('is null when there is none, never undefined', () => {
    expect(toCanvasConfig({ tiers: [{ radius: 1.2, height: 1.45 }] }).tiers[0].wafer).toBeNull();
  });

  it('is saved with the design', () => {
    expect(OPTIONAL_TIER_FIELDS).toContain('wafer');
  });
});

/* The presets and the ranges live in core because they are offered in TWO places now — the tier
 * card and WaferPaperStudio. A preset that falls outside its own slider is a look a baker can be
 * handed and then cannot get back to once they touch anything. */
describe('the presets fit the controls that edit them', () => {
  const all = [...WAFER_CONTROLS.sheets, ...WAFER_CONTROLS.pleat, ...WAFER_CONTROLS.mount];

  it('every control names a real wafer parameter', () => {
    for (const c of all) expect(WAFER_DEFAULTS, c.key).toHaveProperty(c.key);
  });

  it('every preset value sits inside its control range', () => {
    for (const [name, preset] of Object.entries(WAFER_PRESETS)) {
      for (const c of all) {
        if (preset[c.key] == null) continue;
        expect(preset[c.key], `${name} / ${c.label}`).toBeGreaterThanOrEqual(c.min);
        expect(preset[c.key], `${name} / ${c.label}`).toBeLessThanOrEqual(c.max);
      }
    }
  });

  /* ⚠️ `setTierWafer` MERGES onto whatever the tier already has, so a key a preset leaves unsaid is
   * INHERITED from the preset tapped before it. `fin` is the one that matters: it decides whether a
   * sheet lies on the wall or stands on edge, and a look tuned flat rendered standing is a cake no
   * reference shows. The tier card's chip also marks itself active by comparing every key it names,
   * so a preset that omits `fin` cannot even tell whether it is the one currently applied. */
  it('every preset says which way its sheets face', () => {
    for (const [name, preset] of Object.entries(WAFER_PRESETS)) {
      expect(preset, name).toHaveProperty('fin');
      expect(typeof preset.fin, name).toBe('boolean');
    }
  });

  it('every preset asks for a cut the panel builder can make', () => {
    const keys = WAFER_HEMS.map(h => h.key);
    for (const [name, preset] of Object.entries(WAFER_PRESETS)) {
      expect(keys, name).toContain(preset.hem);
    }
    expect(keys).toContain(WAFER_DEFAULTS.hem);
  });
});
