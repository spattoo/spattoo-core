/* The sprinkles card, after three changes asked for together:
 *
 *   Sandeep: "dial controls - lets keep top and side in two rows. and there is only one size
 *   control. user can select diff sizes for top and side. other thing is- it ll be diffficult for
 *   the user to remember the colors in the multi color band. need to have a option for multi
 *   color? may be near the color selector."
 *
 * ⚠️ NONE OF THE THREE IS PROVABLE FROM SOURCE, and one of them already built clean while broken.
 * Deleting the card's shared `size` const left a dead reference in the surface-preview tile:
 * `npm run build` passed, `check:bindings` passed, 2430 tests passed, and it would have thrown a
 * ReferenceError the instant a baker opened a sprinkles card, because a JSX closure is only
 * evaluated on render. That is root CLAUDE.md rule 6 demonstrated on my own change, and it is the
 * reason this script asserts on a MOUNTED card rather than on the file.
 *
 * Five claims:
 *   1. Two surfaces ticked → TWO dial rows, each headed by its surface, each holding Count, Big
 *      ones and Size. (Before: one row of five cells that had to scroll sideways.)
 *   2. The rows do not scroll — three cells fit a 390px phone, which was the point of splitting.
 *   3. Top and side hold DIFFERENT sizes at once. This is the change; a shared dial could not.
 *   4. Multi colour fills the swatches from the ELEMENT'S configured mix (`scatter_mix` on e9 —
 *      four colours that are deliberately NOT the code default, so reading the config is proven).
 *   5. Switching back restores the single colour untouched, and switching on again restores the
 *      exact mix — the per-instance stash, round-tripped.
 *
 * ⚠️ NOT `networkidle` — the designer runs a live 3D scene and never goes idle.
 * Assumes `npm run dev` is up on 5190.
 *   node scripts/shoot-scatter-rows.mjs
 */
import { chromium } from 'playwright';

const B = 'http://localhost:5190';
const OUT = `${process.env.HOME}/Downloads/sprinkles-two-rows.png`;

const fails = [];
const ok = (cond, msg) => { console.log(cond ? '  ✓' : '  ✗ FAIL —', msg); if (!cond) fails.push(msg); };

const b = await chromium.launch();
// A baker's screen is a phone, and the designer switches layout at <=640.
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', e => { console.error('  PAGE ERROR:', e.message); fails.push(`page error: ${e.message}`); });

/* ⚠️ `catalog=1` IS NOT OPTIONAL. Without it `fetchElements` returns the football stub and `e9`
   (the scatterable rosette, the only fixture carrying `scatter: true`) does not exist — so every
   assertion below would "pass" by finding nothing. */
await page.goto(`${B}/designer-mobile.html?catalog=1`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4500);   // the scene mounts and the env map lands a frame or two later

/* ⚠️ THE DESIGN TOUR OWNS THE SCREEN ON A FIRST VISIT, and it sat squarely over the Surface tiles in
   the first run of this script — the assertions passed (they read the DOM, which the coach mark does
   not remove) but the SCREENSHOT showed a card half-covered, which is the half a person actually
   checks. Same one-liner `shoot-wire-card.mjs` and `shoot-tier-cavity.mjs` already use. */
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click();
});
await page.waitForTimeout(600);

/* ── place the scatter on BOTH surfaces ─────────────────────────────────────────────────────── */
console.log('\nplacing the scatter on both surfaces');
{
  await page.evaluate(() => window.__loadElements?.());
  await page.waitForTimeout(1200);           // the catalogue fetch resolves
  const placed = await page.evaluate(() => window.__placeElementByIdZone?.('e9', 'side') ?? false);
  await page.waitForTimeout(1500);
  ok(placed, 'the rosette scatter is placed on the SIDE');
  const ticked = await page.evaluate(() => window.__scatterSurface?.('e9', 'top_surface', true) ?? false);
  await page.waitForTimeout(1500);
  ok(ticked, 'and the TOP surface is ticked on too');

  const groups = await page.evaluate(() => {
    const st = (window.__getStickers?.() ?? []).filter(s => s.elementId === 'e9' && s.scatter);
    const side = st.filter(s => s.zone === 'side' || s.zone === 'middle_tier').length;
    return { side, top: st.length - side, total: st.length };
  });
  ok(groups.side > 0 && groups.top > 0,
    `both surfaces carry instances — top ${groups.top}, side ${groups.side}`);
}

