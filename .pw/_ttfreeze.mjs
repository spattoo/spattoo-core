// Reproduces the "Page Unresponsive" hang in the REAL Text Topper Studio (admin :5174, real API/DB):
// artwork with a baked-in numeral → a {number} placeholder → Look = Fondant → then DRAG A CORNER
// HANDLE FAR OUTSIDE THE CANVAS, which is what an operator does when covering the printed "4".
//
// The measurement is the point: we drive real pointer events and time how long the main thread takes
// to answer afterwards. Before the fix the resize box grew unbounded (pointer capture keeps feeding
// deltas past the canvas edge), fondant built ~30-megapixel layers per frame, and the tab stopped
// responding. A responsive page answers an evaluate() in single-digit ms.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: resolve(here, 'storageState-admin-5174.json'), viewport: { width: 1500, height: 1100 } });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 160)));

// The artwork: an orange plaque with a fat baked-in "4" — the thing the placeholder must cover.
await page.goto('about:blank');
const artB64 = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 1024;
  const x = c.getContext('2d');
  x.fillStyle = '#F07A16';
  x.beginPath(); x.arc(512, 512, 470, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#F5C842';
  x.font = '900 620px sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('4', 512, 512);
  return c.toDataURL('image/png').split(',')[1];
});

await page.goto('http://localhost:5174/elements/text-topper', { waitUntil: 'domcontentloaded' });
if (await page.locator('input[type=password]').count()) {
  console.log('!! admin session expired — run: node .pw/capture-admin-login.mjs 5174');
  await browser.close(); process.exit(1);
}

await page.getByPlaceholder(/Safari Animals/i).fill('Freeze repro (not saved)');
await page.locator('select').first().selectOption({ index: 1 });
await page.locator('input[type=file]').first().setInputFiles({
  name: 'plaque.png', mimeType: 'image/png', buffer: Buffer.from(artB64, 'base64'),
});
await page.getByRole('button', { name: '+ Number' }).waitFor({ timeout: 90_000 });
await page.waitForFunction(() => !document.body.innerText.includes('Removing background'), null, { timeout: 90_000 });
await page.waitForTimeout(600);
await page.getByRole('button', { name: '+ Number' }).click();
await page.waitForTimeout(500);

// Look = Fondant (the fatal algorithm: ~11 layer canvases + 2 pixel scans per render).
for (const sel of await page.locator('select').all()) {
  const opts = await sel.locator('option').allTextContents();
  if (opts.some(o => /Fondant/i.test(o))) { await sel.selectOption({ label: opts.find(o => /Fondant/i.test(o)) }); break; }
}
await page.waitForTimeout(1200);
await page.screenshot({ path: resolve(here, '_tt-before.png') });

const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
console.log('canvas:', Math.round(box.width), 'x', Math.round(box.height));

// The default slot rect is 0.3² centred → its SE corner grip sits here.
const se = { x: box.x + box.width * 0.65, y: box.y + box.height * 0.65 };

console.log('dragging the SE handle far outside the canvas…');
const t0 = Date.now();
await page.mouse.move(se.x, se.y);
await page.mouse.down();
// Straight out past the canvas edge — the unbounded case. 24 real moves.
for (let i = 1; i <= 24; i++) {
  await page.mouse.move(se.x + i * 40, se.y + i * 30);
}
const tMoves = Date.now() - t0;
await page.mouse.up();
const tDrag = Date.now() - t0;

// Is the main thread still answering? On the broken build this is where it dies.
const t1 = Date.now();
const rect = await page.evaluate(() => 'alive');
const tAlive = Date.now() - t1;

console.log(`24 pointer moves : ${tMoves} ms`);
console.log(`whole drag+up    : ${tDrag} ms`);
console.log(`main thread reply: ${tAlive} ms  (${rect})`);
await page.screenshot({ path: resolve(here, '_tt-after.png') });
await browser.close();
