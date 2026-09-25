import { useRef } from 'react';
import useRevealOnScroll from '../../shared/useRevealOnScroll.js';

/* ── THE grid of cake templates ──────────────────────────────────────────────────────────────────
 *
 * Square, picture-only tiles that reveal a page at a time as you near the bottom. One component for
 * every DESIGNER-SIDE surface that shows templates:
 *
 *   the rail's Templates flyout     browse the catalogue to start a cake     onPick loads it
 *   Settings → Spattoo templates    browse the library to stock the shop     overlay adds it
 *   the catalogue's Edit mode       take one out of the shop                 overlay removes it
 *
 * Extracted from `CakeDesigner.jsx`, where it was inline JSX inside a 14,800-line file, because
 * `plans/baker-catalogue.md` needs a third use of it and there were already two. A third copy is how
 * a hand-rolled chip got committed while `src/shared/Chip.jsx` sat unused.
 *
 * ⚠️ NOT THE STOREFRONT'S GALLERY, DELIBERATELY. `storefront/facets/DesignFacet.jsx` has its own —
 * 118px captioned cards with a selected state, its own loading/error/empty copy, and the BAKER's
 * warm palette rather than the app's chrome. That is a decision, not drift: "this is the CUSTOMER's
 * storefront, which wears the BAKER's colours. Putting app furniture here would be the same mistake
 * as styling a baker's storefront in Spattoo green." Folding the two together would have to absorb
 * two palettes, caption-or-not, and click-loads versus click-selects. Left alone on purpose.
 *
 * ── WHAT IT OWNS AND WHAT IT ASKS FOR ──────────────────────────────────────────────────────────
 * Owns everything about how a template LOOKS and how the grid GROWS. Asks the caller only for what
 * a tap means, because that is the one thing genuinely different on each surface: the flyout loads a
 * design, the browser adds to a catalogue.
 */

// Both thumbnail shapes, because the list route and the full row name it differently.
const thumbSrc = (item) => item?.thumb_key ?? item?.thumbnail_url ?? null;

// Hide a thumbnail that fails to load so the tile shows its neutral background instead of the
// browser's broken-image icon.
const onThumbError = (e) => { e.currentTarget.style.display = 'none'; };

const s = {
  /* ⚠️ A GRID THAT COUNTS ITS OWN COLUMNS, and it runs on desktop too. This was `display: flex`
   * applied only when `isMobile`, so a phone got two columns and a desktop got none — every template
   * stacked in a single 200px lane, a worse use of a large screen than of a small one. `auto-fill` +
   * `minmax` means the count follows the width instead of being asserted per breakpoint: two columns
   * on a phone, three in the widened flyout, without either number appearing anywhere. */
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))',
    gap: 10,
  },
  /* ⚠️ THE PICTURE IS THE WHOLE CARD — no caption row, so no bottom padding and no gap to hold one.
   * Square because the stored thumbnails ARE square: the capture canvas is a fixed 400x400, so a 3:2
   * box showed every cake letterboxed with a dead gutter down each side. */
  card: {
    border: '1.5px solid #999999', borderRadius: 12,
    overflow: 'hidden', cursor: 'pointer',
    display: 'flex', flexDirection: 'column',
    padding: 0,
    transition: 'all 0.15s',
    flexShrink: 0,
    position: 'relative',   // anchors the badge, the ⤢ button and any overlay
  },
  cardOn: { borderColor: '#333333', boxShadow: '0 0 0 2px rgba(51,51,51,0.14)' },
  placeholder: {
    width: '100%', aspectRatio: '1 / 1',
    background: '#FAFAF8', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    fontSize: 32,
  },
  /* ⚠️ ON the picture, not beside a name — there is no name to sit beside. Top LEFT, because the ⤢
   * preview button owns the top right on a phone, and two chips in one corner is a collision that
   * would only show up on the one device that cannot hover. */
  badge: {
    position: 'absolute', top: 6, left: 6, zIndex: 1,
    fontSize: 9, color: '#333', fontWeight: 700,
    background: 'rgba(255,255,255,0.92)', border: '1px solid #999999',
    borderRadius: 4, padding: '1px 5px', letterSpacing: 0.3,
    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
  },
  previewBtn: {
    position: 'absolute', top: 6, right: 6,
    width: 26, height: 26, borderRadius: 8,
    border: 'none', background: 'rgba(255,255,255,0.92)',
    boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
    fontSize: 13, lineHeight: 1, color: '#333', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    WebkitTapHighlightColor: 'transparent',
  },
  tail: {
    fontSize: 10.5, color: '#C3CBC6', fontWeight: 600,
    textAlign: 'center', padding: '10px 0 2px',
  },
};

/**
 * templates     the filtered list. ⚠️ MUST BE A STABLE ARRAY — `useRevealOnScroll` resets on array
 *               IDENTITY, because a new array means a new question (a filter changed, a word was
 *               typed) and the grid must start at the top. A caller rebuilding it every render would
 *               reset every render and reveal nothing. Pass a `useMemo`.
 * isMobile      touch has no hover, so the preview needs an explicit control instead
 * onPick        what a tap MEANS on this surface — load the design, or add to a catalogue
 * onPreview     ({ src, name, tiers, rect }) — show the enlarged picture. `rect` is the tile's
 *               bounding box on desktop (anchor beside it) and null from the ⤢ button (centre it).
 *               The overlay itself stays with the caller: it is portalled past the panel's clipping,
 *               which is not this component's business.
 * onPreviewEnd  the pointer left — clear it
 * overlay       optional (t) => node, rendered over the tile. The seam for "remove from catalogue"
 *               and "add to catalogue". ⚠️ Its own control must stopPropagation, or picking is
 *               indistinguishable from acting on the tile.
 * selectedIds   optional Set of ids to draw as chosen — the Spattoo browser showing what is already
 *               in the catalogue
 * page          how many appear at a time (the hook's default is 24)
 */
