import { useState, useEffect } from 'react';

// Shared presentational controls for the settings-area slide-in panels
// (SettingsPanel, FlavoursPanel, …). Keep these dumb and reusable — one Toggle, one
// Section, one Field across every panel so they stay visually consistent.

export function useIsMobile() {
  const [m, setM] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setM(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return m;
}

export function Toggle({ checked, onChange }) {
  return (
    <div onClick={() => onChange(!checked)} style={{
      width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
      background: checked ? '#2C4433' : '#D1D5DB',
      position: 'relative', flexShrink: 0, transition: 'background 0.2s',
    }}>
      <div style={{
        position: 'absolute', top: 3, left: checked ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%',
        background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        transition: 'left 0.2s',
      }} />
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>{label}</span>
      {hint && <span style={{ fontSize: 11, color: '#888' }}>{hint}</span>}
      {children}
    </div>
  );
}

export function Section({ title, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <div style={{
        padding: '12px 20px', borderBottom: '1px solid #F3F4F6',
        fontSize: 11, fontWeight: 800, letterSpacing: 1,
        textTransform: 'uppercase', color: '#9BB5A2', background: '#FAFCFB',
        borderRadius: '16px 16px 0 0',
      }}>{title}</div>
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {children}
      </div>
    </div>
  );
}
