import { createRoot } from 'react-dom/client';

/* The decoration card's button row, as XrayDecorationSteps draws it — before and after.
 * The question is whether the credit-spending button reads as THE action when it sits beside the
 * two that merely open something. Judged at 390px, at rest: a baker's screen has no hover. */
const tag = { fontSize: 11, fontWeight: 800, borderRadius: 20, padding: '3px 9px', background: '#F4F1EC', color: '#6B655D' };
const muted = { fontSize: 11.5, color: '#8A857D', marginTop: 6, lineHeight: 1.35 };

const OUTLINE = {
  border: '1.5px solid #E0DDD8', background: '#fff', borderRadius: 9, cursor: 'pointer',
  padding: '6px 12px', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: '#555',
};
const FILLED = {
  border: 'none', background: '#2C2A26', borderRadius: 9, cursor: 'pointer',
  padding: '7px 13px', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, color: '#fff',
};
const DISABLED = { ...FILLED, background: '#F1EDE7', color: '#A49D95', cursor: 'default' };
const BUSY     = { ...FILLED, background: '#57514A', cursor: 'default' };

function Card({ title, children, note }) {
  return (
    <div style={{ background: '#fff', border: '1.5px solid #EFEAE3', borderRadius: 14, padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* minWidth 140, exactly as XrayDecorationSteps sets it — at 0 the title shreds into one
            word per line and the picture is of a bug this harness invented. */}
        <div style={{ fontSize: 14, fontWeight: 800, color: '#2C2A26', flex: 1, minWidth: 140 }}>{title}</div>
        {children}
      </div>
      {note && <div style={muted}>{note}</div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <div style={{ maxWidth: 390, padding: 16, background: '#FBF9F6', fontFamily: 'Quicksand, system-ui, sans-serif' }}>
    <div style={{ fontSize: 11, fontWeight: 900, color: '#8A857D', letterSpacing: 0.6, margin: '4px 0 8px' }}>BEFORE</div>
    <Card title="topper on the top surface" note="Uses 20 credits — read from this order’s photo.">
      <button style={OUTLINE}>How do I make this?</button>
    </Card>

    <div style={{ fontSize: 11, fontWeight: 900, color: '#8A857D', letterSpacing: 0.6, margin: '16px 0 8px' }}>AFTER</div>
    <Card title="topper on the top surface" note="Uses 20 credits — read from this order’s photo.">
      <button style={FILLED}>How do I make this?</button>
    </Card>
    {/* Beside the buttons it has to be distinguishable FROM — the whole complaint. */}
    <Card title="flower on the side">
      <span style={{ ...tag, background: '#F0EEF6', color: '#6A5A8C' }}>AI draft</span>
      <span style={tag}>sets in 1–2 hours</span>
      <button style={OUTLINE}>Hide steps</button>
    </Card>
    <Card title="figurine on the top surface" note="Waiting — no reference photo on this order.">
      <button style={DISABLED}>How do I make this?</button>
    </Card>
    <Card title="other on the side" note="Uses 20 credits — read from this order’s photo.">
      <button style={BUSY}>Reading…</button>
    </Card>
  </div>,
);
