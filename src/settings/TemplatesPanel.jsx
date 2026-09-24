import { useState, useEffect } from 'react';
import { useIsMobile, Toggle, Section, Field } from './controls.jsx';
import { dockedPage, dockedBleed } from '../shared/rail.js';
import { PanelBackArrow, PanelDismiss } from '../shared/panelTopBar.jsx';
import { ConfirmPanel } from '../shared/Panel.jsx';
import { INK } from '../shared/tokens.js';

// Templates — a top-level settings destination (peer of Flavours), reached from the Settings gear.
//
// Two lists, because a baker has two kinds of template and does two different things to them:
//
//   YOUR TEMPLATES   the designs they saved themselves ("Save as Template"). Theirs, so they can
//                    REMOVE one. GET /api/baker/templates/mine, DELETE /api/baker/templates/:id.
//   SPATTOO          the shared library, with an on/off switch each. Off = hidden tenant-wide (from
//                    their own Templates menu AND from their customers), because everyone browses
//                    through the one GET /api/templates that applies the filter.
//
// ⚠️ THIS FILE USED TO SAY "a baker's OWN templates are NOT listed here — those they create and
// delete in the designer", and the API said the same thing pointing back here ("a baker's OWN
// templates aren't managed here (they delete those)"). Neither was true: there was no delete
// anywhere, in either place, and the two comments sent anyone looking for it to the other file.
// Sandeep: *"when a baker creates a template, he cannot delete his own template."* Save as Template
// was a one-way door for as long as it existed.
//
// ⚠️ REMOVING IS IMMEDIATE; THE SWITCHES ARE NOT. The on/off set is a draft until "Save Templates" —
// that is what the button is for — while a Remove is a server call the moment it is confirmed. Two
// behaviours on one screen is normally a smell, and here it is the honest one: a deletion cannot sit
// in a draft that a baker might close the panel on, believing it done.
//
// The API owns the schema and resolution (GET /api/baker/templates → [{ id, name, thumbnail_url,
// tier_count, offering, excluded }]; the save replaces the baker's exclusion set). Core only ever
// sees flags — this is the same shape as FlavoursPanel, just with a thumbnail per row.
export default function TemplatesPanel({ open, onClose, apiClient, primaryColor = INK, accentColor = '#333333' }) {
  const isMobile = useIsMobile();
  const [templates, setTemplates] = useState(null);
  const [mine,      setMine]      = useState([]);
  const [excluded,  setExcluded]  = useState(() => new Set());
  // Which of the baker's own templates is being confirmed for removal, and whether that call is out.
  const [pending,   setPending]   = useState(null);
  const [removing,  setRemoving]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState(null);

  useEffect(() => {
    if (!open) return;
    setError(null); setSaved(false);
    if (!apiClient.fetchBakerTemplates) { setTemplates([]); return; }
    setLoading(true);
    /* Both lists together — one spinner, not two. The baker's own is optional: a host running an
       older build has no `fetchMyTemplates`, and the section simply does not render rather than the
       whole page failing on a method that is not there. */
    Promise.all([
      apiClient.fetchBakerTemplates(),
      apiClient.fetchMyTemplates ? apiClient.fetchMyTemplates().catch(() => []) : Promise.resolve([]),
    ])
      .then(([list, own]) => {
        const arr = Array.isArray(list) ? list : [];
        setTemplates(arr);
        setExcluded(new Set(arr.filter(t => t.excluded).map(t => t.id)));
        setMine(Array.isArray(own) ? own : []);
      })
      .catch(e => { setError(e.message); setTemplates([]); })
      .finally(() => setLoading(false));
  }, [open]);

  function toggleTemplate(id) {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /* Remove one of the baker's own. Optimistic only AFTER the server says yes — a row that vanishes
     and comes back is worse than one that takes a moment to go. */
  async function removeMine(id) {
    if (!apiClient.deleteBakerTemplate) return;
    setRemoving(true); setError(null);
    try {
      await apiClient.deleteBakerTemplate(id);
      setMine(prev => prev.filter(t => t.id !== id));
      setPending(null);
    } catch (e) {
      setError(e.message);
      setPending(null);
    } finally {
      setRemoving(false);
    }
  }

  async function handleSave() {
    if (!apiClient.updateBakerTemplateExclusions) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      await apiClient.updateBakerTemplateExclusions([...excluded]);
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
        @keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* A page beside the rail, not a layer over the designer — see dockedPage. */}
      <div style={{
        ...dockedPage(isMobile),
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Quicksand', sans-serif",
        background: '#F4F8F5',
      }}>

        {/* Header — the band reaches back under the rail (dockedBleed). */}
        <div style={{
          padding: isMobile ? '16px 20px' : '20px 28px',
          ...dockedBleed(isMobile, 28),
          background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`,
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14,
        }}>
          {/* How this page is left — shared/panelTopBar.jsx: a ✕ at the far right on desktop, where
              nothing is "back" beside an always-visible rail; the arrow on a phone. */}
          {isMobile && <PanelBackArrow onClick={onClose} />}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Templates</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>Your own designs, and which Spattoo templates you offer</div>
          </div>
          {!isMobile && <PanelDismiss onClick={onClose} />}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 60, color: '#9BB5A2', fontSize: 14 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid #C5D4C8', borderTopColor: '#2C4433', animation: 'spin 0.7s linear infinite', marginRight: 10 }} />
              Loading templates…
            </div>
          )}

          {error && (
            <div style={{ padding: '14px 18px', borderRadius: 12, background: '#FEE2E2', color: '#991B1B', fontSize: 13, fontWeight: 600 }}>
              {error}
            </div>
          )}

          {templates && !loading && (
            <>
              {/* ⚠️ THEIR OWN GO FIRST. INVARIANTS #12 — a surface is laid out by what is reached for,
                  and this is the section a baker came here to find: the Spattoo switches are set once
                  and left, while their own library is the thing that grows every time they save a
                  design. It is also their content, and putting somebody else's list above it reads
                  as though the catalogue is the point and their work is an appendix. */}
              {apiClient.fetchMyTemplates && (
                <Section title="Your templates">
                  <Field label="Designs you saved" hint="Saved from the designer with “Save as Template”. Removing one deletes it straight away and cannot be undone — the cakes you have already sold are not affected.">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
                      {mine.length === 0 && (
                        <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 600 }}>
                          You haven’t saved any templates yet. Build a cake, then choose “Save as Template”.
                        </span>
                      )}
                      {mine.map((t, i) => (
                        <div key={t.id} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                          borderTop: i === 0 ? 'none' : '1px solid #F3F4F6',
                        }}>
                          <div style={{
                            width: 52, height: 40, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
                            background: '#FAFAF8', border: '1px solid #EAEFEA',
                          }}>
                            {t.thumbnail_url && (
                              <img src={t.thumbnail_url} alt={t.name} width={52} height={40} loading="lazy" decoding="async"
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#2C4433' }}>{t.name}</div>
                            {t.tier_count != null && (
                              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{t.tier_count}-tier</div>
                            )}
                          </div>
                          {/* A real <button> with its own edge, not a bare word — rule 7: a clickable
                              has to look like one at rest, on a phone, with no hover to help it. */}
                          <button
                            type="button"
                            onClick={() => setPending(t)}
                            disabled={removing}
                            style={{
                              padding: '7px 14px', borderRadius: 9, cursor: removing ? 'not-allowed' : 'pointer',
                              border: '1.5px solid #FBCFCF', background: '#FEF2F2', color: '#B91C1C',
                              fontSize: 12, fontWeight: 800, fontFamily: 'inherit', flexShrink: 0,
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </Field>
                </Section>
              )}

              <Section title="Spattoo templates">
                <Field label="Visible templates" hint="Turn off any template you don't want to offer. Hidden templates won't appear in your Templates menu or to your customers. Your own saved templates aren't affected.">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
                    {templates.length === 0 && (
                      <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 600 }}>No Spattoo templates available yet.</span>
                    )}
                    {templates.map((t, i) => {
                      const visible = !excluded.has(t.id);
                      return (
                        <div key={t.id} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                          borderTop: i === 0 ? 'none' : '1px solid #F3F4F6',
                        }}>
                          <div style={{
                            width: 52, height: 40, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
                            background: '#FAFAF8', border: '1px solid #EAEFEA',
                            opacity: visible ? 1 : 0.4, transition: 'opacity 0.2s',
                          }}>
                            {t.thumbnail_url && (
                              <img src={t.thumbnail_url} alt={t.name} width={52} height={40} loading="lazy" decoding="async"
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: visible ? '#2C4433' : '#9CA3AF' }}>{t.name}</div>
                            {t.tier_count != null && (
                              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{t.tier_count}-tier</div>
                            )}
                          </div>
                          <Toggle checked={visible} onChange={() => toggleTemplate(t.id)} />
                        </div>
                      );
                    })}
                  </div>
                </Field>
              </Section>

              {templates.length > 0 && (
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
                    {saving ? 'Saving…' : 'Save Templates'}
                  </button>
                  {saved && <span style={{ fontSize: 13, fontWeight: 700, color: '#2C4433' }}>✓ Saved</span>}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* THE shared confirmation (shared/Panel.jsx) — three hand-rolled ones had already drifted to
          three widths and three greys before it existed, so there is one and this uses it. */}
      <ConfirmPanel
        open={!!pending}
        isMobile={isMobile}
        title="Remove this template?"
        message={pending
          ? `“${pending.name}” will be deleted from your library and will stop appearing to your customers. This cannot be undone. Orders already placed from it are not affected.`
          : ''}
        confirmLabel={removing ? 'Removing…' : 'Remove'}
        cancelLabel="Keep it"
        danger
        busy={removing}
        onConfirm={() => pending && removeMine(pending.id)}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
