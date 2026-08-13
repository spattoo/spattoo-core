// ── Reference photos, held in the browser until the enquiry is verified ─────────────────────────
// The bytes do NOT leave the device when the customer picks them. They are compressed, previewed
// from an object URL, and uploaded only at submit, on the session the OTP step produces — so by the
// time anything reaches R2 there is a proved phone number attached to it.
//
// The alternative was an anonymous signed-upload endpoint. The bucket is served publicly, so that is
// free file hosting on a Spattoo domain: the content-type allowlist stops scripts, but it cannot
// stop a JPEG being something awful, and the object would be immediately reachable and plausibly
// indexed. See plans/storefront-facets.md, "The reference photo door".
//
// ── WHY INDEXEDDB AND NOT localStorage ──────────────────────────────────────────────────────────
// localStorage is strings. A few megabytes of image would have to be base64'd (a third larger
// again), would blow the ~5MB quota, and — the part that matters — would take the REST of the draft
// down with it, because the quota is shared and the write that fails is whichever one happens to be
// last. The draft keeps its own store; photos keep theirs.
//
// The draft therefore holds only { id, name } per photo. Small, JSON-safe, and it survives a refresh
// alongside everything else the customer typed.

const DB_NAME = 'spattoo-storefront';
const STORE = 'photos';
const VERSION = 1;

let dbPromise = null;

function open() {
  // Cached: opening is async and a picker can add three photos in a burst. Not cached across a
  // failure, though — see the catch, or one blocked open would poison every later call.
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no-indexeddb'));
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexeddb-open-failed'));
  }).catch(err => { dbPromise = null; throw err; });
  return dbPromise;
}

function tx(mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let out;
    try { out = fn(store); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('indexeddb-aborted'));
  }));
}

// Scoped by slug so two bakers' storefronts open in two tabs cannot see each other's photos, and so
// clearing one draft cannot empty the other.
const rowKey = (slug, id) => `${slug}::${id}`;

/** Store a blob and return the id the draft should remember. */
export async function putPhoto(slug, blob, name) {
  const id = (globalThis.crypto?.randomUUID?.() ?? `p${Date.now()}${Math.random().toString(16).slice(2)}`);
  await tx('readwrite', s => s.put({ blob, name, slug, addedAt: Date.now() }, rowKey(slug, id)));
  return id;
}

/** The blob back, or null if it is gone — a cleared store, another device, a browser that evicted it. */
export async function getPhoto(slug, id) {
  try {
    const row = await tx('readonly', s => s.get(rowKey(slug, id)));
    return row?.blob ?? null;
  } catch {
    return null;
  }
}

export async function deletePhoto(slug, id) {
  try { await tx('readwrite', s => s.delete(rowKey(slug, id))); } catch { /* nothing to undo */ }
}

/** Everything this slug is holding — called after a successful send, and when the draft is cleared. */
export async function clearPhotos(slug) {
  try {
    const keys = await tx('readonly', s => s.getAllKeys());
    const mine = (keys ?? []).filter(k => typeof k === 'string' && k.startsWith(`${slug}::`));
    if (mine.length) await tx('readwrite', s => { mine.forEach(k => s.delete(k)); });
  } catch { /* best effort — a stranded blob is harmless and gets evicted */ }
}

/**
 * Is the store usable at all?
 *
 * Private-browsing modes and locked-down browsers throw on open. The photo door asks first and says
 * so plainly, rather than letting somebody pick three photos and discover at submit that none of
 * them survived — the one moment the failure is most expensive.
 */
export async function photosAvailable() {
  try { await open(); return true; } catch { return false; }
}
