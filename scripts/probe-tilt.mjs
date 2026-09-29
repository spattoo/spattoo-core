import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 420, height: 880 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:5190/designer-mobile.html?catalog', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 20000 });
await page.waitForTimeout(3500);
await page.getByText('Skip').first().click(); await page.waitForTimeout(600);
await page.getByText('Decor').first().click(); await page.waitForTimeout(2500);
const box = page.getByPlaceholder('Search decorations', { exact: false }).first();
await box.click(); await box.type('Butterfly', { delay: 40 }); await page.waitForTimeout(1200);
await page.getByText('Butterfly on a wire').first().click(); await page.waitForTimeout(1800);

const readout = async () => {
  const t = await page.locator('body').innerText();
  const m = t.match(/(-?\d+°\/-?\d+°)/);
  return m ? m[1] : '(no readout)';
};
console.log('before      :', await readout());
for (const [label, glyph] of [['lean fwd ↓', '↓'], ['lean fwd ↓', '↓'], ['lean left ←', '←']]) {
  const btn = page.getByRole('button', { name: glyph }).first();
  if (!(await btn.count())) { console.log('  MISSING button', glyph); continue; }
  await btn.click();
  await page.waitForTimeout(700);
  console.log(label.padEnd(12), ':', await readout());
}
await page.screenshot({ path: `${process.env.HOME}/Downloads/tilt-after.png` });
await b.close();
