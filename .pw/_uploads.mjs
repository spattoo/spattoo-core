// Drives the REAL designer (:5173, real API/DB, logged-in baker): opens Decorations → the "Uploads"
// door, and exercises the SHIPPED ingest module (src/shared/image.js, loaded from the running Vite
// server — the very code the app imports) against real Files in a real browser canvas:
//   · a 3000×2000 JPEG "phone photo"  → compressImage must cap the long edge and emit WebP
//   · the same                        → normalizeArtwork must emit a 1024² square
//   · a HEIC and an SVG               → validateImageFile must refuse both
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: resolve(here, 'storageState.json'), viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 160)); });

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 30000 });
await page.waitForTimeout(2500);

// ── 1. The UI: the picker door must now read "Uploads" ─────────────────────────────────────────
await page.getByText('Decorations', { exact: true }).first().click();
await page.waitForTimeout(1200);
const hasUploads = await page.getByText('Uploads', { exact: true }).count();
const hasOld     = await page.getByText('My images', { exact: true }).count();
console.log(`picker door  "Uploads": ${hasUploads}   stale "My images": ${hasOld}`);
await page.screenshot({ path: resolve(here, '_uploads-picker.png') });

if (hasUploads) {
  await page.getByText('Uploads', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(here, '_uploads-panel.png') });
  console.log('panel title  :', await page.locator('div').filter({ hasText: /^Uploads$/ }).first().textContent());
}

// ── 2. The ingest pipeline, in the browser, using the SHIPPED module ───────────────────────────
const out = await page.evaluate(async () => {
  const mod = await import('/@fs/Users/sandeep/Dev/spattoo-core/src/shared/image.js');

  // A real 3000×2000 JPEG, the shape of a phone photo.
  const big = document.createElement('canvas');
  big.width = 3000; big.height = 2000;
  const g = big.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 3000, 2000);
  grad.addColorStop(0, '#e08'); grad.addColorStop(1, '#08e');
  g.fillStyle = grad; g.fillRect(0, 0, 3000, 2000);
  const jpegBlob = await new Promise(r => big.toBlob(r, 'image/jpeg', 0.95));
  const photo = new File([jpegBlob], 'IMG_4021.jpg', { type: 'image/jpeg' });

  // A decoration: a small opaque blob adrift in a big transparent PNG (the alpha crop must find it).
  const art = document.createElement('canvas');
  art.width = 1200; art.height = 900;
  const a = art.getContext('2d');
  a.fillStyle = '#f2c14e';
  a.beginPath(); a.arc(300, 250, 90, 0, Math.PI * 2); a.fill();
  const artBlob = await new Promise(r => art.toBlob(r, 'image/png'));

  const dimsOf = async (blob) => {
    const bmp = await createImageBitmap(blob);
    return [bmp.width, bmp.height];
  };

  const compressed = await mod.compressImage(photo, { maxEdge: 2048, quality: 0.85 });
  const normalized = await mod.normalizeArtwork(artBlob);

  return {
    accept: mod.ACCEPT_IMAGE,
    photoIn:  { kb: Math.round(photo.size / 1024), dims: await dimsOf(photo) },
    photoOut: { kb: Math.round(compressed.size / 1024), dims: await dimsOf(compressed), type: compressed.type, ext: mod.imageExt(compressed) },
    artOut:   { kb: Math.round(normalized.size / 1024), dims: await dimsOf(normalized), type: normalized.type },
    rejects: {
      heic: mod.validateImageFile(new File([new Uint8Array(64)], 'IMG_9.heic', { type: 'image/heic' })),
      svg:  mod.validateImageFile(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' })),
      huge: mod.validateImageFile(new File([new Uint8Array(26 * 1024 * 1024)], 'raw.png', { type: 'image/png' })),
      ok:   mod.validateImageFile(photo),
    },
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
