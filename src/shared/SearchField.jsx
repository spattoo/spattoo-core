// ── The search box, with a way out of it ─────────────────────────────────────────────────────────
//
// Two panels in the designer had the same hand-rolled `<input>` — Decorations and Templates, the
// same border, radius, padding and font written out twice — and neither could be emptied except by
// holding backspace. The search also SURVIVES the panel closing, deliberately: someone placing six
// of the same decoration should not retype the word each time they reopen it. That is only kind if
// getting rid of it is one tap. Sandeep, reopening Decorations onto a stale "cream pe":
// *"pls have a clear icon next to the textbox so user can easily clear than using backspace."*
//
// ⚠️ A THIRD COPY WAS THE OTHER OPTION, AND IT IS THE ONE THE RULES EXIST TO STOP. The ask was for
// one panel; writing the button into that panel's input would have left the other search still
// uncloseable and a fourth one waiting to be written by hand (root CLAUDE.md rule 1).
//
// ⚠️ IT IS A <button>, NOT A SPAN WITH AN onClick. It takes keyboard focus, answers Enter and
// Space, and announces itself — the same reason `NavRow` exists. There are already two dozen
// `<div onClick>` in src/; this is not the next one.
//
// ⚠️ AND IT ONLY EXISTS WHEN THERE IS SOMETHING TO CLEAR. A permanent ✕ over an empty box is a
// control that does nothing, which is worse than no control (rule 7, judged at rest).

import { useRef } from 'react';

export function SearchField({
  value,
  onChange,
  placeholder = 'Search…',
  ariaLabel,
  autoFocus = false,
  style = {},
}) {
  const ref = useRef(null);
  const has = (value ?? '').length > 0;

  return (
    <div style={{ position: 'relative', width: '100%', flexShrink: 0, ...style }}>
      <input
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        autoFocus={autoFocus}
        /* ⚠️ Escape clears before it closes anything. A search box is the one place Escape already
           means "undo what I typed", and without this the key bubbles to the panel and shuts the
           whole thing — losing the search AND the panel when only the first was wanted. */
        onKeyDown={e => {
          if (e.key === 'Escape' && has) { e.stopPropagation(); onChange(''); }
        }}
        style={{
          width: '100%',
          // room for the button, so a long query never runs underneath it
          padding: has ? '6px 38px 6px 10px' : '6px 10px',
          border: '1.5px solid #999999', borderRadius: 8,
          fontSize: 12, fontFamily: "'Quicksand', sans-serif", color: '#333',
          outline: 'none', boxSizing: 'border-box', background: '#ffffff',
        }}
      />
      {has && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange('');
            // Straight back into the box: clearing is almost always the start of another search,
            // and a cleared field that has lost focus costs a second tap to carry on.
            ref.current?.focus();
          }}
          style={{
            /* ⚠️ AS WIDE AS THE FIELD WILL ALLOW IT TO BE TALL. A thumb wants 44px and the box is
               only 29 high, so the height is spent; widening to 38 buys back what is left rather
               than leaving a 30px square in the corner of a phone screen (rule 5). */
            position: 'absolute', top: 0, right: 0, height: '100%', width: 38,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0, border: 'none', background: 'transparent',
            color: '#8a8a8a', fontSize: 13, lineHeight: 1, cursor: 'pointer',
            fontFamily: "'Quicksand', sans-serif",
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default SearchField;
