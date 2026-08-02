#!/usr/bin/env node
// ── Cut a core release and vendor it into spattoo-web, in one command ───────────────────────────
//
// Shipping a core change is SEVEN steps across two repos, and every one of them has to happen or
// production quietly serves the old bundle:
//
//   rebase → verify → bump → push commit+tag → pack → bump the tarball name in web → install → commit
//
// Done by hand, the failure is never "it broke". It is "it deployed and nothing changed", which
// looks like the code not working and sends you debugging the wrong thing.
//
// ── WHAT THIS ADDS OVER `npm run pack:vendor` ──────────────────────────────────────────────────
// pack:vendor already refuses to produce a tarball that cannot be trusted — dirty tree, behind
// origin/dev, a version already vendored, and a byte-diff of the tarball against `git archive`.
// It guards the ARTIFACT. This guards the PROCESS around it, and closes the one hole neither the
// script nor a careful human covers:
//
//   VERSION COLLISION. `npm version patch` increments the LOCAL package.json and asks nobody.
//   Two sessions working the same afternoon both read 0.1.192, both cut 0.1.193, and the second
//   push is rejected — after the tag exists locally, so it has to be deleted and re-cut by hand.
//   That happened twice in one day. The next version here is derived from the highest version
//   that EXISTS ON THE REMOTE, not from the local file, so a parallel release is picked up and
//   stepped over instead of collided with.
//
// Usage:
//   npm run release                      patch bump, vendor into ../spattoo-web-ai-credits
//   npm run release -- --minor           minor bump
//   npm run release -- --web <path>      a web checkout somewhere else
//   npm run release -- --dry-run         print the plan, change nothing
//   npm run release -- --no-push         do everything locally, push by hand
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CORE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt  = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };

