#!/usr/bin/env node
/**
 * measure:template — what a template actually costs to open.
 *
 * Boots the vite dev server, opens dev/template-load.html in a cold Chromium, and prints:
 *   · a waterfall of every asset request, with START times — so "18 requests in parallel" and
 *     "18 requests one behind another" stop looking identical
 *   · how long after the last byte the cake is still not drawn
 *
 * ⚠️ WHY START TIMES ARE THE POINT. Durations alone cannot separate the two explanations for a slow
 * load, and they have opposite fixes: BYTES (make the assets smaller) and ROUND TRIPS (make the
 * requests fewer and earlier). A diagnosis built on durations alone guessed wrong twice.
 *
 * ⚠️ WHAT IT DOES NOT MEASURE. Assets come through vite's `/cdn` proxy (CORS — see dev/scene.js),
 * so there is a localhost hop in front of every byte. The SHAPE of the waterfall and the time after
 * the last byte are faithful; the absolute download times are not a phone's. Measure raw CDN
 * throughput with curl against the real host instead.
 *
 * Usage:
 *   npm run measure:template                 # Slow 4G, mid-range phone CPU
 *   npm run measure:template -- --fast       # no throttling, to isolate CPU from network
 *   npm run measure:template -- --cpu 1      # no CPU throttle
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const ARGV = process.argv.slice(2);
const flag = (n, d) => { const i = ARGV.indexOf(`--${n}`); return i === -1 ? d : ARGV[i + 1]; };
const FAST = ARGV.includes('--fast');
const CPU  = Number(flag('cpu', FAST ? 1 : 4));
const PORT = Number(flag('port', 5311));

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
const dead = new Promise((_, rej) => vite.on('exit', c => rej(new Error(`vite exited with ${c}`))));
await Promise.race([
  new Promise(res => vite.stdout.on('data', d => { if (/Local:.*http/.test(String(d))) res(); })),
  dead,
  new Promise((_, rej) => setTimeout(() => rej(new Error('vite did not start in 60s')), 60000)),
]);

const browser = await chromium.launch();
// A brand-new context: no HTTP cache, no storage. This IS a cold load.
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
if (!FAST) await cdp.send('Network.emulateNetworkConditions', {
  offline: false, latency: 562.5,                       // Chrome DevTools' "Slow 4G"
  downloadThroughput: 1.6 * 1024 * 1024 / 8 * 0.9, uploadThroughput: 750 * 1024 / 8 * 0.9,
});
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

const rows = [];
page.on('requestfinished', async req => {
  try {
    const res = await req.response();
    const sizes = await req.sizes().catch(() => ({}));
    const t = req.timing();
    rows.push({ startAbs: t.startTime, dur: Math.round(t.responseEnd), type: req.resourceType(),
                status: res?.status(), bytes: sizes.responseBodySize ?? 0, url: req.url() });
  } catch { /* a request can finish after the context closes */ }
});
page.on('requestfailed', r => rows.push({ failed: true, type: r.resourceType(), url: r.url() }));
page.on('console', m => { if (m.type() === 'error') console.log('  [page error]', m.text().slice(0, 160)); });

await page.goto(`http://localhost:${PORT}/template-load.html`, { waitUntil: 'commit', timeout: 120000 });

const SETTLE_MS = Number(flag('settle', 45000));
let stuck = null;
await page.waitForFunction(() => window.__tl?.settled != null, null, { timeout: SETTLE_MS }).catch(() => {});

/* ⚠️ A BOUNDARY THAT NEVER RELEASES LOOKS EXACTLY LIKE A SLOW NETWORK, and they are not the same
   bug — one is bytes, the other is a Suspense that resolved and never re-rendered. loadingRegistry
   says so in its own comments: "the cake was fully drawn, the spinner stayed for two minutes, and
   switching the window to a phone width cleared it at once". So when nothing settles, the rig asks
   the question that separates them: force a re-render and see whether the count falls. If it does,
   the assets were never the problem and no amount of making them smaller will help. */
