import React from 'react';

// ── SessionBar ──────────────────────────────────────────────────────────────────
// Minimal live co-design control. Functional-first (visual polish comes after the
// mechanism is proven live). Reflects the useDesignSession hook; owns no state itself.
//
// States:
//   no session  → "Go live" (host only)
//   in session  → connection dot · who holds the pen · participant count · pen actions
// Pen handoff works with just Take/Release (+ baker override): the editor releases, the
// other participant takes; a baker-staff member can always take back. `onGrant` hands
// the pen straight to the first other participant when present (convenience).

const S = {
  bar: {
    position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 40,
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '6px 12px', borderRadius: 999,
    background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
    boxShadow: '0 4px 18px rgba(0,0,0,0.12)', border: '1px solid #eee',
    fontFamily: "'Quicksand',sans-serif", fontSize: 13, color: '#1a1a1a',
  },
  dot: (on) => ({ width: 8, height: 8, borderRadius: '50%', background: on ? '#2ecc71' : '#f1c40f', flexShrink: 0 }),
  who: { fontWeight: 600 },
  muted: { color: '#888' },
  btn: {
    border: '1px solid #d9d9d9', background: '#fff', color: '#1a1a1a',
    borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 700,
    fontFamily: "'Quicksand',sans-serif", cursor: 'pointer',
  },
  primary: { border: 'none', background: '#1a1a1a', color: '#fff' },
  danger: { borderColor: '#e7c3c3', color: '#b23b3b' },
  goLive: {
    position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 40,
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
    background: '#1a1a1a', color: '#fff', fontFamily: "'Quicksand',sans-serif", fontSize: 13, fontWeight: 700,
    boxShadow: '0 4px 18px rgba(0,0,0,0.14)',
  },
};

export default function SessionBar({
  live, canHost = false,
  sessionId, connected, isEditor,
  participants = [], holderUserId, myUserId,
  onGoLive, onTakePen, onReleasePen, onGrant, onEnd,
}) {
  if (!live) return null;

  // Not in a session yet → offer to start one (host only).
  if (!sessionId) {
    if (!canHost) return null;
    return (
      <button style={S.goLive} onClick={onGoLive}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2ecc71' }} />
        Go live
      </button>
    );
  }

  const holder = participants.find((p) => p.userId === holderUserId);
  const others = participants.filter((p) => p.userId !== myUserId);
  const whoLabel = !holderUserId
    ? 'No one is editing'
    : isEditor
      ? "You're editing"
      : `${holder?.name || 'Someone'} is editing`;

  return (
    <div style={S.bar}>
      <span style={S.dot(connected)} />
      <span style={S.who}>{whoLabel}</span>
      <span style={S.muted}>· {participants.length} here</span>

      {isEditor ? (
        <>
          {others.length > 0 && (
            <button style={S.btn} onClick={() => onGrant?.(others[0].userId)}>Hand over</button>
          )}
          <button style={S.btn} onClick={onReleasePen}>Release</button>
        </>
      ) : (
        <button style={{ ...S.btn, ...S.primary }} onClick={onTakePen}>Take pen</button>
      )}

      <button style={{ ...S.btn, ...S.danger }} onClick={onEnd}>End</button>
    </div>
  );
}
