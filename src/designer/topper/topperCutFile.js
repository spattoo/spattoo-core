import { loadFacesFor, BLOCK_FACE } from '../geometry/topperFaces.js';
import { toppersToSvg } from './topperSvg.js';

// ── Handing a cutting file to the baker ──────────────────────────────────────────────────────────
//
// The download itself. Kept apart from `topperSvg.js` so what gets CUT stays a pure function that
// can be checked without a browser — this file is the only part that needs one.

const safe = (s) => String(s || 'card toppers').trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 60) || 'card-toppers';

/**
 * Build one cutting file for a cake's card toppers and give it to the browser.
 *
 * ⚠️ FACES ARE LOADED FIRST, and a topper whose face has not arrived would otherwise be cut in the
 * wrong letterform — on the cake a late face is a moment of block lettering, but a cut file is
 * permanent: the card is already in the machine.
 *
 * @returns {Promise<{ok: true, name: string} | {ok: false, reason: string}>}
 */
export async function downloadToppersCutFile(toppers, { cakeName } = {}) {
  const list = (toppers ?? []).filter(t => t?.payload?.objects?.length);
  if (!list.length) return { ok: false, reason: 'There are no card toppers on this cake.' };

  // One face map for the whole cake: two toppers usually share a face, and loading it twice would
  // be two fetches for one file.
  const merged = { objects: list.flatMap(t => t.payload.objects) };
  const fonts = await loadFacesFor(merged);
  const svg = toppersToSvg(list, (o) => fonts[o.face] ?? fonts[BLOCK_FACE]);
  if (!svg) return { ok: false, reason: 'Those toppers have nothing that can be cut.' };

  const name = `${safe(cakeName)}-toppers.svg`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);   // Firefox will not follow a link that is not in the document
    a.click();
    a.remove();
  } finally {
    // Freed on the next tick rather than immediately: revoking while the click is still being
    // handled cancels the download in Safari, and the leak is one blob for one frame.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return { ok: true, name };
}