export default function TemplateGrid({
  templates,
  isMobile = false,
  onPick,
  onPreview,
  onPreviewEnd,
  overlay,
  selectedIds,
  page = 24,
}) {
  const { visible, sentinelRef, done } = useRevealOnScroll(templates, { page });
  const total = templates?.length ?? 0;

  /* A short delay before the hover preview, so running the cursor down the list does not strobe.
   *
   * ⚠️ A REF, NOT A LOCAL. The first cut of this extraction wrote `let timer = null` in the function
   * body and a comment arguing it was enough. It is not: the variable is re-created on every render,
   * so any re-render between mouseenter and mouseleave — and `onPreview` causes one in the caller —
   * leaves `hoverOut` clearing a fresh `null` while the pending timeout from the previous render
   * still fires. The result is a preview that appears after the pointer has gone. CakeDesigner used
   * `tplPreviewTimer.current` for exactly this reason; keeping a ref keeps that fix. */
  const timer = useRef(null);
  const hoverIn = (t, e) => {
    const src = thumbSrc(t);
    if (!src) return;
    const rect = e.currentTarget.getBoundingClientRect();
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => onPreview?.({ src, name: t.name, tiers: t.tier_count, rect }), 180);
  };
  const hoverOut = () => { clearTimeout(timer.current); onPreviewEnd?.(); };

  return (
    <>
      <div style={s.grid}>
        {visible.map(t => {
          const src = thumbSrc(t);
          const on = selectedIds?.has?.(t.id) ?? false;
          return (
            <div
              key={t.id}
              style={{ ...s.card, ...(on ? s.cardOn : null) }}
              /* Desktop only: touch has no hover, and the two substitutes both break here —
                 long-press fights the panel's own scrolling, and a tap already picks the template. */
              onMouseEnter={isMobile ? undefined : (e) => hoverIn(t, e)}
              onMouseLeave={isMobile ? undefined : hoverOut}
              onClick={() => onPick?.(t)}
            >
              {src
                /* ⚠️ `height: 'auto'` IS LOAD-BEARING. The width/height ATTRIBUTES reserve the tile
                   before the picture arrives (no reflow as the grid fills), but they are
                   presentational hints — and with no author height, `height=180` BEATS
                   `aspect-ratio`: measured 171x180 instead of 171x171, a tile that was square in the
                   stylesheet and not on the screen. */
                ? <img src={src} alt={t.name} width={180} height={180} loading="lazy" decoding="async"
                       onError={onThumbError}
                       style={{ width: '100%', height: 'auto', aspectRatio: '1 / 1', objectFit: 'contain',
                                borderRadius: 8, background: '#FAFAF8', display: 'block' }} />
                : <div style={s.placeholder} />
              }

              {/* Mobile's stand-in for hover. An explicit control, not a gesture: tapping the card
                  picks the template, so the preview needs a target of its own. */}
              {isMobile && src && (
                <button type="button" aria-label={`Preview ${t.name}`} style={s.previewBtn}
                  onClick={(e) => {
                    e.stopPropagation();          // never pick from this button
                    onPreview?.({ src, name: t.name, tiers: t.tier_count, rect: null });
                  }}
                >⤢</button>
              )}

              {/* ⚠️ NO NAME ON THE CARD, AND NO CAPTION AT ALL. Sandeep: "we can actually skip
                  showing the name. its difficult to name a lot of templates. thumbnail speaks. just
                  the way canva app does." The catalogue showed the label failing at the one job it
                  had — two cards read "Football" and two read "Dino" — so it was width spent on a
                  word that distinguished nothing.

                  ⚠️ THE NAME IS STILL HERE, IT IS JUST NOT DRAWN. It is the img's `alt` and the
                  preview button's label, so a screen reader still says which cake this is, and
                  `matchesTemplateSearch` still finds a template by a name nobody can see. Taking it
                  out of the DOM would leave a grid of pictures nothing can name. It stays READABLE
                  in the enlarged preview, which is how you tell those two Footballs apart. */}
              {t.offering === 'premium' && <span style={s.badge}>Premium</span>}

              {overlay?.(t)}
            </div>
          );
        })}
      </div>

      {/* ── The next page, before you get to the edge ──────────────────────────────────────────
          An empty element the observer watches. It sits AFTER the grid and inside the same scroller,
          so an ancestor that scrolls clips the intersection and this reads correctly in the desktop
          flyout and the phone sheet without being told which. Nothing is fetched when it fires. */}
      {!done && <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />}

      {/* ⚠️ SAID ONCE, AT THE END. A grid that simply stops reads as a grid that gave up. Only worth
          saying when there was more than one page to scroll through; on a short list the end is
          obvious and a line about it is noise. */}
      {done && total > page && (
        <div style={s.tail}>That&rsquo;s all {total} templates.</div>
      )}
    </>
  );
}
