/* A loaded card topper opens ready to type, through either door.
 *
 *   Sandeep, on a studio that opened with the number selected but not editable: "when its loaded
 *   entire 10 number and the offset and selected together. and user does not know how to edit.
 *   instead it should open in a state where is shows 10 is editable."
 *
 * ⚠️ THERE ARE THREE DOORS INTO THE SAME ROOM AND THIS HAS BEEN WRONG AT TWO OF THEM. Pieces arrive either WITH
 * the studio (a preset on an element row, a kept decoration, a template coming back through
 * `editWith`) or from the PRESET LIST inside it. The first was fixed; the second still cleared the
 * selection and the editor, so tapping "10" put a finished-looking number on the canvas with an
 * empty panel beside it. Both now go through one `applyArrival`, and this asks both.
 *
 * ⚠️ AND IT CHECKS THE SELECTION RANGE, not just the focus. "Ready to type" means the first
 * keystroke REPLACES the number; an input that is focused with the caret parked at the end would
 * pass a focus-only check and still make a baker select-all by hand.
 *
 * ⚠️ NOT `networkidle` — the studio runs a live scene and never goes idle.
 * Assumes `npm run dev` is up on 5190.
 *   node scripts/shoot-topper-open.mjs
 */
import { chromium } from 'playwright';

const B = 'http://localhost:5190/topper-studio.html';
const OUT = `${process.env.HOME}/Downloads`;
const fails = [];
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL —', m); if (!c) fails.push(m); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', e => { console.error('  PAGE ERROR:', e.message); fails.push(e.message); });

const state = () => page.evaluate(() => {
  const a = document.activeElement;
  const inputs = [...document.querySelectorAll('input')].filter(i => !i.type || i.type === 'text');
  return {
    editing: inputs.length,
    value: a?.tagName === 'INPUT' ? a.value : null,
    focused: a?.tagName === 'INPUT',
    selected: a?.tagName === 'INPUT' && a.selectionStart === 0 && a.selectionEnd === (a.value ?? '').length,
  };
});

console.log('\ndoor 1 — the preset list inside the studio');
await page.goto(B, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
/* ⚠️ THE TILES CARRY NO TEXT — they are SVG thumbnails — so they are found by ORDER, not a label.
   The left rail runs T, Block, five SHAPE tiles, then the PRESETS; the sixth textless button is
   the "10". */
ok(await page.evaluate(() => {
  const blank = [...document.querySelectorAll('button')].filter(b => !b.textContent.trim())
    .sort((a, c) => a.getBoundingClientRect().top - c.getBoundingClientRect().top);
  if (!blank[5]) return false; blank[5].click(); return true;
}), 'the "10" preset tile is there to tap');
await page.waitForTimeout(1800);
let st = await state();
ok(st.editing === 1, `it opens ONE text editor (${st.editing})`);
ok(st.focused && st.value === '10', `focused, holding the number (${st.value})`);
ok(st.selected, 'with the whole number selected, so the first keystroke replaces it');
await page.screenshot({ path: `${OUT}/topper-open-preset.png` });

/* Typing really does replace it — the point of all of the above. */
await page.keyboard.type('7');
await page.waitForTimeout(800);
st = await state();
ok(st.value === '7', `typing replaces the number outright (${st.value})`);

console.log('\ndoor 2 — pieces that arrive with the studio');
await page.goto(`${B}?saved=1`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4500);
st = await state();
ok(st.editing === 1, `a kept topper also opens in its editor (${st.editing})`);
ok(st.focused, 'focused');
ok(st.selected, 'and selected');
await page.screenshot({ path: `${OUT}/topper-open-kept.png` });

console.log('\ndoor 3 — a catalogue row');
/* ⚠️ THE ROW OPENS EMPTY NOW, BY REQUEST. Sandeep: *"do not default it to '10' with offset. empty
   canvas… let the user pull from preset."* The studio arriving with a finished-looking "10" on it
   is the state three rounds of fixes went into making editable, and on the deployed app it still
   arrived merely selected. An empty canvas cannot be in that state at all, and the preset rail —
   proven at every window size and through a real mouse click — lands a look IN its editor. */
await page.goto(`${B.replace('topper-studio.html', 'designer-mobile.html')}?catalog=1`,
  { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip')?.click());
await page.waitForTimeout(600);
await page.evaluate(() => window.__loadElements?.());
await page.waitForTimeout(1500);
ok(await page.evaluate(() => window.__tapElementById?.('e8') ?? false), 'the Card topper studio row opens it');
await page.waitForTimeout(3500);
st = await state();
ok(st.editing === 0, `and the canvas is EMPTY — nothing to misread as finished (${st.editing} editors)`);
ok(await page.evaluate(() => /Pick a preset/i.test(document.body.innerText)),
   'with the prompt saying what to do next');

/* And from there the preset rail still lands a look ready to type — the path this leans on. */
/* ⚠️ SCOPED TO THE MODAL. In the standalone studio the sixth textless button is the "10"; inside
   the designer the page also carries the nav's icon buttons, so an index taken over the whole
   document lands on the sidebar. The modal is found by its own title. */
ok(await page.evaluate(() => {
  const title = [...document.querySelectorAll('*')]
    .find(x => x.children.length === 0 && x.textContent.trim() === 'Card topper studio');
  let modal = title?.parentElement;
  while (modal && modal.querySelectorAll('button').length < 10) modal = modal.parentElement;
  if (!modal) return false;
  const blank = [...modal.querySelectorAll('button')].filter(b => !b.textContent.trim())
    .sort((a, c) => a.getBoundingClientRect().top - c.getBoundingClientRect().top);
  const tile = blank.find(b => { const r = b.getBoundingClientRect(); return r.width > 30 && r.width < 70 && r.height > 30; });
  const tiles = blank.filter(b => { const r = b.getBoundingClientRect(); return r.width > 30 && r.width < 70 && r.height > 30; });
  if (tiles.length < 6) return false;
  tiles[5].click(); return true;
}), 'the "10" tile is one tap away');
await page.waitForTimeout(1800);
st = await state();
ok(st.editing === 1 && st.focused && st.selected,
   `and it lands in its editor, selected (${st.value})`);
await page.screenshot({ path: `${OUT}/topper-open-row.png` });

console.log(fails.length ? `\n✗ ${fails.length} failed` : '\n✓ all good');
await browser.close();
process.exit(fails.length ? 1 : 0);
