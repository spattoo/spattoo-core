import { useEffect, useRef, useState } from 'react';

/* ── Show more as you reach the bottom, without a button and without a request ───────────────────
 *
 * A list that is already in memory, revealed a page at a time. Put the returned `sentinelRef` on an
 * empty element after the last item; when it comes near the viewport the next page appears.
 *
 * ⚠️ THIS IS A RENDERING CONTROL, NOT PAGINATION. Nothing is fetched. The whole filtered list is
 * already held — that is what Layer 1 bought by taking `design` out of the list payload — so growing
 * the slice costs nothing and there is no moment that can feel like a reload. Sandeep, on Amazon and
 * Myntra: "you dont feel like those are refreshing or reloading." A request between pages is exactly
 * what would break that, which is why this deliberately has none.
 *
 * ⚠️ AND IT IS NOT VIRTUALISATION. Revealed items stay in the DOM. Thumbnails already carry
 * `loading="lazy"`, so off-screen pictures are never fetched; nodes are the cheap part. Reach for a
 * windowing library only when a measurement says nodes are the problem — core ships vendored into
 * two apps, so a dependency here is a decision with a blast radius.
 *
 * ⚠️ PASS A STABLE ARRAY. The reset below keys on the array's IDENTITY, because a new array means a
 * new question — a filter changed, a word was typed — and the grid must start at the top rather than
 * halfway down results nobody has seen. A caller that rebuilds its array every render would reset on
 * every render and never reveal anything; memoise it (the templates grid passes a `useMemo`).
 *
 * See plans/template-browsing-at-scale.md, Layer 2.
 */
export default function useRevealOnScroll(items, { page = 24, rootMargin = '600px' } = {}) {
  const list = items ?? [];
  const total = list.length;
  const [count, setCount] = useState(page);
  const sentinelRef = useRef(null);

  useEffect(() => { setCount(page); }, [items, page]);

  const done = count >= total;

  useEffect(() => {
    /* ⚠️ NO OBSERVER, NO HIDING. vitest renders these components with renderToStaticMarkup in node,
       where IntersectionObserver does not exist — and an old browser is the same case. Falling back
       to "reveal everything" makes the absence of this feature look like the grid before it, rather
       than like a catalogue that mysteriously stops at 24. */
    if (typeof IntersectionObserver === 'undefined') { setCount(total); return undefined; }

    const el = sentinelRef.current;
    if (!el || done) return undefined;

    /* `rootMargin` is what keeps it from feeling like paging at all: the next page is revealed
       before the sentinel is on screen, so the grid has already grown by the time you would have
       reached the end of it. root is the viewport — an ancestor that scrolls (the flyout, the phone
       sheet) still clips the intersection, so this reads correctly inside either without being told
       which one it is in. */
    const io = new IntersectionObserver(
      entries => { if (entries.some(e => e.isIntersecting)) setCount(c => Math.min(c + page, total)); },
      { rootMargin },
    );
    /* ⚠️ OBSERVE ON THE NEXT FRAME, NOT SYNCHRONOUSLY — and this half is as load-bearing as the
     * `count` dependency below. `observe()` reports the CURRENT intersection immediately, and since
     * this effect re-runs after every reveal, observing at once asks the question against a layout
     * the browser has not performed yet: the new row is not on screen, the sentinel still looks to
     * be in view, the callback advances again, and it cascades to the end of the list.
     *
     * Measured, with `count` in the deps but observing synchronously: 60 of 60 tiles on mount at a
     * 900px viewport, and 30 at 300px — the whole list revealed before a single scroll, which
     * removes the paging this hook exists to provide as completely as the stall did.
     *
     * One frame is enough for the revealed row to land, so the next decision is made against where
     * the sentinel actually is. */
    const raf = requestAnimationFrame(() => io.observe(el));
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
    /* ⚠️ `count` IS IN HERE, AND WITHOUT IT THIS REVEALS EXACTLY TWO PAGES AND STOPS.
     *
     * An IntersectionObserver invokes its callback on a TRANSITION, not continuously. Observe once
     * and the first reveal fires; the new row pushes the sentinel down, but `rootMargin` is 600px,
     * so it usually stays INSIDE the margin — still intersecting, no transition, no second callback.
     * The grid then sits at `2 * page` for ever.
     *
     * Measured in a browser (dev/template-grid.html, 60 templates, scrolled to the bottom six
     * times): `page=6` stuck at 12, `page=24` stuck at 48 — two pages in both cases, whatever the
     * viewport height and whether or not the document could scroll.
     *
     * ⚠️ IT WAS INVISIBLE IN PRODUCTION AND WAS ABOUT TO STOP BEING SO. At the default page of 24,
     * two pages is 48 — more than the whole catalogue — so nothing was ever withheld. It would have
     * appeared as "the grid stops at 48" on the day the catalogue passed 48 templates, which is the
     * growth plans/template-browsing-at-scale.md exists for.
     *
     * Re-creating the observer after each reveal fixes it because `observe()` reports the CURRENT
     * state immediately: still in view → reveal again, until the sentinel is finally pushed beyond
     * the margin or the list runs out. That is the behaviour the rootMargin note above describes —
     * the next page arrives before you reach the end — rather than one it only claimed. */
  }, [done, page, total, rootMargin, count]);

  return { visible: list.slice(0, count), sentinelRef, done, total, shown: Math.min(count, total) };
}
