#!/usr/bin/env node
// ── Pack the library for spattoo-web, and prove the tarball is what it claims ───────────────────
//
// spattoo-web installs a committed tarball (vendor/spattoo-designer-<version>.tgz), so the artifact
// — not the source — is what reaches production. `npm pack` packs the WORKING TREE, and nothing
// checks that tree against the commit whose version it stamps on the file. That gap has already
// shipped once: 0.1.161's release commit contained the template-thumbnail crop, but the tarball
// vendored as 0.1.161 did not, because it was packed from a branch predating the merge. The crop
// was live in the source and absent from production, which is the worst kind of missing — every
// check you would run against the repo passes.
//
// This packs only when the tree can honestly stamp a version, then verifies the result:
//
//   1. no uncommitted changes  — a dirty tree matches no commit at all
//   2. nothing missing from origin/<branch> — the 0.1.161 failure exactly
//   3. this version has not already been vendored — silently replacing a shipped artifact is worse
//      than the drift it hides
//   4. after packing, the tarball's src/ is byte-identical to `git archive HEAD src`
//
// Usage: npm run pack:vendor -- /path/to/spattoo-web/vendor [--allow-behind]

import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', ...opts }).trim();

const die = (msg) => { console.error(`\n✗ pack:vendor — ${msg}\n`); process.exit(1); };
const ok  = (msg) => console.log(`  ✓ ${msg}`);

const dest = process.argv[2];
const allowBehind = process.argv.includes('--allow-behind');
if (!dest) die('missing destination.\n  usage: npm run pack:vendor -- <spattoo-web>/vendor');
if (!existsSync(dest)) die(`destination does not exist: ${dest}`);

const { version, name } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
console.log(`\npack:vendor — ${name}@${version} → ${dest}\n`);

// ── 1. clean tree ──
if (sh('git', ['status', '--porcelain'])) {
  die('working tree is dirty. Commit first — a tarball packed from uncommitted work\n' +
      '  corresponds to no commit, so nothing can ever verify it.');
}
ok('working tree is clean');

// ── 2. not behind the branch this will ship from ──
const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
const upstream = `origin/${branch === 'HEAD' ? 'dev' : branch}`;
try {
  sh('git', ['fetch', 'origin', '--quiet']);
  const behind = sh('git', ['rev-list', '--count', `HEAD..${upstream}`]);
  if (behind !== '0') {
    const missing = sh('git', ['log', '--oneline', `HEAD..${upstream}`]).split('\n').slice(0, 8);
    const msg = `HEAD is ${behind} commit(s) behind ${upstream}. Packing now would ship a tarball\n` +
      `  missing work that is already on the branch — this is how 0.1.161 lost the thumbnail crop.\n\n` +
      missing.map((l) => `      ${l}`).join('\n') +
      `\n\n  Rebase onto ${upstream} first, or pass --allow-behind if this is deliberate.`;
    if (allowBehind) console.warn(`\n  ! ${msg}\n`); else die(msg);
  } else {
    ok(`up to date with ${upstream}`);
  }
} catch {
  console.warn(`  ! could not compare against ${upstream} (offline?) — skipping that check`);
}

// ── 3. version not already vendored ──
const existing = readdirSync(dest).filter((f) => f === `spattoo-designer-${version}.tgz`);
if (existing.length) {
  die(`spattoo-designer-${version}.tgz already exists in the destination.\n` +
      '  Bump the version rather than replacing a tarball that may already be live.');
}
ok(`${version} is not vendored yet`);

// ── pack ──
const out = sh('npm', ['pack', `--pack-destination=${dest}`, '--silent']).split('\n').pop();
const tarball = join(dest, out);
ok(`packed ${out}`);

// ── 4. tarball src == git archive HEAD src ──
const work = mkdtempSync(join(tmpdir(), 'packverify-'));
try {
  sh('tar', ['-xzf', tarball, '-C', work]);
  const tree = join(work, 'tree');
  sh('sh', ['-c', `mkdir -p '${tree}' && git archive HEAD src | tar -x -C '${tree}'`]);

  let diff = '';
  try {
    sh('diff', ['-rq', join(tree, 'src'), join(work, 'package', 'src')]);
  } catch (e) {
    diff = (e.stdout || '').trim();
  }
  if (diff) {
    die(`the tarball's source does not match HEAD:\n\n${diff.split('\n').map((l) => `      ${l}`).join('\n')}`);
  }
  const count = sh('sh', ['-c', `find '${join(tree, 'src')}' -type f | wc -l`]).trim();
  ok(`tarball src matches HEAD (${count} files, 0 adrift)`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(`\n✓ ${out} is exactly ${sh('git', ['rev-parse', '--short', 'HEAD'])}\n`);
