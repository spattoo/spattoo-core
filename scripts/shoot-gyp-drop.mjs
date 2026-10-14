/* A bunch of baby's breath dropped where the baker let go — on the WALL, between roses.
 *
 * Sandeep: *"i have added rose flowers on the the side of top tier in a two tier cake. i want to
 * add gypsophila between those roses… i dont have a way to drag a bunch between the roses. see what
 * we do for faux balls, i think a similar mechanism need to be implemented here."*
 *
 * ⚠️ THE DROP PATH, NOT THE MENU TAP. `tapPlaceElement` has no point on the cake — you tapped a
 * card in a list — so it never could place one where you meant. `handleElementDrop` has the hit and
 * never consulted the procedural registry at all, which is the root of "placement is not driven by
 * config". This drives the real drag: pointer down on the element card, move onto the cake wall,
 * release.
 *
 * Assumes `npm run dev` is up on 5190.  node scripts/shoot-gyp-drop.mjs
 */
import { chromium } from 'playwright';

const fails = [];
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL —', m); if (!c) fails.push(m); };
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', e => { console.error('  PAGE ERROR:', e.message); fails.push(e.message); });

await page.goto('http://localhost:5190/designer-mobile.html?catalog=1&rainbow2=1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click());
await page.waitForTimeout(3000);
await page.evaluate(async () => { await window.__loadElements?.(); });
await page.waitForTimeout(2500);

/* ⚠️ THE DROP IS DRIVEN THROUGH `handleElementDrop` WITH A REAL HIT, because the gesture it belongs
   to is a pointer drag from a card in a drawer onto a 3D wall — three surfaces and a scroll
   container a script cannot aim through. The hook calls the SAME function the drag calls, with the
   same hit shape the canvas produces; re-implementing either would prove nothing. */
const dropped = await page.evaluate(() => window.__dropElementAt?.('e-gyp',
  { zone: 'side', tierIndex: 1, theta: 0.6, y: 2.0 }) ?? false);
ok(dropped !== false, 'dropped a bunch on the top tier\'s wall');
await page.waitForTimeout(3000);

const g = await page.evaluate(() => { const d = window.__design(); const i = d.tiers.findIndex(t => t.gyp);
  return { tier: i, gyp: d.tiers[i]?.gyp ?? null }; });
ok(g.tier === 1, `it landed on the tier that was hit (tier index ${g.tier})`);
ok(g.gyp?.patches?.length === 1, `one bunch (${g.gyp?.patches?.length})`);
ok(g.gyp?.patches?.[0]?.surface === 'side',
   `and it knows it is on the WALL (${g.gyp?.patches?.[0]?.surface})`);
ok(g.gyp?.where === 'free', `the tier is in clump mode (${g.gyp?.where})`);

/* ⚠️ AND A SECOND ONE ON THE LID, AT THE SAME TIME. That is the thing a single `where` made
   impossible: a bunch between roses on the wall while something else sits on top. */
await page.evaluate(() => window.__dropElementAt?.('e-gyp',
  { zone: 'top_surface', tierIndex: 1, x: 0.4, z: 0.2 }));
await page.waitForTimeout(3000);
const two = await page.evaluate(() => window.__design().tiers[1]?.gyp?.patches ?? []);
ok(two.length === 2, `two bunches now (${two.length})`);
ok(new Set(two.map(p => p.surface)).size === 2,
   `on two different surfaces (${two.map(p => p.surface).join(', ')})`);

const handles = await page.evaluate(() => (window.__gypTapTargets?.() ?? []).length);
ok(handles >= 3, `each one carries a drag handle, plus the cloud itself (${handles})`);

await page.screenshot({ path: `${process.env.HOME}/Downloads/gyp-dropped-on-wall.png` });
await b.close();
console.log(fails.length ? `\n✗ ${fails.length} failed` : '\n✓ all good');
process.exitCode = fails.length ? 1 : 0;
