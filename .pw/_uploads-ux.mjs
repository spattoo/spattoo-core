// Drives the REAL designer (:5173, real API/DB, logged-in baker): Uploads → an image's ⋮ menu →
// Edit screen → back → the promote studio's rights tick. Screenshots each, so the UX can be judged
// by eye rather than asserted.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: resolve(here, 'storageState.json'), viewport: { width: 1200, height: 1000 } });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 160)));
page.on('console', m => { if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 140)); });

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 30000 });
await page.waitForTimeout(2500);

await page.getByText('Uploads', { exact: true }).first().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: resolve(here, '_ux-1-grid.png') });

const kebabs = page.locator('button[aria-haspopup="menu"]');
console.log('images with a menu grip:', await kebabs.count());
if (!(await kebabs.count())) { console.log('!! no uploads to work with'); await browser.close(); process.exit(1); }

await kebabs.first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: resolve(here, '_ux-2-menu.png') });
console.log('menu items:', (await page.locator('[role=menuitem]').allTextContents()).join(' · '));

await page.getByRole('menuitem', { name: 'Edit' }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: resolve(here, '_ux-3-edit.png') });

// Back → the delete confirmation (in-panel, not window.confirm)
await page.getByLabel('Back to uploads').click();
await page.waitForTimeout(500);
await kebabs.first().click();
await page.waitForTimeout(400);
await page.getByRole('menuitem', { name: 'Delete' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: resolve(here, '_ux-4-confirm.png') });
await page.getByRole('button', { name: 'Keep it' }).click();   // never actually delete
await page.waitForTimeout(400);

// The promote studio — the rights tick, and the button it gates.
await kebabs.first().click();
await page.waitForTimeout(400);
const promote = page.getByRole('menuitem', { name: 'Show in my decorations' });
if (await promote.count()) {
  await promote.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: resolve(here, '_ux-5a-studio.png'), fullPage: true });
  console.log('studio buttons:', (await page.locator('button').allTextContents()).filter(Boolean).slice(0, 14).join(' | '));
  // pick a kind so only the tick is left blocking (zones default to all the kind allows)
  await page.getByRole('button', { name: 'Image topper' }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: resolve(here, '_ux-5-promote.png'), fullPage: true });

  const save = page.getByRole('button', { name: /^Show in my decorations$/ }).last();
  console.log('save disabled BEFORE the tick :', await save.isDisabled());
  const tick = page.locator('input[type=checkbox]').last();
  await tick.check();
  await page.waitForTimeout(500);
  console.log('save disabled AFTER the tick  :', await save.isDisabled());
  await page.screenshot({ path: resolve(here, '_ux-6-attested.png'), fullPage: true });
} else {
  console.log('(this image is already promoted — no promote item)');
}
await browser.close();
