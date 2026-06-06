// Dev-only backfill: render a thumbnail for each rectangular/sheet template (which were
// seeded server-side and have none) and upload it. Open http://localhost:5173/thumbnails.html
// while logged in, then click "Generate". One-time tool; not part of the shipped app.

import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { CakeThumbnailCanvas, AuthGate } from '../src/index.js';
import { BOTTOM_H, TIER_HEIGHT_STEP } from '../src/designer/constants.js';

const supabase = createClient(
  'https://lsvmnycehfopxsgruwmk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxzdm1ueWNlaGZvcHhzZ3J1d21rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MjI0NjIsImV4cCI6MjA5MTM5ODQ2Mn0.ay0o6ugWvik_Mp607oYyYQIQzX4wphhhLNi-53HvwHY'
);
const API_URL = 'https://spattoo-backend.onrender.com';

async function authFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, ...(options.headers ?? {}) },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `API ${res.status}`);
  return res.json();
}

// Map a stored template design into the canvasConfig shape CakeThumbnailCanvas renders.
function toConfig(design) {
  const tiers = (design.tiers ?? []).map((t, i) => {
    const isRect = t.shape === 'rect';
    const width = t.width ?? 2.16, depth = t.depth ?? 1.56;
    return {
      radius:       isRect ? Math.max(width, depth) / 2 : (t.radius ?? 1.2),
      height:       t.height ?? (BOTTOM_H - i * TIER_HEIGHT_STEP),
      color:        t.color ?? '#ffffff',
      frostingType: t.frostingType ?? 'buttercream',
      topPiping:    t.topPiping ?? null,
      bottomPiping: t.bottomPiping ?? null,
      ...(isRect && { shape: 'rect', width, depth }),
    };
  });
  return { tiers, stickers: design.stickers ?? [], topper: design.topper ?? null };
}

function Backfill() {
  const [rows, setRows] = useState([]);     // [{ id, name, shape, design, status }]
  const [active, setActive] = useState(-1); // index currently rendering
  const [running, setRunning] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    authFetch('/api/templates')
      .then(list => setRows(list
        .filter(t => t.shape === 'rectangle' || t.shape === 'square')
        .map(t => ({ id: t.id, name: t.name, shape: t.shape, design: t.design, status: t.thumbnail_url ? 'has thumbnail' : 'pending' }))))
      .catch(e => alert('Load failed: ' + e.message));
  }, []);

  // When `active` points at a row, give the canvas time to paint, then capture+upload.
  useEffect(() => {
    if (active < 0 || active >= rows.length) return;
    const row = rows[active];
    const t = setTimeout(async () => {
      try {
        const canvas = containerRef.current?.querySelector('canvas');
        if (!canvas) throw new Error('no canvas');
        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        if (!blob) throw new Error('capture failed');
        const filename = `${crypto.randomUUID()}.png`;
        const { url, key } = await authFetch('/api/storage/sign-upload', {
          method: 'POST', body: JSON.stringify({ folder: 'templates/thumbnails', filename, contentType: 'image/png' }),
        });
        await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: blob });
        await authFetch(`/api/admin/templates/${row.id}`, { method: 'PATCH', body: JSON.stringify({ thumbnail_url: key }) });
        setRows(rs => rs.map((r, i) => i === active ? { ...r, status: 'done ✓' } : r));
      } catch (e) {
        setRows(rs => rs.map((r, i) => i === active ? { ...r, status: 'error: ' + e.message } : r));
      }
      const next = active + 1;
      if (next < rows.length) setActive(next); else { setActive(-1); setRunning(false); }
    }, 900);
    return () => clearTimeout(t);
  }, [active]); // eslint-disable-line

  const start = () => { if (rows.length) { setRunning(true); setActive(0); } };

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 24, maxWidth: 560 }}>
      <h2>Template thumbnail backfill</h2>
      <p style={{ color: '#666', fontSize: 13 }}>Generates a thumbnail for each rectangular/square template and uploads it. Re-runnable (overwrites).</p>
      <button onClick={start} disabled={running || !rows.length}
        style={{ padding: '8px 16px', fontSize: 14, fontWeight: 700, cursor: running ? 'default' : 'pointer' }}>
        {running ? `Generating ${active + 1}/${rows.length}…` : `Generate (${rows.length})`}
      </button>
      <ul style={{ marginTop: 16, fontSize: 14, lineHeight: 1.8 }}>
        {rows.map((r, i) => (
          <li key={r.id}><b>{r.name}</b> <span style={{ color: '#999' }}>({r.shape})</span> — {i === active ? 'rendering…' : r.status}</li>
        ))}
      </ul>
      {/* Hidden render target for the row currently being captured */}
      {active >= 0 && active < rows.length && (
        <CakeThumbnailCanvas config={toConfig(rows[active].design)} containerRef={containerRef} />
      )}
    </div>
  );
}

const container = document.getElementById('root');
ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <AuthGate supabase={supabase}><Backfill /></AuthGate>
  </React.StrictMode>
);
