// Renders the X-Ray PDF in a REAL browser from a REAL order — the one Sandeep downloaded (a
// photo-cake with no piping, which is the case that printed with no cake on it). The order, its
// design snapshot, the craft guides and the baker's profile all come from the live API via the
// logged-in session; only the rendering is driven from here, because the X-Ray button itself is
// behind a Blaze entitlement this account doesn't have.
//
// Saves the PDF and rasterizes page 1 so the sheet can be looked at.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const ORDER_ID = process.argv[2] ?? '9b4b2830-66eb-45de-9cba-7369042ab5c3';

const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: resolve(here, 'storageState.json') });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 160)); });

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 30000 });
await page.waitForTimeout(1500);

const out = await page.evaluate(async (orderId) => {
  const key = Object.keys(localStorage).find(k => k.includes('auth-token'));
  const token = JSON.parse(localStorage.getItem(key))?.access_token;
  const api = async (path) => {
    const r = await fetch(`https://api.spattoo.dev${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`${path} → ${r.status}`);
    return r.json();
  };

  // The REAL order, straight from the API.
  const orders = await api('/api/orders');
  const list = Array.isArray(orders) ? orders : (orders.orders ?? orders.data ?? []);
  const { buildXrayReport } = await import('/@fs/Users/sandeep/Dev/spattoo-core/src/orders/xray/report.js');
  const { buildXrayPdf, renderXrayPages } = await import('/@fs/Users/sandeep/Dev/spattoo-core/src/orders/xray/xrayPdf.js');

  // 'most-piping' → the busiest design, to exercise the annotated diagram and the page break.
  let order;
  if (orderId === 'most-piping') {
    const scored = list.filter(o => o.design_snapshot).map(o => ({
      o, n: buildXrayReport({ design: o.design_snapshot, guides: {} }).elements.length,
    })).sort((a, b) => b.n - a.n);
    order = scored[0]?.o;
  } else {
    order = list.find(o => String(o.id) === orderId) ?? list.find(o => o.design_snapshot);
  }
  if (!order) return { error: 'no order with a design snapshot' };

  // Real craft guides for this design's piping, and the real baker profile (logo + name).
  const report0 = buildXrayReport({ design: order.design_snapshot, weightKg: order.weight_kg, guides: {} });
  let guides = {};
  if (report0.elementIds.length) {
    const rows = await api(`/api/craft-guide?element_ids=${report0.elementIds.map(encodeURIComponent).join(',')}`);
    (rows || []).forEach(r => { guides[r.element_id] = r; });
  }
  const profile = await api('/api/baker/profile');
  const baker = profile?.baker ?? null;

  const report = buildXrayReport({ design: order.design_snapshot, weightKg: order.weight_kg, guides });
  const blob = await buildXrayPdf({ order, report, baker });
  // Every PAGE as an image, so the layout can be looked at (no PDF rasterizer on this machine).
  const canvases = await renderXrayPages({ order, report, baker });
  const pagePngs = canvases.map(c => c.toDataURL('image/png').split(',')[1]);
  const b64 = await new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result.split(',')[1]);
    fr.readAsDataURL(blob);
  });

  return {
    orderId: order.id,
    thumbUrl: order.design_thumbnail_url,
    bakerName: baker?.name, bakerLogo: baker?.logo_url,
    counts: { tins: report.tins.tiers.length, colors: report.colors.length, piping: report.elements.length, freehand: report.freehand.length, annotations: report.diagram.length },
    bytes: blob.size, b64, pagePngs,
  };
}, ORDER_ID);

if (out.error) { console.log('!!', out.error); await browser.close(); process.exit(1); }
const { b64, pagePngs, ...meta } = out;
console.log(JSON.stringify(meta, null, 2));

const fs = await import('fs');
fs.writeFileSync(resolve(here, '_xray.pdf'), Buffer.from(b64, 'base64'));
pagePngs.forEach((b, i) => fs.writeFileSync(resolve(here, `_xray-p${i + 1}.png`), Buffer.from(b, 'base64')));
console.log(`wrote .pw/_xray.pdf and ${pagePngs.length} page image(s)`);
await browser.close();
