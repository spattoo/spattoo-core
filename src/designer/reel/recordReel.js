/* ── Recording the cake canvas to a video file ───────────────────────────────────────────────────
 *
 * Used by the reel recorder (catalogue authors only — see spattoo-docs/features/reel-capture.md).
 * Nothing in here is three.js aware: it takes a canvas and a function that advances the shot, and
 * gives back a file. The camera move lives with the camera, in ReelDirector.
 *
 * ── NO LIBRARY, ON PURPOSE ──────────────────────────────────────────────────────────────────────
 * canvas.captureStream() and MediaRecorder are browser APIs, so the whole recording path costs zero
 * bundle. The obvious alternative — ffmpeg.wasm, to guarantee an MP4 — is ~25–30 MB, an order of
 * magnitude larger than the entire designer, and it is not worth it for a feature one bakery uses.
 * We negotiate the best container the browser offers instead, and SAY so when it is not MP4.
 */

// Best first. Instagram accepts MP4/H.264; WebM it may reject outright, which is why the caller has
// to be able to tell the difference rather than just being handed a blob.
const CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E',   // H.264 baseline — Chrome 130+, Safari
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

// Exported for testing, and because the UI needs to warn BEFORE a two-and-a-half second take rather
// than after it. `supported` is injected so this is testable without a browser.
export function pickMimeType(supported = t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
  for (const type of CANDIDATES) if (supported(type)) return type;
  return null;                                   // nothing usable — MediaRecorder missing entirely
}

export const isInstagramReady = mime => !!mime && mime.startsWith('video/mp4');

export const extensionFor = mime =>
  !mime ? 'bin' : mime.startsWith('video/mp4') ? 'mp4' : 'webm';

/* Record `canvas` for the duration of `run`.
 *
 * `run(onFrame)` drives the shot and resolves when it is finished. It is given nothing and is
 * expected to animate for as long as it wants; recording starts just before it and stops just after.
 *
 * ⚠️ The stream is requested at 0 fps and driven by requestFrame(). An fps argument makes
 * MediaRecorder sample on ITS own clock, which double-samples a canvas that is already rendering on
 * rAF — some frames captured twice, some missed, and a rotation that visibly stutters at a constant
 * 2.5 seconds. Driving it explicitly means exactly one captured frame per rendered frame.
 */
export async function recordCanvas(canvas, run, { mimeType = pickMimeType(), bitsPerSecond = 12_000_000 } = {}) {
  if (!canvas) throw new Error('no canvas to record');
  if (!mimeType) throw new Error('This browser cannot record video (MediaRecorder unavailable).');

  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error('the canvas produced no video track');

  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitsPerSecond });
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };

  const stopped = new Promise((resolve, reject) => {
    rec.onstop = resolve;
    rec.onerror = e => reject(e.error ?? new Error('recording failed'));
  });

  rec.start();
  try {
    // requestFrame is what actually samples the canvas. Handed to the caller so it can be called
    // immediately after each render — before anything else touches the GL context.
    await run(() => track.requestFrame?.());
  } finally {
    // In `finally` so a throw mid-shot still tears the recorder down; leaving it running holds the
    // canvas's capture stream open and the next take fails in a way that looks unrelated.
    if (rec.state !== 'inactive') rec.stop();
    stream.getTracks().forEach(t => t.stop());
  }
  await stopped;

  if (!chunks.length) throw new Error('nothing was recorded — the canvas may not have rendered');
  return new Blob(chunks, { type: mimeType });
}

// Hand the file to the baker. A blob URL rather than a data URL: a 2.5-second 1080×1920 take is a
// few MB, and a data URL that size is a string the browser has to hold in memory twice.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Not revoked immediately: Safari has been known to cancel an in-flight download when the URL is
  // revoked in the same tick.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
