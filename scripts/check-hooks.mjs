#!/usr/bin/env node
// ── check:hooks — no hook below an early return ─────────────────────────────────────────────────
//
// Catches ONE mistake, because this codebase has now shipped it twice from the same file:
//
//   function Storefront() {
//     const [x] = useState();
//     if (loading) return <Spinner />;      // ← early return
//     const y = useCallback(...);           // ← never runs on the loading render
//   }
//
// The first render bails at the early return and calls 3 hooks; the second calls 4. React aborts
// the whole tree with "Rendered more hooks than during the previous render" (minified #310) and the
// user sees "Something went wrong", not a hint about hooks.
//
// ── WHY A SCRIPT AND NOT ESLINT ─────────────────────────────────────────────────────────────────
// react-hooks/rules-of-hooks is the proper tool and would catch this. It also brings eslint, a
// config, and a first run over a 7,500-line CakeDesigner.jsx that would report far more than
// anybody will fix today. This guard is the 5% of that rule which has actually bitten us, it runs
// in `npm run verify` with the other check:* guards, and it does not stand in the way of adopting
// the real thing later.
//
// ── WHY BUILD AND TEST DO NOT CATCH IT ──────────────────────────────────────────────────────────
// The code is valid JavaScript, so it builds. The dev harnesses mount leaf components directly, so
// the early-returning container never renders. It surfaces only when a real app loads the real
// component — which is the most expensive place to find it.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from '@babel/parser';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

/** Every .js/.jsx under src/, skipping tests — a test may legitimately do odd things. */
function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { files(p, out); continue; }
    if (/\.(jsx?|mjs)$/.test(name) && !/\.test\.[jm]sx?$/.test(name)) out.push(p);
  }
  return out;
}

const isHookCall = (node) => {
  if (node?.type !== 'CallExpression') return null;
  const c = node.callee;
  const name = c?.type === 'Identifier' ? c.name
             : c?.type === 'MemberExpression' && c.property?.type === 'Identifier' ? c.property.name
             : null;
  return name && /^use[A-Z]/.test(name) ? name : null;
};

const FN = ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'];

/**
 * Depth-first walk over every child node.
 *
 * `skipNested` stops at function boundaries, and both callers need it. A `return` inside a callback
 * exits the CALLBACK, not the component — treating it as an early return reported four phantom
 * findings in CakeDesigner, whose DEV block assigns a handful of arrow functions to `window`.
 */
function walk(node, fn, { skipNested = false } = {}, depth = 0) {
  if (!node || typeof node.type !== 'string') return;
  if (skipNested && depth > 0 && FN.includes(node.type)) return;
  fn(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach(n => walk(n, fn, { skipNested }, depth + 1));
    else if (v && typeof v.type === 'string') walk(v, fn, { skipNested }, depth + 1);
  }
}

/** Does this top-level statement return without running the rest of the body? */
function isEarlyReturn(stmt) {
  if (stmt.type === 'ReturnStatement') return true;
  if (stmt.type !== 'IfStatement') return false;
  let found = false;
  for (const branch of [stmt.consequent, stmt.alternate]) {
    walk(branch, n => { if (n.type === 'ReturnStatement') found = true; }, { skipNested: true });
  }
  return found;
}

const findings = [];

for (const file of files(SRC)) {
  const src = readFileSync(file, 'utf8');
  // Cheap skip: no hooks, nothing to say.
  if (!/\buse[A-Z]/.test(src)) continue;

  let ast;
  try {
    ast = parse(src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true });
  } catch (err) {
    console.error(`  ! could not parse ${relative(ROOT, file)}: ${err.message}`);
    process.exitCode = 1;
    continue;
  }

  walk(ast, (node) => {
    // `const Foo = () => {}` has no node.id, so the name is stamped on the way past the declarator —
    // the walk visits it before descending into the function. Without this, every arrow component
    // in the codebase is silently skipped and the guard quietly checks half of what it claims to.
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier'
        && FN.includes(node.init?.type)) {
      node.init.__inferredName = node.id.name;
    }

    if (!FN.includes(node.type) || node.body?.type !== 'BlockStatement') return;

    // Only components and custom hooks have the rule. A plain helper that happens to early-return is
    // not interesting, and flagging it would make the guard noise.
    const name = node.id?.name ?? node.__inferredName;
    if (!name || !/^([A-Z]|use[A-Z])/.test(name)) return;

    const body = node.body.body;
    const exitAt = body.findIndex(isEarlyReturn);
    if (exitAt === -1) return;

    // Everything after the first early return: any hook here runs conditionally. Nested functions
    // are skipped — a hook inside a callback or an inline component belongs to THAT function's hook
    // order, not this one's.
    for (const stmt of body.slice(exitAt + 1)) {
      walk(stmt, (n) => {
        const hook = isHookCall(n);
        if (!hook) return;
        findings.push({
          file: relative(ROOT, file),
          line: n.loc.start.line,
          fn: name,
          hook,
          exitLine: body[exitAt].loc.start.line,
        });
      }, { skipNested: true });
    }
  });
}

if (findings.length) {
  console.error('✗ check:hooks — hook called below an early return (React #310 at runtime):\n');
  for (const f of findings) {
    console.error(`   ${f.file}:${f.line}`);
    console.error(`     ${f.hook}() in ${f.fn}(), after the early return on line ${f.exitLine}`);
    console.error(`     → move it above line ${f.exitLine}\n`);
  }
  console.error('   A hook skipped on one render and called on the next changes the hook order,');
  console.error('   which React treats as fatal — the whole tree unmounts to an error boundary.');
  process.exit(1);
}

console.log('✓ check:hooks — no hook is called below an early return');
