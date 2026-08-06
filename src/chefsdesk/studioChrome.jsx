// ── The shell every Chef's Desk full-screen tool wears ────────────────────────────────────────────
// The Edible Print Studio is two screens — the sheet library and the A4 page — and a baker moves
// between them without leaving. They must therefore look like ONE tool: the same full-bleed surface,
// the same title bar, the same two buttons in the same place. A header that shifted by two pixels on
// the way in would read as a different screen having opened.
//
// Extracted because it had already been copied once. `check:dup` caught the second copy the moment
// it existed, which is the entire reason src/chefsdesk was added to that gate's paths — a shared
// vocabulary that lives in two files stops being shared the first time somebody tunes one of them.
//
// Tool-specific styling stays with its tool. Only what BOTH screens are is here.

export const chrome = {
  // Full-bleed and fixed: these are destinations, not dialogs. zIndex sits above the designer's own
  // panels, which is what lets the studio be opened from inside it.
  overlay: {
    position: 'fixed', inset: 0, zIndex: 4000, background: '#FAFAF8',
    display: 'flex', flexDirection: 'column', fontFamily: 'inherit',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 20px', borderBottom: '1.5px solid #E8E4DC', background: '#fff',
  },
  // The tool's name. Identical on both screens on purpose — it is the one thing telling a baker they
  // are still in the same place.
  title: { fontWeight: 800, fontSize: 16, color: '#2C4433' },
  actions: { display: 'flex', gap: 10 },
  primaryBtn: {
    padding: '9px 16px', borderRadius: 10, border: 'none', background: '#3D5A44',
    color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },
  ghostBtn: {
    padding: '9px 14px', borderRadius: 10, border: '1.5px solid #ccc', background: '#fff',
    fontSize: 13, fontWeight: 700, color: '#555', cursor: 'pointer',
  },
};
