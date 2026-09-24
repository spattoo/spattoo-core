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
    io.observe(el);
    return () => io.disconnect();
  }, [done, page, total, rootMargin]);

  return { visible: list.slice(0, count), sentinelRef, done, total, shown: Math.min(count, total) };
}
