/* Does tapping a foil flake reopen its card after Done?
 *
 * Sandeep: "when you say done, control closes, but then clicking on any flake on the cake does not
 * open the control back."
 *
 * ⚠️ THIS FIX WAS WRITTEN ONCE BEFORE AND REVERTED, because it could not be demonstrated: taps were
 * aimed at the cake by eye, every one missed, and a miss is indistinguishable from a fix that does
 * not work. So this aims with window.__foilTapTargets(), which projects each handle's world position
 * through the live camera — the same projection ResizeHandles.beginResize uses.
 *
 * It also asserts the CLOSED state, not just the reopen: with the card shut the cake-wrapping
 * catchers must be gone (__foilCatcherCount() === 0) and the grab spheres must carry isFoilTap, so
 * orbit still works everywhere. A fix that reopened the card by mounting the whole component would
 * pass step 7 and fail step 5 — that is the version that got reverted.
 *
 *   node foil-reopen.mjs          (needs the core harness on 5204, proven fresh via /@fs/)
 */
import { chromium } from 'playwright';

const PORT = process.env.PORT ?? '5204';
const URL = `http://localhost:${PORT}/designer-mobile.html?catalog`;   // ?catalog or NO elements load

let failures = 0;
const ok   = (m) => console.log(`  ✓ ${m}`);
const bad  = (m) => { failures++; console.log(`  ✗ ${m}`); };
const check = (cond, m) => (cond ? ok(m) : bad(m));

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });   // a phone
page.on('pageerror', e => console.log(`  [pageerror] ${e.message}`));
page.on('console', m => { if (m.type() === 'error') console.log(`  [console.error] ${m.text().slice(0, 160)}`); });

/* ⚠️ NOT `networkidle`. A live designer page holds connections open (HMR socket, streamed assets),
 * so idle can never arrive and goto times out on a page that is perfectly healthy — which reads as
 * "the harness is broken" and sends you fixing the wrong thing. The canvas existing is the real
 * readiness signal for a 3D screen. */
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 30000 });
// The first frame is a different picture of the same geometry — wait for the env map before judging.
await page.waitForTimeout(3000);

