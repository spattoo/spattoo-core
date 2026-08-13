// Drives the REAL app (:5173, real API/DB, logged-in baker): Orders → an order with a design →
// X-Ray report → Download PDF. Captures the actual downloaded file so the sheet can be LOOKED at,
// not merely assumed. No fixtures: the order, the design and the craft guides are the real ones.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: resolve(here, 'storageState.json'),
  viewport: { width: 1400, height: 1000 },
  acceptDownloads: true,
});
const page = await ctx.newPage();
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 160)); });

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 30000 });
await page.waitForTimeout(2500);

await page.getByText('Orders', { exact: true }).first().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: resolve(here, '_xray-orders.png') });

// Open orders until one offers an X-Ray button (only placed orders with a design have one).
const rows = await page.locator('[class], div').filter({ hasText: /Order #|#\d+/ }).count();
console.log('orders screen loaded; candidate rows:', rows);

const xray = page.getByText('X-Ray', { exact: false }).first();
if (!(await xray.count())) {
  // Click the first order card to open its detail.
  const cards = page.locator('button, div[role=button]');
  const n = await cards.count();
  for (let i = 0; i < Math.min(n, 40); i++) {
    const t = (await cards.nth(i).textContent().catch(() => '')) || '';
    if (/kg|tier|Order|#/.test(t) && t.length < 200) {
      await cards.nth(i).click().catch(() => {});
      await page.waitForTimeout(1800);
      if (await page.getByText('X-Ray', { exact: false }).count()) break;
    }
  }
}
await page.screenshot({ path: resolve(here, '_xray-detail.png') });

const btn = page.getByText('X-Ray', { exact: false }).first();
console.log('X-Ray button found:', await btn.count());
if (!(await btn.count())) { console.log('!! no X-Ray button — entitlement off, or no order with a design'); await browser.close(); process.exit(1); }

await btn.click();
await page.waitForTimeout(3000);
await page.screenshot({ path: resolve(here, '_xray-report.png'), fullPage: true });

const dl = page.getByRole('button', { name: /Download PDF/i });
await dl.waitFor({ timeout: 15000 });
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 30000 }),
  dl.click(),
]);
const out = resolve(here, '_xray.pdf');
await download.saveAs(out);
console.log('downloaded  :', download.suggestedFilename());
console.log('saved       :', out);
await browser.close();
