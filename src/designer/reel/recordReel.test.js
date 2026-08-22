import { describe, it, expect, vi } from 'vitest';
import { pickMimeType, isInstagramReady, extensionFor, recordCanvas } from './recordReel.js';

describe('pickMimeType', () => {
  it('prefers MP4/H.264, because that is what Instagram accepts', () => {
    const supported = () => true;                       // a browser that supports everything
    expect(pickMimeType(supported)).toBe('video/mp4;codecs=avc1.42E01E');
  });

  it('falls back through MP4 to WebM as support narrows', () => {
    expect(pickMimeType(t => t !== 'video/mp4;codecs=avc1.42E01E')).toBe('video/mp4');
    expect(pickMimeType(t => t.startsWith('video/webm'))).toBe('video/webm;codecs=vp9');
    expect(pickMimeType(t => t === 'video/webm')).toBe('video/webm');
  });

  it('returns null when the browser can record nothing', () => {
    expect(pickMimeType(() => false)).toBeNull();
  });
});

describe('isInstagramReady', () => {
  // The whole reason the mime type is surfaced rather than hidden: a WebM handed over silently is a
  // file the baker discovers is useless at the moment they try to post it.
  it('is true only for MP4', () => {
    expect(isInstagramReady('video/mp4;codecs=avc1.42E01E')).toBe(true);
    expect(isInstagramReady('video/mp4')).toBe(true);
    expect(isInstagramReady('video/webm;codecs=vp9')).toBe(false);
    expect(isInstagramReady(null)).toBe(false);
  });
});

describe('extensionFor', () => {
  it('matches the container, so the file is not misnamed', () => {
    expect(extensionFor('video/mp4;codecs=avc1.42E01E')).toBe('mp4');
    expect(extensionFor('video/webm;codecs=vp9')).toBe('webm');
    expect(extensionFor(null)).toBe('bin');
  });
});

// ── recordCanvas ────────────────────────────────────────────────────────────────────────────────
// Stubs rather than a real browser: what is worth testing here is the LIFECYCLE — that the recorder
// is always torn down, that frames are requested explicitly, and that an empty take is an error
// rather than a zero-byte file the baker finds out about later.
function stubEnv({ failMidShot = false } = {}) {
  const track = { requestFrame: vi.fn(), stop: vi.fn() };
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
  const canvas = { captureStream: vi.fn(() => stream) };
  const rec = {
    state: 'recording',
    start: vi.fn(),
    stop: vi.fn(function () { this.state = 'inactive'; queueMicrotask(() => this.onstop?.()); }),
  };
  // `function`, not an arrow: MediaRecorder is called with `new`, and an arrow is not a constructor.
  globalThis.MediaRecorder = function () { return rec; };
  globalThis.Blob = class { constructor(parts, opts) { this.parts = parts; this.type = opts?.type; this.size = 1; } };
  return { canvas, rec, track, stream, failMidShot };
}

describe('recordCanvas', () => {
  it('captures one frame per rendered frame, driven explicitly', async () => {
    const { canvas, rec, track } = stubEnv();
    const blob = await recordCanvas(canvas, async onFrame => {
      for (let i = 0; i < 5; i++) { rec.ondataavailable({ data: { size: 10 } }); onFrame(); }
    }, { mimeType: 'video/mp4' });

    // 0 fps: MediaRecorder must not sample on its own clock, or it double-samples a canvas already
    // rendering on rAF and the rotation stutters.
    expect(canvas.captureStream).toHaveBeenCalledWith(0);
    expect(track.requestFrame).toHaveBeenCalledTimes(5);
    expect(blob.type).toBe('video/mp4');
  });

  it('tears the recorder down even when the shot throws', async () => {
    const { canvas, rec, track } = stubEnv();
    await expect(recordCanvas(canvas, async () => { throw new Error('camera exploded'); },
      { mimeType: 'video/mp4' })).rejects.toThrow('camera exploded');
    // Left running, the capture stream stays open and the NEXT take fails for reasons that look
    // nothing like this one.
    expect(rec.stop).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
  });

  it('refuses an empty take rather than handing over a zero-byte file', async () => {
    const { canvas } = stubEnv();
    await expect(recordCanvas(canvas, async () => {}, { mimeType: 'video/mp4' }))
      .rejects.toThrow(/nothing was recorded/);
  });

  it('refuses when the browser cannot record at all', async () => {
    const { canvas } = stubEnv();
    await expect(recordCanvas(canvas, async () => {}, { mimeType: null }))
      .rejects.toThrow(/cannot record video/);
  });
});
