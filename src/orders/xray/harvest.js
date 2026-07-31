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
          // Photo orders only: where the model saw this border on the reference image. Carried
          // rather than derived, because the leader-line anchor for a photo cannot be computed —
          // there is no camera to project through, only the box the model reported.
          bbox: p.bbox ?? null,
          // Photo orders only: the model's own read of the technique. A FALLBACK for when no
          // curated nozzle exists — never a substitute for one, and rendered so the difference is
          // visible.
          seenTechnique: p.technique ?? null,
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

// ── Everything that has to be PLACED on the cake ──────────────────────────────
// harvestPiping answers "which nozzle for which piping". This answers a different
// question: what does the baker still have to put on, and have they put it all on?
//
// ── WHY THIS EXISTS SEPARATELY ────────────────────────────────────────────────
// Until now the X-Ray sheet was piping-centric. Stickers, toppers, texts and the age
// numbers appeared nowhere on it — a lion topper is the most visible thing on the cake
// and the easiest to forget, and the sheet said nothing about it. harvestColors touches
// stickers, but only to pull a colour out of them.
//
// ── THE COMPLETENESS TRAP ─────────────────────────────────────────────────────
// A checklist makes a claim the rest of the report does not: that this is EVERYTHING.
// If it enumerates six collections and the design grows a seventh, the sheet quietly
// gets shorter, the baker trusts it, and a decoration ships missing. A checklist that
// silently omits is worse than no checklist, because it is believed.
//
// So the source list is written out ONCE, explicitly, right here — every placeable
// collection in DEFAULT_DESIGN (useCakeDesign.js), including the two easiest to miss:
// `writing`, which is a SINGLE OBJECT rather than an array, and `ages`, which is the
// kind of thing added later and forgotten. If you add a placeable collection to the
// design, add it here in the same change.
//
//   tiers[].topPipings / .bottomPipings   piped rim + base borders
//   design.stickers                       decorations, toppers, decals  ← the lion
//   design.decorations                    legacy stickers (pre-migration designs)
//   design.texts                          text on the cake
//   design.ages                           gold 3D balloon numbers
//   design.writing                        cream-pen message (ONE object, nullable)
//   design.piping                         freehand cream-pen strokes
//
// ── ORDER ─────────────────────────────────────────────────────────────────────
// Grouped by tier, BOTTOM UP, because that is the order a cake is assembled in — the
// list should read in the order the hand works, not alphabetically or by type. Items
// that belong to the whole cake rather than one tier (texts, ages, writing, freehand)
// come last, under "Finishing", which is also when they actually go on.
//
// Deduped by (what · where) with a count, reusing the rule report.js already applies to
// piping: six scattered sprinkles of one element are ONE line reading "× 6". Nobody
// ticks the same box six times.
export function harvestPlaceables(design) {
  const tiers = design?.tiers ?? [];
  const n = tiers.length;
  const groups = [];

  const push = (bucket, what, where, key) => {
    const found = bucket.items.find(i => i.key === key);
    if (found) { found.count++; return; }
    bucket.items.push({ key, what, where, count: 1 });
  };

  // Per tier, bottom up.
  tiers.forEach((t, i) => {
    const bucket = { title: tierLabel(i, n), items: [] };

    topList(t).forEach(p => push(bucket, p?.name || 'Piping', 'Rim', `pipe-top-${p?.id ?? p?.name}`));
    bottomList(t).forEach(p => push(bucket, p?.name || 'Piping', 'Base', `pipe-bot-${p?.id ?? p?.name}`));

    // Stickers and legacy decorations carry their own tierIndex, so they are filtered
    // per tier rather than collected globally — the checklist has to say WHICH tier the
    // lion goes on, or it does not save anyone a decision.
    [...(design?.stickers ?? []), ...(design?.decorations ?? [])]
      .filter(s => (s?.tierIndex ?? 0) === i)
      .forEach(s => push(
        bucket,
        s?.name || 'Decoration',
        s?.zone ? String(s.zone).replace(/_/g, ' ') : null,
        `deco-${s?.elementId ?? s?.name}-${s?.zone ?? ''}`,
      ));

    if (bucket.items.length) groups.push(bucket);
  });

  // Whole-cake items. Last, because that is when they go on.
  const finishing = { title: 'Finishing', items: [] };

  (design?.texts ?? []).forEach((t, idx) => push(
    finishing,
    t?.content ? `Text — "${t.content}"` : 'Text',
    null,
    `text-${t?.id ?? idx}`,
  ));

  (design?.ages ?? []).forEach((a, idx) => push(
    finishing,
    `Number "${a?.value ?? ''}"`.replace(' ""', ''),
    a?.finish ? `${a.finish} topper` : 'topper',
    `age-${a?.id ?? idx}`,
  ));

  // Nullable SINGLE object, not an array — the shape most likely to be dropped by an
  // enumerator written in a hurry.
  if (design?.writing?.text) {
    push(finishing, `Message — "${design.writing.text}"`, 'cream pen', 'writing');
  }

  (design?.piping ?? []).forEach((p, idx) => push(
    finishing,
    'Freehand piping',
    typeof p?.tierIndex === 'number' ? tierLabel(p.tierIndex, n) : 'cream pen',
    `fh-${p?.id ?? idx}`,
  ));

  if (finishing.items.length) groups.push(finishing);

  return groups;
}
