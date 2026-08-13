// ── Framing one image on the print sheet ──────────────────────────────────────────────────────────
// Two questions about the selected image: which shape cuts it, and how the photo sits inside that
// shape. They are one panel because they are one decision — choosing a heart immediately raises
// "which part of the photo is in the heart", and answering it anywhere else would mean picking a
// frame, hunting for a control, and picking again.
//
// ── WHY NOT THE DESIGNER'S CONTROLS ─────────────────────────────────────────────────────────────
// The cake designer has a zoom dial and pan arrows for exactly this (CakeDesigner.jsx). They are not
// reused, and that is a judgement rather than an oversight: those write through `updateSticker` into
// cake-design state and are built from the designer's toolbar chrome, so sharing them means either
// dragging that state model in here or rewriting them to a plain interface — a change to a
// 7,000-line file, for UI that is a dozen buttons.
//
// What genuinely IS shared is already shared: the arithmetic lives in framePhoto.js
// (renderFramedPhoto), which both call. This file is a way of asking for a transform; the meaning of
// one is defined in exactly one place.

const PAN_STEP = 0.04;
const PAN_LIMIT = 0.6;
const ZOOM = { min: 0.5, max: 4, step: 0.1 };

const clampPan = (v) => Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, +v.toFixed(3)));

export default function FrameControls({ frames = [], source, onChangeFrame, onChangeTransform }) {
  // Nothing selected — say so, rather than showing dead controls that look broken.
  if (!source) {
    return <div style={s.idle}>Select an image on the sheet to frame it.</div>;
  }

  const t = source.transform ?? { x: 0, y: 0, zoom: 1, rot: 0 };
  const set = (patch) => onChangeTransform({ ...t, ...patch });
  const framed = !!source.frameId;

  return (
    <div style={s.wrap}>
      <div style={s.title}>Shape</div>
      <div style={s.frames}>
        {/* "No frame" first and always present: printing an image as it is, is the commonest job
            here, and it must not read as the absence of a choice. */}
        <button type="button" onClick={() => onChangeFrame(null)}
                style={{ ...s.frameBtn, ...(framed ? null : s.frameBtnOn) }}>
          <span style={s.noFrameGlyph} />
          <span style={s.frameName}>No frame</span>
        </button>
        {frames.map(f => (
          <button key={f.id} type="button" onClick={() => onChangeFrame(f)}
                  style={{ ...s.frameBtn, ...(source.frameId === String(f.id) ? s.frameBtnOn : null) }}
                  title={f.name}>
            {/* The MASK is the thumbnail — it is a silhouette of the cut, which is the thing being
                chosen. The element's own artwork would show a decorated frame the print has not got. */}
            <img src={f.placement_config.photo.mask} alt="" style={s.frameMask} />
            <span style={s.frameName}>{f.name}</span>
          </button>
        ))}
      </div>

      {/* Composing only means something once there is a shape to compose INTO. An unframed image is
          printed whole, so a zoom control there would be a crop with no way to see what it cut. */}
      {framed && (
        <>
          <div style={{ ...s.title, marginTop: 14 }}>Fit the photo</div>

          <div style={s.row}>
            <span style={s.label}>Zoom</span>
            <input type="range" min={ZOOM.min} max={ZOOM.max} step={ZOOM.step} value={t.zoom ?? 1}
                   onChange={e => set({ zoom: parseFloat(e.target.value) })}
                   style={s.range} aria-label="Zoom" />
          </div>

          <div style={s.row}>
            <span style={s.label}>Position</span>
            <div style={s.pad}>
              <button type="button" style={s.padBtn} onClick={() => set({ y: clampPan((t.y ?? 0) - PAN_STEP) })} aria-label="Move up">↑</button>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" style={s.padBtn} onClick={() => set({ x: clampPan((t.x ?? 0) + PAN_STEP) })} aria-label="Move left">←</button>
                <button type="button" style={s.padBtn} onClick={() => set({ x: clampPan((t.x ?? 0) - PAN_STEP) })} aria-label="Move right">→</button>
              </div>
              <button type="button" style={s.padBtn} onClick={() => set({ y: clampPan((t.y ?? 0) + PAN_STEP) })} aria-label="Move down">↓</button>
            </div>
          </div>

          <div style={s.row}>
            <span style={s.label}>Rotate</span>
            <input type="range" min={-180} max={180} step={1} value={t.rot ?? 0}
                   onChange={e => set({ rot: parseInt(e.target.value, 10) })}
                   style={s.range} aria-label="Rotate" />
          </div>

          {/* One way back. Fiddling with a crop and losing the original framing is the fastest way to
              give up on a photo that was fine to begin with. */}
          <button type="button" style={s.reset} onClick={() => onChangeTransform({ x: 0, y: 0, zoom: 1, rot: 0 })}>
            Reset fit
          </button>
        </>
      )}
    </div>
  );
}

const s = {
  wrap: { marginTop: 16, paddingTop: 14, borderTop: '1px dashed #e6e2ea' },
  idle: { marginTop: 16, paddingTop: 14, borderTop: '1px dashed #e6e2ea', fontSize: 11, color: '#8a7a80', lineHeight: 1.5 },
  title: { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: '#8a7a80', marginBottom: 10 },
  frames: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  frameBtn: { width: 62, padding: '6px 2px', borderRadius: 10, border: '1.5px solid #e6e2ea', background: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  frameBtnOn: { borderColor: '#b08968', background: '#fbf3ec' },
  frameMask: { width: 30, height: 30, objectFit: 'contain', opacity: 0.75 },
  noFrameGlyph: { width: 30, height: 30, border: '1.5px dashed #c9c2cc', borderRadius: 3, boxSizing: 'border-box' },
  frameName: { fontSize: 9.5, fontWeight: 700, color: '#7A6C60', maxWidth: 58, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  row: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  label: { fontSize: 10, fontWeight: 700, color: '#8a7a80', width: 52, flexShrink: 0 },
  range: { flex: 1, minWidth: 0 },
  pad: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  padBtn: { width: 26, height: 24, borderRadius: 6, border: '1.5px solid #d8cfd9', background: '#fff', color: '#5b5340', fontSize: 12, lineHeight: 1, cursor: 'pointer', padding: 0 },
  reset: { marginTop: 4, width: '100%', padding: '7px 0', borderRadius: 8, border: '1.5px solid #d8cfd9', background: '#fff', color: '#7A6C60', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' },
};
