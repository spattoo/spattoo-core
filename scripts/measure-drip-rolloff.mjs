/* Which CHOCOLATE_ROLLOFF renders a baker's colour as itself?
 *
 *   node scripts/measure-drip-rolloff.mjs          (needs `npm run dev` on 5190)
 *
 * ⚠️ THE REFERENCE LIGHT IS SOLVED FIRST, AND THIS ANSWERS A DIFFERENT QUESTION. `measure-surface-colour`
 * says where a colour lands; this says how the correction should TAPER toward white, which is a
 * judgement about which colours matter. Re-run it after any change to the drip material — a rolloff
 * is fitted to one reflectance and does not survive a new one.
 *
 * Sweep CHOCOLATE_ROLLOFF on the colours bakers actually pick (never on grey — INVARIANTS #16), and
   report the MEAN and the WORST channel: a setting that improves the average by crushing one colour
   is not an improvement. The albedo is driven onto the live material, so only the rolloff varies. */
import { chromium } from 'playwright';
import { albedoForLight } from '../src/designer/shared/albedoForLight.js';
/* Keep in step with CHOCOLATE_REFERENCE_LIGHT in canvas/CakeTier.jsx — importing it would pull the
   whole tier module (and three) into a node script for three numbers. */
const L=[2.653,2.370,2.243];
const COLOURS=['#C4626B','#4EC5B0','#D98FA8','#3a2117','#F6DCE2','#FFFFFF','#7FC241','#4A2C1B','#EFE3CE','#E8598F','#5a3621','#9B6FD4'];
const lin=c=>(c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4));
const hx=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
const browser = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 760, height: 640 } });
await page.goto('http://localhost:5190/garnish-on-cake.html?still=1&drip=1&dripcolor=%23FF00FF',{waitUntil:'networkidle'});
await page.waitForTimeout(3500);
await page.evaluate(()=>{window.__drip=[];
  window.__scene.traverse(o=>{if(o.isMesh&&o.material?.isMeshPhysicalMaterial&&o.material.clearcoat>0)window.__drip.push(o);});});
const render=()=>page.evaluate(()=>{window.__gl.render(window.__scene,window.__camera);
  const cv=document.querySelector('canvas');const t=document.createElement('canvas');
  t.width=cv.width;t.height=cv.height;t.getContext('2d').drawImage(cv,0,0);
  return Array.from(t.getContext('2d').getImageData(0,0,cv.width,cv.height).data);});
const setC=(r,g,b)=>page.evaluate(([r,g,b])=>{for(const m of window.__drip)m.material.color.setRGB(r,g,b);},[r,g,b]);
const magenta=await render(); await setC(0,0,0); const black=await render();
const mask=[];for(let i=0;i<magenta.length;i+=4){
  const d=Math.abs(magenta[i]-black[i])+Math.abs(magenta[i+1]-black[i+1])+Math.abs(magenta[i+2]-black[i+2]);
  if(d>80&&magenta[i+3]>250)mask.push(i);}
const mean=px=>{let r=0,g=0,b=0;for(const i of mask){r+=px[i];g+=px[i+1];b+=px[i+2];}
  const n=mask.length;return [r/n,g/n,b/n];};
console.log('rolloff   mean |err|   worst channel');
for(const ro of [0,1,1.5,2,2.5,3,4]){
  let sum=0,n=0,worst=0,wc='';
  for(const c of COLOURS){
    const a=albedoForLight(c,L,{rolloff:ro}).match(/[\d.]+/g).map(Number).map(v=>lin(v/255));
    await setC(a[0],a[1],a[2]);
    const got=mean(await render()), ask=hx(c);
    got.forEach((v,i)=>{const e=Math.abs(v-ask[i]); sum+=e; n++; if(e>worst){worst=e;wc=`${c} ch${i}`;}});
  }
  console.log(`${String(ro).padEnd(9)} ${(sum/n).toFixed(1).padEnd(11)} ${worst.toFixed(0)} (${wc})`);
}
await browser.close();
