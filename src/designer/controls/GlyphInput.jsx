import React from 'react';

// The ONE text input for glyph cakes (numbers AND letters). Every place a customer types the characters
// their cake is shaped like — the New-cake prompt (ShapePicker) and the tier popup's field
// (TierShapeControls) — renders this, so the sanitisation and look never drift into copies. The charset,
// max length and casing come in as props so the digit and letter families share one control:
//   • number → keep={/[^0-9]/g},   maxLength=4, inputMode="numeric"
//   • letter → keep={/[^A-Za-z]/g}, maxLength=3, upper, inputMode="text"
// NOTE: this strips the charset but does NOT apply the family's fallback ('1'/'A') — an empty box must
// stay empty while typing. The fallback lives in glyphShape's cleaners, applied only at render time.
export default function GlyphInput({
  value, onChange, onEnter, autoFocus = false, placeholder = '', style,
  keep = /[^0-9]/g, maxLength = 4, upper = false, inputMode = 'numeric',
}) {
  const sanitize = (raw) => {
    let s = String(raw ?? '').replace(keep, '');
    if (upper) s = s.toUpperCase();
    return s.slice(0, maxLength);
  };
  return (
    <input
      inputMode={inputMode} maxLength={maxLength} placeholder={placeholder} autoFocus={autoFocus}
      value={value ?? ''}
      onChange={e => onChange(sanitize(e.target.value))}
      onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter(); }}
      style={{
        width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
        border: '1.5px solid #d9d9e0', background: '#fff', fontSize: 20, fontWeight: 800,
        fontFamily: 'inherit', color: '#1a1a1a', textAlign: 'center', letterSpacing: 3, ...style,
      }}
    />
  );
}

// The two family presets, so callers pass ONE prop (`family`) instead of restating the charset each time.
export const GLYPH_INPUT_PROPS = {
  number: { keep: /[^0-9]/g,   maxLength: 4, upper: false, inputMode: 'numeric', placeholder: 'e.g. 21' },
  letter: { keep: /[^A-Za-z]/g, maxLength: 3, upper: true,  inputMode: 'text',    placeholder: 'e.g. ABC' },
};
