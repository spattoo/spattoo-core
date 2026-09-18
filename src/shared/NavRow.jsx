import { ChevronRightIcon } from './icons.jsx';

/* ── THE row that opens something ────────────────────────────────────────────────────────────────
 *
 * A label, an optional hint, an optional value on the right, and a chevron. Pressing it goes
 * somewhere. Use this wherever a row is a destination — never a bare `<div onClick>` with text in it.
 *
 * ⚠️ IF IT DOES SOMETHING, IT MUST LOOK LIKE IT DOES SOMETHING. Top-ups shipped with two rows that
 * were plain text, a faint grey balance and a 16px "›" — no border, no fill, no press feedback.
 * Sandeep's words: "the two options here do not look like they are clickable. make this a standard.
 * any clickable should look like clickable."
 *
 * ⚠️ AND HOVER IS NOT THE ANSWER ON ITS OWN. A baker's screen is a phone (root CLAUDE.md rule 5) and
 * a phone has no hover, so an affordance that only appears on pointer-over does not exist for most
 * of the people using it. The row therefore reads as pressable AT REST — its own surface, its own
 * edge, and a chevron dark enough to see — and hover and press are feedback on top of that, not the
 * thing that makes it legible.
 *
 * The interaction rules are lifted from `.spattoo-pack` in billing/BuyCreditsPanel.jsx, which had
 * already solved this for the credit packs and said why in a comment worth repeating: "A price alone
 * reads as a fact; a price with somewhere to go reads as an offer."
 */

const CSS = `
  .spattoo-navrow {
    display: flex; align-items: center; gap: 12px; width: 100%;
    padding: 13px 14px; border-radius: 12px; border: 1px solid #E6EBE7;
    background: #FFFFFF; cursor: pointer; text-align: left; font: inherit;
    box-shadow: 0 1px 2px rgba(20,24,21,0.05);
    transition: border-color .15s, box-shadow .15s, transform .15s, background .15s;
  }
  .spattoo-navrow:hover:not(:disabled) {
    border-color: #9DBBA8; box-shadow: 0 4px 14px rgba(20,24,21,0.10); transform: translateY(-1px);
  }
  .spattoo-navrow:active:not(:disabled) {
    transform: translateY(0); box-shadow: 0 1px 2px rgba(20,24,21,0.06); background: #FBFDFB;
  }
  .spattoo-navrow:focus-visible { outline: 2px solid #7FA98C; outline-offset: 2px; }
  .spattoo-navrow:disabled { cursor: default; opacity: 0.55; box-shadow: none; }
  /* The chevron leans into the direction of travel on hover. Small, and the only animation here. */
  .spattoo-navrow .spattoo-navrow-chev { transition: transform .15s; color: #B4C3B8; flex-shrink: 0; }
  .spattoo-navrow:hover:not(:disabled) .spattoo-navrow-chev { transform: translateX(2px); color: #7FA98C; }
`;

let injected = false;
function useRowCss() {
  // One <style> for every NavRow on the page. Injected on first use rather than imported as a CSS
  // file, because this library is vendored into two apps and neither bundles our stylesheets.
  if (typeof document !== 'undefined' && !injected) {
    injected = true;
    const el = document.createElement('style');
    el.dataset.spattoo = 'navrow';
    el.textContent = CSS;
    document.head.appendChild(el);
  }
}

/**
 * label    what the destination is called
 * hint     one line under it, optional
 * value    the right-hand readout (a balance, a count) — omit when there is nothing to say. `null`
 *          means "not known yet" and must NOT be rendered as 0; decide that in the caller.
 * accent   colour for `value`, normally the bakery's primary
 * onClick  where it goes
 */
export function NavRow({ label, hint, value, accent = '#2C4433', onClick, disabled = false, ariaLabel }) {
  useRowCss();
  return (
    <button type="button" className="spattoo-navrow" onClick={onClick} disabled={disabled}
            aria-label={ariaLabel}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: '#1a1a1a' }}>{label}</span>
        {hint && (
          <span style={{ display: 'block', fontSize: 11.5, color: '#7C8B82', marginTop: 2, lineHeight: 1.45 }}>
            {hint}
          </span>
        )}
      </span>
      {value != null && (
        <span style={{ fontSize: 13, fontWeight: 700, color: accent, whiteSpace: 'nowrap' }}>{value}</span>
      )}
      <span className="spattoo-navrow-chev" style={{ display: 'flex' }}>
        <ChevronRightIcon size={18} />
      </span>
    </button>
  );
}

export default NavRow;