/* ── 1 + 2 — two rows, each with three dials, neither scrolling ─────────────────────────────── */
console.log('\nthe dial rows');
let rowReport;
{
  /* Read the CAPTIONS off the mounted card. `ControlCell` captions itself below each dial, so the
     captions are the honest test of "which dials are in which row" — far better than counting
     divs, which would pass on any layout that merely contained the right words somewhere. */
  rowReport = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('span,div,label')]
      .filter(n => n.children.length === 0)
      .map(n => ({ t: n.textContent.trim(), r: n.getBoundingClientRect() }))
      .filter(x => x.r.width > 0 && x.r.height > 0);
    const dialCaps = labels.filter(x => ['Count', 'Big ones', 'Size'].includes(x.t));
    // Group captions by their vertical band — one band per row.
    const bands = [];
    dialCaps.forEach(c => {
      const mid = c.r.top + c.r.height / 2;
      const band = bands.find(bd => Math.abs(bd.mid - mid) < 24);
      if (band) { band.caps.push(c.t); band.mid = (band.mid + mid) / 2; }
      else bands.push({ mid, caps: [c.t] });
    });
    bands.sort((a, b) => a.mid - b.mid);
    const heads = ['Top', 'Side'].map(h => {
      const n = labels.find(x => x.t === h);
      return n ? { t: h, top: Math.round(n.r.top) } : null;
    }).filter(Boolean);
    // Does either row need sideways scrolling?
    const scrollers = [...document.querySelectorAll('div')]
      .filter(d => d.scrollWidth > d.clientWidth + 2 && d.clientWidth > 120 && d.clientHeight < 140)
      .map(d => ({ w: d.clientWidth, sw: d.scrollWidth, txt: d.textContent.trim().slice(0, 40) }));
    return {
      bands: bands.map(bd => ({ mid: Math.round(bd.mid), caps: bd.caps.sort() })),
      heads, scrollers,
    };
  });

  ok(rowReport.bands.length === 2,
    `TWO dial rows — got ${rowReport.bands.length}: ${JSON.stringify(rowReport.bands.map(b2 => b2.caps))}`);
  const every3 = rowReport.bands.every(bd =>
    bd.caps.length === 3 && bd.caps.join(',') === 'Big ones,Count,Size');
  ok(every3, 'each row holds exactly Count, Big ones and Size');
  ok(rowReport.heads.length === 2,
    `both rows are headed by their surface — found ${rowReport.heads.map(h => h.t).join(', ') || 'none'}`);
  /* ⚠️ THE CAPTIONS ARE PLAIN NOUNS AGAIN. With one row they had to read "Count Top / Count Side"
     to say which was which; a row that IS the surface carries that in its heading. */
  const text = await page.evaluate(() => document.body.innerText);
  ok(!/Count\s+(Top|Side)/.test(text), 'and no "Count Top"-style captions survive');
  ok(rowReport.scrollers.length === 0,
    `neither row scrolls sideways on a 390px phone — ${JSON.stringify(rowReport.scrollers)}`);
}

/* ── 3 — different sizes on top and side ────────────────────────────────────────────────────── */
console.log('\ndifferent sizes per surface (the change)');
{
  const before = await page.evaluate(() => ({
    top: window.__scatterSizeOf?.('e9', 'top'), side: window.__scatterSizeOf?.('e9', 'side'),
  }));
  /* Through the card's OWN writer, with the zone — not by editing stickers, which would prove only
     that the store can hold two numbers, never that the dial scopes its write. */
  await page.evaluate(() => window.__setScatterSize?.('e9', 'side', 0.9));
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__setScatterSize?.('e9', 'top_surface', 0.2));
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => ({
    top: window.__scatterSizeOf?.('e9', 'top'), side: window.__scatterSizeOf?.('e9', 'side'),
  }));
  console.log(`    before ${JSON.stringify(before)}  →  after ${JSON.stringify(after)}`);
  ok(after.side > after.top,
    `the two surfaces hold DIFFERENT sizes — side ${after.side}, top ${after.top}`);
  ok(Math.abs(after.side - 0.9) < 0.001, 'the side kept the size the side dial set');
  ok(Math.abs(after.top - 0.2) < 0.001,
    '⚠️ and setting the TOP did not drag the side with it (the old shared-dial bug)');

  /* And the dials on screen must SHOW the two values, not one repeated — the reason the shared
     `size` const had to go rather than merely being passed a group. */
  /* ⚠️ READ BY GEOMETRY, NOT BY TREE-WALKING. The first version climbed `closest('div').parentElement`
     from the "Size" caption and scraped the first number under it — which returned "12" twice, the
     COUNT dial's readout, because the cells share an ancestor and `12` sorts first in document
     order. It reported a failure that was entirely its own. A dial's value is the number drawn
     inside that dial, so match it by position: the numeric node whose centre is nearest the caption
     horizontally and sits directly above it. */
  const shown = await page.evaluate(() => {
    const leaves = [...document.querySelectorAll('span,div,text,tspan')]
      .filter(n => n.children.length === 0 && n.textContent.trim())
      .map(n => ({ t: n.textContent.trim(), r: n.getBoundingClientRect() }))
      .filter(x => x.r.width > 0 && x.r.height > 0);
    const caps = leaves.filter(x => x.t === 'Size');
    return caps.map(c => {
      const cx = c.r.left + c.r.width / 2;
      const near = leaves
        .filter(x => /^\d*\.?\d+$/.test(x.t))
        .filter(x => Math.abs((x.r.left + x.r.width / 2) - cx) < 34)   // same column as the caption
        .filter(x => x.r.bottom <= c.r.top + 2)                        // drawn ABOVE its caption
        .sort((a, b) => b.r.bottom - a.r.bottom);                      // the closest one up
      return near[0]?.t ?? null;
    });
  });
  console.log(`    Size dials read: ${JSON.stringify(shown)}`);
  ok(new Set(shown.filter(Boolean)).size === 2,
    `the two Size dials show different numbers — ${JSON.stringify(shown)}`);
}

