// Renames a REAL upload through the REAL app (:5173 designer → Uploads → ⋮ → Edit → Save), against
// the deployed dev API. Then RELOADS and re-reads the name from the server, because a name that only
// changed in React state is not a rename.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: resolve(here, 'storageState.json'), viewport: { width: 1200, height: 1000 } });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 140)));

const openUploads = async () => {
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.getByText('Uploads', { exact: true }).first().click();
  await page.waitForTimeout(2500);
};

await openUploads();

// The card with the ugly machine name — exactly the case rename exists for.
const before = (await page.locator('div').filter({ hasText: /^Screenshot 2026/ }).first().textContent().catch(() => null))
  ?? (await page.locator('button[aria-haspopup="menu"]').first().getAttribute('aria-label'));
console.log('before :', before);

await page.locator('button[aria-haspopup="menu"]').first().click();
await page.waitForTimeout(500);
await page.getByRole('menuitem', { name: 'Edit' }).click();
await page.waitForTimeout(1200);

const NEW_NAME = `Tube logo ${Date.now() % 10000}`;
const field = page.locator('input[type=text], input:not([type])').last();
await field.fill(NEW_NAME);
await page.screenshot({ path: resolve(here, '_rename-1-edit.png') });
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: resolve(here, '_rename-2-saved.png') });

// The real test: throw the page away and ask the SERVER what the image is called.
await openUploads();
// Ask the SERVER, not the DOM: a name that only changed in React state is not a rename.
const names = await page.evaluate(async () => {
  const k = Object.keys(localStorage).find(x => x.includes('auth-token'));
  const t = JSON.parse(localStorage.getItem(k))?.access_token;
  const rows = await (await fetch('https://api.spattoo.dev/api/uploads', { headers: { Authorization: `Bearer ${t}` } })).json();
  return rows.map(r => r.name);
});
console.log('names from the API after reload :', names.join(' | '));
console.log('persisted                       :', names.includes(NEW_NAME) ? 'YES' : 'NO');
await page.screenshot({ path: resolve(here, '_rename-3-reloaded.png') });
await browser.close();
