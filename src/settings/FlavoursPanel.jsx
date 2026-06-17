import { useState, useEffect } from 'react';
import { useIsMobile, Toggle, Section, Field } from './controls.jsx';

// Flavours — a top-level settings destination (peer of Store Settings), not a section
// inside it, so the catalogue can grow without bloating the store-config screen.
//
// Shows the GLOBAL flavour master list with an on/off switch per flavour. Off = this baker
// doesn't offer it → hidden from their customers. The API owns the schema and resolution
// (GET /api/baker/flavours → [{ id, name, description, excluded }]; the save replaces the
// baker's exclusion set). Core only ever sees flags.
export default function FlavoursPanel({ open, onClose, apiClient, primaryColor = '#1a1a1a', accentColor = '#333333' }) {
  const isMobile = useIsMobile();
  const [flavours, setFlavours]                 = useState(null);
  const [excluded, setExcluded]                 = useState(() => new Set());
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    if (!open) return;
    setError(null); setSaved(false);
    if (!apiClient.fetchBakerFlavours) { setFlavours([]); return; }
    setLoading(true);
    apiClient.fetchBakerFlavours()
      .then(list => {
        const arr = Array.isArray(list) ? list : [];
        setFlavours(arr);
        setExcluded(new Set(arr.filter(f => f.excluded).map(f => f.id)));
      })
      .catch(e => { setError(e.message); setFlavours([]); })
      .finally(() => setLoading(false));
  }, [open]);

  function toggleFlavour(id) {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (!apiClient.updateBakerFlavourExclusions) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      await apiClient.updateBakerFlavourExclusions([...excluded]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

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
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Flavours</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>Choose which flavours you offer</div>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 60, color: '#9BB5A2', fontSize: 14 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid #C5D4C8', borderTopColor: '#2C4433', animation: 'spin 0.7s linear infinite', marginRight: 10 }} />
              Loading flavours…
            </div>
          )}

          {error && (
            <div style={{ padding: '14px 18px', borderRadius: 12, background: '#FEE2E2', color: '#991B1B', fontSize: 13, fontWeight: 600 }}>
              {error}
            </div>
          )}

          {flavours && !loading && (
            <>
              <Section title="Flavours">
                <Field label="Offered flavours" hint="Turn off any flavour you don't offer. Hidden flavours won't appear to customers placing an order.">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
                    {flavours.length === 0 && (
                      <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 600 }}>No flavours available yet.</span>
                    )}
                    {flavours.map((f, i) => {
                      const offered = !excluded.has(f.id);
                      return (
                        <div key={f.id} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                          borderTop: i === 0 ? 'none' : '1px solid #F3F4F6',
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: offered ? '#2C4433' : '#9CA3AF' }}>{f.name}</div>
                            {f.description && (
                              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{f.description}</div>
                            )}
                          </div>
                          <Toggle checked={offered} onChange={() => toggleFlavour(f.id)} />
                        </div>
                      );
                    })}
                  </div>
                </Field>
              </Section>

              {flavours.length > 0 && (
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
                    {saving ? 'Saving…' : 'Save Flavours'}
                  </button>
                  {saved && <span style={{ fontSize: 13, fontWeight: 700, color: '#2C4433' }}>✓ Saved</span>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
