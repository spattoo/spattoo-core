import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TemplateGrid from '../src/designer/shared/TemplateGrid.jsx';

/* ── The template grid, in the states a static render cannot reach ───────────────────────────────
 *
 * `TemplateGrid` was extracted from CakeDesigner.jsx (plans/baker-catalogue.md step 1), and four of
 * its behaviours are invisible to `renderToStaticMarkup` because they need effects, a layout or a
 * pointer:
 *
 *   reveal-on-scroll   the hook's count advances only when IntersectionObserver fires
 *   hover preview      a 180ms debounce, then a real getBoundingClientRect
 *   the ⤢ button       phone only, and it must NOT pick the template
 *   tap to pick        the whole tile is the button
 *
 * A green suite does not prove any of them (root CLAUDE.md rule 6), so this is the surface to drive.
 *
 *   ?n=30        how many templates (default 30, so paging is reachable)
 *   ?page=6      page size, to reach a second page without 24 tiles
 *   ?mobile=1    render the phone branch (the ⤢ button instead of hover)
 *   ?selected=1  mark every third tile chosen, for the Spattoo browser's selection state
 *   ?overlay=1   render a per-tile overlay, the seam Edit-catalogue mode will use
 *
 * ⚠️ The thumbnails are inline SVG data URIs, not real cakes. A harness that needed R2 would only
 * work for someone with credentials, and what is being checked here is the GRID, not the pictures.
 */

const q = new URLSearchParams(location.search);
const N        = Number(q.get('n')) || 30;
const PAGE     = Number(q.get('page')) || 24;
const MOBILE   = q.get('mobile') === '1';
const SELECTED = q.get('selected') === '1';
const OVERLAY  = q.get('overlay') === '1';

// A distinct colour per tile so a screenshot shows the order, and the eye can see paging happen.
const thumb = (i) => {
  const hue = (i * 37) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">
    <rect width="180" height="180" fill="hsl(${hue} 55% 88%)"/>
    <circle cx="90" cy="100" r="52" fill="hsl(${hue} 50% 70%)"/>
    <text x="90" y="46" font-family="monospace" font-size="22" text-anchor="middle" fill="#333">${i}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const TEMPLATES = Array.from({ length: N }, (_, i) => ({
  id: `t${i + 1}`,
  name: `Cake ${i + 1}`,
  thumbnail_url: thumb(i + 1),
  tier_count: (i % 3) + 1,
  // Every fifth is premium, so the badge is visible without dominating.
  offering: i % 5 === 4 ? 'premium' : 'standard',
}));

// The one tile with no picture, to prove the placeholder keeps the grid square.
TEMPLATES.push({ id: 'no-thumb', name: 'No picture', tier_count: 1 });

const selectedIds = SELECTED
  ? new Set(TEMPLATES.filter((_, i) => i % 3 === 0).map(t => t.id))
  : undefined;

function Harness() {
  /* What the caller does with a preview is the caller's business — CakeDesigner portals it past the
     panel's clipping. Here it is a plain readout, because what is being checked is that the grid
     REPORTS it: the right template, and a rect on hover but not from the ⤢ button. */
  const [preview, setPreview] = useState(null);
  const [picked, setPicked]   = useState(null);
  const [removed, setRemoved] = useState(() => new Set());

  const shown = TEMPLATES.filter(t => !removed.has(t.id));

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Read by the Playwright script — the assertions live on these, not on a screenshot. */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, fontWeight: 700, color: '#2C4433' }}>
        <span data-testid="count">tiles: {shown.length}</span>
        <span data-testid="picked">picked: {picked ?? '—'}</span>
        <span data-testid="preview">
          preview: {preview ? `${preview.name} rect=${preview.rect ? 'yes' : 'no'}` : '—'}
        </span>
        <span data-testid="mode">{MOBILE ? 'phone' : 'desktop'} · page {PAGE}</span>
      </div>

      <TemplateGrid
        templates={shown}
        isMobile={MOBILE}
        page={PAGE}
        selectedIds={selectedIds}
        onPick={(t) => setPicked(t.id)}
        onPreview={setPreview}
        onPreviewEnd={() => setPreview(null)}
        overlay={OVERLAY ? (t) => (
          <button
            type="button"
            data-testid={`remove-${t.id}`}
            aria-label={`Remove ${t.name}`}
            onClick={(e) => { e.stopPropagation(); setRemoved(s => new Set(s).add(t.id)); }}
            style={{
              position: 'absolute', bottom: 6, right: 6, zIndex: 2,
              border: 'none', borderRadius: 8, padding: '3px 8px', cursor: 'pointer',
              background: 'rgba(255,255,255,0.94)', boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
              fontSize: 11, fontWeight: 800, color: '#B91C1C', fontFamily: 'inherit',
            }}
          >Remove</button>
        ) : undefined}
      />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
