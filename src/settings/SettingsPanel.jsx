import { useState, useEffect, useRef } from 'react';
import { useIsMobile, Toggle, Section, Field } from './controls.jsx';
import ThemePreview from '../storefront/ThemePreview.jsx';

// ── Color conversion utils ─────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return [0, 0, 0];
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2,'0')).join('');
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, max === 0 ? 0 : d / max, max];
}

function hsvToRgb(h, s, v) {
  const f = n => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

function isValidHex(hex) {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

// ── Color wheel picker ─────────────────────────────────────────────────────────

// ── ColorField ─────────────────────────────────────────────────────────────────

function ColorField({ label, hint, value, onChange }) {
  const safe = isValidHex(value) ? value : '#000000';

  return (
    <Field label={label} hint={hint}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
        {/* Swatch — native color picker overlaid invisibly on top */}
        <label style={{ position: 'relative', flexShrink: 0, cursor: 'pointer' }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10, background: safe,
            border: '2.5px solid #C5D4C8',
            boxShadow: '0 2px 6px rgba(0,0,0,0.14)',
          }} />
          <input
            type="color"
            value={safe}
            onChange={e => onChange(e.target.value)}
            style={{
              position: 'absolute', inset: 0, opacity: 0,
              width: '100%', height: '100%', cursor: 'pointer',
            }}
          />
        </label>

        {/* Hex input */}
        <input
          type="text"
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder="#000000"
          style={{
            width: 110, padding: '9px 12px', borderRadius: 10,
            border: '1.5px solid #C5D4C8', fontSize: 13, fontWeight: 700,
            fontFamily: 'monospace', color: '#2C4433', outline: 'none', background: '#fff',
          }}
        />
      </div>
    </Field>
  );
}

// ── Layout helpers ─────────────────────────────────────────────────────────────

const inp = {
  padding: '9px 12px', borderRadius: 10,
  border: '1.5px solid #C5D4C8', fontSize: 13,
  fontFamily: 'inherit', color: '#2C4433', outline: 'none',
  background: '#fff', width: '100%', boxSizing: 'border-box',
};

const DAYS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

const DEFAULT_DAY_HOURS = { open: '09:00', close: '23:30' };

const HOUR_SLOTS = Array.from({ length: 36 }, (_, i) => {
  const totalMins = 360 + i * 30;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const value = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12  = h % 12 || 12;
  return { value, label: `${h12}:${String(m).padStart(2,'0')} ${ampm}` };
});

// ── Main panel ─────────────────────────────────────────────────────────────────

export default function SettingsPanel({ open, onClose, apiClient, primaryColor = '#1a1a1a', accentColor = '#333333', onBrandingUpdate, onSettingsSaved }) {
  const isMobile = useIsMobile();
  const [settings, setSettings]     = useState(null);
  const [profile,  setProfile]      = useState(null);
  const [logoFile,    setLogoFile]   = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);
  const [saved,    setSaved]    = useState(false);
  const [urlError, setUrlError] = useState(null);
  const [themes,   setThemes]   = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true); setError(null); setUrlError(null); setLogoFile(null); setLogoPreview(null);
    Promise.all([
      apiClient.fetchBakerSettings(),
      apiClient.fetchBakerProfile(),
      apiClient.fetchStorefrontThemes?.().catch(() => ({ themes: [] })) ?? Promise.resolve({ themes: [] }),
    ])
      .then(([s, { baker }, themesRes]) => {
        const loaded = s ?? {};
        if (!loaded.store_hours) {
          loaded.store_hours = Object.fromEntries(DAYS.map(d => [d.key, { ...DEFAULT_DAY_HOURS }]));
        }
        setSettings(loaded);
        setProfile(baker ?? {});
        setThemes(themesRes?.themes ?? []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  function setSetting(path, value) {
    setSettings(prev => {
      const next = { ...prev };
      const parts = path.split('.');
      let cur = next;
      for (let i = 0; i < parts.length - 1; i++) {
        cur[parts[i]] = { ...(cur[parts[i]] ?? {}) };
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
      return next;
    });
  }

  function setProfileField(key, value) {
    setProfile(p => ({ ...p, [key]: value }));
  }

  function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setLogoPreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  function isValidWebsite(url) {
    if (!url) return true;
    try {
      const u = new URL(url);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }

  // Publish from the theme preview/customiser — persists theme + brand colours immediately.
  async function publishStorefront({ storefront_theme_id, primary_color, accent_color, portrait_key }) {
    const payload = {
      storefront_theme_id, primary_color, accent_color,
      instagram_handle: profile.instagram_handle, website_url: profile.website_url, tagline: profile.tagline,
    };
    if (portrait_key !== undefined) payload.portrait_url = portrait_key;  // new portrait (R2 key) or null to clear
    await apiClient.updateBakerProfile(payload);
    if (apiClient.publishStorefront) await apiClient.publishStorefront();   // take it live
    setProfile(p => ({ ...p, storefront_theme_id, primary_color, accent_color, storefront_published: true }));
    onBrandingUpdate?.({ primary_color, accent_color, logo_url: profile.logo_url });
  }

  async function unpublishStorefront() {
    if (apiClient.unpublishStorefront) await apiClient.unpublishStorefront();
    setProfile(p => ({ ...p, storefront_published: false }));
  }

  async function handleSave() {
    const websiteVal = profile?.website_url ?? '';
    if (!isValidWebsite(websiteVal)) {
      setUrlError('Enter a valid URL starting with https:// or http://');
      return;
    }
    setSaving(true); setError(null); setSaved(false);
    try {
      const profilePayload = {
        primary_color:    profile.primary_color,
        accent_color:     profile.accent_color,
        instagram_handle: profile.instagram_handle,
        website_url:      profile.website_url,
        tagline:          profile.tagline,
      };
      if (profile.storefront_theme_id != null) profilePayload.storefront_theme_id = profile.storefront_theme_id;
      if (logoFile && apiClient.getSignedUploadUrl) {
        const ext = logoFile.name.split('.').pop();
        const filename = `${crypto.randomUUID()}.${ext}`;
        const { url, key } = await apiClient.getSignedUploadUrl('logos', filename, logoFile.type);
        await fetch(url, { method: 'PUT', headers: { 'Content-Type': logoFile.type }, body: logoFile });
        profilePayload.logo_url = key;
      }
      await Promise.all([
        apiClient.updateBakerSettings(settings),
        apiClient.updateBakerProfile(profilePayload),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSettingsSaved?.();
      onBrandingUpdate?.({
        primary_color: profile.primary_color,
        accent_color:  profile.accent_color,
        logo_url:      logoPreview ?? profile.logo_url,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const delivery = settings?.delivery ?? {};

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700;800&display=swap');
        @keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, left: isMobile ? 0 : 76,
        zIndex: 300, display: 'flex', flexDirection: 'column',
        fontFamily: "'Quicksand', sans-serif",
        background: '#F4F8F5',
        boxShadow: '-4px 0 40px rgba(0,0,0,0.15)',
        animation: 'slideInRight 0.3s cubic-bezier(0.32,0.72,0,1)',
      }}>

        {/* Header */}
        <div style={{
          padding: isMobile ? '16px 20px' : '20px 28px',
          background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`,
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <button onClick={onClose} style={{
            display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
            background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 10, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.85)',
          }}>← Back</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Settings</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>Manage your store preferences</div>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 60, color: '#9BB5A2', fontSize: 14 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid #C5D4C8', borderTopColor: '#2C4433', animation: 'spin 0.7s linear infinite', marginRight: 10 }} />
              Loading settings…
            </div>
          )}

          {error && (
            <div style={{ padding: '14px 18px', borderRadius: 12, background: '#FEE2E2', color: '#991B1B', fontSize: 13, fontWeight: 600 }}>
              {error}
            </div>
          )}

          {settings && profile && (
            <>
              {/* ── Branding ── */}
              <Section title="Branding">
                {/* Logo — clicking the image opens the file picker */}
                <Field label="Logo" hint="Square or circular image works best. Click to change.">
                  <label style={{ display: 'inline-block', marginTop: 4, cursor: 'pointer' }}>
                    <div style={{
                      width: 80, height: 80, borderRadius: 16, overflow: 'hidden',
                      border: '2px dashed #C5D4C8', background: '#F4F8F5',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      position: 'relative', transition: 'border-color 0.15s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = '#2C4433'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = '#C5D4C8'}
                    >
                      {(logoPreview || profile.logo_url)
                        ? <img src={logoPreview ?? profile.logo_url} alt="Logo"
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        : <span style={{ fontSize: 32 }}>🏪</span>
                      }
                      {/* Hover overlay */}
                      <div style={{
                        position: 'absolute', inset: 0, borderRadius: 14,
                        background: 'rgba(0,0,0,0.35)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: 0, transition: 'opacity 0.15s',
                      }}
                        onMouseEnter={e => e.currentTarget.style.opacity = 1}
                        onMouseLeave={e => e.currentTarget.style.opacity = 0}
                      >
                        <span style={{ fontSize: 20 }}>📷</span>
                      </div>
                    </div>
                    <input type="file" accept="image/*" onChange={handleLogoChange} style={{ display: 'none' }} />
                  </label>
                  {logoFile && (
                    <div style={{ fontSize: 11, color: '#9BB5A2', marginTop: 6 }}>{logoFile.name}</div>
                  )}
                </Field>

                <ColorField
                  label="Primary Color"
                  hint="Main brand color — used for buttons and highlights."
                  value={profile.primary_color ?? ''}
                  onChange={v => setProfileField('primary_color', v)}
                />

                <ColorField
                  label="Accent Color"
                  hint="Secondary color — used for gradients."
                  value={profile.accent_color ?? ''}
                  onChange={v => setProfileField('accent_color', v)}
                />
              </Section>

              {/* ── Storefront Theme ── */}
              {themes.length > 0 && (
                <Section title="Storefront Theme">
                  <Field label="Theme" hint="See your storefront in each theme, tweak the colours, then publish.">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 6, padding: '12px 14px', borderRadius: 12, border: '1.5px solid #C5D4C8', background: '#fff' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#2C4433' }}>
                          {themes.find(t => t.id === profile.storefront_theme_id)?.name ?? 'Spotlight'}
                        </div>
                        <div style={{ fontSize: 12, color: '#9BB5A2', marginTop: 2 }}>Current theme</div>
                      </div>
                      <button type="button" onClick={() => setPreviewOpen(true)}
                        style={{ flexShrink: 0, padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, color: '#fff', background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})` }}>
                        Preview &amp; customise →
                      </button>
                    </div>
                  </Field>
                </Section>
              )}

              {/* ── Store Info ── */}
              <Section title="Store Info">
                <Field label="Instagram">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 4 }}>
                    <span style={{
                      padding: '9px 12px', borderRadius: '10px 0 0 10px',
                      border: '1.5px solid #C5D4C8', borderRight: 'none',
                      fontSize: 13, color: '#9BB5A2', background: '#F4F8F5', fontWeight: 700,
                    }}>@</span>
                    <input
                      style={{ ...inp, borderRadius: '0 10px 10px 0' }}
                      placeholder="yourbakery"
                      value={profile.instagram_handle ?? ''}
                      onChange={e => setProfileField('instagram_handle', e.target.value.replace(/^@/, ''))}
                    />
                  </div>
                </Field>

                <Field label="Website">
                  <input
                    style={{
                      ...inp, marginTop: 4,
                      borderColor: urlError ? '#E53935' : '#C5D4C8',
                    }}
                    type="text"
                    placeholder="https://yourbakery.com"
                    value={profile.website_url ?? ''}
                    onChange={e => {
                      setProfileField('website_url', e.target.value);
                      if (urlError) setUrlError(null);
                    }}
                    onBlur={e => {
                      const val = e.target.value;
                      if (val && !isValidWebsite(val))
                        setUrlError('Enter a valid URL starting with https:// or http://');
                      else
                        setUrlError(null);
                    }}
                  />
                  {urlError && (
                    <span style={{ fontSize: 11, color: '#E53935', fontWeight: 600, marginTop: 4 }}>
                      {urlError}
                    </span>
                  )}
                </Field>
              </Section>

              {/* ── Store Hours ── */}
              <Section title="Store Hours">
                <Field label="Opening hours" hint="Customers will only see delivery time slots within these hours.">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                    {DAYS.map(({ key, label }) => {
                      const hours = settings.store_hours?.[key] ?? null;
                      const isOpen = hours !== null;
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#444', width: 34, flexShrink: 0 }}>{label}</span>
                          <Toggle
                            checked={isOpen}
                            onChange={v => {
                              const next = { ...(settings.store_hours ?? {}) };
                              next[key] = v ? { ...DEFAULT_DAY_HOURS } : null;
                              setSetting('store_hours', next);
                            }}
                          />
                          {isOpen ? (
                            <>
                              <select
                                value={hours.open}
                                onChange={e => setSetting('store_hours', { ...settings.store_hours, [key]: { ...hours, open: e.target.value } })}
                                style={{ padding: '6px 8px', borderRadius: 8, border: '1.5px solid #C5D4C8', fontSize: 12, fontFamily: 'inherit', color: '#2C4433', outline: 'none', background: '#fff', cursor: 'pointer' }}
                              >
                                {HOUR_SLOTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                              </select>
                              <span style={{ fontSize: 12, color: '#9BB5A2', fontWeight: 700 }}>to</span>
                              <select
                                value={hours.close}
                                onChange={e => setSetting('store_hours', { ...settings.store_hours, [key]: { ...hours, close: e.target.value } })}
                                style={{ padding: '6px 8px', borderRadius: 8, border: '1.5px solid #C5D4C8', fontSize: 12, fontFamily: 'inherit', color: '#2C4433', outline: 'none', background: '#fff', cursor: 'pointer' }}
                              >
                                {HOUR_SLOTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                              </select>
                            </>
                          ) : (
                            <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 600 }}>Closed</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Field>
              </Section>

              {/* ── Delivery ── */}
              <Section title="Delivery">
                <Field label="Home Delivery" hint="Offer delivery to customers' addresses in addition to pickup.">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                    <Toggle
                      checked={!!delivery.home_delivery}
                      onChange={v => setSetting('delivery.home_delivery', v)}
                    />
                    <span style={{ fontSize: 13, color: delivery.home_delivery ? '#2C4433' : '#9CA3AF', fontWeight: 600 }}>
                      {delivery.home_delivery ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </Field>

                {delivery.home_delivery && (
                  <Field label="Delivery Radius" hint="Maximum distance you deliver to, in kilometres.">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                      <input
                        type="number" min={1} max={500}
                        value={delivery.radius_km ?? ''}
                        onChange={e => setSetting('delivery.radius_km', e.target.value === '' ? null : Number(e.target.value))}
                        placeholder="e.g. 10"
                        style={{ width: 100, padding: '8px 12px', borderRadius: 10, border: '1.5px solid #C5D4C8', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', color: '#2C4433', outline: 'none', background: '#fff' }}
                      />
                      <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 600 }}>km</span>
                    </div>
                  </Field>
                )}
              </Section>

              {/* Save */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    padding: '12px 28px', borderRadius: 12, border: 'none',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    background: saving ? '#C5D4C8' : `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
                    color: '#fff', fontSize: 14, fontWeight: 800, fontFamily: 'inherit',
                    boxShadow: saving ? 'none' : '0 4px 14px rgba(0,0,0,0.2)',
                    transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  {saving && <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />}
                  {saving ? 'Saving…' : 'Save Settings'}
                </button>
                {saved && <span style={{ fontSize: 13, fontWeight: 700, color: '#2C4433' }}>✓ Saved</span>}
              </div>
            </>
          )}
        </div>
      </div>

      <ThemePreview
        open={previewOpen}
        apiClient={apiClient}
        themes={themes}
        value={{
          storefront_theme_id: profile?.storefront_theme_id,
          primary_color: profile?.primary_color,
          accent_color:  profile?.accent_color,
          portrait_url:  profile?.portrait_url,
          storefront_published: profile?.storefront_published,
        }}
        baker={{ name: profile?.name, slug: profile?.slug, story: profile?.story, instagram_handle: profile?.instagram_handle, website_url: profile?.website_url }}
        logoUrl={profile?.logo_url || null}
        onPublish={publishStorefront}
        onUnpublish={unpublishStorefront}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}
