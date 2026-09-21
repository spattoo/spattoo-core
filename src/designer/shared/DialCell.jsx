import { SizeDial } from './SizeDial.jsx';
import { OffsetDial } from './OffsetDial.jsx';
import { ControlCell } from './ControlCell.jsx';

/* ── A captioned dial in a scrolling control row ─────────────────────────────────────────────────
 *
 * One dial, one caption under it, sized so a row of them keeps a single baseline. Used by every
 * procedural card's control row — dust, cream, grass (twice), the cream pen, piped writing.
 *
 * ⚠️ THIS EXISTS BECAUSE I WROTE IT SEVEN TIMES. Converting those cards' sliders to dials, the same
 * nine-line cell got typed out per card, and `check:dup` failed on the seventh: the writing row
 * against the pen row, 25 matching lines. The gate was right. `.jscpd.json` says it plainly —
 * "Reuse is enforced by looking before you build (CLAUDE.md rule 1), never by this number" — and a
 * gate catching copy-paste after the fact is the slower way to learn it.
 *
 * ⚠️ AND THEN THE WRAPPER ITSELF WAS THE CLONE. The column-plus-caption markup below used to live
 * here in full, and the photo-frame block had its own copy of the same lines. Two ~8-line copies sit
 * under `check:dup`'s minLines, so nothing ever flagged it; it surfaced only when the faux ball row
 * needed the same cell around a colour swatch and a pair of nudge buttons — neither of which is a
 * dial, so neither could reach this component. The wrapper is `ControlCell` now, and this file is
 * what it always should have been: the DIAL-shaped caller of it.
 *
 * ⚠️ `dial` PICKS THE INSTRUMENT, AND THE CHOICE IS NOT COSMETIC. SizeDial's band tapers thin→thick
 * to mean small→large; OffsetDial fills from a marked zero in whichever direction the value went
 * and keeps the sign. A signed quantity on a SizeDial is a lie about what the control does —
 * OffsetDial's own header argues this at length, and it is why Curve, Rotate and Lean are offsets
 * while Height, Spread and Thickness are sizes.
 *
 * ⚠️ `fmt` IS NOT OPTIONAL IN PRACTICE. Both dials default to one or two decimals, which is wrong
 * for most real ranges: dust's Glow tops out at 0.6, pen Thickness runs 0.008–0.07, grass Density
 * steps by 0.002. At the default they read "0.0" across their whole travel — a dial whose number
 * never moves is worse than the slider it replaced. Pass the caller's own formatter; the semantic
 * ones ("flat", "normal", "none", "1.40×") are the reason several of these controls are legible.
 */
export function DialCell({ label, value, min, max, step, fmt, onChange, dial = 'size' }) {
  return (
    <ControlCell label={label}>
      {dial === 'offset'
        ? <OffsetDial value={value} min={min} max={max} step={step} label={label} fmt={fmt} onChange={onChange} />
        : <SizeDial size={value} min={min} max={max} step={step} fmt={fmt} onChange={onChange} />}
    </ControlCell>
  );
}
