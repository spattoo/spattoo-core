import { describe, it, expect } from 'vitest';
import { buildXrayReport, strengthOf, formatTips } from './report.js';

// The X-Ray report is now rendered TWICE — on screen, and onto the PDF the baker carries to the bench.
// These lock the rules that decide what it SAYS, so the two renderings cannot start disagreeing about
// the same cake (which is the failure a reader would never catch: a plausible sheet, quietly wrong).

const guides = {
  'el-shell': {
    element_id: 'el-shell',
    nozzle_recs: [
      { brand: 'Wilton', number: '1M', rank: 'primary', confidence: 0.92 },
      { brand: 'Wilton', number: '32', rank: 'primary', confidence: 0.9 },
      { brand: 'Ateco',  number: '863', rank: 'alt',    confidence: 0.5 },
    ],
    consistency: 'medium',
    technique: 'Hold at 90°.',
  },
};

// Two instances of the SAME element on the same tier + zone, plus one elsewhere.
const design = {
  tiers: [
    { color: '#ffffff', topPipings: [{ id: 'el-shell', color: '#ff0000' }, { id: 'el-shell', color: '#ff0000' }] },
    { color: '#ffffff', topPipings: [{ id: 'el-shell', color: '#00ff00' }] },
  ],
};

describe('strengthOf', () => {
  it('bands a confidence into words a baker can act on', () => {
    expect(strengthOf(0.92)).toEqual({ label: 'Strong', pct: 92 });
    expect(strengthOf(0.7)).toEqual({ label: 'Good', pct: 70 });
    expect(strengthOf(0.2)).toEqual({ label: 'Possible', pct: 20 });
    expect(strengthOf(null)).toBeNull();
  });
});

describe('formatTips', () => {
  it('groups by brand, because a baker owns tips by brand', () => {
    expect(formatTips([
      { brand: 'Wilton', number: '1M' },
      { brand: 'Wilton', number: '32' },
      { brand: 'Ateco', number: '863' },
    ])).toBe('Wilton 1M/32  ·  Ateco 863');
  });
  it('survives no recommendations', () => {
    expect(formatTips([])).toBe('');
    expect(formatTips(undefined)).toBe('');
  });
});

describe('buildXrayReport', () => {
  it('collapses repeats of one element on one tier+zone into a single line with a count', () => {
    const r = buildXrayReport({ design, weightKg: 2, guides });
    const first = r.elements.filter(e => e.tierIndex === 0);
    expect(first).toHaveLength(1);          // two instances, ONE line — you fit the nozzle once
    expect(first[0].count).toBe(2);
    expect(r.elements).toHaveLength(2);     // the other tier is its own line
  });

  it('splits primary from alternative nozzles and labels them', () => {
    const el = buildXrayReport({ design, weightKg: 2, guides }).elements[0];
    expect(el.primaryLabel).toBe('Wilton 1M/32');
    expect(el.othersLabel).toBe('Ateco 863');
    expect(el.strength).toEqual({ label: 'Strong', pct: 92 });
  });

  it('only gives a leader line to piping that HAS a recommended nozzle', () => {
    const withGuides = buildXrayReport({ design, weightKg: 2, guides });
    expect(withGuides.diagram).toHaveLength(2);

    // No craft guides loaded yet → nothing to point at, so the diagram stays empty rather than
    // annotating the cake with blanks.
    const none = buildXrayReport({ design, weightKg: 2, guides: {} });
    expect(none.diagram).toHaveLength(0);
    expect(none.elements[0].primaryLabel).toBe('');
  });

  it('resolves each colour to a mixing recipe once, for both renderings to share', () => {
    const r = buildXrayReport({ design: { tiers: [{ color: '#e8b71b' }] }, weightKg: 1, guides: {} });
    expect(r.colors).toHaveLength(1);
    expect(r.colors[0].hex).toBe('#e8b71b');
    expect(r.colors[0].recipe?.recipe).toEqual(expect.any(String));
  });

  it('says so when there is nothing to report, rather than yielding a blank sheet', () => {
    expect(buildXrayReport({ design: null }).isEmpty).toBe(true);
    expect(buildXrayReport({ design, weightKg: 2, guides }).isEmpty).toBe(false);
  });

  it('survives a design with no weight — the tins simply cannot be sized', () => {
    const r = buildXrayReport({ design, guides });
    expect(r.tins.totalKg).toBeFalsy();
    expect(r.elements).toHaveLength(2);   // the rest of the report still stands
  });
});

// ── A hand-piped run is the same element as its ring ─────────────────────────────────────────────
// It carries the element's own id, so it must earn that element's craft guide — the very nozzle a
// ring of it would use — and a leader line on the diagram. It used to go down the freehand path
// instead, which reported a generic cream-pen tip nobody had chosen and appeared on no diagram,
// because `diagram` is built from `elements` and freehand entries were never in it.
describe('hand-piped runs in the report', () => {
  const guides = { 'el-1': { nozzle_recs: [{ rank: 'primary', brand: 'Wilton', number: '1M', confidence: 0.95 }] } };
  const design = {
    tiers: [{ topPipings: [], bottomPipings: [] }],
    piping: Array.from({ length: 12 }, (_, i) => ({
      id: `s${i}`, tierIndex: 0, stampId: 'el-1', stampName: 'Ruffled Swirl',
      color: '#ffffff', nozzle: 'round', normal: [0, 1, 0], points: [[0, 1, 0], [0.2, 1, 0]],
    })),
  };

  it('gets the element\'s own nozzle, not a generic cream-pen tip', () => {
    const r = buildXrayReport({ design, guides });
    const mine = r.elements.filter(e => e.elementId === 'el-1');
    expect(mine).toHaveLength(1);                       // twelve strokes, ONE line
    expect(mine[0].count).toBe(12);
    expect(mine[0].primary.length).toBeGreaterThan(0);  // the guide reached it
  });

  it('earns a leader line on the diagram', () => {
    const r = buildXrayReport({ design, guides });
    expect(r.diagram.some(d => d.key.startsWith('el-1'))).toBe(true);
  });

  it('is not listed as a cream-pen nozzle as well', () => {
    // Left in both places it would be counted twice AND credited with a tip nobody picked.
    const r = buildXrayReport({ design, guides });
    expect(r.freehand).toHaveLength(0);
  });

  it('says "Hand-piped", never "Rim"', () => {
    // The anchor is Rim so the leader line points somewhere sensible; the LABEL must not claim a
    // border that is not there, or a baker pipes one.
    const r = buildXrayReport({ design, guides });
    expect(r.elements[0].zoneLabel).toBe('Hand-piped');
  });

  it('does not merge with an actual rim ring of the same element', () => {
    const both = {
      tiers: [{ topPipings: [{ id: 'el-1', name: 'Ruffled Swirl', color: '#ffffff' }], bottomPipings: [] }],
      piping: design.piping,
    };
    const r = buildXrayReport({ design: both, guides });
    expect(r.elements.filter(e => e.elementId === 'el-1')).toHaveLength(2);
  });
});
