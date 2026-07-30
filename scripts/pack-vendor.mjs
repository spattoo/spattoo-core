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
// Compare against the RELEASE branch, never against origin/<current branch>. The question is
// "does this tree contain everything that will be on dev when it ships", and it does not stop
// mattering because you are on a feature branch — that is when you are most likely to be behind.
// An earlier cut of this script derived the ref from the branch name, so on any feature branch it
// looked up a remote ref that does not exist, fell into the catch, and downgraded the check that
// matters most to a warning about being offline. Same silent-skip bug as the hook above.
const RELEASE_REF = process.env.SPATTOO_RELEASE_REF || 'origin/dev';

let fetched = true;
try { sh('git', ['fetch', 'origin', '--quiet']); }
catch { fetched = false; console.warn(`  ! could not reach origin — comparing against the last fetched ${RELEASE_REF}`); }

const haveRef = (() => {
  try { sh('git', ['rev-parse', '--verify', '--quiet', RELEASE_REF]); return true; } catch { return false; }
})();

if (!haveRef) {
  die(`${RELEASE_REF} does not exist locally${fetched ? '' : ' and origin is unreachable'}.\n` +
      '  Without it there is no way to tell whether this tree is missing shipped work — which is\n' +
      `  the check that matters. Fetch first, or set SPATTOO_RELEASE_REF to the right branch.`);
}

const behind = sh('git', ['rev-list', '--count', `HEAD..${RELEASE_REF}`]);
if (behind !== '0') {
  const missing = sh('git', ['log', '--oneline', `HEAD..${RELEASE_REF}`]).split('\n').slice(0, 8);
  const msg = `HEAD is ${behind} commit(s) behind ${RELEASE_REF}. Packing now would ship a tarball\n` +
    `  missing work already on the release branch — this is how 0.1.161 lost the thumbnail crop.\n\n` +
    missing.map((l) => `      ${l}`).join('\n') +
    `\n\n  Rebase onto ${RELEASE_REF} first, or pass --allow-behind if this is deliberate.`;
  if (allowBehind) console.warn(`\n  ! ${msg}\n`); else die(msg);
} else {
  ok(`contains everything on ${RELEASE_REF}`);
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
