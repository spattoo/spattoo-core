#!/usr/bin/env node
// ── Stamp src/designer/buildId.js with the version npm just bumped to ───────────────────────────
//
// Runs as the `version` lifecycle script: npm bumps package.json, runs this, THEN commits — so
// staging the file here puts it inside the same `chore(release)` commit. That ordering is what
// keeps `pack-vendor.mjs` happy, since it requires the tarball's src/ to be byte-identical to
// `git archive HEAD src`: a stamp injected at pack time would fail that guard, and a stamp written
// after the commit would not be in it.
//
// Fails loudly rather than skipping. A release whose stamp did not land produces a tarball that
// names the wrong version — which is worse than no version at all, because everything downstream
// would believe it.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'src/designer/buildId.js');
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`stamp-build: package.json version is "${version}", which is not x.y.z`);
  process.exit(1);
}

const src = readFileSync(TARGET, 'utf8');
const next = src.replace(/export const BUILD = \{ version: '[^']*' \};/,
                         `export const BUILD = { version: '${version}' };`);
if (next === src && !src.includes(`version: '${version}'`)) {
  console.error('stamp-build: could not find the BUILD line in src/designer/buildId.js');
  process.exit(1);
}
writeFileSync(TARGET, next);
execFileSync('git', ['add', TARGET], { cwd: ROOT, stdio: 'inherit' });
console.log(`✓ stamped buildId.js with ${version}`);
