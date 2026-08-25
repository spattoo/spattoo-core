// A checkable preview tile: a framed 3D preview with a checkbox in the corner.
//
// Shared, not copied. The element popup uses it to choose WHICH tier/surface an element goes on; the
// upload studio uses it to ask "where can this go?" — showing the user's own artwork rendered on the
// cake in each candidate zone, because the honest answer to "what is a zone" is to show them one.
//
// `locked` = this tile may be ADDED but not REMOVED. The checkbox is the remove control on this path,
// so a lock has to reach it or unticking would remove what the caller said could not be removed.
//
// ⚠️ It no longer comes from allowed_actions.delete. Every ELEMENT is deletable — a customer cannot
// be made to keep something on their own cake — so all element callers pass false. The one live user
// is piping, which locks a ring for its own reasons. Config-gated by the caller; never a type branch.
export default function PreviewTile({ checked, onToggle, label, height = 104, locked = false, children }) {
  const frozen = checked && locked;
  return (
    <div>
      <div style={{ position: 'relative', width: '100%', height, borderRadius: 10, overflow: 'hidden', border: `1.5px solid ${checked ? '#1a1a1a' : '#cdccd3'}`, background: '#cfcdd6' }}>
        {children}
        <label title={frozen ? 'This decoration can’t be removed' : checked ? 'Remove from cake' : 'Add to cake'} onPointerDown={e => e.stopPropagation()}
          style={{ position: 'absolute', top: 5, left: 5, width: 22, height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.92)', boxShadow: '0 1px 3px rgba(0,0,0,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: frozen ? 'not-allowed' : 'pointer', opacity: frozen ? 0.55 : 1 }}>
          <input type="checkbox" checked={checked} disabled={frozen} onChange={onToggle} style={{ accentColor: '#1a1a1a', width: 15, height: 15, cursor: frozen ? 'not-allowed' : 'pointer', margin: 0 }} />
        </label>
      </div>
      {label && (
        <span style={{ display: 'block', marginTop: 7, fontSize: 11, fontWeight: 700, color: '#1a1a1a', fontFamily: "'Quicksand',sans-serif", textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 1.25, textAlign: 'center' }}>{label}</span>
      )}
    </div>
  );
}
