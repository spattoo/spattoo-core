import React from 'react';

// The ONE numeric input for number cakes. Both places a customer types a number — the New-cake prompt
// (ShapePicker) and the tier popup's Number field (TierShapeControls) — render this, so the sanitisation
// (digits only, max 4) and the look never drift into two copies. `onChange` receives the cleaned string.
export default function DigitsInput({ value, onChange, onEnter, autoFocus = false, placeholder = 'e.g. 4', style }) {
  return (
    <input
      inputMode="numeric" maxLength={4} placeholder={placeholder} autoFocus={autoFocus}
      value={value ?? ''}
      onChange={e => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
      onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter(); }}
      style={{
        width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
        border: '1.5px solid #d9d9e0', background: '#fff', fontSize: 20, fontWeight: 800,
        fontFamily: 'inherit', color: '#1a1a1a', textAlign: 'center', letterSpacing: 3, ...style,
      }}
    />
  );
}
