/* ── Where you are in a journey that has not started yet ─────────────────────────────────────────
 *
 * Numbered dots joined by a line, with a label under each. The current one is filled in the baker's
 * colour, everything behind it is done, everything ahead is waiting.
 *
 * ⚠️ THIS IS A MAP, NOT A WIZARD, and the difference decides where it may be used. A stepper on a
 * form promises "finish this, press Next, get the next one". The cake designer is not that: shape,
 * decorations and colour are all available at once, in any order, for as long as somebody likes.
 * Drawing four numbered steps AROUND it would tell a customer the tool works in a way it does not.
 *
 * So it belongs on the DOOR, where nothing has begun and the question in the customer's head is
 * "what am I signing in for?" — and it must not follow them inside. `DesignTour` is what greets them
 * in the designer itself, and it is built the other way round on purpose: it points at real controls
 * rather than counting stages.
 *
 * ⚠️ AND THE WORDS ARE THE TOUR'S WORDS. The customer meets this, signs in, and is met by DesignTour
 * saying the same three things about the same three stages. Two vocabularies for one journey is how
 * somebody ends up wondering whether "add decorations" and "browse elements" are different tasks.
 * If the labels here and the titles in `designer/tour/DesignTour.jsx` ever disagree, that is a bug in
 * whichever one moved.
 *
 * Not interactive, deliberately: nothing here can be pressed, because none of these places can be
 * reached yet. Root CLAUDE.md rule 7 cuts both ways — a thing that does nothing must not look as
 * though it does.
 */

// `<ol>` because it IS an ordered list of stages, and a screen reader should say so. The current
// stage carries aria-current="step", which is the one thing a non-visual reader needs from this.
export function Steps({ steps = [], current = 0, accent = '#2C4433', muted = '#B9AFA4' }) {
  if (steps.length < 2) return null;     // one step is not a journey

  return (
    <ol style={s.list} aria-label="What happens next">
      {steps.map((label, i) => {
        const done = i < current;
        const now  = i === current;
        const on   = done || now;
        return (
          <li key={label} style={s.item} aria-current={now ? 'step' : undefined}>
            {/* The joining line sits BEHIND the dots and starts at the previous one, so the row reads
                as a single path rather than four separate badges. Hidden on the first, which has
                nothing to its left to join to. */}
            {i > 0 && <span aria-hidden="true" style={s.line(on ? accent : muted)} />}
            <span style={s.dot(now ? accent : done ? accent : '#FFFFFF',
                               on ? accent : muted,
                               now ? '#FFFFFF' : done ? '#FFFFFF' : muted)}>
              {i + 1}
            </span>
            <span style={s.label(on ? accent : muted, now)}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

const s = {
  list: { display: 'flex', listStyle: 'none', margin: '2px 0 6px', padding: 0, width: '100%' },
  // Equal columns, so the dots land on an even rhythm whatever the labels do. `minWidth: 0` lets a
  // long label wrap instead of pushing its neighbours out of the card.
  item: { flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 5 },
  /* From the middle of the previous dot to the middle of this one: 50% back, 100% across. Sits at
     the dots' vertical centre (11px down on a 22px dot) and behind them. */
  line: (colour) => ({ position: 'absolute', top: 10, right: '50%', width: '100%', height: 2,
                       background: colour, zIndex: 0 }),
  dot: (fill, edge, ink) => ({
    position: 'relative', zIndex: 1,
    width: 22, height: 22, borderRadius: '50%', boxSizing: 'border-box',
    background: fill, border: `2px solid ${edge}`, color: ink,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 800, lineHeight: 1, flexShrink: 0,
  }),
  // 10.5px is small, and it is a label rather than something to read — it names a place, and the
  // title above is what actually explains. Centred under its own dot, wrapping to two lines at 375px
  // rather than truncating: a clipped "Add decoration…" is worse than two short lines.
  label: (colour, now) => ({ fontSize: 10.5, fontWeight: now ? 800 : 600, color: colour,
                             textAlign: 'center', lineHeight: 1.3, letterSpacing: '0.01em' }),
};

export default Steps;
