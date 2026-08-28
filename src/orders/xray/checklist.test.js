import { describe, it, expect } from 'vitest';
import { harvestPlaceables, proceduralPlacements } from './harvest.js';
import { buildXrayReport, splitInstructions } from './report.js';

// A checklist makes a claim nothing else on the sheet makes: that this is EVERYTHING.
// If the design grows a placeable collection and the enumerator does not, the sheet gets
// quietly shorter, the baker trusts it, and a decoration ships missing. These tests exist
// to make that failure loud — the completeness test below is the important one.

const design = {
  tiers: [
    { topPipings: [{ id: 'p1', name: 'Rosette border' }], bottomPipings: [{ id: 'p2', name: 'Shell border' }] },
    { topPipings: [], bottomPipings: [] },
  ],
  stickers: [
    { elementId: 'lion', name: 'Lion topper',  zone: 'top',  tierIndex: 1 },
    { elementId: 'star', name: 'Star sprinkle', zone: 'side', tierIndex: 0 },
    { elementId: 'star', name: 'Star sprinkle', zone: 'side', tierIndex: 0 },
    { elementId: 'star', name: 'Star sprinkle', zone: 'side', tierIndex: 0 },
  ],
  texts:   [{ id: 't1', content: 'Happy Birthday' }],
  ages:    [{ id: 'a1', value: '7', finish: 'gold' }],
  writing: { text: 'Love, Mum' },
  piping:  [{ id: 'f1', tierIndex: 0 }],
};

describe('harvestPlaceables — completeness', () => {
  // The guard. Every placeable collection in DEFAULT_DESIGN must reach the checklist.
  // If someone adds a collection to the design and not to the enumerator, this fails.
  it('covers every placeable collection in the design', () => {
    const all = harvestPlaceables(design).flatMap(g => g.items.map(i => i.what));
    const joined = all.join(' | ');

    expect(joined).toContain('Rosette border');   // tiers[].topPipings
    expect(joined).toContain('Shell border');     // tiers[].bottomPipings
    expect(joined).toContain('Lion topper');      // design.stickers
    expect(joined).toContain('Happy Birthday');   // design.texts
    expect(joined).toContain('7');                // design.ages
    expect(joined).toContain('Love, Mum');        // design.writing  — a NULLABLE OBJECT
    expect(joined).toContain('Freehand piping');  // design.piping
  });

  // `writing` is a single nullable object, not an array — the shape an enumerator written
  // in a hurry forgets, and the one most likely to regress.
  it('includes the cream-pen message even though it is not an array', () => {
    const items = harvestPlaceables({ ...design, stickers: [], texts: [], ages: [], piping: [] })
      .flatMap(g => g.items);
    expect(items.some(i => i.what.includes('Love, Mum'))).toBe(true);
  });

  it('picks up legacy `decorations` as well as `stickers`', () => {
    const items = harvestPlaceables({
      tiers: [{}], stickers: [], decorations: [{ elementId: 'old', name: 'Legacy flower', tierIndex: 0 }],
    }).flatMap(g => g.items);
    expect(items.some(i => i.what === 'Legacy flower')).toBe(true);
  });
});

describe('harvestPlaceables — grouping and counts', () => {
  it('groups by tier bottom-up, with whole-cake items last', () => {
    const titles = harvestPlaceables(design).map(g => g.title);
    expect(titles[0]).toBe('Base tier');           // assembly starts at the bottom
    expect(titles[titles.length - 1]).toBe('Finishing');
  });

  // Six scattered sprinkles are ONE line. Nobody ticks the same box six times.
  it('collapses repeats of the same element into one line with a count', () => {
    const stars = harvestPlaceables(design).flatMap(g => g.items).filter(i => i.what === 'Star sprinkle');
    expect(stars).toHaveLength(1);
    expect(stars[0].count).toBe(3);
  });

  it('puts a decoration on the tier it belongs to', () => {
    const groups = harvestPlaceables(design);
    const topTier = groups.find(g => g.title === 'Top tier');
    expect(topTier.items.some(i => i.what === 'Lion topper')).toBe(true);
  });

  it('says nothing for an empty design rather than inventing a group', () => {
    expect(harvestPlaceables({ tiers: [{}] })).toEqual([]);
    expect(harvestPlaceables(undefined)).toEqual([]);
  });
});

