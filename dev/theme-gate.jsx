import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import ThemePreview from '../src/storefront/ThemePreview.jsx';

/* Harness for the premium-theme PREVIEW gate. Mounts the customiser directly with a Flame-plan
 * stub (premium_themes: false), which is the only combination that exercises the new path and the
 * one a developer cannot reach by logging in as themselves. */
const THEMES = [
  { id: 1, key: 'spotlight',  name: 'Spotlight',  is_active: true,  is_premium: false },
  { id: 2, key: 'patisserie', name: 'Patisserie', is_active: true,  is_premium: true  },
  { id: 3, key: 'aurora',     name: 'Aurora',     is_active: true,  is_premium: false },
];
const api = {
  fetchEntitlements: async () => ({ ent: { premium_themes: new URLSearchParams(location.search).get('plan') === 'blaze' } }),
  fetchStorefrontPhotos: async () => [],
  fetchTestimonials: async () => [],
  fetchTemplates: async () => [],
  fetchFlavourList: async () => ({ curated: true, offered: 3 }),
};
function Harness() {
  const [log, setLog] = useState([]);
  const note = m => setLog(l => [...l, m]);
  return (
    <>
      <ThemePreview
        open apiClient={api} themes={THEMES}
        appPrimary="#3a4f46" appAccent="#6B8C74"
        value={{ storefront_theme_id: 1, primary_color: '#9FA28B', accent_color: '#A3AB9B',
                 storefront_published: true, storefront_customizations: { cta_color: '' } }}
        baker={{ name: 'Sample Bakery', slug: 'sample' }}
        onPublish={async p => note('PUBLISH theme_id=' + p.storefront_theme_id + ' primary=' + p.primary_color)}
        onUpgrade={() => note('UPGRADE → billing opened')}
        onClose={() => note('customiser closed')}
      />
      <pre id="log" style={{ position: 'fixed', bottom: 0, left: 0, zIndex: 9999, background: '#000', color: '#0f0',
        font: '11px monospace', padding: 6, margin: 0, maxWidth: '100%' }}>{log.join('\n')}</pre>
    </>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<Harness />);
