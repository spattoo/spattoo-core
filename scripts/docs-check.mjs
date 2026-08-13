#!/usr/bin/env node
// ── Run a gate that lives in spattoo-docs ───────────────────────────────────────────────────────
//
// The docs repo is a SIBLING of this one, and `../spattoo-docs` only resolves when the process
// starts from the main checkout. From a git worktree (…/.claude/worktrees/<name>) it points at a
// directory that cannot exist, and `npm run check:occasions` died with a module-not-found stack —
// which is what happened the first time anyone worked in a worktree here.
//
// `.githooks/commit-msg` already solved this and says why: --git-common-dir is the shared .git of
// the repo whichever worktree you are standing in, so its parent is always the main checkout. This
// is that same resolution, in the one place the npm scripts can share (INVARIANTS #3) instead of
// two more copies of a fragile relative path.
//
// Usage: node scripts/docs-check.mjs <bin-name> [args…]
//   e.g. node scripts/docs-check.mjs check-occasions
//        node scripts/docs-check.mjs check-feature-docs --repo spattoo-core

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const [bin, ...rest] = process.argv.slice(2);
if (!bin) {
  console.error('✗ docs-check — missing gate name.\n  usage: node scripts/docs-check.mjs <bin-name> [args…]');
  process.exit(1);
}

const mainRoot = dirname(
  execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim(),
);
const docsDir = process.env.SPATTOO_DOCS_DIR || join(mainRoot, '..', 'spattoo-docs');
const script  = join(docsDir, 'bin', `${bin}.mjs`);

// Skip when the sibling repo simply is not on this machine — matching the commit-msg hook, so a
// checkout without spattoo-docs behaves the same whichever gate runs. This is the ONE case where a
// silent pass is right: the alternative is a repo that cannot be built by anyone who has not cloned
// a second one. A worktree is NOT that case, which is the whole point of resolving from the main
// checkout rather than the cwd.
if (!existsSync(script)) {
  console.log(`i spattoo-docs not found next to repo — skipping ${bin}`);
  process.exit(0);
}

try {
  execFileSync('node', [script, ...rest], { stdio: 'inherit' });
} catch (e) {
  process.exit(e.status ?? 1);
}
