/* The thumbnail is saved from the angle the baker aimed, and the preview is the capture.
 *
 * Sandeep: "sometimes cake's interesting decorations are on the top (hugging) or a message written
 * on the top. that needs to be highlighted. not from the front which capturrs size."
 *
 * ⚠️ IT ASSERTS THE BLOB, NOT THE PREVIEW. The panel showing a top view proves the preview moved;
 * only reading what `captureThumbnailBlob` produced proves the SAVE did. Those are the two halves
 * this feature joins, and a check that only looked at the screen would pass with the capture still
 * pinned to the front.
 *
 * Assumes `npm run dev` on 5190.   node scripts/shoot-thumbnail-angle.mjs
 */
import { chromium } from 'playwright';
const fails = []; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗ FAIL —', m); if (!c) fails.push(m); };
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.error('  PAGE ERROR:', e.message));
await page.goto('http://localhost:5190/designer-mobile.html?stack=top', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
const skip = page.locator('text=Skip').first(); if (await skip.count()) { await skip.click(); await page.waitForTimeout(800); }

/* ⚠️ THE OPENER IS THE BOTTOM-BAR BUTTON, NOT "the first thing that says Save as Template" — the
   panel's own submit says the same words, so once the panel is up a bare text match re-clicks that
   and the second case never opens. Close whatever is open first: after a save the panel stays with
   its success message. */
const open = async () => {
  const esc = page.locator('[role="dialog"]');
  if (await esc.count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(900); }
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .filter(x => !x.closest('[role="dialog"]'))
      .find(x => /Save as Template/i.test(x.textContent));
    b?.click();
  });
  await page.waitForTimeout(2400);
};
/* The blob, decoded — its pixels are what a catalogue tile will show. */
const savedThumb = () => page.evaluate(async () => {
  const blob = window.__lastThumb;
  if (!blob) return null;
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  /* Mean brightness of the TOP third vs the BOTTOM third. A cake seen from the front fills the
     frame with wall and shows board at the bottom; seen from above it is all top face. Crude on
     purpose — the point is that the two angles produce DIFFERENT pictures, measured rather than
     eyeballed. */
  const band = (y0, y1) => { let s = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = 0; x < c.width; x += 2) {
      const i = (y * c.width + x) * 4; s += d[i] + d[i+1] + d[i+2]; n += 3; }
    return Math.round(s / n); };
  /* ⚠️ COUNT THE GOLD, which is the message. Brightness bands were the first attempt and they are
     nearly blind here — a white cake on a white field differs by ~10 between the two angles, inside
     the noise. The lettering is gold leaf on white, so counting warm pixels asks the product
     question directly: does the message on the TOP take up more of the picture when photographed
     from above? */
  let gold = 0, tot = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    tot++;
    const [r, g, bl] = [d[i], d[i + 1], d[i + 2]];
    if (r > 110 && r - bl > 45 && g - bl > 20 && r >= g) gold++;
  }
  return { w: bmp.width, h: bmp.height, aspect: +(bmp.width / bmp.height).toFixed(2),
           goldPct: +(100 * gold / Math.max(1, tot)).toFixed(2) };
});

const fillForm = async (pg, name) => {
  await pg.locator('input[placeholder="Template name..."]').fill(name);
  await pg.locator('input[placeholder="Min"]').fill('1');
  await pg.locator('input[placeholder="Max"]').fill('100');
};

console.log('\nsaving from the FRONT (the shipped angle)');
await open();
await page.locator('text="Front"').first().click();
await page.waitForTimeout(1200);
/* ⚠️ THE AGE RANGE IS REQUIRED, and leaving it out fails silently as far as a script is concerned:
   the panel simply stays open with "Say which ages this design suits" at the bottom and no blob is
   ever produced. That reads exactly like a broken capture. */
await fillForm(page, 'Front shot');
await page.locator('button:has-text("Save as Template")').last().click();
await page.waitForTimeout(3000);
const front = await savedThumb();
ok(!!front, 'a thumbnail blob was produced');
ok(front?.aspect === 1.5, `it is 3:2 — ${front?.aspect} (${front?.w}x${front?.h})`);

console.log('\nsaving from the TOP');
await page.waitForTimeout(1200);
await open();
await page.locator('text="Top"').first().click();
await page.waitForTimeout(1400);
await fillForm(page, 'Top shot');
await page.locator('button:has-text("Save as Template")').last().click();
await page.waitForTimeout(3000);
const top = await savedThumb();
ok(!!top, 'a thumbnail blob was produced');
ok(top?.aspect === 1.5, `it is 3:2 too — ${top?.aspect} (${top?.w}x${top?.h})`);

/* ⚠️ THE ASSERTION THAT MATTERS, and it is the reported need rather than "something changed". Same
   cake, same panel, two angles: the gold message lies on the TOP face, so from above it must take up
   more of the thumbnail than it does from the front. A camera still pinned to the front would give
   the same two numbers. */
ok(top.goldPct > front.goldPct * 1.4,
   `the message on top reads bigger from above — gold ${front.goldPct}% front vs ${top.goldPct}% top`);
/* And the crop follows the silhouette rather than being one fixed box. */
ok(front.w !== top.w || front.h !== top.h,
   `the crop follows the angle — ${front.w}x${front.h} vs ${top.w}x${top.h}`);

/* ── The panel opens on the view the cake is already at ──────────────────────────────────────────
   ⚠️ DRAG THE CAKE FIRST, THEN OPEN. Without the orbit this asserts nothing: the live camera starts
   near the thumbnail's own front angle, so a panel that ignored it entirely would still look right. */
console.log('\nthe panel opens where the baker left the cake');
{
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  const cv = await page.locator('canvas').first().boundingBox();
  await page.mouse.move(cv.x + cv.width / 2, cv.y + cv.height / 2);
  await page.mouse.down();
  await page.mouse.move(cv.x + cv.width / 2 - 260, cv.y + cv.height / 2 - 40, { steps: 18 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  const live = await page.evaluate(() => window.__cameraState?.() ?? null);
  await open();
  /* The preset row shows which, if any, preset the view matches — after a free orbit it should match
     NONE, which is itself the evidence that the panel took the live angle rather than snapping. */
  const anyPresetOn = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    return [...(d?.querySelectorAll('button') ?? [])]
      .filter(b => ['Front', 'Tilted', 'Top'].includes(b.textContent.trim()))
      .some(b => getComputedStyle(b).backgroundColor !== 'rgb(255, 255, 255)');
  });
  ok(live !== null, 'the live camera was readable');
  ok(anyPresetOn === false, 'the panel opened on the orbited view, not snapped to a preset');
}

await b.close();
console.log(fails.length ? `\n✗ ${fails.length} FAILED` : '\n✓ all checks passed');
process.exit(fails.length ? 1 : 0);
