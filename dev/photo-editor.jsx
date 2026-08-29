import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import FinishedPhotoEditor from '../src/orders/FinishedPhotoEditor.jsx';

/* The editor on a REAL baker photo. It normally opens between choosing a finished-cake photo and
 * uploading it, which is behind a login, an order, and a status transition — so it cannot be judged
 * by clicking through, and the toggles it offers are exactly the thing that needs judging by eye.
 *
 * Drops a sample photo in on load; drag another in to compare. */
function App() {
  const [file, setFile] = useState(null);
  const [out, setOut] = useState(null);

  /* ⚠️ NO SAMPLE PHOTO IS COMMITTED, and that is deliberate. The obvious convenience is to drop a
     real finished-cake photo into public/ so the harness opens on something — but a finished-cake
     photo is a CUSTOMER'S cake, and the one this was built against has a child's name piped on it
     and a printed photo topper of a child. That does not belong in a git repository, on anyone's
     machine, forever. Drag one in instead; it never leaves the browser. */
  useEffect(() => {
    fetch('/sample-cake.jpg').then(r => r.ok ? r.blob() : null)
      .then(b => b && setFile(new File([b], 'sample-cake.jpg', { type: 'image/jpeg' })))
      .catch(() => {});   // absent by design — see above
  }, []);

  return (
    <div style={{ height: '100%', padding: 20 }}
         onDragOver={e => e.preventDefault()}
         onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) { setOut(null); setFile(f); } }}>
      <div style={{ fontSize: 12, color: '#777', marginBottom: 10 }}>
        Drop a photo anywhere to load it. {file ? `Loaded: ${file.name}` : 'Waiting…'}
      </div>
      {file && !out && (
        <FinishedPhotoEditor
          file={file} bakerName="feelings & flavours" primaryColor="#3A4F46"
          onCancel={() => setFile(null)}
          onDone={(f) => setOut(f)}
        />
      )}
      {out && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            Returned: {out.name} — {(out.size / 1024).toFixed(0)} KB
            {out === file ? ' (unchanged — the original file itself)' : ' (edited)'}
          </div>
          <img alt="" src={URL.createObjectURL(out)} style={{ maxWidth: 420, borderRadius: 12 }} />
          <div><button onClick={() => setOut(null)} style={{ marginTop: 10 }}>Edit again</button></div>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
