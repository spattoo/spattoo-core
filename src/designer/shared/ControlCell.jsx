/* ── A captioned control in a scrolling row ──────────────────────────────────────────────────────
 *
 * One control (or a small cluster of them), one caption underneath, sized so a row of them keeps a
 * single baseline with a 46px dial.
 *
 * ⚠️ THIS WAS WRITTEN TWICE BEFORE IT WAS SHARED. DialCell had it wrapped around a dial, and the
 * photo-frame block in CakeDesigner had a local `cell(label, node)` — the same wrapper, the same
 * caption span, the same 46px baseline, character for character. Neither could use the other:
 * DialCell hardcodes a dial as its child, and the local one could not be reached from outside that
 * block. `check:dup` never saw it, because two ~8-line copies sit under its minLines — which is the
 * case `.jscpd.json`'s own note calls out: "Reuse is enforced by looking before you build
 * (CLAUDE.md rule 1), never by this number."
 *
 * ⚠️ THE CAPTION GOES BELOW, AND INSIDE THE SCROLLER. Sandeep: "name of the control - lets add it
 * below the control, so this below line also adds to the same scroll panel." buildToolbar's
 * `panelLabel` renders BESIDE the scrolling row, so it stays pinned while the controls slide out
 * from under it — a row that opens with "Colour" and then shows whatever happens to be in view.
 * Below and inside, the name and the thing it names travel together.
 *
 * ⚠️ `minHeight` ON THE CONTROL BOX IS WHAT KEEPS THE BASELINE. A 46px dial and a pair of 22px
 * nudge buttons in the same row would otherwise sit their captions at two different heights. The
 * box is the dial's height; short clusters centre inside it.
 *
 * ⚠️ IT OWNS ITS LOOK, like DialCell and PreviewTile beside it. CakeDesigner's `s` style object is
 * module-local and not exported, and no shared component in this folder takes style props. Passing
 * the caption style in from each caller would reproduce the duplication one level up, in prop lists
 * instead of markup.
 */
export function ControlCell({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 46 }}>
        {children}
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, color: '#888', minWidth: 26, textAlign: 'center', letterSpacing: 0.3 }}>
        {label}
      </span>
    </div>
  );
}
