import * as THREE from 'three';

/* ── What makes a sheet read as WAFER PAPER rather than as pink plastic ──────────────────────────
 *
 * Sandeep, on the first render: *"may be geometrically fine, but it does not look like wafer
 * paper."* He was right, and the fault was entirely in the material.
 *
 * ⚠️ `transparent` + `opacity` ALONGSIDE `transmission` IS THE BUG, and it looks like a reasonable
 * line of code. Setting them puts the mesh on the alpha-blended path: every pixel becomes a flat
 * lerp toward whatever is behind it, which is why two overlapping panels rendered as one uniform
 * pink instead of getting denser where they cross. Transmission is a different mechanism — the
 * renderer samples what is BEHIND the surface and refracts it — and alpha blending on top of it
 * throws that away. Paper that does not get denser where it doubles is not paper.
 *
 * ⚠️ AND IT IS DIFFUSE TRANSMISSION, NOT GLASS. Glass is smooth and transmits an image; paper is
 * rough and transmits a GLOW. That is `roughness` near 1 with transmission high — the two together
 * scatter what comes through, which is what gives the references their soft lit-from-behind look.
 * A low roughness here gives frosted perspex.
 *
 * ⚠️ SHEEN IS THE FIBRE. Wafer paper is pressed starch with a visible grain, and its highlight is
 * broad and cloth-like rather than a tight specular dot. `sheen` is three.js's cloth lobe and it is
 * the single cheapest thing that stops the surface reading as moulded. `specularIntensity` goes
 * DOWN at the same time, because the plastic look is that tight highlight.
 *
 * The fibre map is generated rather than loaded: it is noise, nobody should be shipping a texture
 * for it, and a procedural one scales to any panel size without a UV budget.
 */

export const WAFER_PAPER_MATERIAL = {
  transmission: 0.82,   // how much light comes THROUGH. Paper is not glass, but it is not card.
  roughness:    0.92,   // with transmission high, this is what scatters it into a glow
  thickness:    0.10,   // the volume light travels through — bigger = more diffusion, not thicker paper
  ior:          1.33,
  sheen:        0.9,    // the fibre lobe
  sheenRoughness: 0.95,
  specular:     0.18,   // down, because a tight highlight is what reads as plastic
  fibre:        0.55,   // how strongly the grain shows
};

/* A sheet of pressed starch: long fibres lying mostly one way, with a slow mottle over the top.
 * Returned as a roughness map, so the grain shows as a change in how the surface scatters rather
 * than as a drawn-on pattern — paint it into the colour and it reads as printed paper instead. */
export function waferFibreTexture({ size = 512, strength = WAFER_PAPER_MATERIAL.fibre } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);

  // A cheap value-noise mottle: two octaves, enough for a surface nobody looks at up close.
  const mottle = (x, y) => {
    const a = Math.sin(x * 0.021 + y * 0.007) * Math.cos(y * 0.017 - x * 0.005);
    const b = Math.sin(x * 0.083 - y * 0.061) * 0.5;
    return (a + b) * 0.5;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Fibres run with the sheet, so the noise is stretched along one axis — an isotropic
      // speckle reads as concrete. The streaks are what the eye calls "paper".
      const streak = Math.sin(x * 1.7 + Math.sin(y * 0.03) * 9) * 0.5 + 0.5;
      const v = 0.78 + strength * 0.22 * (streak * 0.6 + mottle(x, y) * 0.4);
      const px = (y * size + x) * 4;
      const g = Math.max(0, Math.min(255, Math.round(v * 255)));
      img.data[px] = img.data[px + 1] = img.data[px + 2] = g;
      img.data[px + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 6);          // the grain runs down the panel, which is how a strip is cut
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}
