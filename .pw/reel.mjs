/* ── Reel capture: one cake, one 2.5-second move ─────────────────────────────────────────────────
 *
 * Films the designer for an Instagram reel — a slow arc around the cake, captured as numbered PNG
 * frames at 1080×1920. Run it once per cake and cut the shots together.
 *
 *   node .pw/capture-login.mjs                       # once, if storageState.json has expired
 *   node .pw/reel.mjs --out ~/Desktop/reel/cake1
 *
 * ── WHY IT DRIVES THE MOUSE INSTEAD OF THE CAMERA ───────────────────────────────────────────────
 * React Three Fiber 8 keeps its store off the DOM — there is no window handle on the camera or on
 * OrbitControls, so nothing outside the app can keyframe them. Synthetic pointer input needs no
 * change to the app, which means this films the REAL designer, with real cakes and real UI, exactly
 * as a customer sees it. OrbitControls' own damping supplies the easing, and damped motion reads
 * better on video than a linear keyframe anyway.
 *
 * ── IT WAITS FOR YOU TO SET THE CAKE UP ─────────────────────────────────────────────────────────
 * Automating "open this saved design and wait for every topper to load" would be a brittle script
 * that breaks whenever the designer changes. So it opens the window authenticated (storageState),
 * and pauses. You frame the shot by hand, press Enter, and it does the one thing a hand cannot do
 * well: a perfectly even arc.
 *
 * ⚠️ WHATEVER IS ON SCREEN IS IN ALL 150 FRAMES. Dismiss coach-marks, deselect the tier, and let
 * the "Drag to rotate" hint fade before pressing Enter. The first test run of this script caught
 * the onboarding tooltip sitting in the middle of every frame.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import fs from 'node:fs';
import readline from 'node:readline';

const here = dirname(fileURLToPath(import.meta.url));
const STATE = resolve(here, 'storageState.json');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const CFG = {
  url:     arg('url', 'http://localhost:5173/'),
  out:     arg('out', resolve(process.cwd(), 'reel-frames')),
  seconds: +arg('seconds', 2.5),
  fps:     +arg('fps', 60),
  // ⚠️ NOT 360. A full revolution reads as a product viewer and tells the viewer exactly when the
  // loop ends — which is when they scroll. An incomplete arc reads as camera work.
  arcDeg:  +arg('arc', 120),
  // How much closer by the end, as a fraction of frame width. Applied at ENCODE, not capture —
  // see the note at the bottom about enableZoom={false}.
  zoomTo:  +arg('zoom', 0.78),
  // 540×960 at 2× renders 1080×1920, the reel format — and it is under the designer's 640px mobile
  // breakpoint, so this films the layout a customer actually uses rather than a desktop UI
  // letterboxed into a vertical frame.
  width:   +arg('width', 540),
  height:  +arg('height', 960),
  scale:   +arg('scale', 2),
  auto:    process.argv.includes('--yes'),       // skip the pause (smoke tests only)
};

const ease = t => t * t * t * (t * (t * 6 - 15) + 10);   // smootherstep: starts and ends at rest
const ask = q => new Promise(res => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, a => { rl.close(); res(a); });
});

const frames = Math.round(CFG.seconds * CFG.fps);
fs.mkdirSync(CFG.out, { recursive: true });
console.log(`\n  ${frames} frames · ${CFG.seconds}s @ ${CFG.fps}fps · ${CFG.arcDeg}° arc`);
console.log(`  ${CFG.width * CFG.scale}×${CFG.height * CFG.scale} → ${CFG.out}\n`);

// Real Chrome (channel), not Playwright's bundled Chromium. Two reasons: it avoids a ~150 MB
// browser download that this machine does not have, and for footage that ships to customers the
// real browser is the honest renderer — same fonts, same GPU path, same colour handling a customer
// gets. `npx playwright install` and dropping `channel` would work too, if you prefer parity with
// the other .pw scripts.
// headless: false because you cannot frame a cake you cannot see.
const browser = await chromium.launch({ headless: false, channel: 'chrome' });
const ctx = await browser.newContext({
  ...(fs.existsSync(STATE) ? { storageState: STATE } : {}),
  viewport: { width: CFG.width, height: CFG.height },
  deviceScaleFactor: CFG.scale,
  isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
await page.goto(CFG.url, { waitUntil: 'domcontentloaded' });
if (!fs.existsSync(STATE)) console.log('  (no saved session — run node .pw/capture-login.mjs first, or log in by hand)\n');
await page.waitForSelector('canvas', { timeout: 5 * 60 * 1000 });

console.log('  Set the shot up in the window: open the design, wait for every topper to load,');
console.log('  dismiss coach-marks, deselect everything, and turn the cake to the START position.\n');
if (CFG.auto) await page.waitForTimeout(2500);
else await ask('  Press Enter when the cake is ready… ');

const box = await page.locator('canvas').first().boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

// OrbitControls maps horizontal drag to azimuth as 2π · dx / clientHEIGHT — height on BOTH axes.
// Not a typo in the library, and the reason this divides by box.height rather than box.width.
const totalDx = CFG.arcDeg * (box.height / 360);

console.log('\n  Filming…');
await page.mouse.move(cx, cy);
await page.mouse.down();
for (let i = 0; i < frames; i++) {
  // Absolute position each frame, so the arc lands exactly on arcDeg — incremental deltas drift
  // over 150 frames.
  await page.mouse.move(cx + totalDx * ease(i / (frames - 1)), cy);
  await page.screenshot({ path: join(CFG.out, `f${String(i).padStart(4, '0')}.png`) });
  if (i % 30 === 0) process.stdout.write(`\r  frame ${i + 1}/${frames}`);
}
await page.mouse.up();
console.log(`\r  frame ${frames}/${frames} — done\n`);

/* ── ⚠️ THE PUSH-IN HAPPENS AT ENCODE, NOT AT CAPTURE ────────────────────────────────────────────
 * The designer sets enableZoom={false} on its OrbitControls (CakeCanvas.jsx) — deliberately, so a
 * customer cannot pinch the cake out of frame. No wheel or pinch event can dolly that camera, and
 * nothing here can change it without altering the app.
 *
 * Cropping in at encode is not a workaround but the better answer: ffmpeg scales from the full
 * 1080×1920 source so the push stays sharp, and re-timing costs a re-encode rather than a re-shoot.
 * (A CSS transform on the canvas WOULD be a workaround, and a soft one — it stretches already
 * rasterised WebGL pixels instead of re-rendering them.)
 */
const rate = ((1 / CFG.zoomTo) - 1) / frames;
console.log(`  ${frames} frames in ${CFG.out}\n`);
console.log(`  Encode with the push-in (needs ffmpeg — brew install ffmpeg):\n`);
console.log(`    ffmpeg -framerate ${CFG.fps} -i ${CFG.out}/f%04d.png \\`);
console.log(`      -vf "zoompan=z='min(zoom+${rate.toFixed(6)},${(1 / CFG.zoomTo).toFixed(3)})':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=${CFG.fps}" \\`);
console.log(`      -c:v libx264 -pix_fmt yuv420p -crf 18 ${CFG.out}.mp4\n`);
console.log(`  Without the push-in, if you would rather do it in your editor:\n`);
console.log(`    ffmpeg -framerate ${CFG.fps} -i ${CFG.out}/f%04d.png -c:v libx264 -pix_fmt yuv420p -crf 18 ${CFG.out}.mp4\n`);
console.log('  Run again with a different --out for the next cake.\n');

await browser.close();
