import { useState, useEffect, useMemo } from 'react';
import { useIsMobile } from './controls.jsx';
import { dockedPage, dockedBleed } from '../shared/rail.js';
import { PanelBackArrow, PanelDismiss } from '../shared/panelTopBar.jsx';
import { ConfirmPanel } from '../shared/Panel.jsx';
import { INK } from '../shared/tokens.js';
import TemplateGrid from '../designer/shared/TemplateGrid.jsx';

/* ── Spattoo templates — the library a baker stocks their catalogue from ─────────────────────────
 *
 * Spattoo authors templates and publishes them from admin, and a baker’s own saved designs land here
 * want to offer. Tapping a tile puts it in their catalogue or takes it out. What they choose is what
 * their customers see — see plans/baker-catalogue.md.
 *
 * ⚠️ A GRID, NOT A LIST OF ROWS, and that is from the catalogue itself. 22 globals carry 16 distinct
 * names today — `Football` five times, `love` three — so a row labelled by name cannot tell two cakes
 * apart, and a search box over those names would concentrate the problem rather than solve it. The
 * browse flyout settled this already: "the picture identifies the cake". Same component, same tile.
 *
 * ⚠️ SAVES IMMEDIATELY, WHICH BREAKS THE SETTINGS CONVENTION ON PURPOSE. Every other panel here is
 * draft-until-Save, and this one cannot safely be: `leaveOpenPanels()` in CakeDesigner closes docked
 * pages on ANY rail click, and that file says so itself — "the day a docked panel starts holding
 * something a baker typed, it has to guard THIS path too". A catalogue assembled from hundreds of
 * tiles is a long session, so a draft here would be thirty taps a baker loses by pressing New Cake.
 * Protecting it would mean gating the rail's teardown for every destination; a grid does not need a
 * draft, because one tap IS the change and tapping again is the undo.
 *
 * ⚠️ THE PUT CARRIES THE WHOLE CATALOGUE, INCLUDING TEMPLATES THIS SCREEN DOES NOT SHOW. The route
 * replaces the set rather than taking a delta, so the baker's OWN offered designs have to travel with
 * every save from here or this screen would silently empty their half. That is why `offered` holds
 * every id from the fetch and only the DISPLAY is filtered to `source === 'spattoo'`.
 */
