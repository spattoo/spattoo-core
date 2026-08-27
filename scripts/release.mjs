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
//
// ── --skip-admin ────────────────────────────────────────────────────────────────────────────────
// Releasing both together is the right default and the paragraph above is why. But a consumer can
// be genuinely UNAVAILABLE: somebody else mid-change on a feature branch with a dirty tree, which
// the "all checkouts are clean" preflight rejects — correctly, and it then blocks a web release that
// has nothing to do with admin. Waiting for another person's branch to land is not a release
// policy.
//
// So it can be skipped, explicitly and never by default, and the run says loudly what it leaves
// behind: admin goes on vendoring the previous tarball until somebody releases again. That is the
// invisible-staleness the paragraph above warns about, which is exactly why it is announced rather
// than merely allowed.
const SKIP_ADMIN = flag('--skip-admin');
const TARGETS = [
  { label: 'web',   dir: WEB,   pkg: ['apps', 'app', 'package.json'], scope: 'app'   },
  ...(SKIP_ADMIN ? [] : [{ label: 'admin', dir: ADMIN, pkg: ['package.json'], scope: 'admin' }]),
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
// Not an error — the release is fine. Something the person running it has to DO afterwards.
const warn = (m) => console.log(`  ! ${m}`);
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
if (SKIP_ADMIN) {
  warn('--skip-admin: spattoo-admin is NOT being updated and will go on vendoring the PREVIOUS');
  warn('  tarball until the next full release. It aliases core\'s source locally, so nobody will');
  warn('  notice by using it — only a deploy would. Release again without this flag when the admin');
  warn('  checkout is free.');
}

// ── 0c. nobody is running a dev server we are about to pull the rug from under ──────────────────
// Clearing node_modules/.vite (see "Vite's pre-bundled dependency cache" below) is REQUIRED and
// breaks any dev server already running: it goes on serving dep URLs stamped with the hash it
// booted with, the files behind them are gone, and every one 504s. What reaches the screen is
// "Failed to fetch dynamically imported module" and a blank page — nothing that says "cache", and
// nothing a reload fixes.
//
// This used to be a warning printed at the moment of clearing. It was accurate, it was ignored, and
// the evening it mattered it scrolled past in the middle of a long release and cost half an hour of
// hunting a bug that did not exist. A warning you can miss is not a guard; it is a note explaining
// the damage afterwards.
//
// So it STOPS, before anything is bumped, tagged or installed. The escape hatch is real but has to
// be TYPED — `--keep-dev-servers` — because a bypass you choose is a different thing from a line
// you scrolled past.
function devPort(dir) {
  // The port the consumer pins in its own config; Vite's default otherwise.
  for (const f of ['vite.config.js', 'vite.config.mjs', 'vite.config.ts']) {
    const p = join(dir, f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/server\s*:\s*\{[^}]*?port\s*:\s*(\d+)/s);
    if (m) return Number(m[1]);
  }
  return 5173;
}
// Whoever holds the port. `lsof` rather than a bare connect, because naming the pid is the
// difference between "something is running" and a line you can act on without hunting for it.
// `lsof -ti` EXITS 1 when nothing holds the port, which is the ordinary case — and `sh` throws on a
// non-zero exit, so calling it bare would crash every release where no dev server is running. The
// catch also covers a machine without lsof: this guard failing open is right, since a release that
// cannot run because its optional safety check is unavailable is worse than the thing it guards.
function holders(port) {
  // -sTCP:LISTEN, and it is not optional. Without it lsof reports every ESTABLISHED socket on the
  // port too — so an open browser TAB counts as a dev server, and a release is refused because
  // somebody is looking at the app. Only the process holding the listening socket is one.
  let out = '';
  try { out = sh('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN']); } catch { return []; }
  return out.split('\n').map(s => s.trim()).filter(Boolean);
}
if (!flag('--keep-dev-servers')) {
  const live = TARGETS
    .map(t => ({ t, port: devPort(t.dir), pids: holders(devPort(t.dir)) }))
    .filter(x => x.pids.length);
  if (live.length) {
    const lines = live.map(x => `    ${x.t.label}  port ${x.port}  pid ${x.pids.join(', ')}`).join('\n');
    die('a dev server is running for a consumer this release will re-install.\n'
      + lines + '\n\n'
      + '  This release clears each consumer\'s node_modules/.vite, which those servers are\n'
      + '  currently serving out of. Carrying on leaves them 504ing on every dependency and\n'
      + '  showing a blank screen, and a reload does NOT fix it — only a restart does.\n\n'
      + '  Stop them and run again, or keep them and take the restart on yourself:\n'
      + '      npm run release -- --keep-dev-servers   (then restart each server afterwards)');
  }
  ok('no dev server is holding a consumer\'s dep cache');
}

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
  //
  // ── AND IT HAS TO BE SAID OUT LOUD ────────────────────────────────────────────────────────────
  // Clearing this under a RUNNING dev server breaks it. The server keeps serving dep URLs stamped
  // with the hash it started with, the files behind them are gone, and every one 504s with
  // "Outdated Optimize Dep" — which surfaces as a blank screen and "Failed to fetch dynamically
  // imported module", nothing that names a cache. A restart fixes it in two seconds and is
  // impossible to guess.
  //
  // The cache existing is the tell: Vite creates it at startup, so if it is here, a server has run
  // since the last clear and may still be running. If it is not here, nobody needs telling.
  const viteCache = join(t.dir, 'node_modules', '.vite');
  const hadCache = existsSync(viteCache);
  if (DRY) console.log(`  · would clear: ${viteCache}`);
  else rmSync(viteCache, { recursive: true, force: true });
  if (hadCache) {
    ok("cleared Vite's dep cache — it ignores a changed tarball behind an unchanged spec");
    warn(`RESTART any running dev server for ${t.label} — until you do it will 504 with `
       + `"Outdated Optimize Dep" and show a blank screen`);
  }

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
