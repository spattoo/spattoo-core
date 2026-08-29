/* ── Making a baker's finished-cake photo presentable ────────────────────────────────────────────
 *
 * ⚠️ THIS IS A COSMETIC PASS ON A PHOTO THAT IS ALREADY ON ITS WAY TO THE CUSTOMER. The baker took
 * it intending to send it; they have already decided to share it. Everything here tidies it on the
 * way out — none of it may make the cake look like something other than what is about to be handed
 * over. That framing is what keeps the feature small, and it is why background REPLACEMENT is not
 * here: the wall a photo was shot against is part of the photo the baker chose to send.
 * See plans/finished-cake-photo-editor.md.
 *
 * ⚠️ PURE, AND ENTIRELY LOCAL. No AI, no network, no credits, no entitlement. These operate on a
 * plain `{ data, width, height }` — the shape of an ImageData — so the browser passes one straight
 * in and a test can build one out of an array. Nothing here touches a canvas.
 *
 * ⚠️ NOTHING IS APPLIED BY DEFAULT. The caller decides; these functions only know how.
 */

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const LUMA = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** A blank image of the same size — callers write into it rather than mutating the source, so a
 *  preview can always be recomputed from the original at any strength. */
const like = (img) => ({ width: img.width, height: img.height, data: new Uint8ClampedArray(img.data.length) });

/* ── What the photograph got wrong, measured ─────────────────────────────────────────────────────
 * Returned separately from the fix so a caller can SAY what it is about to do, and so the numbers
 * are assertable. On the photo this was built against: gains 0.994/0.980/1.028, black 6/8/8,
 * white 240/238/253 — a mild green cast and no true black or white.
 */
export function analyse(img) {
  const { data, width: w, height: h } = img;
  const n = w * h;

  /* ⚠️ WHITE BALANCE FROM THE HIGHLIGHTS, NOT GREY-WORLD. Grey-world averages the whole frame to
   * neutral, and a cake is mostly one or two colours — a pink-and-yellow cake reads as a cast and
   * gets DRAINED. The brightest few per cent is the wall and the white piping: things that
   * genuinely are neutral and can be trusted to say what white was. */
  const luma = new Float32Array(n);
  for (let p = 0; p < n; p++) luma[p] = LUMA(data[p*4], data[p*4+1], data[p*4+2]);
  const cut = percentileOf(luma, 0.95);

  let hr = 0, hg = 0, hb = 0, hn = 0;
  for (let p = 0; p < n; p++) {
    if (luma[p] < cut) continue;
    hr += data[p*4]; hg += data[p*4+1]; hb += data[p*4+2]; hn++;
  }
  if (!hn) return null;
  hr /= hn; hg /= hn; hb /= hn;
  const grey = (hr + hg + hb) / 3;

  /* ⚠️ CLAMPED. A photo whose highlights are legitimately warm — candlelight, a gold cake, a warm
   * kitchen bulb — would otherwise be dragged blue, "correcting" the very thing that made it look
   * good. This nudges; it never forces. */
  const gain = [grey / (hr || 1), grey / (hg || 1), grey / (hb || 1)]
    .map(v => Math.min(1.25, Math.max(0.80, v)));

  // Endpoints AFTER balancing, per channel, so the stretch does not reintroduce a cast.
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  for (let p = 0; p < n; p++) {
    for (let c = 0; c < 3; c++) hist[c][clamp255(Math.round(data[p*4+c] * gain[c]))]++;
  }
  /* 0.4 / 99.6 rather than 0 / 100: one specular dot or one dead pixel would otherwise define an
   * endpoint and the stretch would do nothing at all. */
  const lo = hist.map(hh => percentileOfHist(hh, n, 0.004));
  const hi = hist.map(hh => percentileOfHist(hh, n, 0.996));

  return { gain, lo, hi, highlight: [hr, hg, hb] };
}

/* The free fix: neutralise the cast, then stretch to real endpoints.
 * `strength` blends against the original, so a baker can have less of it. */
export function autoFix(img, { strength = 1 } = {}) {
  const stats = analyse(img);
  if (!stats) return img;
  const { gain, lo, hi } = stats;
  const out = like(img);
  const { data } = img;
  const span = [0, 1, 2].map(c => Math.max(1, hi[c] - lo[c]));

  for (let p = 0; p < img.width * img.height; p++) {
    const i = p * 4;
    for (let c = 0; c < 3; c++) {
      const fixed = ((data[i+c] * gain[c]) - lo[c]) / span[c] * 255;
      out.data[i+c] = clamp255(data[i+c] + (fixed - data[i+c]) * strength);
    }
    out.data[i+3] = data[i+3];
  }
  return out;
}

