import { createRoot } from 'react-dom/client';
import EdiblePrintStudio from '../src/chefsdesk/EdiblePrintStudio.jsx';

// ── Edible Print Studio harness ─────────────────────────────────────────────────────────────────
// Built while chasing "+ Add image does nothing", which could not be reproduced by reading: the
// picker is a Panel mounted as a SIBLING of a full-screen overlay, and whether it is reachable
// depends on stacking, on pointer handlers and on what the apiClient answers — three things that
// only exist at runtime.
//
// The stub answers every call the studio makes. `fetchUploads` returns real images (data URIs, so
// nothing is fetched) because an empty picker and an absent picker look identical, and that is
// exactly the confusion this harness exists to remove.

// A tiny solid PNG, inlined — the harness must not depend on the network or on R2.
const swatch = (hex) => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = hex; ctx.fillRect(0, 0, 64, 64);
  return c.toDataURL('image/png');
};

const UPLOADS = [
  { id: 'u1', name: 'Rose',   url: swatch('#C98CA7'), uploadedBy: 'baker' },
  { id: 'u2', name: 'Leaf',   url: swatch('#5E8B62'), uploadedBy: 'baker' },
  { id: 'u3', name: 'Banner', url: swatch('#D8B45A'), uploadedBy: 'baker' },
];

const apiClient = {
  fetchPrintSheets:  async () => [],
  createPrintSheet:  async (b) => ({ id: 's1', name: b.name }),
  updatePrintSheet:  async () => ({}),
  deletePrintSheet:  async () => ({}),
  fetchPrintSheet:   async () => ({ items: [], guide: null }),
  fetchUploads:      async () => UPLOADS,
  fetchElementTypes: async () => [],
  fetchUploadLimits: async () => ({ maxImageBytes: 8 * 1024 * 1024 }),
};

createRoot(document.getElementById('root')).render(
  <EdiblePrintStudio apiClient={apiClient} elementTypes={[]} onClose={() => {}} />,
);
