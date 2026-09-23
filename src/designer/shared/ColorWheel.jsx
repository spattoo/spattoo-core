import { HexColorPicker } from 'react-colorful';
import { INK } from '../../shared/tokens.js';
import { ScrollFadeRow } from './ScrollFadeRow.jsx';

/* ── Lifted out of CakeDesigner.jsx unchanged, for the same reason SizeDial was ───────────────────
 *
 * SizeDial's own header names this file before it existed: "INVARIANTS #5b and the root CLAUDE.md
 * both name it as the only one — 'never a row of hand-rolled swatches' applies here as much as to
 * ColorWheel." It applied, and it could not be obeyed: the component lived inside a 14k-line module
 * nothing outside the designer can import, so every other surface that needed a colour had to build
 * one. spattoo-admin's studios reach for `<input type="color">` — including the Calendar Studio I
 * wrote last week, which is the breach that prompted this.
 *
 * Sandeep: "see what kind of color pickers are used. see how we aligned in a scrollable row. we
 * should make some standard i belive- so that admin also can follow."
 *
 * Nothing below is redesigned. It is the same component, at an address other modules can reach.
 */

// ── Color picker (react-colorful) ─────────────────────────────────────────────
export function ColorWheel({ color, onChange, cakeColors = [], width = 216, compact = false }) {
  // Common cake piping colour presets
  const PRESETS = [
    '#ffffff','#f5e6c8','#f5b8c8','#e8a0b0','#c8b5e8',
    '#b5c8e8','#b5e8d5','#f0c040','#e87040','#5c3d2e',
    '#3e2010',INK,'#d4af37','#8b1a1a','#2e5c3e',
  ];
  // ── What you SEE and what you can TAP are different sizes ───────────────────────────────────
  // These were 22px, half the touch floor, in four wrapped rows. Making the whole circle 44 fixed the
  // target and overshot the drawing — a row of 44px discs reads as buttons rather than colour chips,
  // and dominates a sheet where the picker is the main event.
  //
  // So the circle is 32 and the tap area around it is still 44. The floor is about what a thumb can
  // hit, not about how big the paint is, and conflating the two is why it looked wrong.
  const HIT = 44;
  const dot = compact ? 32 : Math.max(18, Math.round(width / 9.8));
  const swatch = (c, key) => {
    const circle = (
      <div style={{
        width: dot, height: dot, borderRadius: '50%', background: c,
        border: color.toLowerCase() === c.toLowerCase() ? `2.5px solid ${INK}` : '1.5px solid #999999',
        boxSizing: 'border-box', flexShrink: 0,
        boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
      }} />
    );
    if (!compact) return <div key={key} onClick={() => onChange(c)} style={{ cursor: 'pointer', display: 'flex' }}>{circle}</div>;
    return (
      <div key={key} onClick={() => onChange(c)} style={{
        width: HIT, height: HIT, flexShrink: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{circle}</div>
    );
  };

  // ── Phone: swatches FIRST, in one row that scrolls ──────────────────────────────────────────
  // Order is the whole point. The sheet opens short, so whatever is at the top is what a baker can
  // reach without doing anything — and picking a preset is the common case, while the gradient
  // picker is the rare one. It used to be the other way round: the picker sat on top and the
  // swatches were below the fold of a sheet that covered the cake anyway.
  //
  // The picker stays, directly underneath. It does not need a disclosure of its own because the
  // sheet's drag handle already is one — pull up and it is there.
  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        {/* gap 2, not 8: each swatch already carries 6px of invisible tap area on either side, so a
            wider gap here is spacing added to spacing. */}
        <ScrollFadeRow style={{
          display: 'flex', gap: 2, overflowX: 'auto', padding: '2px 0 4px',
          scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
        }}>
          {PRESETS.map(c => swatch(c, c))}
          {cakeColors.length > 0 && (
            // A rule rather than a heading: "Colors from cake" cost a whole line of the sheet's
            // height to label six swatches that are self-evident once they are beside the presets.
            <div aria-label="Colors from cake"
                 style={{ flexShrink: 0, width: 1, alignSelf: 'stretch', margin: '4px 2px', background: 'rgba(0,0,0,0.16)' }} />
          )}
          {cakeColors.map((c, i) => swatch(c, `cake-${i}`))}
        </ScrollFadeRow>
        <HexColorPicker color={color} onChange={onChange}
                        style={{ width: '100%', height: 150 }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <HexColorPicker color={color} onChange={onChange} style={{ width, height: Math.round(width * 0.72) }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, width, justifyContent: 'center' }}>
        {PRESETS.map(c => swatch(c, c))}
      </div>
      {cakeColors.length > 0 && (
        <div style={{ width }}>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
            color: INK, textTransform: 'uppercase', marginBottom: 7, textAlign: 'center',
          }}>Colors from cake</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
            {cakeColors.map((c, i) => swatch(c, `cake-${i}`))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ColorWheel;