/* ── Relighting the wall, without segmenting anything ────────────────────────────────────────────
 *
 * The complaint is a DINGY background, not a wrong one — so this lifts the wall that is already
 * there. ⚠️ No mask, which is the whole point: with nothing deciding where the cake ends, nothing
 * can take a bite out of it. (Background REMOVAL was prototyped and did exactly that: 2,134
 * transparent pixels inside the subject, and the damage read as a white fondant decoration.)
 *
 * The wall is recognised by three tests the cake fails at once:
 *   near the wall's colour  sampled from the frame border — a cake is centred; nobody frames it
 *                           into a corner
 *   desaturated             even a pastel cake carries some chroma
 *   not very dark           ⚠️ this is what keeps a black cake board OUT of it. Lifting the board
 *                           removes the one thing giving the cake a base to stand on.
 */
export function relight(img, { strength = 1, target = [246, 243, 238] } = {}) {
  const { data, width: w, height: h } = img;
  const n = w * h;

  const band = Math.max(1, Math.round(Math.min(w, h) * 0.05));
  let br = 0, bg = 0, bb = 0, bn = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x > band && x < w - band && y > band && y < h - band) continue;
      const i = (y * w + x) * 4;
      br += data[i]; bg += data[i+1]; bb += data[i+2]; bn++;
    }
  }
  if (!bn) return img;
  br /= bn; bg /= bn; bb /= bn;

  const weight = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * 4, r = data[i], g = data[i+1], b = data[i+2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    const near    = Math.max(0, 1 - Math.hypot(r - br, g - bg, b - bb) / 90);
    const flat    = Math.max(0, 1 - sat / 0.22);
    const notDark = Math.min(1, Math.max(0, (LUMA(r, g, b) - 40) / 60));
    weight[p] = near * flat * notDark;
  }

  /* ⚠️ BLURRED HARD, and this is the reason there is no halo: the weight map must carry no edge of
   * its own. A one-pixel misjudgement along a sprinkle gets spread across tens of pixels and stops
   * being visible. Done on a DOWNSAMPLED copy — a wide blur at full resolution is the slowest
   * thing here by an order of magnitude, and the map it produces is smooth by construction, so
   * there is nothing in it that survives being computed small. */
  const soft = blurSmall(weight, w, h, 0.03);

  const out = like(img);
  const cx = w / 2, cy = h * 0.38, maxR = Math.hypot(w, h) * 0.62;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x, i = p * 4;
      // A soft pool of light rather than a flat fill: full strength near the subject, easing off
      // toward the corners, which is what a studio backdrop actually does.
      const fall = 1 - 0.28 * Math.min(1, Math.hypot(x - cx, y - cy) / maxR);
      const t = soft[p] * fall * strength;
      for (let c = 0; c < 3; c++) out.data[i+c] = clamp255(data[i+c] * (1 - t) + target[c] * t);
      out.data[i+3] = data[i+3];
    }
  }
  return out;
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────

function percentileOf(values, p) {
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function percentileOfHist(hist, total, p) {
  let acc = 0;
  const want = total * p;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= want) return v; }
  return 255;
}

/* A wide blur, done cheaply: shrink, box-blur three times (which approximates a Gaussian closely
 * enough that nothing downstream can tell), then read back bilinearly. `frac` is the working size
 * as a fraction of the original.
 *
 * Exported for the tests — its correctness is the difference between a soft correction and a halo,
 * and that is not something a screenshot proves reliably. */
export function blurSmall(src, w, h, frac = 0.03) {
  const sw = Math.max(4, Math.round(w * frac));
  const sh = Math.max(4, Math.round(h * frac));

  const small = new Float32Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    const y0 = Math.floor(y * h / sh), y1 = Math.max(y0 + 1, Math.floor((y + 1) * h / sh));
    for (let x = 0; x < sw; x++) {
      const x0 = Math.floor(x * w / sw), x1 = Math.max(x0 + 1, Math.floor((x + 1) * w / sw));
      let sum = 0, cnt = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { sum += src[yy*w+xx]; cnt++; }
      small[y*sw+x] = cnt ? sum / cnt : 0;
    }
  }

  let cur = small;
  for (let pass = 0; pass < 3; pass++) cur = boxBlur(cur, sw, sh, 1);

  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(sh - 1.001, (y / h) * sh), y0 = Math.floor(fy), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(sw - 1.001, (x / w) * sw), x0 = Math.floor(fx), tx = fx - x0;
      const a = cur[y0*sw+x0], b = cur[y0*sw+x0+1], c = cur[(y0+1)*sw+x0], d = cur[(y0+1)*sw+x0+1];
      out[y*w+x] = (a*(1-tx) + b*tx) * (1-ty) + (c*(1-tx) + d*tx) * ty;
    }
  }
  return out;
}

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += src[y*w+xx]; c++; } }
      tmp[y*w+x] = s / c;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += tmp[yy*w+x]; c++; } }
      out[y*w+x] = s / c;
    }
  }
  return out;
}
