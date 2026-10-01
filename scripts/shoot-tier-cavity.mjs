/* Switch the scraped edge and the turntable spiral on from the tier sheet, and photograph the cake.
 *
 * ⚠️ THE CONTROL AND THE CAKE IN ONE FRAME. The POC proved the geometry against a bare cylinder;
 * what this has to show is the control reaching the REAL tier, with the tier's own cream colour and
 * finish — which is the thing a separate harness cannot say anything about.
 */
import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:5190/designer-mobile.html?catalog', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 20000 });
await page.waitForTimeout(3500);

const shots = [];
const grab = async label => {
  await page.screenshot();
  await page.waitForTimeout(900);
  shots.push({ label, png: (await page.screenshot()).toString('base64') });
  console.log('  shot', label);
};
const tap = async t => {
  const el = page.getByText(t, { exact: false }).first();
  if (!(await el.count())) { console.log('  MISSING:', t); return false; }
  await el.click(); await page.waitForTimeout(900); return true;
};
/* ⚠️ EXACT TEXT AND A COORDINATE CLICK, because the loose `tap` above matched a WRAPPER around the
   chip and then hung thirty seconds waiting for it to become clickable. The chip itself was on
   screen and visible the whole time — a harness reporting "MISSING" or timing out on a control that
   is plainly there is worse than no harness, so this one clicks the middle of its own box. */
const tapChip = async t => {
  const el = page.getByText(t, { exact: true }).first();
  if (!(await el.count().catch(() => 0))) { console.log('  MISSING chip:', t); return false; }
  const bb = await el.boundingBox({ timeout: 2000 }).catch(() => null);
  if (!bb) { console.log('  chip has no box:', t); return false; }
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.waitForTimeout(900);
  return true;
};

await tap('Skip');
/* The tier sheet opens by tapping the cake itself. */
const box = await page.locator('canvas').first().boundingBox();
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.62);
await page.waitForTimeout(1500);
console.log('  ' + (await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 300));
await grab('tier sheet');

if (await tap('Scraped edge')) {
  await grab('rim on, default height');

  /* ⚠️ DRIVEN TO THE TOP OF ITS RANGE, because the default is a few PIXELS on a cake this size seen
     from this angle — "it did not change" and "it changed by less than I can see" are different
     findings and a screenshot at the default cannot tell them apart. */
  /* ⚠️ EVERY LOCATOR HERE IS WRAPPED, because two attempts at finding the dial hung for thirty
     seconds apiece on an off-screen SVG in the nav rail. A harness that throws instead of reporting
     is a harness that tells you nothing — and the shots before this point are the ones that matter,
     so losing them to a timeout is the worst outcome available. */
  const db = await page.locator('svg').filter({ has: page.locator('circle') }).last()
    .boundingBox({ timeout: 2000 }).catch(() => null);
  if (!db) console.log('  (could not reach the Height dial — the shots above still stand)');
  if (db) {
    await page.mouse.move(db.x + db.width / 2, db.y + db.height / 2);
    await page.mouse.down();
    await page.mouse.move(db.x + db.width * 1.4, db.y - db.height * 0.2, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    await grab('height at maximum');
  }

  const turn = page.getByTitle("Another hand's pass").first();
  if (await turn.count().catch(() => 0)) {
    await turn.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(900);
    await grab('shuffled');
  }
}

/* ⚠️ THE SPIRAL IS A SECOND CHIP, AND BOTH ON IS THE CASE WORTH PHOTOGRAPHING. They are chosen
   separately and built as one mesh, so "each alone works" proves less than "both together do not
   fight" — a z-fight or a seam at the rim's inner edge only appears when both are asked for. */
if (await tapChip('Spiral')) {
  /* ⚠️ THE DEFAULT CAMERA, AND AN ORBIT "TO SEE THE TOP BETTER" MADE IT WORSE. Looking nearly
     straight down, a crest and the flat beside it both face the overhead light and shade almost
     identically — the spiral vanished completely, from an angle chosen to reveal it. The designer's
     own three-quarter view is where a customer sees the cake and where the relief actually reads. */
  await grab('spiral on, with the scraped edge');

  /* The spiral's own Height, at the top of its range — the same reasoning as the rim's: at the
     default this is a few pixels on a cake seen from across the room. */
  const dials = page.locator('svg').filter({ has: page.locator('circle') });
  const n = await dials.count().catch(() => 0);
  const sd = n ? await dials.nth(n - 1).boundingBox({ timeout: 2000 }).catch(() => null) : null;
  if (!sd) console.log('  (could not reach the spiral Height dial — the shots above still stand)');
  if (sd) {
    await page.mouse.move(sd.x + sd.width / 2, sd.y + sd.height / 2);
    await page.mouse.down();
    await page.mouse.move(sd.x + sd.width * 1.4, sd.y - sd.height * 0.2, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    await grab('spiral height at maximum');
  }
}

const sheet = await b.newPage({ viewport: { width: 1180 * shots.length, height: 880 }, deviceScaleFactor: 1 });
await sheet.setContent(`<body style="margin:0;display:flex;font:600 15px system-ui;background:#fff">
${shots.map(s => `<figure style="margin:0;text-align:center"><img src="data:image/png;base64,${s.png}" style="width:1180px;display:block"><figcaption style="padding:8px 0;color:#2C4433">${s.label}</figcaption></figure>`).join('')}</body>`);
await sheet.waitForTimeout(400);
await sheet.screenshot({ path: `${process.env.HOME}/Downloads/tier-cavity.png` });
await b.close();
