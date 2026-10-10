/* ── Which build of the designer is this? ────────────────────────────────────────────────────────
 *
 * A template is data, but it does not render itself — it renders on whatever build of
 * `@spattoo/designer` the viewer happens to be running, and those diverge two ways at once: prod
 * web trails dev because production is a deliberate deploy, and once the app is in the stores a
 * phone carries whatever build it last updated to. A catalogued template therefore has to be able
 * to say which renderer it needs, and nothing could say that while core could not name itself.
 *
 * ⚠️ WRITTEN BY `npm version`, NOT BY HAND. `scripts/stamp-build.mjs` runs as the `version`
 * lifecycle script — after the bump, before the commit — and stages this file, so it lands inside
 * the same `chore(release)` commit as package.json. `buildId.test.js` fails if the two ever
 * disagree, which is what catches a hand edit or a stamp that did not run.
 *
 * ⚠️ IT CANNOT TELL YOU WHETHER THIS IS A RELEASE, AND THE SPEC THAT SAID IT COULD WAS WRONG.
 * `pack-vendor.mjs` requires the tarball's `src/` to be byte-identical to `git archive HEAD src`,
 * so a `released: true` injected at pack time would fail that guard — and a value COMMITTED here
 * cannot distinguish a tarball from source either, because immediately after a release the working
 * tree carries this very file and then moves ahead of it. The information does not exist in core.
 *
 * It exists in the consumer. `spattoo-admin/vite.config.js` aliases `@spattoo/designer` to core's
 * src when the sibling checkout is present, so admin — and only admin — knows it is running source
 * rather than the vendored tarball. It derives that from the same `existsSync` that picks the
 * alias, so the two cannot drift apart.
 *
 * So read `version` as "the version this code was last released AS". For a tarball that is exact.
 * For a working tree it is a floor, and the consumer is responsible for knowing the difference.
 */
export const BUILD = { version: '0.1.677' };