describe('special instructions', () => {
  it('splits on newlines, dropping blanks', () => {
    expect(splitInstructions('Gold candles\n\n  Face the lion left  \n')).toEqual([
      'Gold candles', 'Face the lion left',
    ]);
  });

  // The dangerous over-cleverness: sentence-splitting turns one coherent instruction into
  // two that read as contradicting each other.
  it('does NOT split a paragraph into sentences', () => {
    const s = 'No nuts in the buttercream. Nuts on top are fine.';
    expect(splitInstructions(s)).toEqual([s]);
  });

  it('is empty for nothing, rather than yielding a blank item', () => {
    expect(splitInstructions('')).toEqual([]);
    expect(splitInstructions(null)).toEqual([]);
    expect(splitInstructions('   \n  ')).toEqual([]);
  });

  // Instructions are CONSTRAINTS on everything below, so they have to be read before the
  // hands start. A don't-forget list at the bottom is read after the mistake.
  it('leads the checklist and takes the first numbers', () => {
    const r = buildXrayReport({ design, weightKg: 2, specialInstructions: 'Gold candles\nNo fondant' });
    expect(r.checklist[0].title).toBe('Special instructions');
    expect(r.checklist[0].kind).toBe('instruction');
    expect(r.checklist[0].items.map(i => i.seq)).toEqual([1, 2]);
  });

  it('adds no section at all when the order has none', () => {
    const r = buildXrayReport({ design, weightKg: 2 });
    expect(r.checklist.some(g => g.kind === 'instruction')).toBe(false);
  });

  // Verbatim. This is the only text on the sheet that is the customer's own words.
  it('never rewrites or truncates the customer text', () => {
    const long = 'no nuts in the buttercream but nuts on top are absolutely fine, she is only mildly allergic';
    const r = buildXrayReport({ design, weightKg: 2, specialInstructions: long });
    expect(r.checklist[0].items[0].what).toBe(long);
  });
});

describe('flavour per tier', () => {
  // Joined by tier INDEX. Labels are display strings; matching on them would break the
  // moment a one-tier cake says "Single tier" instead of "Base tier".
  it('attaches the flavour to the right tin row', () => {
    const r = buildXrayReport({
      design, weightKg: 2,
      flavours: [{ tier: 0, name: 'Red Velvet' }, { tier: 1, name: 'Vanilla' }],
    });
    expect(r.tins.tiers.find(t => t.index === 0).flavour).toBe('Red Velvet');
    expect(r.tins.tiers.find(t => t.index === 1).flavour).toBe('Vanilla');
  });

  it('leaves a tier with no flavour null rather than guessing', () => {
    const r = buildXrayReport({ design, weightKg: 2, flavours: [{ tier: 0, name: 'Vanilla' }] });
    expect(r.tins.tiers.find(t => t.index === 1).flavour).toBeNull();
  });

  it('survives an order with no flavours at all', () => {
    const r = buildXrayReport({ design, weightKg: 2 });
    expect(r.tins.tiers.every(t => t.flavour === null)).toBe(true);
  });
});

