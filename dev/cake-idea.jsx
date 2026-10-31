import React, { useEffect, useMemo, useRef, useState } from 'react';
import './scene.js';   // light it the way production does — see the file
import ReactDOM from 'react-dom/client';
import { useCakeDesign } from '../src/designer/hooks/useCakeDesign.js';
import { CakePreview } from '../src/designer/canvas/CakeCanvas.jsx';
import { planFromSpec } from '../src/designer/idea/planFromSpec.js';
import { validateSpec } from '../src/designer/idea/cakeSpec.js';
import { tierShape } from '../src/designer/geometry/surface.js';
import { tierShapeAt } from '../src/designer/hooks/useCakeDesign.js';
import { boardOf } from '../src/designer/canvas/CakeCanvas.jsx';
import { ZONES, BOTTOM_H } from '../src/designer/constants.js';
import KRISHNA from '../src/designer/idea/fixtures/krishna-5-boy.json';

/* ── A cake built from a hand-written spec, with no model anywhere ───────────────────────────────
 *
 * This is the go/no-go for the daily-cake-idea feature, and it is deliberately the FIRST thing
 * built. Everyone pictures the composer — the clever half that thinks of a cake. The half that
 * decides whether the feature is possible at all is this one: can a spec become real placements,
 * on real seats, at sizes the dial can express? If it cannot, no amount of prompt work matters.
 *
 * So: a spec somebody typed (`idea/fixtures/krishna-5-boy.json`), the planner, and the designer's
 * own `addSticker`. Swap the fixture for a model's output later and nothing here changes — which
 * is the entire reason the spec exists as a contract rather than as a function signature.
 *
 * ⚠️ IT APPLIES THROUGH `addSticker`, NEVER BY WRITING `design.stickers`. A placed sticker reads
 * nine fields off `placement_config`, de-overlaps against coincident siblings, and resolves a
 * sheet's size against the tier it lands on. A harness that assembled the array itself would be a
 * second answer to "what is a placed sticker", and it would look right here and be wrong in the
 * app — which is the worst way for a prototype to be wrong.
 *
 * ⚠️ AND THE SEAT CONTEXT IS BUILT THE SAME WAY THE CARD BUILDS IT. `seatOnSlot` takes its world as
 * data because `boardOf` lives in the canvas; both callers therefore have to hand it the same three
 * things, and this harness is the second caller that proves the first one's shape was right.
 *
 * Open /cake-idea.html.
 *
 * ⚠️ `?bundle=` TAKES A SPEC **AND THE ROWS IT NAMES**, and that pairing is the whole reason a real
 * composed spec can be looked at here at all. A spec carries element IDS; this harness has no API,
 * no session and no catalogue, so on its own it would drop every id as "not in this baker's
 * library" — which is exactly what my first claim that `?spec=` was enough would have done. The
 * composer has already fetched those rows to build its prompt, so it emits both:
 *     { spec, elements: [ …the rows the spec names… ] }
 * `spattoo-backend/scripts/compose-idea.mjs --out` writes one. `?spec=` still works for a
 * hand-written spec against the stand-in library below.
 */

/* A stand-in catalogue. These are the Krishna assets generated on 2026-10-25, which are not in the
 * element library yet — the point of the harness is the PIPELINE, so the rows are shaped like real
 * ones (`allowed_zones`, `placement_config.scale`) and the artwork is whatever is to hand.
 * ⚠️ `el-retired` is absent ON PURPOSE. A composer works from a shortlist and a shortlist goes
 * stale; the dropped list below is how that reads to a baker, and it should be visible here. */
