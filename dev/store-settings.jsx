/* ── Which blocks land on which page ─────────────────────────────────────────────────────────────
 *
 * The 2026-10-03 split gave the shop its own rail destination and left Settings with what is about
 * the app. Both are the SAME component behind a `scope` prop, which is exactly the arrangement that
 * can go wrong invisibly: a section that renders under both scopes, or under neither, still builds
 * and still passes every gate.
 *
 * The page is docked beside the rail behind a baker sign-in, so this mounts it against a stub.
 *
 * ⚠️ THE STUB IS A STUB — it proves WHICH BLOCKS APPEAR, never that a save works. The merge that
 * makes two writers safe is spattoo-api's, gated by check:settings-merge.
 */
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import SettingsPanel from '../src/settings/SettingsPanel.jsx';

const wait = ms => new Promise(r => setTimeout(r, ms));

const stub = {
  fetchBakerSettings: async () => ({
    lead_time_days: 2,
    delivery_radius_km: 8,
    delivery: { home_delivery: true },
  }),
  fetchBakerProfile: async () => ({ baker: {
    name: '31 Bakers', slug: '31bakers', tagline: 'Cakes for the whole street',
    primary_color: '#2C4433', accent_color: '#C9A227',
    instagram_handle: 'thirtyonebakers', website_url: 'https://example.com',
    storefront_theme_id: 1, storefront_published: false,
  } }),
  fetchStorefrontThemes: async () => ({ themes: [{ id: 1, name: 'Spotlight' }] }),
  updateBakerSettings: async () => { await wait(200); },
  updateBakerProfile:  async () => { await wait(200); },
  // PrivacyDataSection's three. Empty is the honest shape for a new baker.
  fetchConsentHistory: async () => ({ events: [] }),
  fetchLegalCurrent:   async () => ({ documents: [] }),
  fetchDeletionStatus: async () => ({ deletion_status: 'active' }),
  // Rail skins. `?locked` flips the entitlement so the Blaze state can be seen too — that is the
  // half a baker on Spark actually meets, and the half most likely to be built blind.
  fetchRailSkins: async () => ({
    skins: [
      { key:'chrome', name:'Chrome', is_default:true,  is_premium:false,
        stops:['#121214','#08080a','#08080a','#020203'], joint_at:null, texture:'none',
        ink:'rgba(255,255,255,0.78)', ink_active:'#ffffff' },
      { key:'walnut', name:'Walnut', is_default:false, is_premium:true,
        stops:['#3A2616','#4C321C','#3C2717','#2C1D11'], joint_at:0.62, texture:'grain',
        ink:'rgba(255,255,255,0.78)', ink_active:'#ffffff' },
      { key:'slate',  name:'Slate',  is_default:false, is_premium:true,
        stops:['#2B3038','#232830','#1E232A','#161A20'], joint_at:null, texture:'none',
        ink:'rgba(255,255,255,0.80)', ink_active:'#ffffff' },
    ],
    chosen: 'walnut', served: 'walnut',
    entitled: !new URLSearchParams(location.search).has('locked'),
  }),
  setRailSkin: async () => { await wait(300); },
};

function Harness() {
  const [scope, setScope] = useState('store');
  return (
    <>
      <div style={{ position: 'fixed', top: 8, right: 8, zIndex: 9999, display: 'flex', gap: 8 }}>
        {['store', 'settings', 'appearance', 'all'].map(k => (
          <button key={k} onClick={() => setScope(k)}
            style={{ padding: '8px 14px', borderRadius: 10, cursor: 'pointer', fontWeight: 800,
                     border: '1.5px solid #C5D4C8', background: scope === k ? '#2C4433' : '#fff',
                     color: scope === k ? '#fff' : '#2C4433' }}>{k}</button>
        ))}
      </div>
      {/* Remounted per scope (`key`), because the real screens are two separate openings and a
          component that only looks right when it has been something else first is not proved. */}
      <SettingsPanel key={scope} open scope={scope} apiClient={stub}
        primaryColor="#2C4433" accentColor="#C9A227" onClose={() => {}} />
    </>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
