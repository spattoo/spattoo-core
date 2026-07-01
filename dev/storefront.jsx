import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { CustomerStorefront } from '../src/index.js';
import { TEMPLATES } from '../src/storefront/templates.js';

// Dev-only preview of the public storefront with SAMPLE placeholder data (uses the existing
// dev sample-cake images). The template switcher lets us compare storefront templates as they're
// added — today only "Standard" (spotlight) exists. Not shipped; a development aid.
const SAMPLE_BAKER = {
  name: 'Sample Bakery',
  slug: 'sample',
  primary_color: '#7a4a52',
  accent_color:  '#c98b94',
  instagram_handle: 'samplebakery',
  whatsapp: '+91 90000 00000',
  website_url: '',
  logo_url: null,
  story: '',                       // empty → component's SAMPLE_STORY fallback
  portrait_url: null,
  storefront_customizations: {},
  accepting_orders: true,
  gallery: [
    { url: '/sample-cake-1.png', caption: 'Three-tier celebration cake' },
    { url: '/sample-cake-2.png', caption: 'Floral buttercream' },
    { url: '/sample-cake-3.png', caption: 'Chocolate drip finish' },
  ],
  testimonials: [
    { quote: 'Absolutely stunning — exactly what we pictured.', author: 'Aarti', occasion: 'Birthday' },
    { quote: 'Tasted as good as it looked. Ordering again!',    author: 'Rohan', occasion: 'Anniversary' },
  ],
};

function Preview() {
  const [tpl, setTpl] = useState('spotlight');
  const [hero, setHero] = useState('framed');   // 'framed' | 'fullbleed' | 'designer'
  const [font, setFont] = useState('montserrat');
  const [highlight, setHighlight] = useState(true);
  const baker = {
    ...SAMPLE_BAKER,
    storefront_theme: tpl,
    storefront_customizations: {
      ...SAMPLE_BAKER.storefront_customizations,
      hero_style: hero === 'designer' ? 'designer' : 'photo',
      // NOTE: placeholder is a product CUTOUT so the full-bleed crops; a real baker sets a wide
      // lifestyle hero shot here (then it reads like the Honeybear full-bleed hero).
      hero_image: hero === 'fullbleed' ? '/sample-cake-1.png' : null,
      font_key: font,
      // Exercise the section-array + Highlight section (baker lever). Highlight sits after gallery.
      sections: [
        { type: 'gallery',   enabled: true },
        { type: 'highlight', enabled: highlight, title: 'This week: Pistachio & rose', blurb: 'A limited-run three-tier with real pistachio sponge and a rosewater buttercream. Order by Friday.', cta_label: 'Order this cake', image: '/sample-cake-2.png' },
        { type: 'story',     enabled: true },
        { type: 'reviews',   enabled: true },
      ],
    },
  };
  return (
    <>
      <div style={{ position: 'fixed', top: 10, right: 10, zIndex: 9999, background: '#fff', border: '1px solid #ccc',
        borderRadius: 8, padding: '6px 10px', font: '13px system-ui, sans-serif', boxShadow: '0 2px 10px rgba(0,0,0,0.15)', display: 'flex', gap: 14 }}>
        <label>Template:&nbsp;
          <select value={tpl} onChange={e => setTpl(e.target.value)} style={{ font: 'inherit' }}>
            {Object.values(TEMPLATES).map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
        <label>Hero:&nbsp;
          <select value={hero} onChange={e => setHero(e.target.value)} style={{ font: 'inherit' }}>
            <option value="framed">Curved band (Standard)</option>
            <option value="fullbleed">Full-bleed photo</option>
            <option value="designer">3D designer</option>
          </select>
        </label>
        <label>Font:&nbsp;
          <select value={font} onChange={e => setFont(e.target.value)} style={{ font: 'inherit' }}>
            <option value="montserrat">Modern</option>
            <option value="cormorant">Classic serif</option>
            <option value="quicksand">Soft &amp; round</option>
          </select>
        </label>
        <label><input type="checkbox" checked={highlight} onChange={e => setHighlight(e.target.checked)} />&nbsp;Highlight</label>
      </div>
      <CustomerStorefront
        key={tpl + hero + font + highlight}
        baker={baker}
        apiBaseUrl=""
        supabase={null}
        designLabel="Start designing"
        onStartDesign={() => alert('Start designing (preview)')}
      />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Preview />);
