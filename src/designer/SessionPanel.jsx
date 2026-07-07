import React, { useState } from 'react';

// ── SessionPanel ────────────────────────────────────────────────────────────────
// "Design Together" — the live co-design share + control surface (right-side panel,
// per the app's right-side-popup convention). Opened from the sidebar nav item.
// Owns no session state; it is a view over the useDesignSession hook.
//
//   not started → explainer + "Start live session"
//   live        → share link (copy / WhatsApp) · who's editing · pen controls · End
//
// Reflects the hook object as `codesign`. Build the join link from the current URL so
// it works on whatever host the app is served from (baker subdomain in prod).

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
  label: { fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6 },
  linkRow: { display: 'flex', gap: 6 },
  linkInput: {
    flex: 1, minWidth: 0, padding: '7px 9px', fontSize: 12, color: '#333',
    border: '1px solid #ddd', borderRadius: 8, background: '#fafafa', fontFamily: "'Quicksand',sans-serif",
  },
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
  whatsapp: { border: 'none', background: '#25D366', color: '#fff' },
  danger: { borderColor: '#e7c3c3', color: '#b23b3b' },
  divider: { height: 1, background: '#f2f2f2', margin: '2px 0' },
};

export default function SessionPanel({ open, onClose, codesign }) {
  const [copied, setCopied] = useState(false);
  if (!open || !codesign?.live) return null;

  const { sessionId, connected, participants = [], holderUserId, myUserId, isEditor } = codesign;
  const joinLink = sessionId && typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?session=${sessionId}`
    : '';

  const copy = async () => {
    try { await navigator.clipboard.writeText(joinLink); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { /* clipboard blocked — the field is selectable as a fallback */ }
  };
  const shareWhatsApp = () => {
    const text = `Let's design your cake together — join live: ${joinLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

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
              Start a live session and share the link. Whoever joins sees your cake update in real
              time — and you can hand them the pen to try a change themselves.
            </div>
            <button style={{ ...S.btn, ...S.primary }} onClick={() => codesign.start()}>Start live session</button>
          </>
        ) : (
          <>
            <div style={S.row}>
              <span style={S.status}>{whoLabel}</span>
              <span style={S.muted}>· {participants.length} here</span>
            </div>

            <div>
              <div style={{ ...S.label, marginBottom: 6 }}>Share this link</div>
              <div style={S.linkRow}>
                <input style={S.linkInput} readOnly value={joinLink} onFocus={(e) => e.target.select()} />
                <button style={S.btn} onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button>
              </div>
              <button style={{ ...S.btn, ...S.whatsapp, width: '100%', marginTop: 8 }} onClick={shareWhatsApp}>
                Share on WhatsApp
              </button>
            </div>

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
