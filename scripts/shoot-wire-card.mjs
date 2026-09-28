/* Drive a baker to the wire's controls and photograph the card.
 *
 * ⚠️ THE CARD IS THE SURFACE THAT WAS WRONG LAST TIME. The pick's control first shipped inside the
 * COLOUR SHEET — reachable only by tapping a colour swatch — so the feature was reported as not
 * working while nothing was wrong with the capability, the seed or the renderer. A green suite
 * cannot see that. A picture of the card can.
 *
 *   node scripts/shoot-wire-card.mjs      (needs the dev server on 5190)
 *
 * Four things this had to learn, each of which produced a confident wrong answer first:
 *
 *   `?catalog`            the harness serves its fixtures only behind that flag; without it the
 *                         Decorations panel opens, searches and finds nothing, with no error.
 *   not `networkidle`     the designer keeps connections open, so waiting for idle times out on a
 *                         page that loaded fine.
 *   placing SELECTS       so tapping the cake afterwards DESELECTS and closes the card being
 *                         photographed. Two runs "failed" that way.
 *   click the pixels      getByText and getByRole both matched full-width wrappers whose centres
 *                         land on empty card, and a click there dismisses it.
 */
import { chromium } from 'playwright';

const OUT = `${process.env.HOME}/Downloads`;
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: Number(process.env.W || 420), height: 880 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));

await page.goto('http://localhost:5190/designer-mobile.html?catalog', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 20000 });
await page.waitForTimeout(3500);

const shot = async name => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/card-${name}.png` });
  console.log('  shot', name);
};
const tap = async text => {
  await page.getByText(text, { exact: false }).first().click();
  await page.waitForTimeout(700);
};

await tap('Skip');                       // the design tour owns the screen on a first visit
await tap('Decor');
await page.waitForTimeout(2500);
const search = page.getByPlaceholder('Search decorations', { exact: false }).first();
await search.click();
await search.type('Butterfly', { delay: 40 });
await page.waitForTimeout(1200);
await page.getByText('Butterfly on a wire').first().click();
await page.waitForTimeout(1800);
await shot('01-card');                   // the chip must be HERE, beside "On a stick"

const chip = page.getByRole('button', { name: /On a wire/i }).first();
console.log('  chip visible:', await chip.isVisible().catch(() => false));
await page.mouse.click(67, 688);         // the chip's own pixels — see the note above
await page.waitForTimeout(1500);
console.log('  ' + (await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 420));
await shot('02-wire-on');

await b.close();
