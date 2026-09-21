/* Does tapping a placed FINISH reopen its card after Done?
 *
 * Sandeep, on gold leaf: "when you say done, control closes, but then clicking on any flake on the
 * cake does not open the control back." Luster dust had the identical bug, found by reading rather
 * than reported — so this drives BOTH, from one description each.
 *
 * ⚠️ THE FOIL FIX WAS WRITTEN ONCE BEFORE AND REVERTED, because it could not be demonstrated: taps
 * were aimed at the cake by eye, every one missed, and a miss is indistinguishable from a fix that
 * does not work. So this aims with window.__<finish>TapTargets(), which projects each handle's world
 * position through the LIVE camera — the same projection ResizeHandles.beginResize uses.
 *
 * It also asserts the CLOSED state, not just the reopen: with the card shut the cake-wrapping
 * catchers must be gone (__<finish>CatcherCount() === 0) and the grab spheres must carry the TAP
 * flag, so orbit still works everywhere. A fix that reopened the card by mounting the whole
 * component permanently would pass the reopen and fail that — it is the version that got reverted.
 *
 *   node scripts/check-finish-reopen.mjs               both finishes
 *   FINISH=dust node scripts/check-finish-reopen.mjs   just one
 *                                     (needs the core harness; PORT=5204 by default)
 */
import { chromium } from 'playwright';

const PORT = process.env.PORT ?? '5204';
const URL = `http://localhost:${PORT}/designer-mobile.html?catalog`;   // ?catalog or NO elements load

/* Each finish, described rather than duplicated. The three moving parts are the same for both —
 * handles that outlive the card, catchers that must not, and a click the tier must not steal — so a
 * future finish is tested by adding an entry here, not by copying a function. */
