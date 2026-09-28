import { createRoot } from 'react-dom/client';
import ElementPreview from '../src/designer/preview/ElementPreview.jsx';
import './scene.js';

/* ── A catalogue element on a pick ───────────────────────────────────────────────────────────────
 *
 * The real fondant heart, through the real chain, with a stick under it. The question the picture
 * has to answer is the one the numbers cannot: does the rod read as a pick pushed into icing, and
 * does "how far in" actually change how high the heart rides?
 *
 *   /element-stick.html?bury=0.5        half in
 *   /element-stick.html?bury=1          buried to the hilt — the heart should sit ON the icing
 *   /element-stick.html?bury=0          just touching — the rod must still REACH the icing
 *   /element-stick.html?stick=0         no stick at all, the control case
 *   /element-stick.html?len=2.2&thick=2.6   the two multipliers, which is how their defaults were
 *                                           chosen: a pick is judged by eye at the size it is seen,
 *                                           and the first ones were a card topper's proportions on
 *                                           a small solid element — a stub too short to reach and a
 *                                           rod too fine to see. Sandeep: *"stick is floating. stick
 *                                           length should be dynamic. and also add a control for the
 *                                           stick thickness. its too thin now."*
 */
const q = new URLSearchParams(location.search);
const BURY  = q.has('bury') ? Number(q.get('bury')) : 0.5;
const STICK = q.get('stick') !== '0';
const LEN   = q.has('len')   ? Number(q.get('len'))   : undefined;
const THICK = q.has('thick') ? Number(q.get('thick')) : undefined;

const HEART = {
  id: `heart-stick-${BURY}-${STICK}`,
  name: 'fondant heart',
  image_url: '/cdn/elements/files/3D/5c642a4f-231c-4a0a-a7c8-372415863cfa.glb',
  allowed_zones: ['top_surface'],
  default_color: '#c41c1c',
  placement_config: {
    r: 2, scale: { max: 6, min: 0.5, step: 0.25 },
    metalness: 0.0015, roughness: 0.3876,
    top_surface: { modes: ['stand'] },
    // Absent length/thickness fall through to ELEMENT_STICK_DEFAULTS, so the harness shows what a
    // row that authors nothing actually gets — which is the case worth looking at.
    stick: { bury: BURY, ...(LEN != null ? { length: LEN } : {}), ...(THICK != null ? { thickness: THICK } : {}) },
  },
  // The capability is what offers the pick; without it the designer shows no toggle at all.
  allowed_actions: { move: true, tilt: true, color: true, delete: true, resize: true, stick: STICK },
};

createRoot(document.getElementById('root')).render(
  <div style={{ height: '100%' }}>
    {/* ⚠️ THE STICK IS OFF AT PLACEMENT, which is the product's own rule — "can add a stick", so a
        baker decides. Previewing it means saying so explicitly, exactly as the card's toggle does. */}
    <ElementPreview element={HEART} zone="top_surface" mode="stand" autoRotate={false}
                    extra={STICK ? { stick: { on: true, bury: BURY, ...(LEN != null ? { length: LEN } : {}), ...(THICK != null ? { thickness: THICK } : {}) } } : null}
                    style={{ height: '100%' }} />
  </div>,
);
