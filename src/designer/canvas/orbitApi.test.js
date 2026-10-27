import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/* ── Every OrbitControls method we call has to exist ─────────────────────────────────────────────
 *
 * ⚠️ THIS SHIPPED, IN 0.1.767. The hero spin's director called `controls.setAzimuthalAngle(...)`
 * and `controls.setPolarAngle(...)`. Both read perfectly, both are documented in plenty of places,
 * and neither exists in the three we ship: its OrbitControls exposes `getAzimuthalAngle` and
 * `getPolarAngle` and NO matching setters. So every frame of the take threw, the camera never
 * moved, and the only symptom was "it's not working".
 *
 * ⚠️ AND NOTHING COULD HAVE CAUGHT IT. `check:bindings` asks whether a NAME is declared — and
 * `controls` is. The spin's own arithmetic is a pure module with eleven tests, all of which passed,
 * because the half that was wrong is the dozen lines that apply the numbers. I wrote in that
 * module's header that the applying half "does nothing but apply these two numbers", as though
 * that made it safe to leave unchecked. It is exactly the half that touches somebody else's API.
 *
 * So: read the methods we call off our own source, and check each one against the OrbitControls
 * actually installed. A version bump that drops a method fails here rather than in a recording.
 */
const require = createRequire(import.meta.url);
const SOURCE = readFileSync(new URL('./CakeCanvas.jsx', import.meta.url), 'utf8');
const ORBIT = readFileSync(
  require.resolve('three/examples/jsm/controls/OrbitControls.js'), 'utf8');

/* Methods called on a variable named `controls` — the name the canvas uses for an OrbitControls
   instance throughout. Deliberately a narrow net: it is the one object we reach into. */
function calledMethods(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return [...new Set([...code.matchAll(/\bcontrols\.([a-zA-Z][\w]*)\s*\(/g)].map(m => m[1]))];
}

/* Is `name` a method on the installed OrbitControls? It is written as class methods and as
   `this.name = function`, so both spellings count. */
function orbitHas(name) {
  return new RegExp(`(^|\\s)${name}\\s*\\(`, 'm').test(ORBIT)
      || new RegExp(`this\\.${name}\\s*=\\s*function`).test(ORBIT);
}

describe('the canvas only calls OrbitControls methods that exist', () => {
  it('finds the calls it is supposed to be checking', () => {
    // A net that catches nothing would pass this suite in silence.
    const called = calledMethods(SOURCE);
    expect(called.length).toBeGreaterThan(0);
    expect(called).toContain('update');
  });

  it('every method called on `controls` exists in the installed three', () => {
    const missing = calledMethods(SOURCE).filter(m => !orbitHas(m));
    expect(missing).toEqual([]);
  });

  /* The two that were wrong, named — so a future reader sees the specific trap rather than only the
     general rule, and so this test fails loudly if somebody reaches for them again. */
  it('still has no setters to reach for', () => {
    expect(orbitHas('getAzimuthalAngle')).toBe(true);
    expect(orbitHas('getPolarAngle')).toBe(true);
    expect(orbitHas('setAzimuthalAngle')).toBe(false);
    expect(orbitHas('setPolarAngle')).toBe(false);
  });

  /* What the director uses instead. If a three upgrade ever removes these, the spin needs rewriting
     and this says so by name rather than by a blank screen. */
  it('has what the spin director does use', () => {
    for (const m of ['getDistance', 'update']) expect(orbitHas(m), m).toBe(true);
    expect(/this\.target\b/.test(ORBIT), 'controls.target').toBe(true);
    expect(/this\.object\b/.test(ORBIT), 'controls.object').toBe(true);
  });
});
