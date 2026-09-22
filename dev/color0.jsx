import { createRoot } from 'react-dom/client';
import ElementPreview from '../src/designer/preview/ElementPreview.jsx';
import './scene.js';                       // light it the way production does (check:harness-scene)

/* ── What the baked COLOR_0 does to a colour a baker picks ───────────────────────────────────────
 *
 * The fondant heart cannot be recoloured in the designer. The cause is in the FILE, not the code:
 * its GLB carries per-vertex colours (`COLOR_0`) baked by GLB Studio, mean `#bd0101`, saturation
 * 0.997. three.js MULTIPLIES the material colour by those, so `chosen x pure red` stays red
 * whatever is chosen, and a blue choice goes nearly black.
 *
 * This page renders that element through the real chain (addSticker -> toCanvasConfig ->
 * CakeCanvas -> StickerModel), so the fix in `bakedColour.js` can be looked at rather than argued
 * about.
 *
 * `?tick=0` turns colour-changeable OFF, which is the case that must NOT change: an element that is
 * not recolourable is showing the colours it was authored with, and a unicorn eye is black because
 * eyes are black. `?c=` is the colour, and it goes in as `default_color`, which is what `initialStickerColor`
 * reads — so "the baker picked blue" and "the element defaults to cream" are the same code path.
 *
 *   npm run dev   (5190)   ->   /color0.html?c=%233E7BD6        recolourable: takes the colour
 *                              /color0.html?c=%233E7BD6&tick=0  not: keeps its baked red
 */
const q = new URLSearchParams(location.search);
/* The REAL file, through the vite CDN proxy — the same bytes a customer loads, so this page cannot
   go stale the way a checked-in copy would. */
const FILE = '/cdn/elements/files/3D/5c642a4f-231c-4a0a-a7c8-372415863cfa.glb';
// ?tick=0 renders the SAME file with colour-changeable OFF — the case that must NOT change, because
// an element that is not recolourable is showing the colours it was authored with.
const TICK = q.get('tick') !== '0';
const COLOUR = q.get('c') ?? '#F0DEB8';

// The real row from `cake_elements`, minus the embedding: same placement_config (roughness 0.388,
// metalness 0.0015), same allowed_zones, same allowed_actions. Only default_color and the colour
// tick are driven from the URL, and both are things an admin sets on the element anyway.
const HEART = {
  id: 'heart-' + COLOUR + '-' + TICK,
  name: 'fondant heart',
  image_url: FILE,
  allowed_zones: ['top_surface', 'middle_tier', 'board', 'side'],
  default_color: COLOUR,
  placement_config: {
    r: 2, side: 'hug', board: 'hug', middle_tier: 'hug',
    scale: { max: 6, min: 0.5, step: 0.25 },
    metalness: 0.0015014627800557553,
    roughness: 0.38758198588497084,
    top_surface: { modes: ['stand', 'hug'] },
  },
  allowed_actions: { move: true, tilt: true, color: TICK, delete: true, resize: true, gradient: false, duplicate: true },
};

createRoot(document.getElementById('root')).render(
  <div style={{ height: '100%', position: 'relative' }}>
    <ElementPreview element={HEART} zone="top_surface" mode="stand" autoRotate={false}
                    style={{ height: '100%' }} />
    {/* The colour that was ASKED FOR, beside the cake, so the gap is visible without measuring. */}
    <div data-asked style={{ position: 'absolute', top: 12, left: 12, width: 56, height: 44,
                             background: COLOUR, border: '1px solid rgba(0,0,0,.15)', borderRadius: 6 }} />
  </div>,
);