const cardOpen = () => page.evaluate(() =>
  [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Add foil'));
const targets  = () => page.evaluate(() => window.__foilTapTargets?.() ?? null);
const catchers = () => page.evaluate(() => window.__foilCatcherCount?.() ?? null);

console.log('\n1. the dev hooks exist');
const hooks = await page.evaluate(() => ({
  load: typeof window.__loadElements, place: typeof window.__placeElementById,
  taps: typeof window.__foilTapTargets, catch_: typeof window.__foilCatcherCount,
}));
check(hooks.load === 'function' && hooks.place === 'function', 'element hooks present');
check(hooks.taps === 'function' && hooks.catch_ === 'function', 'foil projection hooks present');
if (hooks.taps !== 'function') { console.log('\n  the page is not running tonight\'s CakeCanvas — stop.'); process.exit(1); }

console.log('\n2. put the foil element on the cake');
await page.evaluate(async () => { await window.__loadElements?.(); });
await page.waitForTimeout(800);
const placed = await page.evaluate(() => window.__placeElementById('e3'));
await page.waitForTimeout(1200);
check(placed === true, 'e3 (Gold Leaf, kind: tier_finish) placed');
check(await cardOpen(), 'the FOIL card opened (not a sticker card)');

console.log('\n3. add three flakes');
for (let i = 0; i < 3; i++) {
  await page.getByRole('button', { name: 'Add foil', exact: true }).click();
  await page.waitForTimeout(500);
}
const editing = await targets();
check((editing?.length ?? 0) >= 3, `handles mounted while editing (${editing?.length ?? 0})`);
check(editing?.every(t => t.flag === 'isFoilHandle') ?? false, 'they carry isFoilHandle while the card is open');
check((await catchers()) > 0, `catchers present while editing (${await catchers()})`);

console.log('\n4. press Done');
await page.getByRole('button', { name: 'Done', exact: true }).first().click();
await page.waitForTimeout(900);
check(!(await cardOpen()), 'the card closed');

console.log('\n5. the CLOSED state — the half that makes the fix safe');
const closed = await catchers();
check(closed === 0, `catchers came off (${closed}) — the cake is not wrapped in invisible meshes`);
const tapTargets = await targets();
check((tapTargets?.length ?? 0) >= 3, `grab spheres still mounted (${tapTargets?.length ?? 0})`);
check(tapTargets?.every(t => t.flag === 'isFoilTap') ?? false, 'they carry isFoilTap, so orbit ignores them');

/* ⚠️ THE CAMERA IS STILL MOVING. FitCakeToView runs in useFrame — a continuous lerp, not a
 * one-shot — so closing the card changes the canvas inset and the cake GLIDES to its new framing.
 * A coordinate projected during that glide is stale by the time the tap lands, and the tap then
 * hits the tier wall instead of the shard: indistinguishable, from the DOM, from a fix that does
 * not work. So wait until two consecutive projections agree before aiming. */
const settle = async () => {
  let prev = null;
  for (let i = 0; i < 40; i++) {
    const now = await targets();
    if (prev && now?.length === prev.length &&
        now.every((t, k) => Math.abs(t.x - prev[k].x) < 0.5 && Math.abs(t.y - prev[k].y) < 0.5)) return now;
    prev = now;
    await page.waitForTimeout(150);
  }
  return prev;
};
console.log('\n6. wait for the camera to stop moving, then tap a real projected coordinate');
const before = await targets();
const stable = await settle();
console.log(`   first read: ${before?.[0] ? `(${before[0].x.toFixed(0)}, ${before[0].y.toFixed(0)})` : 'none'}`
          + ` → settled: ${stable?.[0] ? `(${stable[0].x.toFixed(0)}, ${stable[0].y.toFixed(0)})` : 'none'}`);
console.log(`   flakes on the cake: ${JSON.stringify(await page.evaluate(() => window.__getFoil?.() ?? null))}`);

const hit = (stable ?? []).find(t => t.onScreen);
if (!hit) {
  bad('no flake is on screen to tap — the coordinates are known, so this is the test\'s aim, not the fix');
} else {
  console.log(`   tapping (${hit.x.toFixed(0)}, ${hit.y.toFixed(0)})`);
  const selBefore = await page.evaluate(() => window.__getSelectedEl?.() ?? null);
  const foilSelBefore = await page.evaluate(() => window.__getFoilSel?.() ?? null);
  await page.mouse.move(hit.x, hit.y);
  await page.mouse.down();
  await page.mouse.up();
  // Sampled IMMEDIATELY as well as after settling: a selection that is set and then overwritten is
  // invisible at 900ms, and that is exactly the leaked-click failure this is trying to catch.
  const selImmediate = await page.evaluate(() => window.__getSelectedEl?.() ?? null);
  await page.waitForTimeout(900);
  const selAfter = await page.evaluate(() => window.__getSelectedEl?.() ?? null);
  const foilSelAfter = await page.evaluate(() => window.__getFoilSel?.() ?? null);

  console.log('\n7. did the card come back?');
  console.log(`   selection: ${JSON.stringify(selBefore)} → (immediately) ${JSON.stringify(selImmediate)} → ${JSON.stringify(selAfter)}`);
  console.log(`   foil index: ${JSON.stringify(foilSelBefore)} → ${JSON.stringify(foilSelAfter)}`);
  /* ⚠️ THE DISCRIMINATOR. onFoilSelect sets the finish's own indices, so they move if and only if
   * the grab sphere was hit. Tier selected + indices MOVED means the tap landed and the leaked
   * r3f click overwrote it (CakeCanvas:2446 — gestureOnStickerRef covers stickers and grips only).
   * Tier selected + indices UNCHANGED means the tap genuinely missed. Opposite fixes. */
  const finishSaw = JSON.stringify(foilSelBefore) !== JSON.stringify(foilSelAfter);
  if (selAfter?.type === 'tier' && finishSaw) {
    bad('the tap HIT the shard (foil index moved) and the leaked click then selected the tier — gesture ownership, not aim');
  } else if (selAfter?.type === 'tier') {
    bad('the tap landed on the TIER and the finish never saw it — this is aim, not the fix');
  } else if (selAfter == null) {
    bad('the tap selected nothing — it hit neither shard nor tier');
  }
  check(selAfter?.type === 'foil', 'the tap selected the foil finish');
  check(await cardOpen(), 'tapping the flake reopened the foil card');

  /* ⚠️ THE OPEN-CARD CASE, which the same leak would break the other way. With the card open a
   * flake's sphere carries isFoilHandle; if that did not own its click either, tapping a shard
   * while editing would select the tier and CLOSE the card the baker is working in. Never
   * observed, never tested — so it is asserted here rather than assumed. */
  console.log('\n8. tapping a flake while the card is OPEN must not close it');
  const openTargets = await settle();
  const hit2 = (openTargets ?? []).find(t => t.onScreen);
  if (!hit2) {
    bad('no flake on screen with the card open — cannot test the editing case');
  } else {
    await page.mouse.move(hit2.x, hit2.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(900);
    const sel2 = await page.evaluate(() => window.__getSelectedEl?.() ?? null);
    console.log(`   selection after tapping inside the card: ${JSON.stringify(sel2)}`);
    check(sel2?.type === 'foil', 'the foil finish stays selected');
    check(await cardOpen(), 'the card is still open');
  }
}

await page.screenshot({ path: process.env.HOME + '/Downloads/foil-tap-reopen.png' });
console.log(`\n${failures === 0 ? '✓ PASS' : `✗ ${failures} FAILED`} — screenshot: ~/Downloads/foil-tap-reopen.png\n`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
