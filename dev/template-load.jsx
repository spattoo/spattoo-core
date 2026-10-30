import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './scene.js';                       // light it the way production does — see that file
import CakeCanvas from '../src/designer/canvas/CakeCanvas.jsx';
import { toCanvasConfig } from '../src/designer/hooks/useCakeDesign.js';
import { HARNESS_ASSETS_BASE } from './scene.js';
import fixture from './fixtures/template-welcome-home.json';

/* ── What a template actually costs to open ─────────────────────────────────────────────────────
 *
 * Open /template-load.html, or drive it headlessly with `npm run measure:template`.
 *
 * ⚠️ WHY THIS EXISTS. A cold template load on a phone was reported as very slow and resisted three
 * rounds of diagnosis, because every cheap way of looking at it answers the wrong question:
 *
 *   · `curl -I` on the CDN says DYNAMIC and means nothing — Cloudflare does not cache HEAD. That
 *     cost a Cache Rule somebody then had to put back.
 *   · Resource Timing in the page reports `transferSize: 0` and negative waits, because the CDN
 *     sends no `Timing-Allow-Origin`. The `ms` column is the only honest one.
 *   · Reading `performance.getEntriesByType('resource')` after the fact gives durations with no
 *     start times, so there is no waterfall — and a total that was never measured gets reasoned
 *     about as if it had been.
 *
 * None of those can separate the two explanations that matter, which have OPPOSITE fixes:
 *     bytes          → make the assets smaller
 *     round trips    → make the requests fewer and earlier
 * and neither can see the third, which is the work that happens AFTER the last byte lands.
 *
 * So this rig renders a REAL template through the REAL canvas and reports all three.
 *
 * ── WHAT IT IS HONEST ABOUT ─────────────────────────────────────────────────────────────────────
 * The assets come through vite's `/cdn` proxy, not straight from the CDN, because the CDN's CORS
 * allowlist holds the app's ports and not this one (see scene.js). The BYTES are real and live.
 * The absolute download times are not comparable to a phone's — there is a localhost hop in front
 * of them. What IS faithful, and what this is for:
 *
 *   · the SHAPE of the waterfall — whether the assets are requested together or one behind another
 *   · how long after the last byte the cake is still not ready
 *
 * Measure raw CDN throughput with `curl` against the real host instead; the two answer different
 * halves and neither substitutes for the other.
 *
 * ── THE FIXTURE IS THE REAL ROW ─────────────────────────────────────────────────────────────────
 * dev/fixtures/*.json is a verbatim `cake_templates` row, not a hand-written stand-in — a fixture
 * that disagrees with the DB proves the wrong thing. Re-pull it rather than editing it; the table
 * and id are recorded inside the file.
 */

// The design carries absolute `https://dev.spattoocdn.com/...` urls. Rewritten to the proxy at LOAD
// time rather than in the fixture, so the file on disk stays a verbatim copy of the row.
function viaProxy(value) {
  if (typeof value === 'string') return value.replace(/https:\/\/[a-z0-9.-]*spattoocdn\.com/gi, HARNESS_ASSETS_BASE);
  if (Array.isArray(value)) return value.map(viaProxy);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = viaProxy(v);
    return out;
  }
  return value;
}

/* Marks the headless driver reads. `performance.now()` throughout, so everything is on one clock —
   mixing it with Date.now() is what made the first version of this measurement print epoch
   milliseconds in a column labelled "duration". */
function mark(name) {
  window.__tl = window.__tl || {};
  if (window.__tl[name] == null) window.__tl[name] = Math.round(performance.now());
}

function Rig() {
  const [mounted, setMounted] = useState(false);
  /* ⚠️ THE LIVE CANVAS, NOT CakePreview. They share CakeContent (INVARIANTS #2) so they draw the
     same cake, but CakePreview mounts it under SceneKindContext 'thumb' — one <Suspense
     fallback={null}> instead of a per-element LoadingPing, and the capture channel never calls the
     registry's publish(). Measured against the preview, `window.__spattooLoading` is permanently
     null and "when is the cake ready" has no answer at all. The spinner a baker waits on is the
     LIVE count, so the live canvas is the only thing worth timing. */
  const config = useMemo(() => toCanvasConfig(viaProxy(fixture.design)), []);

  // Mount the canvas on a tick AFTER first paint, so t=0 is "the template was opened" rather than
  // "the bundle finished" — the designer is already on screen when a baker picks a template, and
  // measuring from page load would fold the bundle cost back in and hide what we are looking for.
  useEffect(() => {
    mark('pageReady');
    const id = requestAnimationFrame(() => { mark('openTemplate'); setMounted(true); });
    return () => cancelAnimationFrame(id);
  }, []);

  // The one number the baker experiences: the spinner is up while this is non-zero.
  useEffect(() => {
    if (!mounted) return undefined;
    let sawBusy = false;
    const id = setInterval(() => {
      const s = window.__spattooLoading;
      if (!s) return;
      if (s.inFlight > 0) { sawBusy = true; mark('firstPing'); }
      if (sawBusy && s.inFlight === 0) { mark('settled'); clearInterval(id); }
    }, 25);
    return () => clearInterval(id);
  }, [mounted]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #C5D4C8', background: '#fff' }}>
        <strong>{fixture.name}</strong>
        <span style={{ color: '#5C7565' }}>
          {' '}· {fixture.tier_count} tier · {fixture.shape} · fixture pulled {fixture._source.pulled}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {mounted && <CakeCanvas config={config} />}
      </div>
    </div>
  );
}

mark('scriptEval');
createRoot(document.getElementById('root')).render(<Rig />);
