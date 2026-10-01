/* Drive the two controls and photograph what they do.
 *
 * ⚠️ REAL CLICKS, NOT STATE POKES. Project memory: assigning to an input bypasses React's value
 * tracker, onChange never fires, and you photograph a control that looks fine and does nothing.
 * The dial is dragged and the button is pressed.
 */
import { chromium } from 'playwright';

const OUT = `${process.env.HOME}/Downloads/cavity-panel.png`;
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 760, height: 470 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:5190/top-cavity.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

const shots = [];
const grab = async label => {
  await page.screenshot();                    // discard: the env map lands a frame or two late
  await page.waitForTimeout(900);
  shots.push({ label, png: (await page.screenshot()).toString('base64') });
  console.log('  shot', label);
};

await grab('as it opens');

/* Drag the dial round its arc. It is an SVG that takes pointer moves, so a press-move-release is
   the only thing that moves it — exactly as a thumb would. */
const dial = page.locator('svg').first();
const box = await dial.boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + box.width * 0.5, cy - box.height * 0.1, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(600);
await grab('height dragged up');

for (const n of [1, 2]) {
  await page.getByRole('button', { name: /Shuffle/i }).click();
  await page.waitForTimeout(700);
  await grab(`shuffled ${n}`);
}

const sheet = await b.newPage({ viewport: { width: 760 * shots.length, height: 520 }, deviceScaleFactor: 2 });
await sheet.setContent(`<body style="margin:0;display:flex;font:600 14px system-ui;background:#fff">
${shots.map(s => `<figure style="margin:0;text-align:center"><img src="data:image/png;base64,${s.png}" style="width:760px;display:block"><figcaption style="padding:8px 0;color:#2C4433">${s.label}</figcaption></figure>`).join('')}</body>`);
await sheet.waitForTimeout(400);
await sheet.screenshot({ path: OUT });
await b.close();
console.log('→', OUT);
