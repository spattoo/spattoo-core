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
  // A real mark, so the harness previews the COMMON case. It was null, which meant every
  // screenshot showed the no-logo fallback and the branded path was never actually looked at.
  // ?logo=none renders the WORDMARK instead of an uploaded mark. Worth a switch: a theme's brand
  // typography — Atelier's tracked caps, Patisserie's copperplate — is invisible while a logo image
  // is sitting in the header, so the most distinctive thing about a theme cannot be judged.
  logo_url: new URLSearchParams(location.search).get('logo') === 'none' ? null : '/feelings-flavours-logo.png',
  story: '',                       // empty → component's SAMPLE_STORY fallback
  portrait_url: null,
  storefront_customizations: {},
  accepting_orders: true,
  /* No `gallery` — and no `?gallery=none` switch either. Both went with the "Our creations" section
     on 2026-09-28: the component no longer takes a gallery prop or reads `baker.gallery`, so sample
     photos here would be data nothing consumes, which is worse than absent (it reads as a feature
     that has broken). The empty-state this harness used to reach no longer exists at all. */
  testimonials: [
    { quote: 'Absolutely stunning — exactly what we pictured.', author: 'Aarti', occasion: 'Birthday' },
    { quote: 'Tasted as good as it looked. Ordering again!',    author: 'Rohan', occasion: 'Anniversary' },
  ],
};

function Preview() {
  const [tpl, setTpl] = useState('spotlight');
  const [hero, setHero] = useState('framed');   // 'framed' (branded curve/split) | 'fullbleed'
  const [font, setFont] = useState('montserrat');
  const [highlight, setHighlight] = useState(true);
  const [ctaColor, setCtaColor] = useState('');   // '' = default (adaptive headline + primary button)
  // Seed the "picker" values from the selected template's DEFAULTS (mirrors what the customiser does
  // on theme select) — so aurora shows its chocolate/caramel defaults, spotlight its own.
  const tplDefaults = TEMPLATES[tpl]?.defaults || {};
  const baker = {
    ...SAMPLE_BAKER,
    primary_color: tplDefaults.primary || SAMPLE_BAKER.primary_color,
    accent_color:  tplDefaults.accent  || SAMPLE_BAKER.accent_color,
    storefront_theme: tpl,
    storefront_customizations: {
      ...SAMPLE_BAKER.storefront_customizations,
      // Full-bleed only when a wide hero image is set; otherwise the branded curve/split hero.
      hero_image: hero === 'fullbleed' ? '/sample-cake-1.png' : null,
      font_key: font,
      // ?bg=#E4E8DE — exercise a theme's `grounds` without going through the customiser. The
      // renderer validates it against the theme's own list, so an off-list value here is also the
      // test that a bad stored ground falls back rather than painting the page.
      ...(new URLSearchParams(location.search).get('bg') ? { page_bg: new URLSearchParams(location.search).get('bg') } : {}),
      ...((ctaColor || tplDefaults.ctaColor) ? { cta_color: ctaColor || tplDefaults.ctaColor } : {}),
      // Exercise the section-array + Highlight section (baker lever). Highlight leads the body now
      // that "Our creations" is retired, so this is also the check that the page still opens well.
      sections: [
        { type: 'highlight', enabled: highlight, title: 'This week: Pistachio & rose', blurb: 'A limited-run three-tier with real pistachio sponge and a rosewater buttercream. Order by Friday.', cta_label: 'Order this cake', image: '/sample-cake-2.png' },
        { type: 'story',     enabled: true },
        { type: 'reviews',   enabled: true },
      ],
    },
  };
  return (
    <>
      {/* Wraps, and never wider than the viewport. It was one non-wrapping row pinned right, which
          on a narrow device-toolbar width (335px) pushed the Template select off the left edge —
          the control you most need in order to look at a template was the one you could not reach,
          and it looked like the template simply was not there. */}
      {/* ⚠️ AND IT SITS AT THE BOTTOM, NOT THE TOP. Pinned top-right it wrapped into a tall block at
          phone width and covered the storefront's own header — the hamburger included, which is the
          "3 line menu" this harness is most often opened to look at. A real click could not reach
          it (Playwright: "<div> intercepts pointer events"), and by eye the header simply looked
          absent. The harness must never occlude the thing it exists to show; the page's own footer
          is far less load-bearing than its header, and `?chrome=none` hides this entirely. */}
      {/* ⚠️ HIDDEN VIA `display`, NOT the `hidden` ATTRIBUTE. This element carries an inline
          `display: flex`, and an inline style beats the UA stylesheet's `[hidden] { display: none }`
          — so `hidden` here renders a switch that does nothing. Written that way first, and it would
          have passed: the bar had ALSO moved to the bottom, so the click it was blocking started
          working regardless, and a switch doing nothing would have been credited with the fix. */}
      <div style={{ position: 'fixed', bottom: 10, right: 10, zIndex: 9999, background: '#fff', border: '1px solid #ccc',
        borderRadius: 8, padding: '6px 10px', font: '13px system-ui, sans-serif', boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
        display: new URLSearchParams(location.search).get('chrome') === 'none' ? 'none' : 'flex',
        gap: 10, flexWrap: 'wrap', maxWidth: 'calc(100vw - 20px)', maxHeight: '40vh', overflowY: 'auto',
        alignItems: 'center' }}>
        <label>Template:&nbsp;
          <select value={tpl} onChange={e => setTpl(e.target.value)} style={{ font: 'inherit' }}>
            {Object.values(TEMPLATES).map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
        <label>Hero:&nbsp;
          <select value={hero} onChange={e => setHero(e.target.value)} style={{ font: 'inherit' }}>
            <option value="framed">Branded (curve/split)</option>
            <option value="fullbleed">Full-bleed photo</option>
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
        <label>CTA/Text:&nbsp;<input type="color" value={ctaColor || '#7a4a52'} onChange={e => setCtaColor(e.target.value)} />
          {ctaColor && <button type="button" onClick={() => setCtaColor('')} style={{ marginLeft: 4, font: 'inherit' }}>×</button>}
        </label>
      </div>
      {/* designLabel is deliberately NOT passed — the host app does not pass it either, so the
          preview has to show the component's own default or it previews a string nobody ships. */}
      <CustomerStorefront
        key={tpl + hero + font + highlight + ctaColor}
        baker={baker}
        apiBaseUrl=""
        supabase={null}
        onStartDesign={() => alert('Start designing (preview)')}
      />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Preview />);
