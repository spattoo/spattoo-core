/* ── Re-trace Appu from a reference image ────────────────────────────────────────────────────────
 *
 *   node dev/trace-appu.mjs <reference.png>
 *
 * Prints an SVG path to paste into `BODY` in src/shared/Appu.jsx, and writes a side-by-side
 * comparison to ~/Downloads/appu-trace-check.png. Nothing here runs at build or test time.
 *
 * ⚠️ THIS EXISTS BECAUSE `BODY` MUST NOT BE HAND-EDITED. Nine rounds of drawing Appu from the
 * reference by eye were rejected; the figure is only right because it is the reference's own ink.
 * A hand-tweak to one curve is the first step back to a drawing OF the reference.
 *
 * ⚠️ TWO BUGS LIVE HERE, BOTH FIXED, BOTH INVISIBLE IF REINTRODUCED — each renders a confident,
 * wrong Appu rather than an error. See traceOutline() and the fill rule below.
 *
 * The reference image is expected to be the character on a plain light ground. Its largest
 * connected dark component is the body; the eyes, mouth and cowlick are their own components and
 * are deliberately LEFT OUT, because Appu.jsx draws those to make expressions.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import os from 'os';

const REFERENCE = process.argv[2];
if (!REFERENCE) { console.error('usage: node dev/trace-appu.mjs <reference.png>'); process.exit(2); }
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 700, height: 800 } });
await page.goto('about:blank');
const res = await page.evaluate(async (ref) => {
  const load = s => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => j(new Error('x')); i.src = s; });
  const img = await load('data:image/png;base64,' + ref);
  const W = 625, H = 700;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  const ink = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) if ((d[i]+d[i+1]+d[i+2])/3 < 125) ink[p] = 1;

  // Components, largest first.
  const lab = new Int32Array(W*H).fill(-1); const comps = [];
  for (let s = 0; s < W*H; s++) {
    if (!ink[s] || lab[s] >= 0) continue;
    const id = comps.length, st = [s]; lab[s] = id;
    let n = 0, x0=1e9, y0=1e9, x1=-1, y1=-1;
    while (st.length) {
      const p = st.pop(), x = p % W, y = (p/W)|0; n++;
      if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;
      for (const np of [p-1,p+1,p-W,p+W]) { if (np<0||np>=W*H||!ink[np]||lab[np]>=0) continue; lab[np]=id; st.push(np); }
    }
    comps.push({ id, n, x0, y0, x1, y1 });
  }
  comps.sort((a,b) => b.n - a.n);
  const main = comps[0];

  // Mask of the main component only — the eyes, mouth and cowlick are their own components and
  // stay OUT, so the traced shape has an empty face we can put expressions into.
  const m = new Uint8Array(W*H);
  for (let s = 0; s < W*H; s++) if (lab[s] === main.id) m[s] = 1;

  // Moore boundary tracing.
  const DIRS = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const inside = (x,y) => x>=0 && y>=0 && x<W && y<H && m[y*W+x];
  /* ⚠️ JACOB'S STOPPING CRITERION, NOT "WE ARE BACK AT THE START". A boundary through thin strokes
     passes its start pixel more than once — stopping on first revisit cut the contour short and
     closed it across the arms, filling the gaps between them solid black. Stop only when the start
     pixel is re-entered FROM THE SAME DIRECTION. */
  function trace(sx, sy) {
    const out = []; let cx = sx, cy = sy, dir = 0, guard = 0, startDir = -1;
    for (;;) {
      out.push([cx, cy]);
      let found = false;
      for (let k = 0; k < 8; k++) {
        const dd = (dir + 6 + k) % 8;
        const nx = cx + DIRS[dd][0], ny = cy + DIRS[dd][1];
        if (inside(nx, ny)) { cx = nx; cy = ny; dir = dd; found = true; break; }
      }
      if (!found || ++guard > 400000) break;
      if (cx === sx && cy === sy) {
        if (startDir < 0) startDir = dir;
        else if (dir === startDir) break;
      }
    }
    return out;
  }
  // Outer contour: topmost-leftmost pixel of the component.
  let start = null;
  for (let y = 0; y < H && !start; y++) for (let x = 0; x < W; x++) if (m[y*W+x]) { start = [x,y]; break; }
  const outer = trace(start[0], start[1]);

  // Holes: background regions enclosed by the component.
  const outsideBg = new Uint8Array(W*H), q = [];
  const push = p => { if (!m[p] && !outsideBg[p]) { outsideBg[p] = 1; q.push(p); } };
  for (let x = 0; x < W; x++) { push(x); push((H-1)*W+x); }
  for (let y = 0; y < H; y++) { push(y*W); push(y*W+W-1); }
  while (q.length) { const p = q.pop(), x = p%W, y=(p/W)|0;
    if (x>0) push(p-1); if (x<W-1) push(p+1); if (y>0) push(p-W); if (y<H-1) push(p+W); }
  const holeSeen = new Uint8Array(W*H); const holes = [];
  for (let s = 0; s < W*H; s++) {
    if (m[s] || outsideBg[s] || holeSeen[s]) continue;
    const st = [s]; holeSeen[s] = 1; const px = [];
    while (st.length) {
      const p = st.pop(); px.push(p);
      for (const np of [p-1,p+1,p-W,p+W]) { if (np<0||np>=W*H||m[np]||outsideBg[np]||holeSeen[np]) continue; holeSeen[np]=1; st.push(np); }
    }
    if (px.length > 120) holes.push(px);
  }
  holes.sort((a,b) => b.length - a.length);
  /* Trace the HOLE's own pixels, not the ink around it: walking "up into the ink" from a hole just
     rejoins the outer boundary and returns a 4-point stub. The hole's own contour is the inner
     edge, which is exactly what fill-rule evenodd needs to punch it out. */
  const holeContours = holes.map(px => {
    const hm = new Uint8Array(W*H);
    for (const p of px) hm[p] = 1;
    const ins = (x,y) => x>=0 && y>=0 && x<W && y<H && hm[y*W+x];
    let sx = -1, sy = -1;
    for (const p of px) { const y = (p/W)|0, x = p%W; if (sy < 0 || y < sy || (y === sy && x < sx)) { sx = x; sy = y; } }
    const out = []; let cx = sx, cy = sy, dir = 0, guard = 0, startDir = -1;
    for (;;) {
      out.push([cx, cy]);
      let found = false;
      for (let k = 0; k < 8; k++) {
        const dd = (dir + 6 + k) % 8;
        const nx = cx + DIRS[dd][0], ny = cy + DIRS[dd][1];
        if (ins(nx, ny)) { cx = nx; cy = ny; dir = dd; found = true; break; }
      }
      if (!found || ++guard > 200000) break;
      if (cx === sx && cy === sy) {
        if (startDir < 0) startDir = dir; else if (dir === startDir) break;
      }
    }
    return out;
  });
  return {
    comps: comps.slice(0, 6).map(c => ({ n: c.n, box: [c.x0, c.y0, c.x1, c.y1] })),
    outer, holes: holeContours.map((c, i) => {
      const xs = holes[i].map(q => q % 625), ys = holes[i].map(q => (q / 625) | 0);
      return { n: holes[i].length, pts: c,
               box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
    }),
  };
}, fs.readFileSync(REFERENCE).toString('base64'));