if (await page.evaluate(() => window.__tl?.settled == null)) {
  const before = await page.evaluate(() => window.__loadingInFlight ?? null);
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => window.__loadingInFlight ?? null);
  stuck = { before, after, cleared: before > 0 && after === 0 };
}
await page.waitForTimeout(500);

const tl = await page.evaluate(() => window.__tl ?? {});
await page.screenshot({ path: flag('shot', `${process.env.HOME}/Downloads/template-load-${FAST ? 'fast' : 'slow4g'}.png`) });

// Only the cake's own assets. The harness's own modules are vite dev chunks and tell us nothing
// about what a baker downloads — that cost is the app bundle, measured separately against the
// deployed app, not here.
const assets = rows.filter(r => !r.failed && /\/cdn\//.test(r.url));
const base = assets.length ? Math.min(...assets.map(r => r.startAbs)) : 0;
const openedAt = tl.openTemplate ?? 0;

console.log(`\n== ${FAST ? 'no throttling' : 'Slow 4G'}, CPU ${CPU}x, 390x780 @3x, cold cache ==`);
console.log(`   dev/fixtures/template-welcome-home.json through dev/template-load.html\n`);
console.log('   start    dur     KB  status  asset');
for (const r of assets.sort((a, b) => a.startAbs - b.startAbs)) {
  const p = new URL(r.url).pathname.replace('/cdn', '');
  console.log(`${String(Math.round(r.startAbs - base)).padStart(8)} ${String(r.dur).padStart(6)} ${String(Math.round(r.bytes / 1024)).padStart(6)}  ${String(r.status).padEnd(6)}  ${p.length > 56 ? '…' + p.slice(-55) : p}`);
}
const failed = rows.filter(r => r.failed);
if (failed.length) { console.log('\n   FAILED:'); failed.forEach(r => console.log('    ', r.type, r.url)); }

const lastByte = assets.length ? Math.max(...assets.map(r => r.startAbs + r.dur)) - base : 0;
const firstReq = 0;
const spread   = assets.length ? Math.max(...assets.map(r => r.startAbs)) - base : 0;
const totalKB  = assets.reduce((n, r) => n + r.bytes, 0) / 1024;

console.log(`\n   ${assets.length} assets, ${totalKB.toFixed(0)} KB`);
console.log(`   first request .......... ${firstReq} ms`);
console.log(`   last request STARTED ... ${Math.round(spread)} ms   ← if this is ~0 they went out together; if it climbs, they are serialised`);
console.log(`   last byte arrived ...... ${Math.round(lastByte)} ms`);
console.log(`\n   template opened at ..... ${openedAt} ms (page clock)`);
console.log(`   spinner first rose ..... ${tl.firstPing ?? '—'} ms`);
console.log(`   spinner settled ........ ${tl.settled ?? 'never'} ms`);
if (stuck?.cleared) {
  console.log(`\n   ⚠️  STUCK LOADING BOUNDARY — not a network problem.`);
  console.log(`      Every asset arrived (above), the spinner stayed up with inFlight=${stuck.before},`);
  console.log(`      and a forced re-render (viewport resize) dropped it to ${stuck.after} at once.`);
  console.log(`      The decoration is not drawn until that re-render happens.`);
} else if (stuck) {
  console.log(`\n   ⚠️  never settled within ${SETTLE_MS} ms, and a re-render did not clear it`);
  console.log(`      (inFlight ${stuck.before} → ${stuck.after}) — this one may really be the network.`);
}

if (tl.settled != null) {
  console.log(`\n   → ${tl.settled - (tl.openTemplate ?? 0)} ms from opening the template to a drawn cake`);
  console.log(`   → of which ${Math.round(lastByte)} ms was the network, and ${Math.max(0, (tl.settled - (tl.openTemplate ?? 0)) - Math.round(lastByte))} ms was everything after the last byte`);
}

await browser.close();
vite.kill('SIGTERM');
process.exit(0);
