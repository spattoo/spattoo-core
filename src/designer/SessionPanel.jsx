import React from 'react';

// ── SessionPanel ────────────────────────────────────────────────────────────────
// "Design Together" — the live co-design hub (right-side panel). Opened from the
// sidebar nav item. A view over the useDesignSession hook; owns no session state.
//
//   not started → explainer + "Start live session"
//   live        → who's editing · Invite your customer (opens the invite picker) ·
//                 pen controls · End
//
// Sharing is delegated to the invite flow (onInvite) — a live session is a live
// invite, so the customer gets a proper storefront link over email/WhatsApp and is
// logged in via OTP, rather than a raw link that can't authenticate them.

const S = {
  panel: {
    position: 'absolute', top: 12, right: 12, zIndex: 45, width: 300, maxWidth: 'calc(100% - 24px)',
    background: '#fff', borderRadius: 16, border: '1px solid #eee',
    boxShadow: '0 10px 34px rgba(0,0,0,0.16)',
    fontFamily: "'Quicksand',sans-serif", color: '#1a1a1a',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px', borderBottom: '1px solid #f2f2f2',
  },
  title: { fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 },
  close: { border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: '#888', lineHeight: 1 },
  body: { padding: 14, display: 'flex', flexDirection: 'column', gap: 12 },
  blurb: { fontSize: 12.5, lineHeight: 1.5, color: '#555' },
  row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  dot: (on) => ({ width: 9, height: 9, borderRadius: '50%', background: on ? '#2ecc71' : '#f1c40f', flexShrink: 0 }),
  status: { fontSize: 13, fontWeight: 600 },
  muted: { fontSize: 12, color: '#999' },
  btn: {
    border: '1px solid #d9d9d9', background: '#fff', color: '#1a1a1a',
    borderRadius: 9, padding: '8px 12px', fontSize: 12.5, fontWeight: 700,
    fontFamily: "'Quicksand',sans-serif", cursor: 'pointer', whiteSpace: 'nowrap',
  },
  primary: { border: 'none', background: '#1a1a1a', color: '#fff', width: '100%', padding: '10px 12px' },
  danger: { borderColor: '#e7c3c3', color: '#b23b3b' },
  divider: { height: 1, background: '#f2f2f2', margin: '2px 0' },
};

export default function SessionPanel({ open, onClose, codesign, onInvite }) {
  if (!open || !codesign?.live) return null;

  const { sessionId, connected, participants = [], holderUserId, myUserId, isEditor } = codesign;
  const holder = participants.find((p) => p.userId === holderUserId);
  const others = participants.filter((p) => p.userId !== myUserId);
  const whoLabel = !holderUserId ? 'No one is editing'
    : isEditor ? "You're editing"
    : `${holder?.name || 'Someone'} is editing`;

  return (
    <div style={S.panel}>
      <div style={S.header}>
        <span style={S.title}><span style={S.dot(!!sessionId && connected)} /> Design Together</span>
        <button style={S.close} onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div style={S.body}>
        {!sessionId ? (
          <>
            <div style={S.blurb}>
              Start a live session, then invite your customer. They join from a link (sent to their
              email or WhatsApp), watch your cake update in real time, and you can hand them the pen.
            </div>
            <button style={{ ...S.btn, ...S.primary }} onClick={() => codesign.start()}>Start live session</button>
          </>
        ) : (
          <>
            <div style={S.row}>
              <span style={S.status}>{whoLabel}</span>
              <span style={S.muted}>· {participants.length} here</span>
            </div>

            <button style={{ ...S.btn, ...S.primary }} onClick={onInvite}>Invite your customer</button>

            <div style={S.divider} />

            <div style={S.row}>
              {isEditor ? (
                <>
                  {others.length > 0 && (
                    <button style={S.btn} onClick={() => codesign.grantPen(others[0].userId)}>Hand over the pen</button>
                  )}
                  <button style={S.btn} onClick={codesign.releasePen}>Release</button>
                </>
              ) : (
                <button style={{ ...S.btn, ...S.primary, width: 'auto' }} onClick={codesign.takePen}>Take the pen</button>
              )}
            </div>

            <button style={{ ...S.btn, ...S.danger, width: '100%' }} onClick={() => { codesign.end(); onClose?.(); }}>
              End session
            </button>
          </>
        )}
      </div>
    </div>
  );
}