const FINISHES = {
  foil: {
    label: 'gold leaf',
    id: 'e3',
    /* The DROP path. `kind: 'tier_finish'` is handled in handleElementDrop, so __placeElementById
     * reaches it. Dust is not — see below. */
    place: (id) => `window.__placeElementById(${JSON.stringify(id)})`,
    addBtn: 'Add foil',
    openProbe: 'Add foil',
    Flag: 'Foil',                       // → isFoilTap / isFoilHandle / isFoilCatcher
    sel: '__getFoilSel', points: '__getFoil',
    // Shards are spread around the front (u ≈ ±0.08, v 0.40–0.65), so three are three targets.
    minTargets: 3,
    expect: (s) => s?.type === 'foil',
    expectDesc: "{type:'foil'}",
  },
  dust: {
    label: 'luster dust',
    id: 'e19',
    /* ⚠️ THE TAP PATH, AND IT MATTERS. handleElementDrop never consults PROCEDURAL_TOOLS — only
     * tapPlaceElement does. Driven through __placeElementById a procedural row falls through to the
     * ordinary sticker path and puts a PICTURE on the cake, which would look like a broken feature
     * rather than a test using the wrong door. */
    place: (id) => `window.__tapElementById(${JSON.stringify(id)})`,
    addBtn: '+ Add dust flick',
    openProbe: '+ Add dust flick',
    Flag: 'Dust',                       // → isDustTap / isDustHandle / isDustCatcher
    sel: '__getDustSel', points: '__getDust',
    /* ⚠️ ONE, NOT THREE. Every flick lands at exactly u=0.0, v=0.4 (addDustToTier), so three
     * splashes stack on a single coordinate. Inheriting foil's `3` would fail a healthy fix. */
    minTargets: 1,
    // Dust is a TOOL, not an element type — its card is `{type:'tool', tool:'luster-dust'}`.
    expect: (s) => s?.type === 'tool' && s?.tool === 'luster-dust',
    expectDesc: "{type:'tool',tool:'luster-dust'}",
  },

  /* ── Grass and letter blocks ────────────────────────────────────────────────────────────────
   * Added because they were the LAST two things on a cake with no hit target once their card was
   * closed — the reason the phone's element flyout could not be dropped ("a baker can add grass and
   * then never edit or remove it"). They get the same three moving parts and therefore the same
   * test, which is what this descriptor is for. */
  grass: {
    label: 'grass',
    id: 'e20',
    // Procedural: only tapPlaceElement consults PROCEDURAL_TOOLS — the trap the dust entry names.
    place: (id) => `window.__tapElementById(${JSON.stringify(id)})`,
    /* ⚠️ DEFAULT GRASS HAS NO HANDLES, AND THAT IS CORRECT. GRASS_DEFAULTS carries no `patches`, so
       a fresh grass is a LAWN covering the top — check:movable registers exactly this: "a treatment
       that covers the top — it has no position of its own". There is nothing discrete to tap, and
       inventing a handle for it would be inventing a position the thing does not have.
       Handles exist only for CLUMPS, so this setup makes one: the tier's Coverage picker offers
       Whole top / Rim band / Clumps, and Clumps sets `patches: [newPatch([])]` outright. One press,
       one clump — and it is a no-op once on, so it is setup rather than an add button.
       ⚠️ NOT the board route ("On the board" then "Clumps"). That renders a SECOND button reading
       Clumps — the board's Ring/Clumps pair — and the two collide under an exact-name locator. */
    setup: ['Clumps'],
    addBtn: null,
    /* NOT the add button: "+ Add clump" only renders for a surface that already HAS grass, and
       there are two of them (board and tier). "On the board" is rendered unconditionally whenever
       the card is open — the flag only changes its colour. ("On top" would work too, but it has a
       plain-<div> twin at 9617, and a probe that relies on cardOpen() matching buttons only is a
       probe waiting to be broken by someone making that heading a button.) */
    openProbe: 'On the board',
    Flag: 'Grass',                      // → isGrassTap / isGrassHandle / isGrassCatcher
    sel: '__getGrassSel', points: '__getGrass',
    minTargets: 1,
    expect: (s) => s?.type === 'grass',
    expectDesc: "{type:'grass'}",
    /* ⚠️ THE INDEX CANNOT BE THE DISCRIMINATOR HERE. grassSelected is NOT cleared by Done
       (clearAllSelections only touches selectedEl; the sole resets are removeGrassPatch and
       removeNameBlocks), so after Done it still holds the clump seeded on tap. With ONE clump the
       only index is 0, so a successful tap sets {tier,idx:0} → {tier,idx:0}: unchanged. The runner
       would then report "the tap missed" for a working fix. Foil and dust escape this only because
       three points mean the tap lands on a different index.
       The selection transition is the honest signal instead: nothing else in this flow can turn
       selectedEl from null into {type:'grass'}. */
    selectionIsDiscriminator: true,
  },
  /* ⚠️ THE KEY IS `block`, SINGULAR, AND IT MUST MATCH `Flag`. The runner builds its probe names
     from the KEY — window[`__${key}TapTargets`] — while the userData flags are built from `Flag`.
     Keyed `blocks` against flag `Block` it looked for __blocksTapTargets, found nothing, and
     reported "the page is not running this build": a true statement about the wrong thing, which
     is the most expensive kind of red. Grass passes only because grass/Grass happen to agree. */
  block: {
    label: 'letter blocks',
    id: 'e23',
    place: (id) => `window.__tapElementById(${JSON.stringify(id)})`,
    /* ⚠️ NO ADD BUTTON AT ALL, and that is not an omission. addNameBlocks seeds the word "NAME" in
       one go, so four cubes exist the moment the row is tapped and the card has nothing to add. */
    addBtn: null,
    openProbe: 'Line them up',
    Flag: 'Block',                      // → isBlockTap / isBlockHandle / isBlockCatcher
    sel: '__getBlocksSel', points: '__getBlocks',
    minTargets: 4,                      // N-A-M-E
    expect: (s) => s?.type === 'blocks',
    expectDesc: "{type:'blocks'}",
    // Same reasoning as grass: blocksSelected outlives Done, so use the selection transition.
    selectionIsDiscriminator: true,
  },
};

const only = process.env.FINISH;
const chosen = only ? { [only]: FINISHES[only] } : FINISHES;
if (only && !FINISHES[only]) { console.error(`unknown FINISH=${only}; try foil or dust`); process.exit(2); }

let failures = 0;
const ok    = (m) => console.log(`  ✓ ${m}`);
const bad   = (m) => { failures++; console.log(`  ✗ ${m}`); };
const check = (cond, m) => (cond ? ok(m) : bad(m));

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

