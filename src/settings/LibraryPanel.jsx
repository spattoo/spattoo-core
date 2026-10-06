import { useState, useEffect, useMemo } from 'react';
import { useIsMobile } from './controls.jsx';
import { dockedPage, dockedBleed } from '../shared/rail.js';
import { PanelBackArrow, PanelDismiss } from '../shared/panelTopBar.jsx';
import { ConfirmPanel } from '../shared/Panel.jsx';
import { INK } from '../shared/tokens.js';
import TemplateGrid from '../designer/shared/TemplateGrid.jsx';
/* ⚠️ THE SAME MATCHER THE CATALOGUE FLYOUT USES, not a second one. It reads `name`, `tag_slugs` and
   `search_slugs` — the last being what makes "rainbow" find a cake named "kids birthday cake" — and
   it parses age phrases ("4 years") against `attrs`. `GET /baker/catalogue` was widened to carry all
   three for exactly this; a private copy here would drift from the flyout the first time either
   changed. `nameBySlug` is not passed: it only adds tag DISPLAY names, and since words are matched
   one at a time, "baby shower" still finds the slug `baby-shower`. */
import { matchesTemplateSearch, splitRecent, RECENT_DAYS } from '../designer/templateFilter.js';
import { TrashIcon } from '../shared/icons.jsx';

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
/* `onPickTemplate` — start a cake from this design. Supplied by CakeDesigner, which owns the canvas;
   it is the SAME function the Catalogue flyout picks with, so "start from a template" has one
   implementation rather than two that drift. Absent (a host that only manages a catalogue) means the
   tiles are not pickable, and TemplateGrid then drops the pointer cursor by itself. */
/* ── A heading over a shelf ──────────────────────────────────────────────────────────────────────
 * Small, quiet and NOT a control: it names what the run of tiles below it is, and the hint says why
 * those and not others, because "Recent" on its own invites "recent how?" — the question the window
 * exists to answer. The count is here for the same reason the page's own count line carries one: a
 * baker scanning a wall of pictures cannot tell four from six at a glance.
 *
 * Plain text rather than a NavRow or a Disclosure: nothing here opens, and rule 7 cuts both ways —
 * something that does NOT do anything must not look like it does.
 */
function SectionHead({ label, hint, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
                  marginTop: 4, marginBottom: 2 }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.9, textTransform: 'uppercase',
                     color: '#2C4433' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF' }}>
        {count}{hint ? ` · ${hint}` : ''}
      </span>
    </div>
  );
}

