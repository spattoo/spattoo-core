/* ⚠️ THE STAMP AND THE PACKAGE MUST AGREE, OR EVERYTHING DOWNSTREAM BELIEVES A WRONG NUMBER.
 *
 * `BUILD.version` is written into buildId.js by scripts/stamp-build.mjs during `npm version`, and
 * a catalogued template's renderer floor is stamped from it. A hand edit, or a release where the
 * lifecycle script did not run, produces a tarball that confidently names the wrong version — and
 * nothing else in the system can tell, because a version string looks the same whether or not it
 * is true. This is the only thing that notices.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BUILD } from './buildId.js';

describe('the build stamp', () => {
  it('matches package.json — the stamp ran and nobody edited it by hand', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(BUILD.version).toBe(pkg.version);
  });

  it('is a plain x.y.z string, so a comparison can be numeric', () => {
    expect(BUILD.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