describe('checklist numbering', () => {
  const report = buildXrayReport({ design, weightKg: 2 });

  // "Number 7 is missing" has to identify exactly one thing on the whole cake. Restarting
  // per tier would give three number 1s, and no total to count down from.
  it('numbers 1..N unbroken across groups', () => {
    const seqs = report.checklist.flatMap(g => g.items.map(i => i.seq));
    expect(seqs).toEqual(Array.from({ length: seqs.length }, (_, i) => i + 1));
  });

  it('reports a total equal to the last number', () => {
    const seqs = report.checklist.flatMap(g => g.items.map(i => i.seq));
    expect(report.checklistTotal).toBe(seqs[seqs.length - 1]);
  });

  // Both renderers read the same numbers off the same object — that is the point of
  // assigning them in the data layer rather than in either view.
  it('keys are unique, so a tick cannot land on two rows', () => {
    const keys = report.checklist.flatMap(g => g.items.map(i => i.key));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// ── Hand-piped runs ──────────────────────────────────────────────────────────────────────────────
// A run drawn by hand is many strokes and ONE job. Keyed by the stroke's own id it became one
// checklist line per drag — a real order came back with twenty-eight identical "Freehand piping"
// items and a headline count of 29, which tells a baker nothing about how much work there is.
describe('hand-piped strokes in the checklist', () => {
  const stroke = (over = {}) => ({
    id: `s${Math.random()}`, tierIndex: 0, color: '#ffffff', nozzle: 'star5',
    points: [[0, 1, 0], [0.2, 1, 0]], ...over,
  });
  const withPiping = (piping) => ({ tiers: [{ topPipings: [], bottomPipings: [] }], piping });

  it('collapses many strokes of one decoration into a single line with a count', () => {
    const piping = Array.from({ length: 28 }, () =>
      stroke({ stampId: 'el-1', stampName: 'Ruffled Swirl' }));
    const items = harvestPlaceables(withPiping(piping)).flatMap(g => g.items);
    const mine = items.filter(i => i.what.includes('Ruffled Swirl'));
    expect(mine).toHaveLength(1);
    expect(mine[0].count).toBe(28);
    expect(mine[0].what).toBe('Ruffled Swirl — piped by hand');
  });

  it('keeps genuinely different jobs apart', () => {
    // Different colour, different decoration, different tier — each is a moment the baker stops and
    // changes something, so each is its own line.
    const items = harvestPlaceables(withPiping([
      stroke({ stampId: 'el-1', stampName: 'Swirl', color: '#ffffff' }),
      stroke({ stampId: 'el-1', stampName: 'Swirl', color: '#ff0000' }),
      stroke({ stampId: 'el-2', stampName: 'Rosette', color: '#ffffff' }),
      stroke({ stampId: 'el-1', stampName: 'Swirl', color: '#ffffff', tierIndex: 1 }),
    ])).flatMap(g => g.items).filter(i => i.what.includes('piped by hand'));
    expect(items).toHaveLength(4);
    for (const i of items) expect(i.count).toBe(1);
  });

  it('still groups plain cream-pen strokes by nozzle and colour', () => {
    const items = harvestPlaceables(withPiping([
      stroke({ nozzle: 'star5' }), stroke({ nozzle: 'star5' }), stroke({ nozzle: 'round' }),
    ])).flatMap(g => g.items).filter(i => i.what === 'Freehand piping');
    expect(items).toHaveLength(2);
    expect(items.find(i => i.count === 2)).toBeTruthy();
  });
});

// ── Procedural decorations ───────────────────────────────────────────────────────────────────────
// A rainbow is BUILT, so it lives in a per-tier collection rather than design.stickers — and this
// file enumerated the collections it knew about. A cake whose most visible decoration was a rainbow
// said nothing about the rainbow, on the checklist or in the guides. The comment at the top of
// harvestPlaceables calls that the completeness trap; it happened anyway.
describe('procedural decorations reach the sheet', () => {
  const design = {
    tiers: [
      { topPipings: [], bottomPipings: [],
        rainbows: [{ id: 'rb-1', elementId: 'el-rainbow', elementName: 'Pastel rainbow' }],
        clouds: [{ id: 'cl-1', elementId: 'el-cloud', elementName: 'Puffy cloud' },
                 { id: 'cl-2', elementId: 'el-cloud', elementName: 'Puffy cloud' }] },
    ],
  };

  it('lists a rainbow and its clouds', () => {
    const what = harvestPlaceables(design).flatMap(g => g.items.map(i => i.what));
    expect(what).toContain('Pastel rainbow');
    expect(what).toContain('Puffy cloud');
  });

  it('names them from the element, falling back to a plain word', () => {
    const bare = { tiers: [{ rainbows: [{ id: 'rb-9' }] }] };
    const what = harvestPlaceables(bare).flatMap(g => g.items.map(i => i.what));
    expect(what).toContain('Rainbow');
  });

  it('counts two clouds as two, not one', () => {
    const items = harvestPlaceables(design).flatMap(g => g.items);
    const clouds = items.filter(i => i.what === 'Puffy cloud');
    // Distinct instances, so distinct keys — two things to place, two things to tick.
    expect(clouds.reduce((n, c) => n + c.count, 0)).toBe(2);
  });

  it('exposes their element ids so a guide can be fetched', () => {
    const ids = proceduralPlacements(design, 1).map(p => p.elementId);
    expect(ids).toContain('el-rainbow');
    expect(ids).toContain('el-cloud');
  });

  it('tolerates an older design that never recorded the element', () => {
    // Not fixable after the fact — an order saved before the designer recorded this simply does not
    // know which rainbow it was. It must still appear on the checklist.
    const old = { tiers: [{ rainbows: [{ id: 'rb-old' }] }] };
    expect(proceduralPlacements(old, 1)[0].elementId).toBeNull();
    expect(harvestPlaceables(old).flatMap(g => g.items).length).toBeGreaterThan(0);
  });
});