console.log('components:', JSON.stringify(res.comps));
console.log('outer contour points:', res.outer.length);
res.holes.forEach((h, i) => console.log(`hole ${i}: area ${h.n}, ${h.pts.length} pts, box ${JSON.stringify(h.box)}`));

await b.close();
const b2 = await chromium.launch();


const { outer, holes } = res;

// Ramer–Douglas–Peucker
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  let maxD = 0, idx = 0;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= eps) return [pts[0], pts[pts.length - 1]];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}
/* ⚠️ POLYGONS, NOT SMOOTHED CURVES. Catmull-Rom through the traced points overshoots wherever the
   contour reverses sharply — the tip of an 8px-wide arm, or a 7-point hole — and the arms came out
   as a star of spikes. At the size this ships (124px from a 625-wide trace) a 0.7px tolerance is
   a seventh of a display pixel, so straight segments are indistinguishable from curves. */
function toPath(pts) {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) d += `L${pts[i][0]} ${pts[i][1]}`;
  return d + 'Z';
}
const EPS = 1.0;          // measured: finer changes nothing visible at the size he ships
const s  = rdp(outer, EPS);
const hs = holes.map(h => rdp(h.pts, Math.min(EPS, 0.6)).slice().reverse());
const d  = [s, ...hs].map(toPath).join('');

console.log(`outer ${s.length} pts, ${hs.length} holes (${hs.map(h => h.length).join('/')}), path ${d.length} chars\n`);
console.log(d);

const check = `${os.homedir()}/Downloads/appu-trace-check.png`;
const page3 = await b2.newPage({ viewport: { width: 900, height: 520 }, deviceScaleFactor: 2 });
await page3.setContent(`<body style="margin:0;background:#fff;display:flex;font:12px system-ui">
  <div><img src="data:image/png;base64,${fs.readFileSync(REFERENCE).toString('base64')}" style="width:420px">
    <div style="text-align:center;color:#888">reference</div></div>
  <div><svg viewBox="0 0 625 700" width="420"><path fill-rule="nonzero" fill="#1a1a1a" d="${d}"/></svg>
    <div style="text-align:center;color:#888">traced</div></div></body>`);
await page3.waitForTimeout(300);
await page3.screenshot({ path: check, clip: { x: 0, y: 0, width: 860, height: 500 } });
console.log(`\ncomparison written to ${check}`);
await b2.close();
