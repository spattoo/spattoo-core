import { useCallback, useEffect, useRef, useState } from 'react';
import { topperSources, TOPPER_PREFIX } from './a4/topperSource.js';
import UploadsPanel from '../designer/decorations/UploadsPanel.jsx';
import { Z } from '../shared/Panel.jsx';
import A4Sheet from './a4/A4Sheet.jsx';
import { imageSource, framesIn, frameMaskOf } from './a4/imageSource.js';
import SheetLibrary from './SheetLibrary.jsx';
import FrameControls from './FrameControls.jsx';

// ── Edible Print Studio ───────────────────────────────────────────────────────────────────────────
// The baker's own door to the print sheet: choose images, lay them out on a to-scale A4, download a
// print-ready PDF — and save the layout so next week's identical banner is a reopen, not a rebuild.
//
// ── WHY IT EXISTS SEPARATELY FROM THE ORDER SHEET ────────────────────────────────────────────────
// The same sheet has always been reachable from an order, but only when a customer attached photos.
// That covers one job — printing what a customer composed — and misses the one bakers do far more
// often: printing something no order asked for. A name. A logo. Six of the same rose to cut out.
//
// Without this the alternative is Word: guess a size, print, discover it was wrong. Which is the
// exact problem a to-scale sheet was built to solve, so the tool already existed — behind the wrong
// door, and only for customers' photographs.
//
// ── ONE PICKER, NOT A SECOND LIBRARY ─────────────────────────────────────────────────────────────
// Images come from `UploadsPanel` in selectMode — the same component the designer opens when a photo
// frame asks "which image?", and the same one that uploads. A baker who already sent an image to a
// cake finds it here without sending it again, and a new one is uploaded from inside the picker
// rather than through a second button, because "a new one" is simply one answer to "which image?".
//
// ── TWO SCREENS, ONE DOOR ────────────────────────────────────────────────────────────────────────
// The studio opens on the LIBRARY and moves to the sheet. `sheet === null` is the library;
// `{ id, name, items, guide }` is the editor, with `id: null` for one not saved yet.

