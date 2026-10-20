import { useState } from 'react';
import { createPortal } from 'react-dom';
import AnchoredPopup from '../../shared/AnchoredPopup.jsx';
import { ColorWheel } from './ColorWheel.jsx';
import { INK, LINE, SURFACE } from '../../shared/tokens.js';

/* ── THE round swatch that opens the colour wheel ────────────────────────────────────────────────
 *
 * One colour, shown as a filled circle; tapping it floats `ColorWheel` beside it.
 *
 * ⚠️ IT EXISTS BECAUSE THE ALTERNATIVE WAS SHIPPING `<input type="color">`. Sandeep, on the
 * sprinkles palette: *"here we have rectangular color picker. can we use the same color picker
 * (round one) that we used in other cards. we need to standardise this."* He is right twice over —
 * the shape was different AND the control was: a native colour input is the operating system's
 * picker, which has none of this app's presets, none of the colours already on the cake, and a
 * different look on every phone. The root CLAUDE.md says so in one line: "never a row of hand-rolled
 * swatches, never a native `<input type="color">`". There were TEN of them in CakeDesigner.jsx.
 *
 * ⚠️ AND IT IS SHARED RATHER THAN A SEVENTH COPY. The piping dot, the recolour groups, the calendar
 * keys and the scatter palette each hand-rolled "a circle that opens a wheel" — the piping one even
 * portals and anchors exactly like this, because a card is a backdrop-filtered scroll container and
 * a fixed child inside one is trapped by it. Nothing could import any of them: they were inline in
 * a 20k-line file, which is the same reason `SizeDial` and `ColorWheel` were lifted out before this.
 *
 * ⚠️ THE POPUP STATE IS THE COMPONENT'S OWN. Every caller before this kept an `activeKey` and an
 * anchor rect in the card's state, which is how a wheel ends up pointed at the wrong swatch after a
 * re-render. A swatch knows whether it is open; nothing else needs to.
 *
 * `cakeColors` is what makes the wheel worth opening — the colours already ON the cake, so a baker
 * can match the drip to the border without reading a hex.
 */
export function WheelSwatch({ color, onChange, cakeColors = [], size = 26, title = 'Choose a colour',
                              compact = false, disabled = false, children }) {
  const [anchor, setAnchor] = useState(null);
  const open = !!anchor;
  return (
    <>
      <button type="button" title={title} aria-label={title} disabled={disabled}
        onClick={e => {
          if (disabled) return;
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor(a => a ? null : { top: r.top, left: r.left });
        }}
        style={{ width: size, height: size, borderRadius: '50%', padding: 0, flexShrink: 0,
                 border: `${open ? 2.5 : 1.5}px solid ${open ? INK : '#cdccd3'}`,
                 background: color || '#ffffff', cursor: disabled ? 'default' : 'pointer',
                 boxShadow: '0 1px 4px rgba(0,0,0,0.15)', opacity: disabled ? 0.5 : 1 }} />
      {open && createPortal(
        <>
          {/* A scrim, so tapping anywhere else puts the wheel away — the same way every other
              popup in this designer closes. */}
          <div onClick={() => setAnchor(null)} style={{ position: 'fixed', inset: 0, zIndex: 2147483000 }} />
          <AnchoredPopup anchor={anchor} width={compact ? 196 : 248} side="left"
            style={{ zIndex: 2147483001, background: SURFACE, borderRadius: 12,
                     border: `1.5px solid ${LINE}`, boxShadow: '0 10px 30px rgba(20,24,21,0.18)', padding: 12 }}>
            <ColorWheel color={color} onChange={onChange} cakeColors={cakeColors}
                        compact={compact} width={compact ? 172 : 216} />
            {children}
          </AnchoredPopup>
        </>, document.body)}
    </>
  );
}

export default WheelSwatch;
