import { useEffect, useState } from 'react';
import { chrome } from './studioChrome.js';

// ── The Edible Print Studio's front door ──────────────────────────────────────────────────────────
// A baker's saved sheets, plus "New sheet". Opening the studio lands HERE rather than on a blank
// page, the way a documents app does: most visits are to something you already made.
//
// ── WHY THIS IS NOT A SECOND MENU ENTRY ─────────────────────────────────────────────────────────
// "Edible Print Studio" and a separate "My print sheets" next to it would be two doors onto one
// idea, and a baker would have to learn which one they wanted before knowing what either did. One
// entry, and the library is simply what is behind it.
//
// ── WHY NO THUMBNAILS YET ───────────────────────────────────────────────────────────────────────
// A thumbnail means rendering every sheet's layout, which means loading every image on every sheet
// — the whole cost of opening a sheet, paid for all of them, to draw a grid. The list carries names
// and dates precisely so it does not do that (the API omits `items` for the same reason). When a
// thumbnail is wanted it should be a stored raster made at save time, not a live render here.

export default function SheetLibrary({ apiClient, onOpen, onNew, onClose }) {
  const [sheets, setSheets] = useState(null);   // null = loading
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(null);       // id mid-delete

  useEffect(() => {
    let alive = true;
    apiClient?.fetchPrintSheets?.()
      .then(rows => { if (alive) setSheets(Array.isArray(rows) ? rows : []); })
      // An empty list and a failed fetch look identical on screen unless we say so, and "you have no
      // sheets" is a lie that makes a baker start rebuilding one they already have.
      .catch(() => { if (alive) { setSheets([]); setErr('Couldn’t load your saved sheets.'); } });
    return () => { alive = false; };
  }, [apiClient]);

  async function remove(sheet) {
    // A sheet can be a long layout and there is no undo, so this asks. Deleting an image does not,
    // because the image survives in Uploads; a sheet deleted is gone.
    if (!window.confirm(`Delete “${sheet.name}”? This can’t be undone.`)) return;
    setBusy(sheet.id);
    try {
      await apiClient.deletePrintSheet(sheet.id);
      setSheets(list => list.filter(s => s.id !== sheet.id));
    } catch {
      setErr('Couldn’t delete that sheet.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={s.overlay}>
      <div style={s.header}>
        <div style={s.title}>Edible Print Studio</div>
        <div style={s.actions}>
          <button style={s.primaryBtn} onClick={onNew}>New sheet</button>
          <button style={s.ghostBtn} onClick={onClose}>Close</button>
        </div>
      </div>

      <div style={s.body}>
        {err && <div style={s.err}>{err}</div>}

        {sheets === null && <div style={s.hint}>Loading your sheets…</div>}

        {sheets?.length === 0 && !err && (
          <div style={s.empty}>
            <div style={s.emptyTitle}>No saved sheets yet</div>
            <p style={s.emptyBody}>
              Lay images out on a to-scale A4, then save the sheet to print it again later — a name
              banner, a logo, a tray of the same decoration.
            </p>
            <button style={s.primaryBtn} onClick={onNew}>New sheet</button>
          </div>
        )}

        {!!sheets?.length && (
          <div style={s.list}>
            {sheets.map(sheet => (
              <div key={sheet.id} style={s.row}>
                {/* The whole row opens it — a baker reaching for a sheet is reaching for the name,
                    not for a button beside it. */}
                <button style={s.rowMain} onClick={() => onOpen(sheet)}>
                  <span style={s.rowName}>{sheet.name}</span>
                  <span style={s.rowMeta}>Edited {relativeDate(sheet.updated_at)}</span>
                </button>
                <button style={s.rowDelete} onClick={() => remove(sheet)} disabled={busy === sheet.id}
                        title={`Delete ${sheet.name}`} aria-label={`Delete ${sheet.name}`}>
                  {busy === sheet.id ? '…' : '×'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// "Edited 3 days ago" beats a date here: the question a baker is answering while scanning this list
// is "which one was I working on", and recency answers it faster than a calendar does.
export function relativeDate(iso, now = Date.now()) {
  const t = Date.parse(iso ?? '');
  if (Number.isNaN(t)) return 'recently';    // never render "Invalid Date" at a baker
  const days = Math.floor((now - t) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? 'a month ago' : `${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? 'a year ago' : `${years} years ago`;
}

const s = {
  ...chrome,   // overlay / header / title / actions / primaryBtn / ghostBtn — shared with the sheet
  body: { flex: 1, overflowY: 'auto', padding: '20px max(20px, calc((100vw - 720px) / 2))' },
  hint: { fontSize: 13, color: '#8a7a80' },
  err: { fontSize: 12.5, color: '#c0392b', fontWeight: 700, marginBottom: 12 },
  empty: { textAlign: 'center', padding: '64px 20px', maxWidth: 420, margin: '0 auto' },
  emptyTitle: { fontSize: 16, fontWeight: 800, color: '#2C4433', marginBottom: 8 },
  emptyBody: { fontSize: 13, color: '#7A6C60', lineHeight: 1.6, marginBottom: 20 },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', alignItems: 'stretch', gap: 8, background: '#fff', border: '1.5px solid #E8E4DC', borderRadius: 12, overflow: 'hidden' },
  rowMain: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, padding: '13px 16px', border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' },
  rowName: { fontSize: 14, fontWeight: 700, color: '#2A241F' },
  rowMeta: { fontSize: 11.5, color: '#8a7a80' },
  rowDelete: { width: 44, flexShrink: 0, border: 'none', borderLeft: '1.5px solid #F0ECE6', background: 'none', color: '#b0a49a', fontSize: 18, lineHeight: 1, cursor: 'pointer' },
};
