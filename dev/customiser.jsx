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

// Stub apiClient — the customiser only needs read fetches to render; uploads/saves are no-ops here.
const apiClient = {
  fetchStorefrontPhotos: async () => ({ photos: SAMPLE_GALLERY }),
  fetchTestimonials:     async () => ({ testimonials: SAMPLE_TESTIMONIALS }),
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
