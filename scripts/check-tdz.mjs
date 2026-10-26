#!/usr/bin/env node
/* ── Is a `const` read before the line that declares it? ─────────────────────────────────────────
 *
 * ⚠️ THIS HAS NOW SHIPPED THREE TIMES, and the third one took the live app down. `const` and `let`
 * are NOT hoisted the way `var` and `function` are: the name exists from the top of the block but
 * reading it before its declaration runs throws `ReferenceError: Cannot access 'x' before
 * initialization` — minified to something like `Cannot access 'e_' before initialization`, which is
 * what a baker saw behind "Something went wrong."
 *
 *   • `footX` in DraggableTopSticker, read fifty lines above its declaration.
 *   • the same shape in LibraryPanel.
 *   • `orbited` in 0.1.773 — declared beside the `flat*` terms, called from the UPRIGHT return
 *     eighty lines earlier, so every cake carrying a standing decoration went black.
 *
 * ⚠️ `check:bindings` CANNOT CATCH IT AND IS NOT MEANT TO. It asks whether a name is declared; all
 * three were. The question that matters is WHERE, relative to the read, and that needs a parser
 * rather than a regex — which is why this gate is the one place in scripts/ that builds an AST.
 *
 * ⚠️ A REFERENCE INSIDE A NESTED FUNCTION IS FINE, and getting that wrong is how a gate like this
 * becomes noise. `const f = n => n ? f(n - 1) : 1` reads `f` above its own declaration and is
 * correct, because the body runs later. So the rule is: flag a read only when it sits in the SAME
 * function as the declaration and earlier in the source. A JSX attribute in a `return` is in the
 * same function — that is exactly the `orbited` case — while an event handler or a callback is not.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

let parse;
try {
  ({ parse } = await import('@babel/parser'));
} catch {
  console.error('✗ check:tdz — @babel/parser is not resolvable, so nothing was checked.');
  console.error('  Fix the dependency rather than deleting the gate: a check that cannot run must');
  console.error('  fail, not quietly pass. `npm i -D @babel/parser` restores it.');
  process.exit(1);
}

const ROOT = process.cwd();
const files = [];
(function walkDir(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkDir(full);
    else if (/\.(js|jsx|mjs)$/.test(name)) files.push(full);
  }
})(join(ROOT, 'src'));

/* Places an Identifier is a NAME rather than a read of a value. Missing one of these is a false
   positive, and a gate that cries wolf gets deleted — see check-bindings' own note. */
function skipKey(parentType, key, parent, node) {
  if (key === 'key' && !parent.computed) return true;                     // { foo: 1 }, class foo() {}
  if (key === 'property' && !parent.computed) return true;                // a.foo
  if (parentType === 'MemberExpression' && key === 'property') return true;
  if (parentType === 'JSXAttribute' && key === 'name') return true;
  if (parentType.startsWith('Import') || parentType.startsWith('Export')) return true;
  if (parentType === 'ObjectProperty' && key === 'key' && !parent.computed) return true;
  if (parentType === 'LabeledStatement' || parentType === 'BreakStatement'
      || parentType === 'ContinueStatement') return true;
  // A declaration's own binding identifiers are declarations, not reads.
  if (parentType === 'VariableDeclarator' && key === 'id') return true;
  if (key === 'params') return true;
  if ((parentType === 'FunctionDeclaration' || parentType === 'FunctionExpression'
       || parentType === 'ClassDeclaration' || parentType === 'ClassExpression') && key === 'id') return true;
  return false;
}

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
  'ClassMethod', 'ObjectMethod', 'ClassPrivateMethod',
]);

/** Every name bound by a destructuring pattern or a plain identifier. */
function patternNames(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  switch (node.type) {
    case 'Identifier': out.push(node.name); break;
    case 'ObjectPattern': for (const pr of node.properties) patternNames(pr.value ?? pr.argument, out); break;
    case 'ArrayPattern': for (const el of node.elements) patternNames(el, out); break;
    case 'AssignmentPattern': patternNames(node.left, out); break;
    case 'RestElement': patternNames(node.argument, out); break;
    default: break;
  }
  return out;
}

