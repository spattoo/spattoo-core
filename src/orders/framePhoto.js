// Render a photo-frame's image exactly as the customer composed it — the photo with their zoom/pan/
// rotate applied and clipped to the frame's shape (mask), on a transparent background — onto a 2D
// canvas. Used by the order Print-sheet (A4) layout + its PDF export, so the print matches the cake.
//
// The transform mirrors the designer's applyPhotoTransform (a THREE UV transform: center 0.5, rotation
// = −rot, repeat = coverFit/zoom, offset = pan), reproduced here as the inverse affine so the same
// crop is drawn. flipY of the texture is folded in as q_v = 1 − v.

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';            // CORS-clean so the export canvas isn't tainted
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// photo, mask: loaded HTMLImageElements. transform: { x, y, zoom, rot(deg) }. S: output size in px.
export function renderFramedPhoto(photo, mask, transform = {}, S = 512) {
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');

  const w = photo.naturalWidth || photo.width, h = photo.naturalHeight || photo.height;
  const aspect = (w && h) ? w / h : 1;
  const zoom = Math.max(0.2, transform.zoom ?? 1);
  let rx = 1, ry = 1;                          // cover-fit a (aspect) image into the square
  if (aspect >= 1) rx = 1 / aspect; else ry = aspect;
  const sx = rx / zoom, sy = ry / zoom;
  const rotation = -((transform.rot ?? 0) * Math.PI) / 180;   // designer negates so +rot = clockwise
  const cx = 0.5, cy = 0.5, tx = transform.x ?? 0, ty = transform.y ?? 0;
  const cs = Math.cos(rotation), sn = Math.sin(rotation);

  // THREE setUvTransform → M(uv)=A·uv + b  (the texture coordinate the designer samples)
  const a = sx * cs, b = sx * sn, cc = -sy * sn, d = sy * cs;
  const bx = -sx * (cs * cx + sn * cy) + cx + tx;
  const by = -sy * (-sn * cx + cs * cy) + cy + ty;
  const det = a * d - b * cc || 1e-6;
  const ia = d / det, ib = -b / det, ic = -cc / det, id = a / det;   // A⁻¹

  // canvasPx = S · A⁻¹ · ( Q·(ix,iy) − b ), with Q = [[1/w,0],[0,1/h]] (image px → uv, natural orientation).
  // (The texture renders upright on the cake, so no V-flip here — adding one rendered it upside-down.)
  const m00 = S * (ia * (1 / w)), m01 = S * (ib * (1 / h));
  const m10 = S * (ic * (1 / w)), m11 = S * (id * (1 / h));
  const vx = -bx, vy = -by;
  const e = S * (ia * vx + ib * vy);
  const f = S * (ic * vx + id * vy);

  ctx.setTransform(m00, m10, m01, m11, e, f);
  ctx.drawImage(photo, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  ctx.globalCompositeOperation = 'destination-in';   // clip to the shape (mask alpha)
  ctx.drawImage(mask, 0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

// A light-grey silhouette of the mask, slightly larger, for a "cut guide" ring on the printed sheet.
export function renderCutGuide(mask, S = 512, color = '#b9b3bf') {
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}
