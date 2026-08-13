// ── Toggleable chip ───────────────────────────────────────────────────────────
// A pill you tap to turn on or off. Extracted the moment it was needed twice — the
// dietary picker on the order form and the flavour declarations in settings — rather
// than pasted a second time. Two copies of a chip is two hover states, two focus rings
// and two mobile hit-targets that quietly drift apart (the de-overlap rule reached four
// copies before anyone unified it; the tax is real).
//
// Colour is a prop, not a branch: callers pass the tone they want (the dietary surfaces
// pass dietTone(kind), settings passes the baker's brand colour). This component knows
// nothing about diets, flavours or brands — it knows pressed and not pressed.

// `tone`   { fg, bg, border } when active — falls back to a neutral ink
// `variant` 'solid' (a normal choice) | 'dashed' (a value inherited from elsewhere that
//           the user may override — dashed reads as provisional without relying on hue,
//           which matters because these are the same surfaces that must stay legible in
//           greyscale and to colour-blind readers)
export default function Chip({
  label, active, onClick, isMobile = false, disabled = false,
  tone = null, variant = 'solid', title = null,
}) {
  const fg     = tone?.fg     ?? '#1a1a1a';
  const bg     = tone?.bg     ?? 'rgba(26,26,26,0.06)';
  const border = tone?.border ?? '#999999';

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title ?? undefined}
      aria-pressed={!!active}
      style={{
        padding: isMobile ? '12px 16px' : '8px 14px',
        borderRadius: 12,
        border: `1.5px ${variant === 'dashed' ? 'dashed' : 'solid'} ${active ? border : '#999999'}`,
        fontSize: isMobile ? 14 : 11,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: active ? bg : 'transparent',
        color: active ? fg : '#666',
        opacity: disabled ? 0.5 : 1,
        fontFamily: "'Quicksand', sans-serif",
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}
