/* ── Pull a still out of a recorded take, without ffmpeg ─────────────────────────────────────────
 *
 *   node .pw/demo/frame.mjs --in take.webm --at 13.5 --out frame.png
 *   node .pw/demo/frame.mjs --in take.webm --at end --out last.png
 *
 * Judging a take means looking at what the VIDEO holds, not at a screenshot — `page.screenshot()`
 * re-renders the page and comes out crisp whatever the encoder did, so it cannot answer "is the
 * zoom readable after compression". This decodes the actual file.
 *
 * Chrome is the decoder because it is already here: Playwright writes VP8 webm and Chrome plays it.
 * One less thing to install, and it reads the same frames YouTube will.
 *
 * ⚠️ PLAYWRIGHT'S WEBM IS WRITTEN LIVE, so `duration` can come back Infinity until it is fully
 * buffered. `--at end` seeks past the end on purpose and lands on the last decoded frame.
 */
import { chromium } from 'playwright';
import { resolve } from 'path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const IN  = resolve(arg('in'));
const OUT = resolve(arg('out', 'frame.png'));
const AT  = arg('at', 'end');

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
/* ⚠️ NAVIGATE TO THE FILE'S OWN FOLDER FIRST. `setContent` on a fresh page leaves it on an opaque
   origin, and Chrome blocks a file:// video from there — `loadeddata` simply never fires and the
   script hangs until it is killed. Landing on file:// first gives the page an origin allowed to
   read the take. */
await p.goto('file://' + IN.replace(/[^/]+$/, ''), { waitUntil: 'domcontentloaded' });
await p.setContent(`<body style="margin:0;background:#111"><video id="v" src="file://${IN}" muted></video></body>`);
const info = await p.evaluate(async (at) => {
  const v = document.getElementById('v');
  await new Promise(r => { v.onloadeddata = r; v.load(); });
  v.currentTime = at === 'end' ? 1e6 : Number(at);
  await new Promise(r => { v.onseeked = r; setTimeout(r, 3000); });
  v.style.width = v.videoWidth + 'px';
  return { w: v.videoWidth, h: v.videoHeight, at: v.currentTime, duration: String(v.duration) };
}, AT);
await p.locator('#v').screenshot({ path: OUT });
await b.close();
console.log(`${info.w}×${info.h}  t=${info.at.toFixed(2)}s of ${info.duration}  →  ${OUT}`);