const problems = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parse(src, {
      sourceType: 'module',
      plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator',
                'topLevelAwait', 'dynamicImport'],
    });
  } catch (e) {
    console.error(`✗ check:tdz — could not parse ${relative(ROOT, file)}: ${e.message}`);
    process.exit(1);
  }

  /* A scope is { bindings: Map(name -> start), funcDepth }. `funcDepth` is what separates a read
     that runs now from one that runs later: same depth means the same function body. */
  const scopes = [];
  const pushScope = (funcDepth) => scopes.push({ bindings: new Map(), funcDepth });
  const popScope = () => scopes.pop();

  // Two passes per block: declare this block's const/let first (they are in scope throughout the
  // block, just not yet initialised), then walk, so a read ABOVE the declaration still resolves.
  function hoistInto(scope, body) {
    // ⚠️ NOT ALWAYS A LIST. A CatchClause's `body` is a single BlockStatement, and iterating it
    // threw — the block itself is visited in turn, so there is simply nothing to hoist here.
    if (!Array.isArray(body)) return;
    for (const stmt of body) {
      if (stmt?.type === 'VariableDeclaration' && stmt.kind !== 'var') {
        for (const d of stmt.declarations) {
          for (const n of patternNames(d.id)) scope.bindings.set(n, d.id.start);
        }
      }
    }
  }

  function walk(node, parent, key, funcDepth) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const c of node) walk(c, parent, key, funcDepth); return; }
    if (!node.type) return;

    const isFn = FUNCTION_TYPES.has(node.type);
    const depth = isFn ? funcDepth + 1 : funcDepth;

    if (node.type === 'Identifier') {
      if (parent && skipKey(parent.type, key, parent, node)) return;
      if (parent?.type === 'ObjectProperty' && key === 'key' && !parent.computed) return;
      for (let i = scopes.length - 1; i >= 0; i--) {
        const sc = scopes[i];
        const declStart = sc.bindings.get(node.name);
        if (declStart === undefined) continue;
        // Found the binding. Only a read in the SAME function, earlier in the file, can throw.
        if (sc.funcDepth === funcDepth && node.start < declStart) {
          problems.push({
            file: relative(ROOT, file), name: node.name,
            readLine: src.slice(0, node.start).split('\n').length,
            declLine: src.slice(0, declStart).split('\n').length,
          });
        }
        return;
      }
      return;
    }

    /* ⚠️ A `for` HEADER IS ITS OWN SCOPE, and forgetting that is what made the first run of this
       gate report five phantoms. `for (const k of …)` binds `k` to the loop; a LATER `const k` in
       the same function body is a different variable entirely. Without a scope here the loop's `k`
       resolved to that later one and read as a use-before-declare — a confident warning about code
       that has always run fine, which is precisely how a gate earns its deletion. */
    const opensLoop = node.type === 'ForStatement' || node.type === 'ForOfStatement'
      || node.type === 'ForInStatement';
    const opensBlock = node.type === 'BlockStatement' || node.type === 'Program'
      || node.type === 'StaticBlock' || node.type === 'CatchClause';
    if (opensLoop) {
      pushScope(depth);
      const head = node.init ?? node.left;
      if (head?.type === 'VariableDeclaration' && head.kind !== 'var') {
        for (const d of head.declarations) {
          for (const n of patternNames(d.id)) scopes[scopes.length - 1].bindings.set(n, -1);
        }
      }
    } else if (opensBlock) {
      pushScope(depth);
      hoistInto(scopes[scopes.length - 1], node.body ?? []);
      if (node.type === 'CatchClause' && node.param) {
        for (const n of patternNames(node.param)) scopes[scopes.length - 1].bindings.set(n, -1);
      }
    } else if (isFn) {
      // Parameters live in their own scope and are initialised before the body runs.
      pushScope(depth);
      for (const prm of node.params ?? []) {
        for (const n of patternNames(prm)) scopes[scopes.length - 1].bindings.set(n, -1);
      }
    }

    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'range' || k === 'leadingComments'
          || k === 'trailingComments' || k === 'innerComments' || k === 'extra') continue;
      walk(node[k], node, k, depth);
    }

    if (opensLoop || opensBlock || isFn) popScope();
  }

  walk(ast.program, null, null, 0);
}

if (problems.length) {
  console.error('✗ check:tdz — a `const` or `let` is read above the line that declares it.\n');
  console.error('  `const` is not hoisted. This throws "Cannot access \'x\' before initialization"');
  console.error('  at RUN time — it builds, it deploys, and the screen goes black. Move the');
  console.error('  declaration ABOVE every use in the same function.\n');
  const seen = new Set();
  for (const p of problems) {
    const k = `${p.file}:${p.name}:${p.readLine}`;
    if (seen.has(k)) continue;
    seen.add(k);
    console.error(`  ${p.file}:${p.readLine}  reads \`${p.name}\`, declared at line ${p.declLine}`);
  }
  console.error('');
  process.exit(1);
}

console.log(`✓ check:tdz — no value is read before it is initialised (${files.length} files)`);
