import React from 'react';
import ReactDOM from 'react-dom/client';
import ThemePreview from '../src/storefront/ThemePreview.jsx';

// Dev-only harness for the storefront CUSTOMISER (ThemePreview) — this is where the Mobile/Desktop
// preview toggle lives. Uses sample data + a stub apiClient (no network). Not shipped; a dev aid.
const THEMES = [
  { id: 1, key: 'spotlight', name: 'Standard', is_active: true },
  { id: 2, key: 'aurora',    name: 'Aurora',   is_active: true },
];

const SAMPLE_GALLERY = [
  { id: 'g1', key: 'k1', url: '/sample-cake-1.png', caption: 'Three-tier celebration cake' },
  { id: 'g2', key: 'k2', url: '/sample-cake-2.png', caption: 'Floral buttercream' },
  { id: 'g3', key: 'k3', url: '/sample-cake-3.png', caption: 'Chocolate drip finish' },
];
const SAMPLE_TESTIMONIALS = [
  { id: 't1', quote: 'Absolutely stunning — exactly what we pictured.', author: 'Aarti', occasion: 'Birthday' },
  { id: 't2', quote: 'Tasted as good as it looked. Ordering again!',    author: 'Rohan', occasion: 'Anniversary' },
];

// Sample cake designs (templates) the baker can pick gallery images from.
const SAMPLE_DESIGNS = [
  { id: 'd1', name: 'Classic three-tier', thumbnail_url: '/sample-cake-1.png' },
  { id: 'd2', name: 'Floral buttercream',  thumbnail_url: '/sample-cake-2.png' },
  { id: 'd3', name: 'Chocolate drip',      thumbnail_url: '/sample-cake-3.png' },
  { id: 'd4', name: 'Ivory & gold',        thumbnail_url: '/sample-cake-1.png' },
];

// Stub apiClient — read fetches to render; the from-design snapshot returns a fake persisted row.
const apiClient = {
  fetchStorefrontPhotos: async () => ({ photos: SAMPLE_GALLERY }),
  fetchTestimonials:     async () => ({ testimonials: SAMPLE_TESTIMONIALS }),
  fetchTemplates:        async () => ({ templates: SAMPLE_DESIGNS }),
  // Real endpoint copies the design's thumbnail into the gallery folder + inserts a row; the stub
  // just echoes a row so the picker flow (optimistic add → reconcile) can be verified end-to-end.
  addStorefrontPhotoFromTemplate: async (id) => {
    const d = SAMPLE_DESIGNS.find(x => x.id === id);
    return { id: `p-${id}-x`, key: `storefront/gallery/${id}.webp`, url: d?.thumbnail_url };
  },
  // Hero snapshot: copies the design thumbnail and returns { key, url } (no photo row).
  addStorefrontImageFromTemplate: async (id) => {
    const d = SAMPLE_DESIGNS.find(x => x.id === id);
    return { key: `storefront/gallery/hero-${id}.webp`, url: d?.thumbnail_url };
  },
  // `curated: false` is a brand-new baker: no settings rows, so EVERY global flavour is offered by
  // default (spattoo-api lib/flavourList.js). It is the state that makes the publish confirm's
  // "you are offering all N flavours" notice render, and the one nobody would think to set up by
  // hand — which is exactly why the harness seeds it.
  fetchBakerFlavours: async () => ({
    curated: false,
    flavours: Array.from({ length: 18 }, (_, i) => ({ id: `f${i}`, name: `Flavour ${i + 1}`, excluded: false })),
  }),
  fetchEntitlements: async () => ({ ent: { premium_themes: false } }),
};

function Harness() {
  return (
    <ThemePreview
      open
      apiClient={apiClient}
      themes={THEMES}
      value={{ storefront_theme_id: 2, primary_color: '#5B3A29', accent_color: '#C8945B', storefront_published: true, storefront_customizations: {} }}
      baker={{ name: 'Sample Bakery', slug: 'sample', story: '', instagram_handle: 'samplebakery', website_url: '' }}
      logoUrl={null}
      appPrimary="#7a4a52"
      appAccent="#c98b94"
      onPublish={async (p) => { console.log('[dev] publish', p); }}
      onUnpublish={async () => { console.log('[dev] unpublish'); }}
      onClose={() => console.log('[dev] close')}
    />
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Harness />);
