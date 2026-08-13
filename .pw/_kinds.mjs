import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: resolve(here, 'storageState.json') });
const page = await ctx.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 30000 });
const out = await page.evaluate(async () => {
  const k = Object.keys(localStorage).find(x => x.includes('auth-token'));
  const t = JSON.parse(localStorage.getItem(k))?.access_token;
  const types = await (await fetch('https://api.spattoo.dev/api/element-types', { headers: { Authorization: `Bearer ${t}` } })).json();
  return types.filter(x => x.baker_uploadable).map(x => ({
    name: x.name, slug: x.slug, default_for_uploads: x.default_for_uploads,
    zones: x.placement_rules?.zones, placement: x.placement_rules?.placement,
  }));
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
