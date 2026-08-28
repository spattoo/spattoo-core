// ── How a docked panel is left ──────────────────────────────────────────────────────────────────
// Orders and Customers are full-height surfaces docked beside the spatula rail. Both had the same
// top bar, and both got the same thing wrong on desktop: the leading control was `onBack ?? onClose`
// rendered as a BACK ARROW — so in the common case (no `onBack`) it was a dismiss button wearing
// navigation, pressed up against the rail.
//
// Three problems at once, and only the third is cosmetic:
//   1. It points backward in a stack that does not exist. Nothing was pushed; there is nowhere back.
//   2. It duplicates the rail, which is RIGHT THERE and is how you actually change destination.
//   3. It contradicts the app's own convention — every other panel dismisses with ✕ at top-right
//      (see shared/Panel.jsx, which OrderModal and the rest go through).
//
// ⚠️ MOBILE IS DIFFERENT AND MUST STAY DIFFERENT. There the panel is full-bleed, the rail is not on
// screen, and the same arrow does real work: it steps from a selected order back to the list before
// it closes anything. A single "consistent" control across both would break the one place the arrow
// was honest.
//
// So: mobile keeps the arrow; desktop gets a ✕ at the far right, and a back control ONLY when there
// is genuinely somewhere to go — in which case it is LABELLED. An unlabelled arrow beside a
// permanent rail is a guess; "← Dashboard" is a breadcrumb.
//
// Lives here rather than in either panel because it was already two copies (jscpd reports these two
// files as clones), and a rule about how to leave a panel kept in two files is a rule that drifts.

export const panelTopBtn = {
  width: 32, height: 32, borderRadius: 8,
  border: '1.5px solid #E8E4DC', background: '#F7F5F0',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 13, color: '#666', flexShrink: 0,
};

function ArrowLeftIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/* The mobile leading control. Full-bleed, no rail — an arrow is the right shape, and it steps
   detail → list before it closes anything. */
export function PanelBackArrow({ onClick }) {
  return (
    <button onClick={onClick} style={panelTopBtn} title="Back" aria-label="Back">
      <ArrowLeftIcon />
    </button>
  );
}

/* The desktop back control, and it is a BREADCRUMB — it names its destination. Rendered only when
   the panel was genuinely opened from somewhere (today: the Dashboard, with a filter). When there
   is nowhere back, nothing is rendered at all: the rail is the way out and does not need a second,
   vaguer copy of itself. */
export function PanelBackCrumb({ label, onClick }) {
  return (
    <button onClick={onClick} title={`Back to ${label}`} style={{
      display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
      height: 32, padding: '0 12px 0 9px', borderRadius: 8,
      border: '1.5px solid #E8E4DC', background: '#F7F5F0',
      cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: '#666',
    }}>
      <ArrowLeftIcon />{label}
    </button>
  );
}

/* Dismiss. Far right of the bar, matching every other panel in the app — this is the one control
   that is always present on desktop, because closing is always possible. */
export function PanelDismiss({ onClick }) {
  return (
    <button onClick={onClick} style={panelTopBtn} title="Close" aria-label="Close">
      <XIcon />
    </button>
  );
}
