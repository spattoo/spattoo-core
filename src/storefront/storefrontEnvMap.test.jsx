import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ── Every canvas must be told where the HDRI lives ──────────────────────────────────────────────
 *
 * `envProps` falls back to a drei PRESET when no assets base is configured, and that preset resolves
 * to a 1.4 MB HDR on raw.githubusercontent.com — 15× the 96 KB file we self-host, fetched before the
 * first cake appears, from a CDN `SafeEnvironment`'s own comment calls "flaky / rate-limited".
 *
 * ⚠️ IT FAILS QUIETLY IN THREE DIFFERENT WAYS, which is why it needs a test rather than a reader.
 *   1. It works. The cake renders, just lit by an environment nobody tuned and paid for in bytes.
 *   2. `SafeEnvironment` catches a load failure and renders flat lighting, so a 503 looks like a
 *      design choice.
 *   3. CSP is report-only today. The day it is enforced the fetch dies — silently, per 2.
 *
 * Found in four preview canvases on 2026-08-17, and in the STOREFRONT on 2026-09-19 — the fifth, and
 * the one customers actually see.
 */
const store = readFileSync(new URL('./CustomerStorefront.jsx', import.meta.url), 'utf8');
const host  = readFileSync(new URL('../../../spattoo-web/apps/app/app/[slug]/StorefrontClient.tsx', import.meta.url), 'utf8');

describe('the storefront lights itself from our own bucket', () => {
  it('configures the env map before any cake renders', () => {
    expect(store).toMatch(/import \{ configureEnvMap \} from '\.\.\/designer\/canvas\/envMap\.js'/);
    expect(store).toMatch(/configureEnvMap\(cfAssetsBase\)/);
  });

  /* Called in the component BODY, not an effect: HeroCake3D and CakeVisual read the resolved URL on
     the same pass, and an effect would run after they had already asked. */
  it('configures it in the body, not an effect', () => {
    const call = store.indexOf('configureEnvMap(cfAssetsBase)');
    const body = store.indexOf('}) {');
    expect(call).toBeGreaterThan(body);
    expect(store.slice(body, call)).not.toMatch(/useEffect/);
  });

  // A prop the host never passes is the same as no prop at all — that was the bug.
  it('is actually passed by the app', () => {
    expect(host).toMatch(/cfAssetsBase=\{process\.env\.NEXT_PUBLIC_ASSETS_BASE\}/);
  });
});
