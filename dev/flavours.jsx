import { createRoot } from 'react-dom/client';
import FlavoursPanel from '../src/settings/FlavoursPanel.jsx';

// The real panel against a stubbed API — the per-kg rates and the visibility line are
// the new surface, and both are judged by eye.
const FLAVOURS = [
  { id: 'f1', name: 'Chocolate Truffle', description: 'Dark ganache', excluded: false, price_per_kg: 1200, is_signature: true, conflicts_with: [], baseline_conflicts: [] },
  { id: 'f2', name: 'Red Velvet',        description: 'Cream cheese frosting', excluded: false, price_per_kg: 1400, conflicts_with: [], baseline_conflicts: [] },
  { id: 'f3', name: 'Hazelnut Praline',  description: null, excluded: false, price_per_kg: null, conflicts_with: [{ key: 'nut_free', label: 'Nut-free', kind: 'allergen' }], baseline_conflicts: ['nut_free'] },
  { id: 'f4', name: 'Pineapple',         description: null, excluded: true,  price_per_kg: 900,  conflicts_with: [], baseline_conflicts: [] },
  // Offered, so the harness can actually exercise the 3-signature cap — with three offered
  // flavours the limit could never bite and the disabled state was never looked at.
  { id: 'f5', name: 'Butterscotch',      description: null, excluded: false, price_per_kg: 1000, conflicts_with: [], baseline_conflicts: [] },
];
const DIET = [
  { key: 'eggless',  label: 'Eggless',  kind: 'diet',     offered: true },
  { key: 'vegan',    label: 'Vegan',    kind: 'diet',     offered: true },
  { key: 'nut_free', label: 'Nut-free', kind: 'allergen', offered: true },
];

const apiClient = {
  fetchBakerFlavours: async () => ({
    flavours: FLAVOURS,
    visibility: { show_flavours: true, price_visibility: 'private' },
  }),
  fetchBakerDietaryRequirements: async () => DIET,
  updateBakerFlavours: async (body) => { window.__lastPut = body; console.log('PUT /api/baker/flavours'); return { ok: true }; },
  updateBakerDietaryExclusions: async () => ({ ok: true }),
  updateBakerFlavourDietaryConflicts: async () => ({ ok: true }),
};

createRoot(document.getElementById('root')).render(
  <FlavoursPanel open apiClient={apiClient} onClose={() => {}} primaryColor="#2C4433" accentColor="#6B8C74" />,
);
