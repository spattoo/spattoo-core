import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildSolidWallMaterial, SOLID_FINISHES, DEFAULT_SOLID_FINISH } from './solidFinishes.js';

// The solid slab's side walls. Two colour sources, chosen by placement_config.relief.solidWallColor:
// a flat hue ('dominant', the default) or the print sampled per-point ('print', via a printMap on uv1).
describe('buildSolidWallMaterial — flat wall colour (default)', () => {
  it('paints the given hue and carries no map', () => {
    const mat = buildSolidWallMaterial('fondant', '#73ab0c', 0);
    expect(mat.map).toBeNull();
    expect(mat.color.getHexString()).toBe('73ab0c');
    // emissive matches the colour so wall and cap read as one hue under the print's self-illumination.
    expect(mat.emissive.getHexString()).toBe('73ab0c');
  });

  it('falls back to a neutral fondant tone when no colour resolves', () => {
    expect(buildSolidWallMaterial('fondant', null, 0).color.getHexString()).toBe('efe6da');
  });

  it('an unknown finish key falls back to the default finish, never throws', () => {
    const mat = buildSolidWallMaterial('not-a-finish', '#ffffff', 0);
    expect(mat.roughness).toBe(SOLID_FINISHES[DEFAULT_SOLID_FINISH].roughness);
  });
});

describe('buildSolidWallMaterial — local wall colour (printMap)', () => {
  it('samples the print through uv1 WITHOUT mutating the shared albedo', () => {
    const albedo = new THREE.Texture();
    expect(albedo.channel).toBe(0);   // the front cap reads uv (channel 0)

    const mat = buildSolidWallMaterial('fondant', '#73ab0c', 0.22, { printMap: albedo });

    // The wall must get its OWN texture on channel 1. Setting channel on the shared albedo would drag the
    // front cap onto the wall's UV set — the whole reason this is a clone.
    expect(mat.map).not.toBe(albedo);
    expect(mat.map.channel).toBe(1);
    expect(albedo.channel).toBe(0);
    // Clone shares the image (no second decode).
    expect(mat.map.image).toBe(albedo.image);
  });

  it('tints white so the wall is EXACTLY the front colour (map is multiplied by color)', () => {
    const mat = buildSolidWallMaterial('fondant', '#73ab0c', 0, { printMap: new THREE.Texture() });
    expect(mat.color.getHexString()).toBe('ffffff');
  });

  it('self-illuminates per-pixel — a green leaf edge must not glow the trunk brown', () => {
    const mat = buildSolidWallMaterial('fondant', '#73ab0c', 0.22, { printMap: new THREE.Texture() });
    expect(mat.emissiveMap).toBe(mat.map);            // same clone → one dispose
    expect(mat.emissive.getHexString()).toBe('ffffff');
  });

  it('keeps the tiling grain on channel 0, so uv stays free for it', () => {
    const mat = buildSolidWallMaterial('fondant', '#73ab0c', 0, { printMap: new THREE.Texture() });
    expect(mat.normalMap).toBeTruthy();               // fondant carries a grain
    expect(mat.normalMap.channel).toBe(0);
    expect(mat.normalMap).not.toBe(mat.map);
  });
});
