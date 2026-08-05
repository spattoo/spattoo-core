import { useCallback, useState } from 'react';
import UploadsPanel from '../designer/decorations/UploadsPanel.jsx';
import A4Sheet from './a4/A4Sheet.jsx';
import { plainSource } from './a4/plainSource.js';

// ── Edible Print Studio ───────────────────────────────────────────────────────────────────────────
// The baker's own door to the print sheet: choose images, lay them out on a to-scale A4, download a
// print-ready PDF.
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
// A parallel picker would have meant a second idea of what a baker's images are, and the two would
// have disagreed the first time one of them learned about deletion.

export default function EdiblePrintStudio({ apiClient, elementTypes = [], onClose }) {
  const [sources, setSources] = useState([]);
  const [picking, setPicking] = useState(false);
  const [err, setErr] = useState('');

  // Add a chosen upload, unless it is already here. Re-picking the same image is a natural way to ask
  // for a SECOND copy of it, but the sheet keys placements by source id, so two sources sharing one
  // id would make the strip ambiguous about which of them a thumbnail meant. Placing the same source
  // twice is already how a baker gets two copies — that is what the + on the thumbnail does.
  const addUpload = useCallback(async (upload) => {
    setPicking(false);
    setErr('');
    const id = String(upload.id);
    if (sources.some(s => s.id === id)) return;
    try {
      setSources(list => list.some(s => s.id === id) ? list : [...list, PENDING(id, upload.name)]);
      const src = await plainSource(upload);
      setSources(list => list.map(s => (s.id === id ? src : s)));
    } catch {
      // Drop the placeholder — leaving it would offer a thumbnail that can never become addable.
      setSources(list => list.filter(s => s.id !== id));
      setErr('That image couldn’t be loaded. Try another, or re-upload it.');
    }
  }, [sources]);

  return (
    <>
      <A4Sheet
        sources={sources}
        // No auto-place: an order's photos are the reason its sheet was opened, but here the baker
        // has not chosen anything yet, and a page that fills itself would be undoing their first act.
        autoPlaceFirst={false}
        paletteTitle="Your images"
        emptyHint="Add an image to start laying out your sheet."
        error={err}
        fileName="edible-print-sheet.pdf"
        onAdd={() => setPicking(true)}
        addLabel="Add image"
        onClose={onClose}
      />
      {picking && (
        <UploadsPanel
          apiClient={apiClient}
          elementTypes={elementTypes}
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

// A source that is on the strip but not yet loaded. `preview: null` is what makes the sheet render it
// as still loading and refuse to place it — the same state an order's photo passes through, so the
// strip behaves identically whichever door the baker came in by.
const PENDING = (id, name) => ({ id, name: name || 'Image', aspect: 1, preview: null, draw: () => {} });