export default function EdiblePrintStudio({ apiClient, elementTypes = [], toppers = [], onClose }) {
  const [sheet, setSheet] = useState(null);     // null = the library is showing
  const [sources, setSources] = useState([]);
  const [picking, setPicking] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [frames, setFrames] = useState([]);
  const [selected, setSelected] = useState(null);   // sourceId the baker has selected on the sheet
  // What the baker chose is kept per UPLOAD, not per placement: two copies of the same photo on one
  // sheet are the same photo, and framing one of them differently would be a second image wearing
  // the first one's name in the strip.
  const [framing, setFraming] = useState({});       // sourceId → { frame, transform }
  // The upload rows behind the sources, kept so a source can be REBUILT when its frame changes
  // without asking the server again. A ref rather than state: nothing renders from it, and it must
  // be readable by a callback that ran before the next render.
  const uploadsRef = useRef(new Map());

  // The frames are the catalogue's photo-frame ELEMENTS — the same masks the cake renderer cuts
  // with, so a heart printed here is the heart the cake has. Config-gated on
  // placement_config.photo.mask, never on element type or slug (INVARIANTS #1/#6), which is what
  // makes a frame added in admin appear here with no deploy.
  useEffect(() => {
    let alive = true;
    // Promise.resolve() for the same reason SheetLibrary uses it: optional chaining short-circuits
    // the whole chain, so an unwired host would skip the .catch too and leave this hanging.
    Promise.resolve(apiClient?.fetchElements?.({ parentsOnly: true }))
      .then(rows => { if (alive) setFrames(framesIn(rows ?? [])); })
      .catch(() => {});   // no frames is a workable studio; every image simply prints unframed
    return () => { alive = false; };
  }, [apiClient]);

  // Rebuild ONE source in place, keeping its id so placements already on the sheet still point at
  // it. The sheet re-derives those items' heights from the new aspect on its own.
  const reframe = useCallback(async (sourceId, next) => {
    const upload = uploadsRef.current.get(sourceId);
    if (!upload) return;
    setFraming(f => ({ ...f, [sourceId]: next }));
    try {
      const rebuilt = await imageSource(upload, next);
      setSources(list => list.map(s => (s.id === sourceId ? rebuilt : s)));
    } catch {
      setErr('Couldn’t apply that frame.');
    }
  }, []);

  // Add a chosen upload, unless it is already here. Re-picking the same image is a natural way to
  // ask for a SECOND copy of it, but the sheet keys placements by source id, so two sources sharing
  // one id would make the strip ambiguous about which of them a thumbnail meant. Placing the same
  // source twice is already how a baker gets two copies — that is what the + on the thumbnail does.
  const addUpload = useCallback(async (upload) => {
    setPicking(false);
    setErr('');
    const id = String(upload.id);
    if (sources.some(s => s.id === id)) return;
    uploadsRef.current.set(id, upload);
    try {
      setSources(list => list.some(s => s.id === id) ? list : [...list, PENDING(id, upload.name)]);
      const src = await imageSource(upload);
      setSources(list => list.map(s => (s.id === id ? src : s)));
    } catch {
      // Drop the placeholder — leaving it would offer a thumbnail that can never become addable.
      setSources(list => list.filter(s => s.id !== id));
      setErr('That image couldn’t be loaded. Try another, or re-upload it.');
    }
  }, [sources]);

  /* ── The card toppers on the cake this sheet was opened from ──────────────────────────────────
   *
   * ⚠️ ADDED, NOT OFFERED IN A PICKER. Every other source here is something the baker goes and finds;
   * a topper is already on the cake in front of them, and it is the one decoration on this sheet
   * that is genuinely MADE by printing. Making them hunt for it would be asking them to re-choose
   * something they chose when they put it on the cake.
   *
   * ⚠️ ONLY ON A NEW SHEET. A SAVED one rebuilds its own toppers from what it stored, because a
   * sheet is a record of a print job — reopening it must show what was printed, not what the cake
   * happens to carry now. */
  useEffect(() => {
    if (!sheet || sheet.id || !toppers.length) return;
    let alive = true;
    (async () => {
      const built = (await Promise.all(toppers.map(t => topperSources(t).catch(() => [])))).flat();
      if (!alive || !built.length) return;
      setSources(list => [...list, ...built.filter(b => !list.some(s2 => s2.id === b.id))]);
    })();
    return () => { alive = false; };
  }, [sheet, toppers]);

  // ── The library ────────────────────────────────────────────────────────────────────────────────
  if (!sheet) {
    return (
      <SheetLibrary
        apiClient={apiClient}
        onNew={() => { setSources([]); setErr(''); setSelected(null); setFraming({}); setSheet(BLANK); }}
        onOpen={async (row) => {
          setErr('');
          try {
            // The list carries no `items` — one sheet's layout is fetched when it is opened, which is
            // why a library of fifty sheets costs one small request instead of fifty layouts.
            const full = await apiClient.fetchPrintSheet(row.id);
            const saved = Array.isArray(full.items) ? full.items : [];

            // Turn the saved uploadIds back into sources. THE STORED SHEET NAMES IMAGES, NOT URLS —
            // so this is where a url that changed is picked up, and where one that no longer exists
            // is noticed instead of rendering as a broken box.
            const uploads = (await apiClient.fetchUploads?.()) ?? [];
            const byId = new Map(uploads.map(u => [String(u.id), u]));
            // Toppers carry themselves; only the image items go looking for an upload.
            const savedToppers = saved.filter(it => it.topper);
            const wanted = [...new Set(saved.filter(it => !it.topper).map(it => String(it.uploadId)))];

            // The FRAMING travels with the layout: each saved item carries the mask it was cut with
            // and the transform it was composed at, so reopening restores the picture the baker
            // approved rather than a default crop of the same photo.
            const savedFraming = new Map(
              saved.map(it => [String(it.uploadId), { maskUrl: it.maskUrl ?? null, transform: it.transform ?? null }]),
            );

            const resolved = await Promise.all(wanted.map(async (id) => {
              const upload = byId.get(id);
              if (!upload) return null;                 // deleted since the sheet was saved
              uploadsRef.current.set(id, upload);
              const was = savedFraming.get(id) ?? {};
              // Matched by MASK URL, not by element id: the mask is what actually cut the photo, and
              // it survives a frame being re-pointed at a different element in the catalogue.
              const frame = was.maskUrl ? frames.find(f => frameMaskOf(f) === was.maskUrl) ?? null : null;
              try { return await imageSource(upload, { frame, transform: was.transform }); } catch { return null; }
            }));

            setFraming(Object.fromEntries(
              [...savedFraming].map(([id, was]) => [id, {
                frame: was.maskUrl ? frames.find(f => frameMaskOf(f) === was.maskUrl) ?? null : null,
                transform: was.transform,
              }]),
            ));
            /* Rebuilt from the STORED payload, never from the cake — see the note on the effect
               above. One source per distinct topper, so two placements of one topper share it. */
            const builtToppers = (await Promise.all(
              [...new Map(savedToppers.map(it => [String(it.topperId), it])).values()]
                .map(it => topperSources({ id: it.topperId, name: it.name, payload: it.topper }).catch(() => [])),
            )).flat();

            setSelected(null);
            setSources([...resolved.filter(Boolean), ...builtToppers]);
            setSheet({
              id: full.id,
              name: full.name,
              // uploadId (what the row stores) → sourceId (what the sheet lays out). The sheet has no
              // idea what an upload is, and translating here is what keeps it that way.
              items: saved.map(it => ({
                ...it,
                uid: it.uid ?? `it${it.topper ? `t${it.topperId}` : it.uploadId}-${it.x}-${it.y}`,
                sourceId: it.topper ? `${TOPPER_PREFIX}${it.topperId}` : String(it.uploadId),
              })),
              guide: full.guide ?? null,
            });
            // Said once, plainly. An item whose image is gone also shows "Image deleted" in its own
            // place on the sheet, so this explains the marks rather than being the only sign.
            const missing = wanted.length - resolved.filter(Boolean).length;
            if (missing) setErr(`${missing} image${missing > 1 ? 's were' : ' was'} deleted since this sheet was saved.`);
          } catch {
            setErr('Couldn’t open that sheet.');
          }
        }}
        onClose={onClose}
      />
    );
  }

  // ── The sheet ──────────────────────────────────────────────────────────────────────────────────
  async function save(sheetItems, guide) {
    setSaving(true);
    setErr('');
    // sourceId → uploadId, the other half of the translation done on open. What is PERSISTED names
    // images; what the sheet lays out names sources. Storing `sourceId` would leak the sheet's own
    // vocabulary into the database, where the next kind of source would make it a lie.
    // Each item also carries HOW its image was framed. Stored per item rather than per sheet because
    // that is the shape the row already declares (migration 049) and because a sheet is a list of
    // placements — nothing else about it would know where to put a transform.
    const items = sheetItems.map(({ sourceId, ...rest }) => {
      const src = sources.find(s => s.id === sourceId);
      /* ⚠️ A TOPPER HAS NO UPLOAD TO POINT AT, so it stores its PAYLOAD. The note above says storing
         `sourceId` would leak the sheet's vocabulary into the database "where the next kind of source
         would make it a lie" — this is that next kind, and it names what it actually is. The payload
         is a few hundred bytes, `printSheets.js` stores items exactly as sent, and carrying it means
         a saved sheet keeps printing what it printed even after the cake is changed. */
      if (src?.topper) {
        return { ...rest, uploadId: null, topperId: sourceId.slice(TOPPER_PREFIX.length), topper: src.topper };
      }
      return { ...rest, uploadId: sourceId, maskUrl: src?.maskUrl ?? null, transform: src?.transform ?? null };
    });
    try {
      if (sheet.id) {
        await apiClient.updatePrintSheet(sheet.id, { items, guide });
      } else {
        const name = window.prompt('Name this sheet', suggestedName());
        if (name == null) return;                       // cancelled — not an error, and not a save
        const created = await apiClient.createPrintSheet({ name: name.trim() || suggestedName(), items, guide });
        setSheet(sh => ({ ...sh, id: created.id, name: created.name }));
      }
    } catch (e) {
      // The server's own words when it has them: "you have reached the limit of 200 saved sheets"
      // tells a baker what to do, and "couldn't save" does not.
      setErr(e?.message || 'Couldn’t save that sheet.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <A4Sheet
        // Remount per sheet. A4Sheet reads initialItems ONCE (it owns the layout after that), so
        // switching sheets without a fresh mount would show the previous one's items under the new
        // one's name — and saving would then write them there.
        key={sheet.id ?? 'new'}
        sources={sources}
        // No auto-place: an order's photos are the reason its sheet was opened, but here the baker
        // has not chosen anything yet, and a page that fills itself would be undoing their first act.
        autoPlaceFirst={false}
        initialItems={sheet.items}
        initialGuide={sheet.guide}
        paletteTitle="Your images"
        emptyHint="Add an image to start laying out your sheet."
        error={err}
        fileName={`${slug(sheet.name) || 'edible-print'}-sheet.pdf`}
        onAdd={() => setPicking(true)}
        addLabel="Add image"
        onSelectSource={setSelected}
        paletteExtra={
          <FrameControls
            frames={frames}
            source={selected ? sources.find(s => s.id === selected) ?? null : null}
            onChangeFrame={(frame) => reframe(selected, { frame, transform: framing[selected]?.transform ?? null })}
            onChangeTransform={(transform) => reframe(selected, { frame: framing[selected]?.frame ?? null, transform })}
          />
        }
        onSave={save}
        saveLabel={saving ? 'Saving…' : sheet.id ? 'Save' : 'Save sheet'}
        saving={saving}
        // Back to the library, not out of the studio — Close on the library is the way out. A single
        // Close here would throw away an unsaved layout to reach a list.
        onClose={() => { setSheet(null); setSources([]); setErr(''); setSelected(null); setFraming({}); }}
      />
      {picking && (
        <UploadsPanel
          apiClient={apiClient}
          elementTypes={elementTypes}
          // The studio is a full-screen surface at Z.studio; a picker at the default Z.panel opens
          // faithfully and invisibly beneath it.
          zIndex={Z.overStudio}
          // Choosing, not managing: no promote controls, and a tap means "use this one".
          selectMode
          canPromote={false}
          onSelect={addUpload}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}

// A sheet that has never been saved. `id: null` is what makes Save create rather than update.
const BLANK = { id: null, name: '', items: [], guide: null };

// A source that is on the strip but not yet loaded. `preview: null` is what makes the sheet render
// it as still loading and refuse to place it — the same state an order's photo passes through, so
// the strip behaves identically whichever door the baker came in by.
const PENDING = (id, name) => ({ id, name: name || 'Image', aspect: 1, preview: null, draw: () => {} });

const suggestedName = () => 'Print sheet';
const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
