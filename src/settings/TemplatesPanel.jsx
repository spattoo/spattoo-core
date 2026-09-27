import { useState, useEffect } from 'react';
import { useIsMobile, Toggle, Section, Field } from './controls.jsx';
import { dockedPage, dockedBleed } from '../shared/rail.js';
import { PanelBackArrow, PanelDismiss } from '../shared/panelTopBar.jsx';
import { ConfirmPanel } from '../shared/Panel.jsx';
import { INK } from '../shared/tokens.js';

// My templates — the designs this baker saved, and whether each one is in their catalogue.
//
// A top-level settings destination (peer of Flavours), reached from the Settings gear. Two things a
// baker does to their own work:
//
//   REMOVE        delete it for good. GET /api/baker/templates/mine, DELETE /api/baker/templates/:id.
//   IN CATALOGUE  offer it to customers, or stop. PUT /api/baker/catalogue.
//
// ⚠️ THE SPATTOO LIBRARY MOVED OUT OF THIS FILE. It used to sit here as a second section of on/off
// switches, because the model was opt-OUT: every global template was offered until a baker hid it.
// Under a chosen catalogue those stopped being one screen — stocking a shop from a library of
// hundreds is a browsing task with its own page (SpattooTemplatesPanel, a grid), while this one is
// the short list of your own work. See plans/baker-catalogue.md.
//
// ⚠️ SAVING A DESIGN NO LONGER PUBLISHES IT. Until 2026-09-25 `templatesForBaker` returned every
// template with this baker's id unconditionally, so a design was on their storefront the moment they
// saved it — nobody decided that, it fell out of the query. Now the save modal asks ("Also add to my
// catalogue", default off) and anything unticked waits here until the toggle below is used.
//
// ⚠️ BOTH ACTIONS ARE IMMEDIATE, and that is a change. The old on/off set was a draft until a "Save
// Templates" button; there is no button now. `leaveOpenPanels()` in CakeDesigner closes docked pages
// on ANY rail click, and that file warns that a panel holding unsaved work would have to guard that
// path — so nothing here holds any. A toggle is one tap to undo; a Remove is confirmed first.
//
// ⚠️ THE CATALOGUE PUT CARRIES TEMPLATES THIS SCREEN DOES NOT SHOW. The route replaces the whole set
// rather than taking a delta, so the Spattoo templates the baker has chosen must travel with every
// save from here — otherwise managing your own designs would quietly empty your shop. That is why
// `offered` holds every id from GET /api/baker/catalogue and only the display is filtered to
// `source === 'mine'`.
export default function TemplatesPanel({ open, onClose, apiClient, primaryColor = INK, accentColor = '#333333' }) {
  const isMobile = useIsMobile();
  const [mine,      setMine]      = useState(null);
  /* EVERY offered id, not just this baker's own — the catalogue PUT replaces the whole set, so the
     Spattoo templates they have chosen have to travel with a save from here. Only the DISPLAY is
     filtered to their own designs. */
  const [offered,   setOffered]   = useState(() => new Set());
  // Which of the baker's own templates is being confirmed for removal, and whether that call is out.
  const [pending,   setPending]   = useState(null);
  const [removing,  setRemoving]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (!apiClient.fetchMyTemplates) { setMine([]); return; }
    setLoading(true);
    /* Two calls, one spinner. `fetchMyTemplates` gives the rows — it carries `created_at`, which the
       catalogue route does not — and `fetchBakerCatalogue` gives what is offered. The catalogue half
       is optional: a host older than that route simply shows no toggles rather than failing the
       whole page on a method that is not there, the same guard this file already used for
       `fetchMyTemplates`. */
    Promise.all([
      apiClient.fetchMyTemplates(),
      apiClient.fetchBakerCatalogue ? apiClient.fetchBakerCatalogue().catch(() => []) : Promise.resolve([]),
    ])
      .then(([own, catalogue]) => {
        const all = Array.isArray(catalogue) ? catalogue : [];
        setOffered(new Set(all.filter(t => t.offered).map(t => t.id)));

        /* ── What this screen LISTS ───────────────────────────────────────────────────────────
         * Every design of the baker's own — offered or not — plus every Spattoo cake they have
         * added. That is the whole of "what do I sell?", and it is why there is no separate My
         * templates page any more.
         *
         * ⚠️ THEIR OWN ARE LISTED EVEN WHEN NOT OFFERED, and that is the point rather than an
         * oversight. Switch one off and it has to stay visible somewhere, or it exists in the
         * database and appears on no screen at all — no way to see it, turn it back on, or delete
         * it. Designs would pile up invisibly. Spattoo's are the opposite: taken out of the
         * catalogue they go back to being Library rows, which is a page that already exists.
         *
         * Their own come first — INVARIANTS #12, and it is their content. `fetchMyTemplates` is the
         * source for those because it carries `created_at`, which the catalogue route does not. */
        const mineRows = (Array.isArray(own) ? own : []).map(t => ({ ...t, source: 'mine' }));
        const mineIds = new Set(mineRows.map(t => t.id));
        const addedFromLibrary = all.filter(t => t.source !== 'mine' && t.offered && !mineIds.has(t.id));
        setMine([...mineRows, ...addedFromLibrary]);
      })
      .catch(e => { setError(e.message); setMine([]); })
      .finally(() => setLoading(false));
  }, [open]);

  /* Optimistic, then reconciled — the row changes on the tap, and the previous set is restored if
     the call fails, so the screen never claims something the server did not accept. No Save button:
     a rail click closes this page, and nothing here may hold work that a click would lose. */
  async function toggleCatalogue(id) {
    if (!apiClient.updateBakerCatalogue) return;
    const before = offered;
    const next = new Set(before);
    if (next.has(id)) next.delete(id); else next.add(id);
    setOffered(next);
    setBusy(true); setError(null);
    try {
      await apiClient.updateBakerCatalogue([...next]);
    } catch (e) {
      setOffered(before);
      setError(e.message);
    } finally {
      setBusy(false);
    }
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
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Catalogue</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>What your customers can order</div>
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

          {mine && !loading && (
            <Section title="Your catalogue">
              <Field
                label="Cakes you offer"
                hint="Saved from the designer with “Save as Template”. Turn one on to let customers order it. Removing deletes it for good — the cakes you have already sold are not affected."
              >
                {/* Says what the toggle means once, where it applies, rather than on every row. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 18, marginTop: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#9BB5A2', letterSpacing: 0.4, textTransform: 'uppercase' }}>
                    In my catalogue
                  </span>
                  {busy && (
                    <span style={{ fontSize: 11, color: '#9BB5A2', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 11, height: 11, borderRadius: '50%', border: '2px solid #C5D4C8', borderTopColor: '#2C4433', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                      Saving
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
                  {mine.length === 0 && (
                    <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 600 }}>
                      You haven’t saved any templates yet. Build a cake, then choose “Save as Template”.
                    </span>
                  )}
                  {mine.map((t, i) => {
                    const inCatalogue = offered.has(t.id);
                    const isMine = t.source === 'mine';
                    return (
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
                          {/* ⚠️ SHORT ON A PHONE, and that is from looking at it. The row carries a
                              thumbnail, a name, this line, a toggle and Remove — five things — and at
                              375px "2-tier · Customers can order this" wrapped to three lines and
                              squeezed the name to about 90px. The switch beside it already says which
                              way is on; this only has to name what "on" MEANS, and "Orderable" does
                              that in one word. The full sentence stays on desktop, where there is
                              room for it. */}
                          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                            {t.tier_count != null ? `${t.tier_count}-tier` : ''}
                            {t.tier_count != null && ' · '}
                            {/* ⚠️ WHOSE IT IS, BECAUSE IT DECIDES WHAT THE ROW CAN DO. Only the
                                baker's own carry Remove; a Spattoo cake leaves the catalogue by its
                                toggle and goes back to being a Library row. Without this the missing
                                button is the only clue, and an absent control explains nothing. */}
                            {isMine ? 'Yours' : 'Spattoo'}
                            {' · '}
                            {isMobile
                              ? (inCatalogue ? 'Orderable' : 'Not offered')
                              : (inCatalogue ? 'Customers can order this' : 'Not offered yet')}
                          </div>
                        </div>

                        {/* ⚠️ ONLY WHERE THE HOST CAN SAVE IT. A baker app older than
                            PUT /api/baker/catalogue has no `updateBakerCatalogue`, and a switch that
                            silently does nothing is worse than no switch — so it is not drawn. */}
                        {apiClient.updateBakerCatalogue && (
                          <Toggle checked={inCatalogue} onChange={() => toggleCatalogue(t.id)} />
                        )}

                        {/* ⚠️ THEIR OWN ONLY. This screen lists Spattoo cakes too now, and
                            `DELETE /api/baker/templates/:id` is scoped `.eq('baker_id', req.bakerId)`
                            — so on a Spattoo row it would answer 404 and delete nothing. A button
                            that cannot work is worse than no button: the baker taps it, an error
                            appears, and nothing explains why. Taking a Spattoo cake out of the
                            catalogue is the toggle's job; it goes back to being a Library row.

                            A real <button> with its own edge, not a bare word — rule 7: a clickable
                            has to look like one at rest, on a phone, with no hover to help it. */}
                        {isMine && (
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
                        )}
                      </div>
                    );
                  })}
                </div>
              </Field>
            </Section>
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
