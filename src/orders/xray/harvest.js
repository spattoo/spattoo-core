// Pull the X-Ray-relevant bits out of a saved design snapshot.
import { normalizeHex } from './gelLibrary.js';

// The cake board is a hardcoded render constant, not part of the design — and we
// deliberately exclude it from the cream-colour table.
const BOARD_HEX = normalizeHex('#fce8d5');

const tierLabel = (i, n) => (n === 1 ? 'Cake' : i === 0 ? 'Base tier' : i === n - 1 ? 'Top tier' : `Tier ${i + 1}`);

// Piping was once stored as singular topPiping/bottomPiping; newer designs use
// the topPipings/bottomPipings arrays. Normalize so X-Ray works on old orders.
const topList = (t) => t?.topPipings ?? (t?.topPiping ? [t.topPiping] : []);
const bottomList = (t) => t?.bottomPipings ?? (t?.bottomPiping ? [t.bottomPiping] : []);

// Friendly mapping for the freehand Cream Pen's internal nozzle keys → real tip.
const FREEHAND_NOZZLE = {
  round:  { shape: 'Round',       tip: 'Round / writing tip (e.g. Wilton 3–5)' },
  bead:   { shape: 'Round bead',  tip: 'Round tip (e.g. Wilton 10–12)' },
  star5:  { shape: 'Open star',   tip: 'Open star (e.g. Wilton 1M / 18)' },
  star6:  { shape: 'Open star',   tip: 'Open star (e.g. Wilton 2D / 32)' },
  drop:   { shape: 'Drop flower', tip: 'Drop flower (e.g. Wilton 2D)' },
  closed: { shape: 'Closed star', tip: 'Closed star (e.g. Wilton 30 / 35)' },
  jumbo:  { shape: 'Jumbo star',  tip: 'Large open star (e.g. Wilton 8B)' },
  french: { shape: 'French star', tip: 'French star (e.g. Ateco 863)' },
  fine:   { shape: 'Fine French', tip: 'Fine French star (e.g. Ateco 861)' },
};

// Deduped cream colours used across the design (board excluded).
// Returns [{ hex, uses: [string] }] in first-seen order.
export function harvestColors(design) {
  const tiers = design?.tiers ?? [];
  const n = tiers.length;
  const map = new Map(); // hex → Set(uses)
  const add = (raw, use) => {
    const hex = normalizeHex(raw);
    if (!hex || hex === BOARD_HEX) return;
    if (!map.has(hex)) map.set(hex, new Set());
    map.get(hex).add(use);
  };

  tiers.forEach((t, i) => {
    add(t?.color, `${tierLabel(i, n)} icing`);
    [...topList(t), ...bottomList(t)].forEach(p => add(p?.color, `Piping (${tierLabel(i, n)})`));
  });
  (design?.piping ?? []).forEach(p => add(p?.color, 'Cream pen'));
  (design?.texts ?? []).forEach(t => add(t?.color, 'Text'));
  if (design?.writing) add(design.writing.color, 'Message');
  // stickers (current) and decorations (legacy) — only when they carry a colour.
  [...(design?.stickers ?? []), ...(design?.decorations ?? [])].forEach(s => { if (s?.color) add(s.color, s?.name || 'Decoration'); });

  return [...map.entries()].map(([hex, uses]) => ({ hex, uses: [...uses] }));
}

// Piping instances that reference a library element (→ craft-guide lookup) plus
// freehand cream-pen strokes (nozzle is in-snapshot already).
// Returns { elements: [...], freehand: [...], elementIds: [unique] }.
export function harvestPiping(design) {
  const tiers = design?.tiers ?? [];
  const n = tiers.length;
  const elements = [];
  const ids = new Set();

  tiers.forEach((t, i) => {
    const zones = [['top', topList(t)], ['bottom', bottomList(t)]];
    zones.forEach(([zone, list]) => {
      (list ?? []).forEach(p => {
        if (!p?.id) return;
        ids.add(p.id);
        elements.push({
          elementId: p.id,
          name: p.name || 'Piping',
          color: normalizeHex(p.color),
          tier: tierLabel(i, n),
          tierIndex: i,
          tierCount: n,
          zone: zone === 'top' ? 'Rim' : 'Base',
        });
      });
    });
  });

  const freehand = (design?.piping ?? []).map((p, idx) => {
    const m = FREEHAND_NOZZLE[p?.nozzle] ?? FREEHAND_NOZZLE.round;
    const ti = p?.tierIndex;
    return {
      key: p?.id ?? `fh-${idx}`,
      shape: m.shape,
      tip: m.tip,
      color: normalizeHex(p?.color),
      tier: typeof ti === 'number' ? tierLabel(ti, n) : null,
    };
  });

  return { elements, freehand, elementIds: [...ids] };
}