const THUMB = (c) => `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="12" fill="${c}"/></svg>`)}`;

const LIBRARY = [
  { id: 'el-bansuri', name: 'Ornate Peacock Feather Bansuri',
    image_url: THUMB('#E8C25A'), thumbnail_url: THUMB('#E8C25A'),
    allowed_zones: [ZONES.TOP_SURFACE, ZONES.SIDE],
    allowed_actions: { move: true, delete: true, resize: true },
    placement_config: { scale: { min: 0.5, max: 2.5, step: 0.1 } } },
  { id: 'el-feather', name: 'Sculpted Emerald Peacock Feather',
    image_url: THUMB('#1E8449'), thumbnail_url: THUMB('#1E8449'),
    allowed_zones: [ZONES.SIDE],
    allowed_actions: { move: true, delete: true, resize: true },
    placement_config: { scale: { min: 0.4, max: 1.2, step: 0.1 } } },
  { id: 'el-matki', name: 'Terracotta Pot Overflowing with Butter',
    image_url: THUMB('#C0693B'), thumbnail_url: THUMB('#C0693B'),
    allowed_zones: [ZONES.TOP_SURFACE, ZONES.BOARD],
    allowed_actions: { move: true, delete: true, resize: true },
    placement_config: {} },
];

/* ⚠️ THE CDN, THROUGH VITE'S PROXY, OR THE CAKE IS EMPTY. A bundle carries absolute R2 URLs —
   correct everywhere except here, because the CDN's CORS allowlist holds the APP's origins, not a
   harness on :5190. The files fetch fine with curl and fail in the browser, and three.js swallows
   the failure: the first real render showed a bare cake with fourteen invisible decorations on it
   and nothing in the panel to say why. `vite.config.js` already proxies `/cdn` for exactly this
   reason — it says so at length about the HDRI, which was reported and written into the docs three
   times against the wrong environment before anyone noticed. Same trap, same fix.
   Dev-only, and in the harness rather than in the composer: the bundle is right, this origin is
   the odd one out. */
const viaProxy = (row) => {
  const swap = (u) => (typeof u === 'string'
    ? u.replace(/^https?:\/\/[^/]*(r2\.dev|spattoocdn\.com)/i, '/cdn')
    : u);
  return { ...row, image_url: swap(row.image_url), thumbnail_url: swap(row.thumbnail_url) };
};

function Harness() {
  const api = useCakeDesign();
  const apiRef = useRef(api);
  apiRef.current = api;

  /* ⚠️ A URL PARAM MEANS "WAIT", NOT "BUILD THE DEFAULT AND THEN THIS". The first version seeded
     the built-in fixture, built it, and then built the fetched bundle on top of the SAME design —
     two cakes superimposed, two messages, and a parts list that looked plausible. Every eval
     render would have been wrong in a way that reads as a bad idea rather than a bad harness. */
  const q = typeof location === 'undefined' ? null : new URLSearchParams(location.search);
  const fromUrl = q?.get('bundle') || q?.get('spec') || null;
  const [spec, setSpec] = useState(fromUrl ? null : KRISHNA);
  const [library, setLibrary] = useState(LIBRARY);
  const [built, setBuilt] = useState(null);
  const [failed, setFailed] = useState(null);
  const done = useRef(false);

  /* A bundle brings its own catalogue; a bare spec leans on the stand-ins above. Both exist
     because they answer different questions — "does a composed cake build" and "does the planner
     do the right thing with a case I typed". */
  useEffect(() => {
    if (!fromUrl) return;
    const isBundle = !!q?.get('bundle');
    fetch(fromUrl).then(r => r.json()).then(j => {
      if (isBundle) { setSpec(j.spec ?? j); setLibrary((j.elements ?? LIBRARY).map(viaProxy)); }
      else setSpec(j);
    }).catch(e => setFailed(String(e)));
  }, []);

  const check = useMemo(() => (spec ? validateSpec(spec) : { ok: false, problems: [] }), [spec]);

  useEffect(() => {
    /* ⚠️ A REFUSED SPEC MUST CLEAR THE LAST ONE. Without this the panel kept showing the previous
       cake's parts beside the new one's error — which reads as "it built, with a warning" when
       nothing was built at all. The most misleading state a prototype can be in. */
    if (!check.ok) { setBuilt(null); return; }
    if (done.current) return;
    done.current = true;
    const a = apiRef.current;

    /* The seat's world, assembled exactly as the placement chooser assembles it. `baseShape` is the
       RAW bottom tier — not `shapeAt(0)` — because the board clamp was always handed the tier
       without tierRadius's override, and collapsing the two moves every board seat. */
    const seatCtxFor = (tierIndex, el) => ({
      pc: el?.placement_config ?? {},
      tierHeights: (a.canvasConfig?.tiers ?? a.design.tiers).map(t => t?.height ?? BOTTOM_H),
      shapeAt: i => tierShapeAt(a.design.tiers, i),
      baseShape: tierShape(a.design.tiers[0] ?? {}),
      board: a.design.tiers[0] ? boardOf((a.canvasConfig?.tiers ?? a.design.tiers)[0]) : null,
    });

    const plan = planFromSpec(spec, { elements: library, seatCtxFor });

    plan.tiers.forEach(t => { if (t.color) a.setTierColor(t.index, t.color); });

    /* ⚠️ ONE AT A TIME, THROUGH THE REAL ADD PATH. Three feathers is three calls, and each
       de-overlaps off the ones already down — the same rule a baker tapping three times gets.
       ⚠️ AND EACH NEEDS AN EXPLICIT ID, WHICH THIS HARNESS FOUND. `addSticker` defaults to
       `extra.id ?? Date.now()`, so placements made in the same millisecond share an id — React
       warns about duplicate keys and two stickers become indistinguishable to every later update.
       It has never mattered because the only caller is a human tapping, and it will matter every
       single time a cake is COMPOSED. Worked around here rather than changed in the hook: that is
       shared state and a wider change than this step. Worth a real fix before the applier ships. */
    plan.placements.forEach((p, i) => {
      const el = library.find(e => e.id === p.elementId);
      a.addSticker(el, p.zone, p.tierIndex, p.placementMode, p.position, { id: Date.now() + i });
    });

    if (plan.message) {
      a.addWriting({
        text: plan.message.text,
        style: plan.message.look ?? 'cream',
        surface: plan.message.surface ?? 'top',
        ...(plan.message.color ? { color: plan.message.color } : {}),
      });
    }
    if (plan.age) a.addAge({ value: plan.age.number });

    setBuilt(plan);
    /* ⚠️ A FLAG ON THE DOCUMENT, FOR THE SCREENSHOT RIG. Twenty cakes rendered on a fixed timeout
       is twenty chances to photograph a half-loaded scene, and a contact sheet of those teaches
       the wrong thing about the ideas. The rig waits for this instead. */
    requestAnimationFrame(() => { document.body.dataset.ideaBuilt = String(plan.placements.length); });
  }, [spec, library, check.ok]);

  const C = { ink: '#EDEAE3', dim: 'rgba(237,234,227,0.55)', sage: '#6B8F7E', warn: '#D9A441' };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0D0D0D', color: C.ink,
                  fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <CakePreview design={api.design} autoRotate />
      </div>
      <aside style={{ width: 380, padding: 24, borderLeft: '1px solid rgba(107,143,126,0.22)',
                      overflowY: 'auto', fontSize: 13, lineHeight: 1.5 }}>
        <p style={{ color: C.sage, letterSpacing: '0.18em', textTransform: 'uppercase',
                    fontSize: 11, margin: '0 0 16px' }}>A cake from a written spec</p>

        {failed && <pre style={{ color: C.warn, whiteSpace: 'pre-wrap' }}>could not load: {failed}</pre>}
        {!check.ok && (
          <pre style={{ color: C.warn, whiteSpace: 'pre-wrap' }}>{check.problems.join('\n')}</pre>
        )}

        {built && <>
          <p style={{ color: C.dim, fontStyle: 'italic', marginTop: 0 }}>{built.why}</p>

          <h3 style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase',
                       color: C.sage }}>Placed ({built.placements.length})</h3>
          <ul style={{ paddingLeft: 18, margin: '0 0 20px' }}>
            {built.placements.map((p, i) => (
              <li key={i}>{p.name} — <span style={{ color: C.dim }}>{p.zone}, {p.prominence}, ×{p.scale.toFixed(2)}</span></li>
            ))}
          </ul>

          {/* ⚠️ THE TWO ABSENCES, SHOWN APART. `wanted` commissions a new element; `dropped` fixes a
              prompt or a row. A single "missing" list would lose which of those you are reading. */}
          <h3 style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase',
                       color: C.warn }}>Wanted, not in the catalogue</h3>
          <ul style={{ paddingLeft: 18, margin: '0 0 20px', color: C.dim }}>
            {built.wanted.length ? built.wanted.map((w, i) => <li key={i}>{w}</li>) : <li>none</li>}
          </ul>

          <h3 style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase',
                       color: C.warn }}>Asked for, could not be placed</h3>
          <ul style={{ paddingLeft: 18, margin: 0, color: C.dim }}>
            {built.dropped.length ? built.dropped.map((d, i) => (
              <li key={i}>{d.name ?? d.elementId} — {d.why}</li>
            )) : <li>none</li>}
          </ul>
        </>}
      </aside>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Harness />);
