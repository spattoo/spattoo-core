#!/usr/bin/env node
/* ── An instanced field must re-seat when its geometry is rebuilt ────────────────────────────────
 *
 * React Three Fiber treats `args` on a primitive as CONSTRUCTION arguments. Change the geometry and
 * it does not swap it in — it rebuilds the `InstancedMesh`. The new mesh arrives with an untouched
 * `instanceMatrix`, so unless the seating effect runs again every instance sits at the identity:
 * all of them stacked at the origin, inside the cake, invisible.
 *
 * ⚠️ IT DOES NOT LOOK LIKE A BUG, WHICH IS WHY THIS IS A GATE. Nothing throws, no warning appears,
 * the cost panel still reports the full count of pieces, and the screen simply loses a decoration.
 * Sandeep found it by moving a slider that has nothing to do with placement: *"when i increase the
 * branches… rim bunch disappears when the value reaches 4."* The seats had not changed, so the
 * effect had no reason to re-run — and `GrassPatch` had carried the same latent fault since it was
 * written, waiting for someone to change a tuft parameter without changing the spacing.
 *
 * The rule: if a component renders `<instancedMesh args={[X, …]}>`, then whatever writes its
 * matrices must DEPEND on X — either the effect that calls `setMatrixAt` lists it, or the component
 * hands it to `useSeatedInstances`, which lists it. There is no DOM in this suite to render a hook
 * against, so this grep is the guard.
 *
 * ⚠️ The first version of this check demanded `useSeatedInstances` specifically and reported three
 * files that were never broken: `CakeCoat` and `CakeTier` seat their own instances and already
 * depend on the object their geometry hangs off. A gate that fails correct code gets switched off,
 * so the rule is the law rather than one implementation of it.
 *
 *   node scripts/check-instanced-seats.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const files = [];
const walk = (d) => {
  for (const e of readdirSync(d)) {
    if (e === 'node_modules' || e.startsWith('.')) continue;
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.jsx$/.test(e)) files.push(p);
  }
};
for (const r of ['src', 'dev']) { try { walk(r); } catch { /* repo without one */ } }

const bad = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const re = /<instancedMesh[^>]*\bargs=\{\[\s*([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(src))) {
    const geoName = m[1];
    const line = src.slice(0, m.index).split('\n').length;
    const named = new RegExp(`(^|[^\\w$.])${geoName}($|[^\\w$])`);
    /* Either the component delegates to the shared hook and passes the geometry to it… */
    const seat = src.match(/useSeatedInstances\(([\s\S]*?)\);/);
    if (seat && named.test(seat[1])) continue;
    /* …or it seats its own instances, in which case the effect that writes the matrices has to list
       the geometry — or the object the geometry hangs off, which is the same dependency. */
    const own = [...src.matchAll(/setMatrixAt[\s\S]*?\}, \[([^\]]*)\]\);/g)];
    if (own.some(e => named.test(e[1]))) continue;
    bad.push(`${relative(process.cwd(), f)}:${line} — \`${geoName}\` reaches the mesh through `
           + `\`args\`, but nothing that writes its matrices depends on it`);
  }
}

if (bad.length) {
  console.error(`\n✗ check:instanced-seats — ${bad.length} instanced field(s) will not re-seat when their geometry is rebuilt.\n`);
  for (const b of bad) console.error(`   • ${b}`);
  console.error(`\n  R3F REBUILDS the mesh when \`args\` changes, and the new one has an empty instanceMatrix.`);
  console.error(`  Pass the geometry to useSeatedInstances so it is a dependency of the seating effect.\n`);
  process.exit(1);
}
console.log(`✓ check:instanced-seats — every instanced field re-seats when its geometry changes (${files.length} files)`);
