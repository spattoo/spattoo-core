import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: resolve(here, 'storageState.json'), viewport: { width: 1200, height: 1000 } });
const page = await ctx.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 30000 });
await page.waitForTimeout(2500);
await page.getByText('Uploads', { exact: true }).first().click();
await page.waitForTimeout(2000);
await page.locator('button[aria-haspopup="menu"]').first().click();
await page.waitForTimeout(300);
await page.getByRole('menuitem', { name: 'Edit' }).click();
await page.waitForTimeout(1000);
const box = await page.evaluate(() => {
  const ul = document.querySelector('ul');
  const btn = [...document.querySelectorAll('button')].find(b => /Publish to decorations/.test(b.textContent));
  const sheet = ul?.closest('div[style*="border-top"]') ?? ul?.parentElement;
  const r = e => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; };
  return {
    ul: ul ? { ...r(ul), marginBottom: getComputedStyle(ul).marginBottom, overflow: getComputedStyle(ul).overflow } : null,
    button: btn ? r(btn) : null,
    footer: sheet ? { ...r(sheet), overflow: getComputedStyle(sheet).overflow, flexShrink: getComputedStyle(sheet).flexShrink } : null,
    sheetH: Math.round(document.querySelector('div[style*="92vh"]')?.getBoundingClientRect().height ?? 0),
  };
});
console.log(JSON.stringify(box, null, 1));
await browser.close();
