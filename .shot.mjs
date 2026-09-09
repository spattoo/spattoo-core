import { chromium } from 'playwright';
const [qs, out] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 760, height: 680 } });
await p.goto(`http://localhost:5190/garnish-on-cake.html?still=1&bare=1&${qs}`, { waitUntil: 'networkidle' });
await p.waitForTimeout(3500);
await p.screenshot({ path: out, clip: { x: 120, y: 230, width: 520, height: 400 } });
console.log('→', out);
await b.close();