const DRY      = flag('--dry-run');
const NO_PUSH  = flag('--no-push');
const BUMP     = flag('--minor') ? 'minor' : flag('--major') ? 'major' : 'patch';
const WEB      = resolve(opt('--web', join(CORE, '..', 'spattoo-web-ai-credits')));
const REF      = process.env.SPATTOO_RELEASE_REF || 'origin/dev';
const BRANCH   = REF.replace(/^origin\//, '');

const sh  = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim();
const run = (cmd, args, cwd) => {
  if (DRY) { console.log(`  · would run: ${cmd} ${args.join(' ')}   (${cwd === CORE ? 'core' : 'web'})`); return ''; }
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
};
const die  = (m) => { console.error(`\n✗ release — ${m}\n`); process.exit(1); };
const ok   = (m) => console.log(`  ✓ ${m}`);
const step = (m) => console.log(`\n${m}`);

// ── 0. both repos exist and are clean ──────────────────────────────────────────────────────────
// Checked for WEB too, and up front. Discovering a dirty web checkout after core is already
// tagged and pushed leaves a released version nothing consumes — recoverable, but only by hand.
if (!existsSync(WEB)) die(`no web checkout at ${WEB}\n  pass one with --web <path>`);
for (const [label, dir] of [['core', CORE], ['web', WEB]]) {
  if (sh('git', ['status', '--porcelain'], dir)) {
    die(`${label} has uncommitted changes. Commit them first — a release must correspond to a commit.`);
  }
}
ok('both checkouts are clean');

// ── 1. take everything already on the release branch ───────────────────────────────────────────
// Rebase rather than merge, and rebase FIRST: the version is computed from the remote below, and
// computing it before catching up would read a stale list of tags.
step(`Syncing with ${REF}`);
run('git', ['fetch', 'origin', BRANCH, '--tags'], CORE);
if (!DRY) {
  try {
    execFileSync('git', ['rebase', REF], { cwd: CORE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    execFileSync('git', ['rebase', '--abort'], { cwd: CORE, stdio: 'ignore' });
    die(`core does not rebase cleanly onto ${REF}.\n` +
        `  Resolve it by hand, then run release again:\n    git -C ${CORE} rebase ${REF}`);
  }
}
ok(`core rebased onto ${REF}`);

// ── 2. the next version, derived from the REMOTE ───────────────────────────────────────────────
// The collision fix. The local package.json only knows what THIS session has done; the tags on
// origin know what everyone has done. Taking the max of the two means a parallel release is
// stepped over rather than collided with.
const pkgPath = join(CORE, 'package.json');
const pkg     = JSON.parse(readFileSync(pkgPath, 'utf8'));
const parse   = (v) => (String(v).match(/^v?(\d+)\.(\d+)\.(\d+)$/) || []).slice(1).map(Number);
const cmp     = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);

const remoteVersions = sh('git', ['ls-remote', '--tags', 'origin'], CORE)
  .split('\n')
  .map(l => l.split('refs/tags/')[1])
  .filter(Boolean)
  .map(t => t.replace(/\^\{\}$/, ''))
  .map(parse).filter(v => v.length === 3);

const localV  = parse(pkg.version);
const highest = [localV, ...remoteVersions].sort(cmp).at(-1);
if (cmp(highest, localV) > 0) {
  console.log(`  ! origin already has v${highest.join('.')} — another session released while you worked.`);
  console.log('    Stepping over it rather than colliding with it.');
}
const [MA, MI, PA] = highest;
const next = BUMP === 'major' ? [MA + 1, 0, 0] : BUMP === 'minor' ? [MA, MI + 1, 0] : [MA, MI, PA + 1];
const VERSION = next.join('.');
ok(`next version ${VERSION}  (local ${pkg.version}, highest on origin ${highest.join('.')})`);

// ── 3. verify BEFORE stamping a version ────────────────────────────────────────────────────────
// A failed verify after the bump leaves a version commit for a release that never happened.
step('Verifying');
if (DRY) console.log('  · would run: npm run verify');
else execFileSync('npm', ['run', 'verify'], { cwd: CORE, stdio: ['ignore', 'ignore', 'inherit'] });
ok('verify passed');

// ── 4. bump, tag, push commit and tag TOGETHER ─────────────────────────────────────────────────
step(`Releasing ${VERSION}`);
// `npm version <exact>` rather than `npm version patch`, so the number computed above is the
// number stamped — patch would silently re-derive it from the local file we just decided not to
// trust.
run('npm', ['version', VERSION, '-m', `chore(release): %s`], CORE);
if (!NO_PUSH) {
  // --atomic so the branch and the tag land together or not at all. Pushed separately, a rejected
  // branch push leaves a tag on origin pointing at a commit nobody has — which is exactly the
  // state that needed untangling by hand today.
  run('git', ['push', '--atomic', 'origin', `HEAD:${BRANCH}`, `v${VERSION}`], CORE);
  ok(`pushed core + tag v${VERSION}`);
} else {
  ok(`tagged v${VERSION} locally (--no-push)`);
}

// ── 5. pack — with its own guards, which are not repeated here ─────────────────────────────────
step('Packing');
if (DRY) console.log(`  · would run: npm run pack:vendor -- ${join(WEB, 'vendor')}`);
else execFileSync('npm', ['run', 'pack:vendor', '--', join(WEB, 'vendor')], { cwd: CORE, stdio: ['ignore', 'ignore', 'inherit'] });
ok(`vendored spattoo-designer-${VERSION}.tgz`);

// ── 6. point web at it ─────────────────────────────────────────────────────────────────────────
// The step most often forgotten by hand, and the one whose omission is invisible: web keeps
// building, keeps deploying, and keeps serving the previous core.
step('Updating web');
run('git', ['fetch', 'origin', BRANCH], WEB);
if (!DRY) {
  try {
    execFileSync('git', ['rebase', `origin/${BRANCH}`], { cwd: WEB, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    execFileSync('git', ['rebase', '--abort'], { cwd: WEB, stdio: 'ignore' });
    die(`web does not rebase cleanly onto origin/${BRANCH}.\n` +
        `  Core ${VERSION} IS pushed; finish web by hand:\n` +
        `    git -C ${WEB} rebase origin/${BRANCH}\n` +
        `    then point apps/app/package.json at spattoo-designer-${VERSION}.tgz, npm install, commit, push`);
  }
}

const webPkgPath = join(WEB, 'apps', 'app', 'package.json');
const webPkgRaw  = readFileSync(webPkgPath, 'utf8');
const bumped     = webPkgRaw.replace(/spattoo-designer-\d+\.\d+\.\d+\.tgz/g, `spattoo-designer-${VERSION}.tgz`);
if (bumped === webPkgRaw) {
  die(`apps/app/package.json does not reference a vendored spattoo-designer tarball.\n` +
      '  Expected "@spattoo/designer": "file:../../vendor/spattoo-designer-<version>.tgz".');
}
if (!DRY) writeFileSync(webPkgPath, bumped);
ok(`apps/app/package.json → spattoo-designer-${VERSION}.tgz`);

// npm install is what rewrites package-lock's integrity hash for the new tarball. Skipping it is
// the classic "works locally, dies on Vercel with a cold cache" — see LINKING.md.
if (DRY) console.log('  · would run: npm install   (web)');
else execFileSync('npm', ['install'], { cwd: WEB, stdio: ['ignore', 'ignore', 'inherit'] });
ok('npm install — package-lock integrity rewritten');

run('git', ['add', '-A'], WEB);
run('git', ['commit', '-m', `chore(app): vendor ${VERSION}`], WEB);
if (!NO_PUSH) {
  run('git', ['push', 'origin', `HEAD:${BRANCH}`], WEB);
  ok(`pushed web`);
}

// ── done ───────────────────────────────────────────────────────────────────────────────────────
console.log(`\n${DRY ? '· DRY RUN — nothing changed' : `✓ released ${VERSION}`}`);
if (!DRY && NO_PUSH) {
  console.log(`\n  Not pushed. To finish:\n` +
              `    git -C ${CORE} push --atomic origin HEAD:${BRANCH} v${VERSION}\n` +
              `    git -C ${WEB} push origin HEAD:${BRANCH}`);
}