export default function LibraryPanel({ open, onClose, apiClient, onPickTemplate, pickingId = null, primaryColor = INK, accentColor = '#333333' }) {
  const isMobile = useIsMobile();
  const [rows,    setRows]    = useState(null);
  const [offered, setOffered] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState(null);
  const [query,   setQuery]   = useState('');
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

  /* ── WHAT IS NOT IN THE CATALOGUE — one place, never two ──────────────────────────────────────
   * Both sources, Spattoo's cakes and the baker's own, but only the ones they have NOT chosen yet.
   * Sandeep's rule, and it is the whole shape of these two screens:
   *
   *   "a template should appear either in library or in catalogue at a given time."
   *
   * So adding a cake REMOVES it from this grid — the tile leaves, and appears in the Catalogue. That
   * is why there is no chosen-outline here any more: nothing on this shelf is in the catalogue, so an
   * outline could only ever draw on nothing. Taking one back out is the Catalogue's job.
   *
   * ⚠️ FILTERED BY `offered`, NEVER BY `source`. Both kinds share this shelf — "library becomes
   * spattoo designs+baker designs" — and filtering by source is what put the baker's own designs on a
   * separate page, where a design switched off existed in the database and appeared on no screen.
   *
   * ⚠️ Memoised because TemplateGrid's reveal hook resets on array IDENTITY — a fresh array every
   * render would restart the grid at the top on every tap. */
  /* ⚠️ TWO LISTS, BECAUSE THE COUNT AND THE GRID ANSWER DIFFERENT QUESTIONS. `unchosen` is the
     SHELF — what "to choose from" means — and must not shrink because somebody typed; `shown` is
     what the grid draws. Filtering one list for both would silently turn "48 to choose from" into
     "6 to choose from", which is a different claim about the bakery. */
  const unchosen = useMemo(() => (rows ?? []).filter(t => !offered.has(t.id)), [rows, offered]);
  const shown = useMemo(
    () => (query.trim() ? unchosen.filter(t => matchesTemplateSearch(t, query)) : unchosen),
    [unchosen, query],
  );

  /* ⚠️ ONE overlay, not one per grid. The Recent section draws a SECOND TemplateGrid, and the
   * obvious way to do that is to paste the overlay into it — which is precisely how this codebase
   * ends up with two buttons that drift (root CLAUDE.md rule 1). Defined once here, where it can
   * still close over `busy`, `removing` and the two api calls. */
  const tileOverlay = (t) => (
              <>
                {/* ⚠️ AN ICON, TOP RIGHT — Sandeep asked for it there. It frees the bottom row for
                    the one control that needs words, and the corner is genuinely free on this
                    screen: Premium sits top-LEFT, and the ⤢ preview that owns top-right in the
                    flyout is never drawn here (no `onPreview` is passed). The label lives in
                    `aria-label`, so the action is still announced and still testable. */}
                {apiClient.deleteBakerTemplate && t.source === 'mine' && (
                  <button
                    type="button"
                    aria-label={`Delete ${t.name}`}
                    title={`Delete ${t.name}`}
                    onClick={(e) => { e.stopPropagation(); setPending(t); }}
                    style={{
                      position: 'absolute', top: 6, right: 6, zIndex: 2,
                      width: 26, height: 26, borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1.5px solid #FBCFCF',
                      background: 'rgba(255,255,255,0.94)', boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
                      color: '#B91C1C', padding: 0,
                      cursor: removing ? 'not-allowed' : 'pointer',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  ><TrashIcon size={14} /></button>
                )}

                {/* The one action that needs words, alone along the bottom now. */}
                {apiClient.updateBakerCatalogue && (
                  <button
                    type="button"
                    aria-label={`Move ${t.name} to catalogue`}
                    disabled={busy}
                    onClick={(e) => { e.stopPropagation(); addToCatalogue(t); }}
                    style={{
                      position: 'absolute', left: 6, right: 6, bottom: 6, zIndex: 2,
                      border: '1.5px solid #C5D4C8', borderRadius: 8, padding: '4px 6px',
                      background: 'rgba(255,255,255,0.94)', boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
                      fontSize: 10.5, fontWeight: 800, color: '#2C4433', fontFamily: 'inherit',
                      cursor: busy ? 'progress' : 'pointer',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >Move to catalogue</button>
                )}
              </>
  );

  /* ── What arrived this week, lifted to the top ───────────────────────────────────────────────
   * The shelf is ordered `sort_order, name` — how you BROWSE it, which says nothing about what is
   * new. A baker's commonest errand here is "put the design I just saved into my catalogue", and
   * that design lands wherever its name falls among forty others.
   *
   * ⚠️ LIFTED OUT, NOT PINNED AND ALSO LEFT BELOW. Every tile on this screen is a picture with no
   * caption — the panel's own note says "the picture identifies the cake" — so the same cake drawn
   * twice is two identical tiles with no way to tell they are one thing. Tapping one and watching
   * the other stay put is the bug that would produce. This panel already holds the matching rule
   * one level up ("a template should appear either in library or in catalogue at a given time");
   * appearing twice on the SAME shelf is the same mistake in miniature.
   *
   * ⚠️ NOT WHILE SEARCHING. A query is a different question — "where is the football one" — and the
   * answer to it is one ranked shelf, not two that split the matches by age. `searching` collapses
   * back to a single grid.
   *
   * Memoised on `shown` for the identity reason the comment above gives: TemplateGrid's reveal hook
   * restarts the grid at the top when the array it is handed changes identity. */
  const { recent, rest } = useMemo(() => splitRecent(shown), [shown]);

  /* Optimistic, then reconciled. The tile leaves on the tap — a grid that waits for a round trip
     before showing anything reads as a dead control — and the previous set is restored if the call
     fails, so the screen never claims something the server did not accept.

     ⚠️ ADD-ONLY, and that is not a simplification: a cake already in the catalogue is not on this
     screen to tap. Removing is the Catalogue's affordance ("catalogue should have option to move to
     library"), which is the other half of one template being in one place at a time. */
  async function addToCatalogue(t) {
    if (!apiClient.updateBakerCatalogue) return;
    const before = offered;
    const next = new Set(before).add(t.id);
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

  /* What is left to choose from, which is what this screen now holds. `offered.size` is the other
     side of the same coin — the Catalogue's count — and says where the rest went. */
  // The SHELF's size, not the search result's — see the two lists above.
  const available = unchosen.length;
  const searching = query.trim().length > 0;
  /* ⚠️ BELOW `searching`, not beside `recent` where it reads better. `const` is not hoisted, so
     declaring this next to the split put it in `searching`'s temporal dead zone and the panel threw
     "Cannot access 'searching' before initialization" the moment it mounted — a blank Library. It
     built clean and check:bindings passed it: the name IS declared, 90 lines further down. Only
     opening the screen found it. */
  const sectioned = !searching && recent.length > 0;

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
              Tap a cake to open it · “Move to catalogue” to offer it
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
              {/* ⚠️ SEARCH HERE MATCHES MORE THAN NAMES, WHICH IS THE ONLY REASON IT EXISTS. This
                  file argued against a search box over the names — 34 rows carry 23 distinct names,
                  `football` six times, `dino` and `love` three each — and that objection stands. It
                  is answered by what is matched, not by the box: tags and `search_slugs` (the
                  decorations on the cake and the words piped on it) come from the route now, so
                  "rainbow" finds a cake called "kids birthday cake" and the six Footballs are told
                  apart by what is on them. Same placement and same wording as the Catalogue
                  flyout's, so the two shelves are searched the same way. */}
              {/* ⚠️ ITS OWN BOTTOM MARGIN, NOT THE CONTAINER'S GAP. Sandeep: "in library search box is
                  touching the cake tiles." The page body already sets `gap: 12`, but 12px between a
                  bare input and a row of bordered tiles reads as touching — the tile's own edge
                  starts where the gap ends, so there is no visual breathing space at all. Widening
                  the container gap would move every other pair on this page; this row is the one
                  that needs the room, so it asks for it itself. */}
              {/* ⚠️ `flexShrink: 0`, and it is load-bearing on a phone. The page body is a flex
                  COLUMN, so this row is a flex item and shrank to its own `minHeight: 20` once the
                  content below it got taller — while its children, wrapped onto two lines at 390px,
                  kept their real height and drew OUTSIDE the box. The count line landed on top of
                  the Recent heading. Nothing errored and the desktop layout was perfect, because
                  there the row never wraps. (Same family as the earlier "search box is touching the
                  cake tiles": this row's height has been the fragile one on this screen.) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 20,
                            flexWrap: 'wrap', marginBottom: 10, flexShrink: 0 }}>
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search templates…"
                  aria-label="Search your library"
                  style={{ flex: '1 1 220px', maxWidth: 340, minWidth: 0, padding: '6px 10px',
                           border: '1.5px solid #999999', borderRadius: 8, fontSize: 12,
                           fontFamily: "'Quicksand', sans-serif", color: '#333', outline: 'none',
                           boxSizing: 'border-box', background: '#ffffff' }}
                />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#2C4433' }}>
                  {searching
                    ? `${shown.length} of ${available} match · ${offered.size} in your catalogue`
                    : `${available} to choose from · ${offered.size} in your catalogue`}
                </span>
                {busy && (
                  <span style={{ fontSize: 11, color: '#9BB5A2', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 11, height: 11, borderRadius: '50%', border: '2px solid #C5D4C8', borderTopColor: '#2C4433', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                    Saving
                  </span>
                )}
              </div>

              {/* Two very different emptinesses, and saying the wrong one is alarming. Everything
                  chosen is success; nothing to choose is a new bakery waiting on us. */}
              {/* ⚠️ THREE EMPTINESSES NOW, AND SAYING THE WRONG ONE IS ALARMING. "Everything is
                  chosen" is success and "nothing here yet" is a new bakery — but a search that
                  matches nothing is neither, and telling a baker with 48 cakes that their library is
                  empty because they mistyped would be the worst of the three. The search case is
                  tested FIRST for that reason, and it offers the way back rather than just the bad
                  news. */}
              {shown.length === 0 && (
                searching ? (
                  <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 600,
                                 display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    Nothing here matches “{query.trim()}”.
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      style={{ border: '1.5px solid #C5D4C8', borderRadius: 8, padding: '3px 9px',
                               background: '#fff', font: 'inherit', fontSize: 11.5, fontWeight: 800,
                               color: '#2C4433', cursor: 'pointer' }}
                    >Clear search</button>
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}>
                    {offered.size > 0
                      ? 'Every design is in your catalogue. Move one back here from Catalogue to set it aside.'
                      : 'Nothing in your library yet. Spattoo’s cakes appear here as we publish them, and your own saved designs join them.'}
                  </span>
                )
              )}

              {/* ⚠️ NO `selectedIds`, DELIBERATELY. Every tile here is un-chosen by definition, so an
                  outline would draw on all of them or none — it carried meaning only while this shelf
                  showed both states. The same tile the Catalogue flyout uses, where a tap loads a
                  design instead; the grid knows nothing about catalogues, and what a tap MEANS is
                  this screen's business. */}
              {sectioned && (
                <>
                  <SectionHead
                    label="Recent"
                    hint={`added in the last ${RECENT_DAYS} days`}
                    count={recent.length}
                  />
                  <TemplateGrid
                    templates={recent}
                    isMobile={isMobile}
                    busyId={pickingId}
                    onPick={onPickTemplate}
                    overlay={tileOverlay}
                  />
                  {/* ⚠️ "Previous", and it does NOT license sorting this list by date. Sandeep chose
                      the word over "Everything else", which read as leftovers for a shelf a baker is
                      about to choose from. It is accurate about WHICH cakes are here — the ones from
                      before this week — and the one thing to know is that the list below keeps the
                      server's `sort_order, name` browsing order, not a chronology. The obvious
                      "tidy-up" is to make the word literal by sorting newest-first; that replaces
                      Spattoo's authored browse order with a changelog, on the larger of the two
                      shelves. Change the word before you change the order. */}
                  {rest.length > 0 && <SectionHead label="Previous" count={rest.length} />}
                </>
              )}

              <TemplateGrid
                templates={sectioned ? rest : shown}
                isMobile={isMobile}
                /* The wait belongs to CakeDesigner (it owns the canvas and the fetch), so the id
                   comes in rather than being tracked twice. */
                busyId={pickingId}
                /* ⚠️ A TAP OPENS THE DESIGN — IT DOES NOT STOCK THE SHOP. Sandeep asked for both
                   halves of this, a day apart, and together they are coherent rather than a reversal:

                     "even clicking by mistake will add it to catalogue. it should be a deliberate
                      action. add button like 'Move to catalogue' for each template."
                     "user should be able to load the template to canvas when clicking on the
                      template. they want to customise an existing one and create a new one out of it."

                   The asymmetry is the whole point. Loading a design onto the canvas costs nothing
                   and a new cake undoes it; publishing one to strangers has no undo, and stays a
                   named button. So the tile is pickable again, and the picture means "show me this
                   cake", exactly as it does in the Catalogue flyout — the same handler, passed in. */
                onPick={onPickTemplate}
                overlay={tileOverlay}
              />

              {/* Says what the buttons do, once, under the grid — the tiles carry no caption. */}
              {shown.length > 0 && (
                <div style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.5, paddingTop: 4 }}>
                  Tap a cake to open it on the canvas and make your own version of it.
                  “Move to catalogue” starts offering it to your customers and moves it out of this
                  list — that saves straight away, and you can move it back from Catalogue. Your own
                  designs can be deleted; Spattoo’s always stay available here.
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