export default function LibraryPanel({ open, onClose, apiClient, primaryColor = INK, accentColor = '#333333' }) {
  const isMobile = useIsMobile();
  const [rows,    setRows]    = useState(null);
  const [offered, setOffered] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState(null);
  /* Which of the baker's OWN designs is being confirmed for deletion, and whether that call is out.
     ⚠️ Deleting is the one action here that tapping again cannot undo, so it is the one action that
     asks first — everything else on this screen saves silently on the tap. */
  const [pending,  setPending]  = useState(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    /* A host running an older build has no `fetchBakerCatalogue` — the route is newer than the
       released baker app. Render the empty state rather than failing on a method that is not there,
       the same guard `fetchMyTemplates` already carries in TemplatesPanel. */
    if (!apiClient.fetchBakerCatalogue) { setRows([]); return; }
    setLoading(true);
    apiClient.fetchBakerCatalogue()
      .then(list => {
        const arr = Array.isArray(list) ? list : [];
        setRows(arr);
        setOffered(new Set(arr.filter(t => t.offered).map(t => t.id)));
      })
      .catch(e => { setError(e.message); setRows([]); })
      .finally(() => setLoading(false));
  }, [open]);

  /* ── EVERYTHING THAT EXISTS, both sources ────────────────────────────────────────────────────
   * Spattoo's cakes and the baker's own saved designs, in one grid. This filtered to Spattoo's for
   * one day, while the baker's own lived on a separate page; Sandeep collapsed that:
   *
   *   "if it moves to library - now library becomes spattoo designs+baker designs. and only baker
   *    designs can be removed from library, while both can be added to catalogue. that keeps
   *    catalogue clean with only the selected templates."
   *
   * So Library is the whole shelf and Catalogue is the chosen subset. `GET /baker/catalogue` already
   * answers exactly this — globals plus the baker's own, each flagged `offered` and `source` — so
   * the response IS the shelf and nothing new is fetched.
   *
   * ⚠️ Memoised because TemplateGrid's reveal hook resets on array IDENTITY — a fresh array every
   * render would restart the grid at the top on every tap. */
  const shown = useMemo(() => rows ?? [], [rows]);

  /* Optimistic, then reconciled. The tile changes on the tap — a grid that waits for a round trip
     before showing anything reads as a dead control — and the previous set is restored if the call
     fails, so the screen never claims something the server did not accept. */
  async function toggle(t) {
    if (!apiClient.updateBakerCatalogue) return;
    const before = offered;
    const next = new Set(before);
    if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
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

  /* Delete one of the baker's OWN designs. Optimistic only AFTER the server says yes — a tile that
     vanishes and comes back is worse than one that takes a moment to go. It also leaves the offered
     set, because a deleted design cannot be in a catalogue. */
  async function removeMine(id) {
    if (!apiClient.deleteBakerTemplate) return;
    setRemoving(true); setError(null);
    try {
      await apiClient.deleteBakerTemplate(id);
      setRows(prev => (prev ?? []).filter(t => t.id !== id));
      setOffered(prev => { const next = new Set(prev); next.delete(id); return next; });
      setPending(null);
    } catch (e) {
      setError(e.message);
      setPending(null);
    } finally {
      setRemoving(false);
    }
  }

  if (!open) return null;

  const inCatalogue = shown.filter(t => offered.has(t.id)).length;

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* A page beside the rail, not a layer over the designer — see dockedPage. */}
      <div style={{
        ...dockedPage(isMobile),
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Quicksand', sans-serif",
        background: '#F4F8F5',
      }}>

        <div style={{
          padding: isMobile ? '16px 20px' : '20px 28px',
          ...dockedBleed(isMobile, 28),
          background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`,
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14,
        }}>
          {isMobile && <PanelBackArrow onClick={onClose} />}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Library</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
              Tap a cake to add it to your catalogue
            </div>
          </div>
          {!isMobile && <PanelDismiss onClick={onClose} />}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 60, color: '#9BB5A2', fontSize: 14 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid #C5D4C8', borderTopColor: '#2C4433', animation: 'spin 0.7s linear infinite', marginRight: 10 }} />
              Loading templates…
            </div>
          )}

          {/* One error surface for every tap, which is what immediate saving costs. It sits ABOVE the
              grid rather than on a tile: the tap that failed has already reverted, so what a baker
              needs is the reason, not which square it was. */}
          {error && (
            <div style={{ padding: '14px 18px', borderRadius: 12, background: '#FEE2E2', color: '#991B1B', fontSize: 13, fontWeight: 600 }}>
              {error}
            </div>
          )}

          {rows && !loading && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 20 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#2C4433' }}>
                  {inCatalogue} of {shown.length} in your catalogue
                </span>
                {busy && (
                  <span style={{ fontSize: 11, color: '#9BB5A2', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 11, height: 11, borderRadius: '50%', border: '2px solid #C5D4C8', borderTopColor: '#2C4433', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                    Saving
                  </span>
                )}
              </div>

              {shown.length === 0 && (
                <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 600 }}>
                  Nothing in your library yet. Spattoo’s cakes appear here as we publish them, and your own saved designs join them.
                </span>
              )}

              {/* ⚠️ `selectedIds` DRAWS the chosen ones and `onPick` TOGGLES — the same tile the browse
                  flyout uses, where a tap loads a design instead. The grid knows nothing about
                  catalogues; what a tap MEANS is this screen's business. */}
              <TemplateGrid
                templates={shown}
                isMobile={isMobile}
                selectedIds={offered}
                onPick={toggle}
                /* ⚠️ ONLY ON THE BAKER'S OWN. Spattoo's cakes can never be deleted — Sandeep:
                   "baker can never delete spattoo templates - he can only move them to catalogue or
                   from catalogue move back to library." `DELETE /baker/templates/:id` is scoped
                   `.eq('baker_id', req.bakerId)` and would 404 on a global anyway, so drawing the
                   control there would offer a button that cannot work.
                   Bottom-right, because the tile's two top corners are already spoken for: Premium
                   sits top-left and the ⤢ preview owns top-right on a phone. */
                overlay={apiClient.deleteBakerTemplate ? (t) => (t.source === 'mine' ? (
                  <button
                    type="button"
                    aria-label={`Delete ${t.name}`}
                    onClick={(e) => { e.stopPropagation(); setPending(t); }}
                    style={{
                      position: 'absolute', bottom: 6, right: 6, zIndex: 2,
                      border: '1.5px solid #FBCFCF', borderRadius: 8, padding: '3px 8px',
                      background: 'rgba(255,255,255,0.94)', boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
                      fontSize: 10.5, fontWeight: 800, color: '#B91C1C', fontFamily: 'inherit',
                      cursor: removing ? 'not-allowed' : 'pointer',
                    }}
                  >Delete</button>
                ) : null) : undefined}
              />

              {/* Says what a tap did, once, under the grid — the tiles carry no caption to say it. */}
              {shown.length > 0 && (
                <div style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.5, paddingTop: 4 }}>
                  Cakes with a dark outline are in your catalogue — your customers can order those.
                  Changes save as you tap. Your own designs can be deleted; Spattoo’s move in and out
                  of the catalogue but stay on the shelf.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* THE shared confirmation (shared/Panel.jsx) — three hand-rolled ones had already drifted to
          three widths and three greys before it existed. Deleting is the one action on this screen
          that tapping again cannot undo, so it is the one that asks first. */}
      <ConfirmPanel
        open={!!pending}
        isMobile={isMobile}
        title="Delete this design?"
        message={pending
          ? `“${pending.name}” will be deleted from your library and will stop appearing to your customers. This cannot be undone. Orders already placed from it are not affected.`
          : ''}
        confirmLabel={removing ? 'Deleting…' : 'Delete'}
        cancelLabel="Keep it"
        danger
        busy={removing}
        onConfirm={() => pending && removeMine(pending.id)}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
