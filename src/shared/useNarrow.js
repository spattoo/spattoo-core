import { useEffect, useState } from 'react';

// ── Is this a phone? ─────────────────────────────────────────────────────────────────────────────
// One definition, because there were about to be three. studioChrome had one, NotificationBell had
// its own, and PastDueBanner was written with a third — at which point INVARIANTS #3 stops being
// advice: "a rule used in two places lives in a single pure function both call — never a second
// copy. Duplicated logic silently drifts — treat a copy-paste as a defect."
//
// They had already drifted in the way that matters. studioChrome read the width in the useState
// INITIALISER, so it is correct on the very first paint. NotificationBell starts `false` and
// corrects in an effect, so a phone paints one desktop frame first. On a bell that is invisible; on
// anything that RESHAPES it is a visible jump, and it also means the narrow branch cannot be
// reached by renderToStaticMarkup — which is how every component in this repo is tested. A branch
// that cannot be rendered is a branch that cannot be tested.
//
// So this reads the width up front, guarded:
//
//   `typeof window !== 'undefined'` — safe on the server, and under renderToStaticMarkup, which is
//   what settings/controls' useIsMobile gets wrong (it reads window.innerWidth in its initialiser
//   unguarded, so importing it into anything server-rendered throws). See INVARIANTS #9.
//
// The BREAKPOINT is a parameter, not a constant, because the components legitimately disagree: a
// header with three buttons runs out of room before a bar with one sentence does. What must not
// differ is HOW the question is answered.

export function useNarrow(breakpoint = 760) {
  const [narrow, setNarrow] = useState(
    typeof window !== 'undefined' && window.innerWidth < breakpoint,
  );

  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < breakpoint);
    check();                                   // a resize between render and mount still lands
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);

  return narrow;
}