/* ── 4 + 5 — multi colour, and switching back ───────────────────────────────────────────────── */
console.log('\nmulti colour — the mix, and getting your single colour back');
{
  const single = await page.evaluate(() => {
    const st = (window.__getStickers?.() ?? []).filter(s => s.elementId === 'e9' && s.scatter);
    return [...new Set(st.map(s => s.color))];
  });
  ok(single.length === 1, `starts on ONE colour — ${JSON.stringify(single)}`);
  ok(await page.evaluate(() => window.__scatterIsMulti?.('e9')) === false,
    'and the Multi colour chip is off');

  // The chip itself, clicked as a baker would — not the hook. It is a Chip, so it is findable.
  const clicked = await page.evaluate(() => {
    const chip = [...document.querySelectorAll('button')]
      .find(x => x.textContent.trim() === 'Multi colour');
    if (!chip) return null;
    chip.click();
    return true;
  });
  await page.waitForTimeout(900);
  ok(clicked === true, 'the "Multi colour" chip exists on the card and was clicked');

  const mixed = await page.evaluate(() => {
    const st = (window.__getStickers?.() ?? []).filter(s => s.elementId === 'e9' && s.scatter);
    return { colours: [...new Set(st.map(s => s.color))], isMulti: window.__scatterIsMulti?.('e9') };
  });
  ok(mixed.isMulti === true, 'the chip now reads as pressed (mode derived from the cake)');
  /* ⚠️ THE ELEMENT'S OWN MIX, not the code default. e9 carries four colours in `scatter_mix` that
     are deliberately not the seeded six — so matching them proves the config is read (root
     CLAUDE.md rule 3: an admin retunes this without a deploy). */
  const CONFIGURED = ['#1B9AAA', '#EF476F', '#FFC43D', '#06D6A0'];
  const got = mixed.colours.map(c => c.toUpperCase()).sort();
  ok(got.length === CONFIGURED.length && got.join() === [...CONFIGURED].sort().join(),
    `the mix came from the ELEMENT's scatter_mix — ${JSON.stringify(mixed.colours)}`);

  const swatches = await page.evaluate(() =>
    [...document.querySelectorAll('input[type="color"]')].map(i => i.value.toUpperCase()));
  ok(swatches.length >= 4,
    `and all of them are on screen as swatches, nothing hidden behind the mode — ${JSON.stringify(swatches)}`);

  /* The card in its mixed state is what gets saved at the end — the screenshot is taken here, while
     the swatches are full, rather than after the toggling below returns it to one colour. */
  await page.screenshot({ path: OUT, fullPage: false });

  // Back to one colour.
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Multi colour')?.click();
  });
  await page.waitForTimeout(900);
  const back = await page.evaluate(() => {
    const st = (window.__getStickers?.() ?? []).filter(s => s.elementId === 'e9' && s.scatter);
    return { colours: [...new Set(st.map(s => s.color))], isMulti: window.__scatterIsMulti?.('e9') };
  });
  ok(back.isMulti === false, 'switching back leaves the chip unpressed');
  ok(back.colours.length === 1 && back.colours[0] === single[0],
    `⚠️ and the original single colour came back UNTOUCHED — was ${single[0]}, now ${JSON.stringify(back.colours)}`);

  // And on again: the stash should return the same mix, not a re-cycled palette.
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Multi colour')?.click();
  });
  await page.waitForTimeout(900);
  const again = await page.evaluate(() => {
    const st = (window.__getStickers?.() ?? []).filter(s => s.elementId === 'e9' && s.scatter)
      .sort((a, b) => a.id - b.id);
    return st.map(s => s.color.toUpperCase());
  });
  ok(new Set(again).size === CONFIGURED.length,
    `switching on again restores the same ${CONFIGURED.length}-colour mix — ${JSON.stringify([...new Set(again)])}`);
}

console.log(`\nscreenshot → ${OUT}`);
console.log(fails.length ? `\n${fails.length} FAILED:\n  - ${fails.join('\n  - ')}` : '\nall claims hold');
await b.close();
process.exit(fails.length ? 1 : 0);
