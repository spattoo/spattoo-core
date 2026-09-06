import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import FinishedPhotoEditor from '../src/orders/FinishedPhotoEditor.jsx';

/* The finished-photo editor on a real photo.
 *
 * It normally opens between choosing a finished-cake photo and uploading it — behind a login, an
 * order, and a status transition — so it cannot be judged by clicking through, and the toggles it
 * offers are exactly the thing that needs judging by eye.
 *
 * ⚠️ NO SAMPLE PHOTO IS COMMITTED, deliberately. A finished-cake photo is a CUSTOMER'S cake, and the
 * one this was built against carries a child's name piped on it and a printed photo topper of a
 * child; that does not belong in a repository forever. Pick one from disk — it never leaves the
 * browser.
 *
 * ⚠️ And it is a PICKER, not a drop zone. The first cut of this harness listened for a drop on the
 * page and fetched a sample on load. Both failed: the editor is a modal, so its overlay sits above
 * the page and swallowed every drop, and Vite answers a missing file with index.html at 200 — so
 * `r.ok` was true, a File was built out of HTML, and the canvas came up blank with nothing to say
 * why.
 */
function App() {
  const [file, setFile] = useState(null);
  const [out, setOut] = useState(null);

  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) { setOut(null); setFile(f); }
  };

  return (
    <div style={{ minHeight: '100%', padding: 24, fontFamily: "'Quicksand', sans-serif" }}>
      <h1 style={{ fontSize: 17, fontWeight: 800, color: '#2C4433', marginBottom: 6 }}>
        Finished-photo editor
      </h1>
      <p style={{ fontSize: 13, color: '#777', marginBottom: 16, maxWidth: 520, lineHeight: 1.5 }}>
        Choose a cake photo. Nothing is uploaded — the whole editor runs in this browser.
      </p>

      <label style={{
        display: 'inline-block', padding: '12px 18px', borderRadius: 11, cursor: 'pointer',
        background: '#3A4F46', color: '#fff', fontSize: 14, fontWeight: 800,
      }}>
        Choose a photo…
        <input type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
      </label>
      {file && <span style={{ marginLeft: 12, fontSize: 12.5, color: '#777' }}>{file.name}</span>}

      {file && !out && (
        <FinishedPhotoEditor
          key={`${file.name}-${file.size}`}
          file={file}
          bakerName="feelings & flavours"
          primaryColor="#3A4F46"
          onCancel={() => setFile(null)}
          onDone={setOut}
        />
      )}

      {out && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2C4433', marginBottom: 8 }}>
            Returned: {out.name} — {(out.size / 1024).toFixed(0)} KB
            {out === file ? '  (unchanged — the original file itself)' : '  (edited)'}
          </div>
          <img alt="" src={URL.createObjectURL(out)}
               style={{ maxWidth: 420, borderRadius: 12, display: 'block' }} />
          <button onClick={() => setOut(null)} style={{
            marginTop: 10, padding: '9px 14px', borderRadius: 9, border: '1.5px solid #ddd',
            background: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>Edit again</button>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
