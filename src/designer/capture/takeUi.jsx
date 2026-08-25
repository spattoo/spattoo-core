import { TAKE_GROUNDS } from '../constants.js';

/* ── What the two take panels genuinely share ────────────────────────────────────────────────────
 *
 * `ReelOptions` and `PhotoOptions` are two panels for the same act at two lengths, so a set of parts
 * came out identical in both: the button styling, the swatch row, and the name-on-the-frame block.
 * jscpd was flagging four clones between them and it was right — a swatch row written twice is two
 * places for "Slate" to get a different border, and the name block is the one control in here with a
 * rule behind it (entitlement, and off means blank) that must not be able to drift.
 *
 * ⚠️ ONLY WHAT IS IDENTICAL LIVES HERE. The panels differ in the ways that matter — shape, angle and
 * a cutout on one; movement, length and sweep on the other — and folding those into a `variant` prop
 * would trade four honest clones for one component with two personalities, which is worse. The rule
 * used was: if making it shared needs a flag to say WHICH panel is calling, it stays in the panel.
 */

// ── Styling shared by every control in both panels ──────────────────────────────────────────────
export const takeRow = { display: 'flex', gap: 6, flexWrap: 'wrap' };
export const takeLabel = { fontSize: 11, fontWeight: 700, color: '#6E8577', letterSpacing: '0.04em',
                           textTransform: 'uppercase', marginBottom: 6 };
export const takeNote = { fontSize: 11.5, color: '#6E8577', marginTop: 6, lineHeight: 1.5 };

export const takePick = (on) => ({
  padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
  border: `1.5px solid ${on ? '#2C4433' : '#D8E0DA'}`,
  background: on ? '#2C4433' : '#fff', color: on ? '#fff' : '#3D5A44',
});

/* The grounds on offer, with the baker's own colour first.
 *
 * Offered first but never the DEFAULT: a dark green brand behind a dark green cake is mush, and no
 * rule we could write would predict that. They look and choose.
 */
export function groundsFor(brandPrimary) {
  const has = brandPrimary && TAKE_GROUNDS.some(g => g.value.toLowerCase() === brandPrimary.toLowerCase());
  return brandPrimary && !has
    ? [{ key: 'brand', label: 'Your colour', value: brandPrimary }, ...TAKE_GROUNDS]
    : TAKE_GROUNDS;
}

/* One swatch, so the selected ring cannot come out different in the two panels. `extra` is where the
 * photo hangs its cutout swatch — a slot rather than a flag, so this stays a swatch row and does not
 * grow an opinion about transparency. */
export function GroundSwatches({ grounds, value, selected = true, onPick, extra = null }) {
  return (
    <div style={takeRow}>
      {grounds.map(g => {
        const on = selected && value === g.value;
        return (
          <button key={g.key} onClick={() => onPick(g.value)} title={g.label}
                  aria-label={g.label} aria-pressed={on}
                  style={{ width: 34, height: 34, borderRadius: 8, cursor: 'pointer', padding: 0,
                           background: g.value,
                           border: on ? '3px solid #2C4433' : '1.5px solid #D8E0DA' }} />
        );
      })}
      {extra}
    </div>
  );
}

/* ── The bakery name on the frame ────────────────────────────────────────────────────────────────
 *
 * ⚠️ The one control in either panel with a rule behind it, which is why it is shared rather than
 * written twice. Shown only to a plan carrying `reel_branding` — the entitlement IS control of this
 * line — and unticking means a BLANK frame, never a fall back to "made with Spattoo". Somebody who
 * has paid to keep our mark off does not want a switch whose off position advertises us.
 *
 * `captionText` enforces the same rule independently: a UI is not an entitlement check.
 */
export function NameOnFrame({ subject, bakeryName = '', checked, onChange }) {
  return (
    <div>
      <div style={takeLabel}>Name on the {subject}</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
               style={{ width: 17, height: 17, accentColor: '#2C4433', cursor: 'pointer', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#3D5A44' }}>
          {bakeryName.trim() ? `Show “${bakeryName.trim()}”` : 'Show my bakery name'}
        </span>
      </label>
      <div style={takeNote}>
        {checked
          ? `Burned into the ${subject}, so it still carries your name wherever it gets reposted.`
          : `This ${subject} saves with nothing written on it.`}
      </div>
    </div>
  );
}

/* The panel's one action, as `Panel`'s footer.
 *
 * ⚠️ Returned BARE, not wrapped in a row. Panel's footer is already `display: flex`, so a wrapper
 * makes this a shrink-wrapped flex item and `flex: 1` grows against nothing — it came out 131px wide
 * in a 390px sheet. The button IS the footer.
 */
export function TakeButton({ label, disabled, onClick }) {
  return (
    <button disabled={disabled} onClick={onClick}
            style={{ flex: 1, padding: '11px 16px', borderRadius: 9, border: 'none',
                     background: '#2C4433', color: '#fff', fontWeight: 700, fontSize: 14,
                     cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      {label}
    </button>
  );
}
