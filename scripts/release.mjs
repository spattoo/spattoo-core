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
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
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
const ADMIN    = resolve(opt('--admin', join(CORE, '..', 'spattoo-admin')));

// ── Every consumer of the tarball, released together ──────────────────────────────────────────
// Two repos vendor core, and a release that updates one leaves the other serving the previous
// version — building fine, deploying fine, silently old. Which is exactly the failure this script
// already guards against for web ("the step most often forgotten by hand, and the one whose
// omission is invisible"); admin has the same shape and was simply not in the list.
//
// Admin is worse in one respect: its vite config aliases @spattoo/designer to core's SOURCE when
// core is checked out beside it, so a developer never runs the vendored tarball and cannot notice
// a stale one by using the app. Only a deploy would show it.
//
//   pkg    — the package.json holding the tarball reference, relative to the repo root
//   scope  — the commit-message scope, so history reads chore(app): / chore(admin):
const TARGETS = [
  { label: 'web',   dir: WEB,   pkg: ['apps', 'app', 'package.json'], scope: 'app'   },
  { label: 'admin', dir: ADMIN, pkg: ['package.json'],                scope: 'admin' },
];
const REF      = process.env.SPATTOO_RELEASE_REF || 'origin/dev';
const BRANCH   = REF.replace(/^origin\//, '');

const sh  = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim();
const run = (cmd, args, cwd) => {
  if (DRY) {
    // Names the ACTUAL repo. It said 'web' for everything, which during a dry run of a two-consumer
    // release is the one thing you are checking.
    const where = cwd === CORE ? 'core' : (TARGETS.find(t => t.dir === cwd)?.label ?? cwd);
    console.log(`  · would run: ${cmd} ${args.join(' ')}   (${where})`);
    return '';
  }
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
};
const die  = (m) => { console.error(`\n✗ release — ${m}\n`); process.exit(1); };
const ok   = (m) => console.log(`  ✓ ${m}`);
const step = (m) => console.log(`\n${m}`);

// ── 0. both repos exist and are clean ──────────────────────────────────────────────────────────
// Checked for every CONSUMER too, and up front. Discovering a dirty checkout after core is already
// tagged and pushed leaves a released version something does not consume — recoverable, but only by
// hand, and only if you notice.
for (const t of TARGETS) {
  if (!existsSync(t.dir)) die(`no ${t.label} checkout at ${t.dir}\n  pass one with --${t.label} <path>`);
}
for (const [label, dir] of [['core', CORE], ...TARGETS.map(t => [t.label, t.dir])]) {
  if (sh('git', ['status', '--porcelain'], dir)) {
    die(`${label} has uncommitted changes. Commit them first — a release must correspond to a commit.`);
  }
}
ok(`all ${TARGETS.length + 1} checkouts are clean`);

// ── 0b. web is caught up too, BEFORE anything is bumped ────────────────────────────────────────
// This used to live down in "Updating web", after core was tagged and pushed and after packing —
// and it could not work there, because packing DIRTIES web: pack:vendor writes the new tarball and
// (since the prune) deletes old ones, and `git rebase` refuses on a dirty tree. It only ever passed
// because an untracked tarball alone is something rebase tolerates; the moment a tracked file was
// deleted too, every release died here with core already pushed.
//
// Doing it now costs nothing and fails cheaply: no bump, no tag, no push, nothing to unwind. It
// also means the version below is computed against a web checkout that is already current.
step(`Syncing consumers with origin/${BRANCH}`);
for (const t of TARGETS) {
  run('git', ['fetch', 'origin', BRANCH], t.dir);
  if (!DRY) {
    try {
      execFileSync('git', ['rebase', `origin/${BRANCH}`], { cwd: t.dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      try { execFileSync('git', ['rebase', '--abort'], { cwd: t.dir, stdio: 'ignore' }); } catch { /* none in progress */ }
      die(`${t.label} does not rebase cleanly onto origin/${BRANCH}.\n` +
          `  Nothing has been released — resolve it and run again:\n` +
          `    git -C ${t.dir} rebase origin/${BRANCH}`);
    }
  }
  ok(`${t.label} is up to date`);
}

// ── 1. take everything already on the release branch ───────────────────────────────────────────
// Rebase rather than merge, and rebase FIRST: the version is computed from the remote below, and
// computing it before catching up would read a stale list of tags.
step(`Syncing with ${REF}`);
run('git', ['fetch', 'origin', BRANCH, '--tags'], CORE);
if (!DRY) {
  try {
    execFileSync('git', ['rebase', REF], { cwd: CORE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    // Swallowed: `rebase --abort` FAILS when no rebase is in progress, which is exactly the case
    // when the rebase was refused outright (a dirty tree) rather than stopped on a conflict. An
    // unguarded abort throws from inside the handler that exists to explain the problem, and the
    // explanation is replaced by a raw execFileSync dump.
    try { execFileSync('git', ['rebase', '--abort'], { cwd: CORE, stdio: 'ignore' }); } catch { /* none in progress */ }
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
for (const t of TARGETS) {
  if (DRY) console.log(`  · would run: npm run pack:vendor -- ${join(t.dir, 'vendor')}`);
  else execFileSync('npm', ['run', 'pack:vendor', '--', join(t.dir, 'vendor')], { cwd: CORE, stdio: ['ignore', 'ignore', 'inherit'] });
  ok(`vendored spattoo-designer-${VERSION}.tgz → ${t.label}`);
}

// ── 6. point web at it ─────────────────────────────────────────────────────────────────────────
// The step most often forgotten by hand, and the one whose omission is invisible: web keeps
// building, keeps deploying, and keeps serving the previous core. (Web was rebased back at 0b, on a
// clean tree — packing has dirtied it by now.)
for (const t of TARGETS) {
  step(`Updating ${t.label}`);
  const pkgPath = join(t.dir, ...t.pkg);
  const raw     = readFileSync(pkgPath, 'utf8');
  const bumped  = raw.replace(/spattoo-designer-\d+\.\d+\.\d+\.tgz/g, `spattoo-designer-${VERSION}.tgz`);
  if (bumped === raw) {
    die(`${t.label}: ${t.pkg.join('/')} does not reference a vendored spattoo-designer tarball.\n` +
        '  Expected "@spattoo/designer": "file:…/vendor/spattoo-designer-<version>.tgz".');
  }
  if (!DRY) writeFileSync(pkgPath, bumped);
  ok(`${t.pkg.join('/')} → spattoo-designer-${VERSION}.tgz`);

  // npm install is what rewrites package-lock's integrity hash for the new tarball. Skipping it is
  // the classic "works locally, dies on Vercel with a cold cache" — see LINKING.md.
  if (DRY) console.log(`  · would run: npm install   (${t.label})`);
  else execFileSync('npm', ['install'], { cwd: t.dir, stdio: ['ignore', 'ignore', 'inherit'] });
  ok('npm install — package-lock integrity rewritten');

  // ── Vite's pre-bundled dependency cache has to go with it ─────────────────────────────────────
  // Vite optimises dependencies into node_modules/.vite/deps and keys that cache on the dependency
  // SPEC, not on the file. `file:…/spattoo-designer-0.1.384.tgz` looks the same to it whatever the
  // tarball now contains — so a consumer's dev server goes on serving the bundle it built the first
  // time, across restarts, forever.
  //
  // It is not a theoretical risk. The admin's cache was ELEVEN DAYS old while four releases went
  // out: every one landed on disk, none reached the screen, and the only symptom was a feature that
  // "was not there". Restarting the server does not fix it, which is what makes it so expensive —
  // the obvious remedy is the one that does not work, so the search goes looking for a bug instead.
  //
  // Cheap to drop: Vite rebuilds it on the next boot in a second or two.
  const viteCache = join(t.dir, 'node_modules', '.vite');
  if (DRY) console.log(`  · would clear: ${viteCache}`);
  else rmSync(viteCache, { recursive: true, force: true });
  ok("cleared Vite's dep cache — it ignores a changed tarball behind an unchanged spec");

  run('git', ['add', '-A'], t.dir);
  run('git', ['commit', '-m', `chore(${t.scope}): vendor ${VERSION}`], t.dir);
  if (!NO_PUSH) {
    run('git', ['push', 'origin', `HEAD:${BRANCH}`], t.dir);
    ok(`pushed ${t.label}`);
  }
}

// ── done ───────────────────────────────────────────────────────────────────────────────────────
console.log(`\n${DRY ? '· DRY RUN — nothing changed' : `✓ released ${VERSION}`}`);
if (!DRY && NO_PUSH) {
  console.log(`\n  Not pushed. To finish:\n` +
              `    git -C ${CORE} push --atomic origin HEAD:${BRANCH} v${VERSION}\n` +
              TARGETS.map(t => `    git -C ${t.dir} push origin HEAD:${BRANCH}`).join('\n'));
}
