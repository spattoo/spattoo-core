// One-time login capture. Opens a headed Chromium at the designer dev server,
// waits for you to log in, then persists the session to storageState.json so
// subsequent headless runs start authenticated. Re-run only when the session expires.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const STATE = resolve(here, 'storageState.json');

// System Chrome, like .pw/reel.mjs. Playwright's bundled Chromium is not downloaded on this
// machine, and `npx playwright install` is a ~150 MB fetch to log in once. storageState is just
// cookies and localStorage, so a session captured here works in either browser.
const browser = await chromium.launch({ headless: false, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });

console.log('\n>>> Log in in the Chromium window. Waiting for the designer canvas to appear…\n');

// AuthGate renders the designer (a <canvas>) only after a successful login.
await page.waitForSelector('canvas', { timeout: 5 * 60 * 1000 });
// Give the session a beat to settle into storage.
await page.waitForTimeout(1500);

await context.storageState({ path: STATE });
console.log(`\n>>> Saved session → ${STATE}\n`);
await browser.close();
