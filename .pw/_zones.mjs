// The zone tiles must show the BAKER'S ARTWORK on the cake — standing on top, hugging the side.
// They were rendering a bare cake (texture blocked by a CORS-poisoned cache), which is the whole
// reason the tiles exist failing silently.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: resolve(here, 'storageState.json'), viewport: { width: 1200, height: 1100 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 110)));
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 30000 });
await page.waitForTimeout(2500);
await page.getByText('Uploads', { exact: true }).first().click();
await page.waitForTimeout(2500);
// the Chhota Bheem card (a busy photo — easy to SEE on the cake)
const cards = page.locator('button[aria-haspopup="menu"]');
await cards.last().click();
await page.waitForTimeout(400);
await page.getByRole('menuitem', { name: 'Edit' }).click();
await page.waitForTimeout(1000);
await page.getByRole('button', { name: 'Publish to decorations' }).click();
await page.waitForTimeout(2000);
const kind = page.getByRole('button', { name: 'Image topper' });
if (await kind.count()) await kind.click();     // (until baker_uploadable is flipped, a kind must be picked)
await page.waitForTimeout(6000);   // let both WebGL tiles draw
console.log('kind buttons shown:', await page.locator('button').filter({ hasText: /^(Image topper|Top&Side Decors)$/ }).count());
console.log('zone tiles         :', (await page.locator('div').filter({ hasText: /^(TOP SURFACE|SIDE)$/ }).allTextContents()).join(' | '));
console.log('texture errors     :', errs.filter(e => /Could not load/.test(e)).length);
await page.screenshot({ path: resolve(here, '_zones.png'), fullPage: true });
await browser.close();
