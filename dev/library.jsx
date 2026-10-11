import { createRoot } from 'react-dom/client';
import LibraryPanel from '../src/settings/LibraryPanel.jsx';

/* ── The library shelf, and what "Recent" does to it ─────────────────────────────────────────────
 *
 * Built for the Recent section, and it exists because THE STATE THAT MATTERS CANNOT BE REACHED ANY
 * OTHER WAY. Whether a baker sees the section at all depends on `created_at` on rows in a database
 * — so "a quiet week" and "a busy week" are two shelves nobody has on their machine, and the quiet
 * one is the DEFAULT in production while being almost impossible to produce on dev, where we
 * publish templates constantly.
 *
 *   ?week=busy   (default)  things landed in the last 7 days → the section is drawn
 *   ?week=quiet             nothing newer than 20 days → NO section, one plain shelf
 *   ?week=flood             15 arrived this week → the section is not trimmed to five
 *   ?week=undated           an older API that sends no created_at → no section, nothing breaks
 */
const q = new URLSearchParams(location.search);
const week = q.get('week') || 'busy';

const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();

/* ⚠️ REAL THUMBNAILS NOW, AND THE NOTE THEY REPLACE WAS RIGHT UNTIL THE QUESTION CHANGED. It read:
   "A flat square so a tile has something to draw. Not a cake, and deliberately not pretending to be
   one — this harness is about the SHELF's structure, and a real thumbnail would make the screenshot
   about the cakes instead." Fair for the Recent section. Useless for the tile itself: a flat 80x80
   square fills any box it is given, so the shelf looked identical whether the tile was 1:1 or 3:2
   — and the grid spent a long time drawing a SQUARE box around a 3:2 blob, losing a third of every
   tile to empty bands. Reported as "there is so much dead space on the desptop catalogue view".
   A fixture that cannot show the fault cannot show the fix. These are real `captureThumbnailBlob`
   output (551x367 WebP), shared with dev/facets.jsx and dev/designer-mobile.jsx. */
const tile = (i) => `/thumbs/cake${(Math.abs(i) % 5) + 1}.webp`;

const NAMES = ['Football', 'Rainbow', 'Unicorn', 'Dino', 'Love', 'Football', 'Jungle', 'Barbie',
               'Car', 'Princess', 'Football', 'Space', 'Mermaid', 'Safari'];

function shelf() {
  const old = NAMES.map((name, i) => ({
    id: `old-${i}`, name, thumbnail_url: tile(i), tier_count: 1 + (i % 3),
    source: i % 4 === 0 ? 'mine' : 'spattoo', type: 'basic', offered: false,
    tag_slugs: [], search_slugs: [], attrs: null, created_at: ago(40 + i),
  }));
  if (week === 'quiet')   return old;
  if (week === 'undated') return old.map(t => ({ ...t, created_at: undefined }));
  const n = week === 'flood' ? 15 : 4;
  const fresh = Array.from({ length: n }, (_, i) => ({
    id: `new-${i}`, name: `Just saved ${i + 1}`, thumbnail_url: tile(i + 2),
    tier_count: 2, source: 'mine', type: 'basic', offered: false,
    tag_slugs: [], search_slugs: [], attrs: null, created_at: ago(i * 1.3),
  }));
  return [...old.slice(0, 7), ...fresh, ...old.slice(7)];   // interleaved, as sort_order would leave them
}

const apiClient = {
  fetchBakerCatalogue: async () => shelf(),
  updateBakerCatalogue: async (ids) => { console.log('[harness] catalogue now', ids.length); },
  deleteBakerTemplate: async (id) => { console.log('[harness] deleted', id); },
};

createRoot(document.getElementById('root')).render(
  <LibraryPanel
    open
    onClose={() => console.log('[harness] close')}
    apiClient={apiClient}
    onPickTemplate={(t) => console.log('[harness] pick', t.name)}
  />,
);
