/* The dished top, swept. One sheet, because the question is a comparison.
 *
 * ⚠️ TWO CAPTURES, KEEPING THE SECOND. The environment map lands a frame or two after the mesh and
 * a cream ridge judged under the wrong lighting is a judgement about the wrong variable.
 */
import { chromium } from 'playwright';
const CASES = (process.env.CASES || 'off=1|lip=0&dish=0.05|dish=0|lip=0.09|').split('|');
const OUT = `${process.env.HOME}/Downloads/${process.env.NAME || 'cavity'}.png`;
const b = await chromium.launch();
const shots = [];
for (const c of CASES) {
  const page = await b.newPage({ viewport: { width: 460, height: 420 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  await page.goto(`http://localhost:5190/top-cavity.html?${c}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2800);
  await page.screenshot();
  await page.waitForTimeout(1200);
  shots.push({ label: c || 'defaults', png: (await page.screenshot()).toString('base64') });
  await page.close();
  console.log('  shot', c || 'defaults');
}
const sheet = await b.newPage({ viewport: { width: 460 * shots.length, height: 470 }, deviceScaleFactor: 2 });
await sheet.setContent(`<body style="margin:0;display:flex;font:600 14px system-ui;background:#fff">
${shots.map(s => `<figure style="margin:0;text-align:center"><img src="data:image/png;base64,${s.png}" style="width:460px;display:block"><figcaption style="padding:8px 0;color:#2C4433">${s.label}</figcaption></figure>`).join('')}</body>`);
await sheet.waitForTimeout(400);
await sheet.screenshot({ path: OUT });
await b.close();
console.log('→', OUT);