for (const [key, F] of Object.entries(chosen)) {
  console.log(`\n══════ ${F.label} ══════`);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });   // a phone
  page.on('pageerror', e => console.log(`  [pageerror] ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') console.log(`  [console.error] ${m.text().slice(0, 160)}`); });

  /* ⚠️ NOT `networkidle`. A live designer page holds connections open (HMR socket, streamed
   * assets), so idle never arrives and goto times out on a page that is perfectly healthy — which
   * reads as "the harness is broken" and sends you fixing the wrong thing. The canvas existing is
   * the real readiness signal for a 3D screen. */
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 30000 });
  // The first frame is a different picture of the same geometry — wait for the env map.
  await page.waitForTimeout(3000);

  /* ⚠️ DISMISS THE COACHING TOUR, or it silently decides which finishes can be tested. Its SCRIM is
   * pointerEvents:'none', so taps on the cake pass through it — but the CARD is a real dialog at
   * Z.toast + 1 and does take pointer events. Foil escaped it only because its card is short; dust's
   * is taller (a Tier chooser plus colour chips), so "+ Add dust flick" lands underneath and every
   * click is refused: `<div role="dialog" aria-label="Turn it around"> intercepts pointer events`.
   * Skip is the honest dismissal — DesignTour writes `seen` whether you press Got it, press Skip or
   * leave — and it is the same thing a baker does.
   * Tolerant on purpose: the tour runs on a 400ms timer and only when autoStart is true, so it may
   * legitimately not be here. A test that REQUIRED it would break the day the harness stops
   * starting it. */
  const tour = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Skip' }) });
  if (await tour.count()) {
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await tour.first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    console.log('  · coaching tour dismissed');
  }

  const cardOpen = () => page.evaluate(t =>
    [...document.querySelectorAll('button')].some(b => b.textContent.trim() === t), F.openProbe);
  const targets  = () => page.evaluate(f => window[`__${f}TapTargets`]?.() ?? null, key);
  const catchers = () => page.evaluate(f => window[`__${f}CatcherCount`]?.() ?? null, key);
  const selNow   = () => page.evaluate(() => window.__getSelectedEl?.() ?? null);
  const finishSel = () => page.evaluate(h => window[h]?.() ?? null, F.sel);

  console.log('\n1. the dev hooks exist');
  const hooks = await page.evaluate((f) => ({
    load: typeof window.__loadElements,
    place: typeof window.__placeElementById, tap: typeof window.__tapElementById,
    taps: typeof window[`__${f}TapTargets`], catch_: typeof window[`__${f}CatcherCount`],
    sel: typeof window.__getSelectedEl,
  }), key);
  check(hooks.load === 'function' && hooks.place === 'function' && hooks.tap === 'function', 'element hooks present');
  check(hooks.taps === 'function' && hooks.catch_ === 'function' && hooks.sel === 'function', 'projection + selection hooks present');
  if (hooks.taps !== 'function') { bad('the page is not running this build — stop'); break; }

  console.log(`\n2. put ${F.label} on the cake`);
  await page.evaluate(async () => { await window.__loadElements?.(); });
  await page.waitForTimeout(800);
  const placed = await page.evaluate(F.place(F.id));
  await page.waitForTimeout(1200);
  check(placed === true, `${F.id} placed`);
  check(await cardOpen(), `the ${F.label} card opened (not a sticker card)`);

  /* Not every finish HAS an add button: letter blocks arrive as a whole word, so there is nothing
     to press three times. Say which path ran, or a reader sees "add three" against an entry that
     adds nothing and assumes the step was skipped by accident. */
  /* One-shot presses some finishes need before they have anything to grab — see grass, whose
     default state is a lawn with no discrete position at all. */
  if (F.setup) {
    console.log(`\n3a. setup: ${F.setup.join(' → ')}`);
    for (const label of F.setup) {
      const btn = page.getByRole('button', { name: label, exact: true });
      await btn.waitFor({ timeout: 10000 });
      await btn.click();
      await page.waitForTimeout(600);
    }
  }
  if (F.addBtn) {
    console.log('\n3. add three');
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: F.addBtn, exact: true }).click();
      await page.waitForTimeout(500);
    }
  } else {
    console.log(`\n3. no add button — ${F.label} arrives complete`);
  }
  const editing = await targets();
  check((editing?.length ?? 0) >= F.minTargets, `handles mounted while editing (${editing?.length ?? 0})`);
  check(editing?.every(t => t.flag === `is${F.Flag}Handle`) ?? false, `they carry is${F.Flag}Handle while the card is open`);
  check((await catchers()) > 0, `catchers present while editing (${await catchers()})`);

  console.log('\n4. press Done');
  await page.getByRole('button', { name: 'Done', exact: true }).first().click();
  await page.waitForTimeout(900);
  check(!(await cardOpen()), 'the card closed');

  console.log('\n5. the CLOSED state — the half that makes the fix safe');
  const closed = await catchers();
  check(closed === 0, `catchers came off (${closed}) — the cake is not wrapped in invisible meshes`);
  const tapTargets = await targets();
  check((tapTargets?.length ?? 0) >= F.minTargets, `grab spheres still mounted (${tapTargets?.length ?? 0})`);
  check(tapTargets?.every(t => t.flag === `is${F.Flag}Tap`) ?? false, `they carry is${F.Flag}Tap, so orbit ignores them`);

  /* ⚠️ THE CAMERA IS STILL MOVING. FitCakeToView runs in useFrame — a continuous lerp, not a
   * one-shot — so closing the card changes the canvas inset and the cake GLIDES to its new
   * framing. A coordinate projected during that glide is stale by the time the tap lands, and the
   * tap then hits the tier wall instead. Wait until two consecutive projections agree. */
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
  const stable = await settle();
  console.log(`   on the cake: ${JSON.stringify(await page.evaluate(h => window[h]?.() ?? null, F.points))}`);

  const hit = (stable ?? []).find(t => t.onScreen);
  if (!hit) {
    bad("nothing is on screen to tap — the coordinates are known, so this is the test's aim, not the fix");
  } else {
    console.log(`   tapping (${hit.x.toFixed(0)}, ${hit.y.toFixed(0)})`);
    const selBefore = await selNow(), idxBefore = await finishSel();
    await page.mouse.move(hit.x, hit.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(900);
    const selAfter = await selNow(), idxAfter = await finishSel();

    console.log('\n7. did the card come back?');
    console.log(`   selection: ${JSON.stringify(selBefore)} → ${JSON.stringify(selAfter)}   (want ${F.expectDesc})`);
    console.log(`   finish index: ${JSON.stringify(idxBefore)} → ${JSON.stringify(idxAfter)}`);
    /* ⚠️ THE DISCRIMINATOR. onSelect sets the finish's own indices, so they move if and only if the
     * grab sphere was hit. Tier selected + indices MOVED means the tap landed and the leaked r3f
     * click overwrote it (gesture ownership). Tier selected + indices UNCHANGED means it missed.
     * Opposite fixes, and from the DOM the two look identical — which is how this got misdiagnosed
     * the first time. */
    /* `selectionIsDiscriminator` is for a finish whose index CANNOT move on a successful tap —
       one addressable point, and an index that outlives Done. See the grass entry. For those the
       signal is the selection appearing, which nothing else in the flow produces. */
    const finishSaw = F.selectionIsDiscriminator
      ? (selBefore == null && selAfter != null)
      : JSON.stringify(idxBefore) !== JSON.stringify(idxAfter);
    if (selAfter?.type === 'tier' && finishSaw) {
      bad('the tap HIT it (finish index moved) and the leaked click then selected the tier — gesture ownership, not aim');
    } else if (selAfter?.type === 'tier') {
      bad('the tap landed on the TIER and the finish never saw it — aim, not the fix');
    } else if (selAfter == null) {
      bad('the tap selected nothing — it hit neither the finish nor the tier');
    }
    check(F.expect(selAfter), `the tap selected ${F.label}`);
    check(await cardOpen(), `tapping it reopened the ${F.label} card`);

    /* The OPEN-card case, which the same leak would break the other way: with the card open the
     * sphere carries the HANDLE flag, and if that did not own its click either, tapping while
     * editing would select the tier and close the card the baker is working in. */
    console.log('\n8. tapping while the card is OPEN must not close it');
    const again = (await settle() ?? []).find(t => t.onScreen);
    if (!again) {
      bad('nothing on screen with the card open — cannot test the editing case');
    } else {
      await page.mouse.move(again.x, again.y);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(900);
      const sel2 = await selNow();
      console.log(`   selection after tapping inside the card: ${JSON.stringify(sel2)}`);
      check(F.expect(sel2), 'it stays selected');
      check(await cardOpen(), 'the card is still open');
    }
  }

  await page.screenshot({ path: `${process.env.HOME}/Downloads/${key}-tap-reopen.png` });
  console.log(`   screenshot: ~/Downloads/${key}-tap-reopen.png`);
  await page.close();
}

console.log(`\n${failures === 0 ? '✓ PASS' : `✗ ${failures} FAILED`}\n`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
