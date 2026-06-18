import React, { useMemo, useState, useEffect } from 'react';
import CustomerStorefront from './CustomerStorefront.jsx';

// ThemePreview — a full-screen "see it before you pick it" customiser. Renders the REAL
// storefront live in a phone frame using a synthetic baker, lets the baker switch theme and
// tweak brand colours with instant feedback, then Publish (saves theme + colours).
//
// Props:
//   open        bool
//   themes      [{ id, key, name, is_active }]   — from GET /baker/storefront-themes
//   value       { storefront_theme_id, primary_color, accent_color }
//   baker       { name, slug, story, instagram_handle, website_url }  — preview content
//   logoUrl     string?   wordmark/logo to show
//   gallery     []?       sample photos (else the fallback panel shows)
//   onPublish   async ({ storefront_theme_id, primary_color, accent_color }) => void
//   onClose     () => void
export default function ThemePreview({ open, themes = [], value, baker = {}, logoUrl = null, gallery = null, onPublish, onClose }) {
  // Defaults come from the baker's saved branding (value.*); the literals are only a last
  // resort if a baker has no colour on file, and match the storefront's own defaults.
  const [themeId, setThemeId] = useState(value?.storefront_theme_id ?? themes[0]?.id ?? 1);
  const [primary, setPrimary] = useState(value?.primary_color || '#2C4433');
  const [accent,  setAccent]  = useState(value?.accent_color  || '#6B8C74');
  const [publishing, setPublishing] = useState(false);
  const isWide = useIsWide(900);

  useEffect(() => {
    if (!open) return;
    setThemeId(value?.storefront_theme_id ?? themes[0]?.id ?? 1);
    setPrimary(value?.primary_color || '#2C4433');
    setAccent(value?.accent_color || '#6B8C74');
  }, [open]);

  const themeKey = themes.find(t => t.id === themeId)?.key || 'spotlight';

  // Synthetic baker the preview renders from — memoised so the storefront only re-renders
  // when something visible actually changes (not every parent render).
  const previewBaker = useMemo(() => ({
    name: baker.name || 'Your Bakery', slug: baker.slug || 'preview',
    primary_color: primary, accent_color: accent,
    story: baker.story || null,
    instagram_handle: baker.instagram_handle || null, website_url: baker.website_url || null,
    storefront_theme: themeKey,
  }), [primary, accent, themeKey, baker.name, baker.slug, baker.story, baker.instagram_handle, baker.website_url]);

  if (!open) return null;

  const dirty = themeId !== value?.storefront_theme_id || primary !== value?.primary_color || accent !== value?.accent_color;

  async function publish() {
    setPublishing(true);
    try {
      await onPublish?.({ storefront_theme_id: themeId, primary_color: primary, accent_color: accent });
      onClose?.();
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div style={s.overlay}>
      <div style={s.topbar}>
        <button type="button" style={s.cancel} onClick={onClose}>← Back</button>
        <div style={s.title}>Customise your storefront</div>
        <button type="button" style={{ ...s.publish, background: primary, opacity: publishing ? 0.6 : 1 }} disabled={publishing} onClick={publish}>
          {publishing ? 'Publishing…' : 'Publish'}
        </button>
      </div>

      <div style={{ ...s.body, flexDirection: isWide ? 'row' : 'column' }}>
        {/* controls */}
        <div style={{ ...s.controls, width: isWide ? 300 : 'auto', borderRight: isWide ? '1px solid #E3E8E4' : 'none', borderBottom: isWide ? 'none' : '1px solid #E3E8E4' }}>
          <div style={s.ctrlLabel}>Theme</div>
          <div style={s.themeList}>
            {themes.map(t => {
              const sel = t.id === themeId, off = !t.is_active;
              return (
                <button key={t.id} type="button" disabled={off}
                  onClick={() => setThemeId(t.id)}
                  style={{ ...s.themeBtn, borderColor: sel ? primary : '#D9DED9', borderWidth: sel ? 2 : 1, opacity: off ? 0.5 : 1, cursor: off ? 'default' : 'pointer' }}>
                  <span style={{ fontWeight: 800, color: '#2C4433', fontSize: 13.5 }}>{t.name}</span>
                  {off ? <span style={s.soon}>Soon</span> : sel ? <span style={{ color: primary, fontWeight: 800, fontSize: 12 }}>✓</span> : null}
                </button>
              );
            })}
          </div>

          <div style={{ ...s.ctrlLabel, marginTop: 22 }}>Brand colours</div>
          <Swatch label="Primary" value={primary} onChange={setPrimary} />
          <Swatch label="Accent"  value={accent}  onChange={setAccent} />

          <p style={s.hint}>Changes preview live. Hit <b>Publish</b> to make them go live on your storefront.</p>
        </div>

        {/* live preview in a phone frame */}
        <div style={s.stage}>
          <div style={s.phone}>
            <div style={s.phoneScroll}>
              <CustomerStorefront baker={previewBaker} logoUrl={logoUrl} gallery={gallery} apiBaseUrl="" onStartDesign={() => {}} />
            </div>
          </div>
          {dirty && <div style={s.dirtyTag}>Unpublished changes</div>}
        </div>
      </div>
    </div>
  );
}

function Swatch({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
      <label style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: value, border: '2.5px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.18)' }} />
        <input type="color" value={value} onChange={e => onChange(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
      </label>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2C4433' }}>{label}</div>
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          style={{ width: 96, padding: '5px 8px', borderRadius: 8, border: '1.5px solid #D9DED9', fontSize: 12.5, fontFamily: 'monospace', color: '#2C4433', outline: 'none', marginTop: 3 }} />
      </div>
    </div>
  );
}

function useIsWide(bp = 900) {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth >= bp : true);
  useEffect(() => {
    const f = () => setW(window.innerWidth >= bp);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, [bp]);
  return w;
}

const FONT = "'Quicksand', sans-serif";
const s = {
  overlay:  { position: 'fixed', inset: 0, zIndex: 400, background: '#EEF2EF', fontFamily: FONT, display: 'flex', flexDirection: 'column' },
  topbar:   { flexShrink: 0, height: 60, background: '#fff', borderBottom: '1px solid #E3E8E4', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', gap: 12 },
  cancel:   { background: '#F0F4F1', border: '1px solid #D9DED9', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700, color: '#2C4433' },
  title:    { fontSize: 15, fontWeight: 800, color: '#2C4433' },
  publish:  { border: 'none', borderRadius: 10, padding: '10px 22px', cursor: 'pointer', fontFamily: FONT, fontSize: 14, fontWeight: 800, color: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,0.18)' },
  body:     { flex: 1, display: 'flex', minHeight: 0 },
  controls: { flexShrink: 0, background: '#fff', padding: '20px 20px 24px', overflowY: 'auto', boxSizing: 'border-box' },
  ctrlLabel:{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#9BB5A2', marginBottom: 10 },
  themeList:{ display: 'flex', flexDirection: 'column', gap: 8 },
  themeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderRadius: 10, border: '1px solid #D9DED9', background: '#fff', fontFamily: FONT },
  soon:     { fontSize: 9.5, fontWeight: 800, color: '#9BB5A2', background: '#F0F4F1', padding: '2px 7px', borderRadius: 12, textTransform: 'uppercase', letterSpacing: 0.4 },
  hint:     { fontSize: 12, fontWeight: 500, color: '#6B8C74', lineHeight: 1.55, marginTop: 22 },
  stage:    { flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, position: 'relative', overflow: 'hidden' },
  phone:    { width: 392, maxWidth: '100%', height: 'min(86vh, 780px)', background: '#fff', borderRadius: 30, overflow: 'hidden', boxShadow: '0 24px 70px rgba(40,30,35,0.28)', border: '8px solid #1c1518' },
  phoneScroll: { width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' },
  dirtyTag: { position: 'absolute', top: 18, right: 18, background: '#2C4433', color: '#fff', fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 20 },
};
