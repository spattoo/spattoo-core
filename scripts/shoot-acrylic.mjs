/* The acrylic word's standing-up numbers, side by side.
 *
 * ⚠️ `surface=top` OR THERE ARE NO LEGS TO LOOK AT. `acrylicCfg` returns `legs: 0` for a flat piece
 * — a plaque against a wall has nothing to push into — so the harness's default side pose renders
 * exactly the same picture whatever this sweeps.
 */
import { chromium } from 'playwright';
const CASES = (process.env.CASES || 'legs=0|legs=1|legs=2|legs=3').split('|');
const OUT = `${process.env.HOME}/Downloads/${process.env.NAME || 'acrylic'}.png`;
const b = await chromium.launch();
const shots = [];
for (const c of CASES) {
  const page = await b.newPage({ viewport: { width: 520, height: 470 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  await page.goto(`http://localhost:5190/acrylic-text.html?surface=top&text=Happy&${c}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot();                 // discard: the env map lands a frame or two late
  await page.waitForTimeout(1200);
  shots.push({ label: c, png: (await page.screenshot({ clip: { x: 290, y: 0, width: 230, height: 470 } })).toString('base64') });
  await page.close();
  console.log('  shot', c);
}
const sheet = await b.newPage({ viewport: { width: 230 * shots.length, height: 520 }, deviceScaleFactor: 2 });
await sheet.setContent(`<body style="margin:0;display:flex;font:600 14px system-ui;background:#fff">
${shots.map(s => `<figure style="margin:0;text-align:center"><img src="data:image/png;base64,${s.png}" style="width:230px;display:block"><figcaption style="padding:8px 0;color:#2C4433">${s.label}</figcaption></figure>`).join('')}</body>`);
await sheet.waitForTimeout(400);
await sheet.screenshot({ path: OUT });
await b.close();
console.log('→', OUT);
