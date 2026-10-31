import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { planFromSpec } from './planFromSpec.js';
import { validateSpec, normaliseSpec, SPEC_VERSION } from './cakeSpec.js';
import { ZONES } from '../constants.js';
import { tierShape } from '../geometry/surface.js';

/* ── A hand-written spec becomes a cake, with no model anywhere ──────────────────────────────────
 *
 * The composer is the half everyone pictures; this is the half that decides whether the feature is
 * possible. If a spec cannot be turned into real placements — seats the drag agrees with, sizes the
 * dial can express, refusals that say why — then no amount of prompt work matters.
 *
 * So it is built and proved first, from JSON somebody typed. Every case below would be identical if
 * the spec had come from GPT, which is the point of the spec existing at all.
 */

const KRISHNA = JSON.parse(
  readFileSync(new URL('./fixtures/krishna-5-boy.json', import.meta.url), 'utf8'));

/* A small library standing in for the catalogue. `el-retired` is deliberately absent — a composer
   works from a shortlist and a shortlist goes stale, which is the normal case, not an error. */
const LIBRARY = [
  { id: 'el-bansuri', name: 'Ornate Peacock Feather Bansuri',
    allowed_zones: [ZONES.TOP_SURFACE, ZONES.SIDE],
    placement_config: { scale: { min: 0.5, max: 2.5, step: 0.1 } } },
  { id: 'el-feather', name: 'Sculpted Emerald Peacock Feather',
    allowed_zones: [ZONES.SIDE],
    placement_config: { scale: { min: 0.4, max: 1.2, step: 0.1 } } },
  { id: 'el-matki', name: 'Terracotta Pot Overflowing with Butter',
    allowed_zones: [ZONES.TOP_SURFACE, ZONES.BOARD],
    placement_config: {} },
];

const ROUND = { shape: 'round', radius: 1, height: 1.45 };
const seatCtxFor = () => ({
  pc: {},
  tierHeights: [1.45],
  shapeAt: () => tierShape(ROUND),
  baseShape: tierShape(ROUND),
  board: { kind: 'round', radius: 1.6 },
});

const plan = (spec = KRISHNA) => planFromSpec(spec, { elements: LIBRARY, seatCtxFor });

describe('the fixture is a spec we would accept', () => {
  it('validates', () => {
    const { ok, problems } = validateSpec(KRISHNA);
    expect(problems).toEqual([]);
    expect(ok).toBe(true);
  });
});

describe('planFromSpec', () => {
  it('places what the library has, in the zones the spec asked for', () => {
    const { placements } = plan();
    const bansuri = placements.filter(p => p.elementId === 'el-bansuri');
    expect(bansuri).toHaveLength(1);
    expect(bansuri[0].zone).toBe(ZONES.TOP_SURFACE);
  });

  /* `count` is repeated placements, not one bigger piece — three feathers is three stickers, each
     handed to addSticker separately so each de-overlaps off the ones already down. */
  it('expands count into separate placements', () => {
    const feathers = plan().placements.filter(p => p.elementId === 'el-feather');
    expect(feathers).toHaveLength(3);
    expect(new Set(feathers.map(f => f.zone))).toEqual(new Set([ZONES.SIDE]));
  });

  /* ⚠️ THE MODEL PROPOSES, THE ROW DISPOSES. The fixture asks for the bansuri on the BOARD, which
     its allowed_zones do not offer. A spec cannot talk an element onto a surface it does not have —
     that claim is geometry, and the row already knows the answer. */
  it('refuses a zone the element does not allow, and says what it does allow', () => {
    const { dropped } = plan();
    const refused = dropped.find(d => d.elementId === 'el-bansuri');
    expect(refused.why).toMatch(/does not allow board/);
    expect(refused.allows).toEqual(expect.arrayContaining([ZONES.TOP_SURFACE, ZONES.SIDE]));
  });

  it('reports an element the library no longer has, rather than throwing', () => {
    const { dropped, placements } = plan();
    expect(dropped.find(d => d.elementId === 'el-retired').why).toMatch(/not in this baker/);
    expect(placements.length, 'the rest of the cake is still built').toBeGreaterThan(0);
  });

  /* ⚠️ TWO DIFFERENT ABSENCES. `wanted` is what the composer could not find in the catalogue at
     all — that commissions a new element. `dropped` is what it named and the cake refused — that
     fixes a prompt or a row. Merging them loses which of the two you are looking at. */
  it('keeps "never existed" apart from "could not be placed"', () => {
    const { wanted, dropped } = plan();
    expect(wanted).toEqual(['a cow', 'a swing']);
    expect(dropped.map(d => d.elementId)).toEqual(expect.arrayContaining(['el-retired', 'el-bansuri']));
    expect(wanted.some(w => dropped.some(d => d.elementId === w))).toBe(false);
  });
});

describe('sizes come from the element, never from the spec', () => {
  /* A spec says "hero", not 1.9. The legal range is the element's own `placement_config.scale`, so
     the same word resolves to different numbers per element — which is the only way it can mean
     anything across a 3D model and a flat decal. */
  it('resolves prominence inside the element\'s own range', () => {
    const { placements } = plan();
    const hero = placements.find(p => p.elementId === 'el-bansuri');    // range 0.5 – 2.5
    const accent = placements.find(p => p.elementId === 'el-feather');  // range 0.4 – 1.2
    expect(hero.scale).toBeGreaterThanOrEqual(0.5);
    expect(hero.scale).toBeLessThanOrEqual(2.5);
    expect(accent.scale).toBeGreaterThanOrEqual(0.4);
    expect(accent.scale).toBeLessThanOrEqual(1.2);
    expect(hero.scale, 'a hero is larger within its own range than an accent is within its')
      .toBeGreaterThan(accent.scale);
  });

  /* A planned size the dial cannot reach is a size the baker can see and not restore. */
  it('lands on the dial\'s own step', () => {
    for (const p of plan().placements) {
      const step = p.elementId === 'el-matki' ? 0.05 : 0.1;
      const min  = p.elementId === 'el-bansuri' ? 0.5 : p.elementId === 'el-feather' ? 0.4 : 0.3;
      expect(Math.abs(((p.scale - min) / step) - Math.round((p.scale - min) / step)))
        .toBeLessThan(1e-6);
    }
  });

  it('falls back to the designer defaults when a row authors no range', () => {
    const matki = plan().placements.find(p => p.elementId === 'el-matki');
    expect(matki.scale).toBeGreaterThanOrEqual(0.3);
    expect(matki.scale).toBeLessThanOrEqual(2.5);
  });
});

describe('seats come from seatOnSlot, not from this module', () => {
  /* ⚠️ THE SAME SEAT THE DRAG HONOURS. If the planner computed its own positions, a composed cake
     would jump the first time a baker touched a piece — the drag reads seatOnSlot's answer. */
  it('seats the board piece in front of the cake, cartesian, never on the wall', () => {
    const matki = plan().placements.find(p => p.elementId === 'el-matki');
    expect(matki.zone).toBe(ZONES.BOARD);
    expect(matki.position.theta, 'a board seat is never a wall angle').toBeUndefined();
    expect(matki.position.z).toBeCloseTo(1, 6);
  });

  it('seats a side piece on the wall, by angle and height', () => {
    const feather = plan().placements.find(p => p.elementId === 'el-feather');
    expect(feather.position).toHaveProperty('theta');
    expect(feather.position.y).toBeGreaterThan(0);
  });

  it('plans without a seat context rather than inventing coordinates', () => {
    const { placements } = planFromSpec(KRISHNA, { elements: LIBRARY });
    expect(placements.length).toBeGreaterThan(0);
    expect(placements[0].position).toEqual({});
  });
});

describe('the spec carries the rest of the cake, not just decorations', () => {
  it('passes the tiers, the message and the age through', () => {
    const out = plan();
    expect(out.tiers).toEqual([{ index: 0, color: '#2E6FD9', frostingStyle: null, coat: null }]);
    expect(out.message.text).toBe('Happy 5th Birthday');
    expect(out.age.number).toBe(5);
    expect(out.why, 'the reasoning survives, so the idea reads as authored').toMatch(/flute/);
  });
});

describe('validateSpec', () => {
  it('rejects a spec that names words instead of ids', () => {
    const { ok, problems } = validateSpec({
      ...KRISHNA, elements: [{ zone: 'top_surface', name: 'flute' }],
    });
    expect(ok).toBe(false);
    expect(problems.join(' ')).toMatch(/elementId is required/);
  });

  it('rejects a surface that does not exist', () => {
    const { problems } = validateSpec({
      ...KRISHNA, elements: [{ elementId: 'x', zone: 'ceiling' }],
    });
    expect(problems.join(' ')).toMatch(/not one of/);
  });

  /* Every problem, not the first: a composer that gets one complaint per round trip takes as many
     model calls as it made mistakes. */
  it('reports every problem in one pass', () => {
    const { problems } = validateSpec({ version: 99, cake: null, elements: [{}] });
    expect(problems.length).toBeGreaterThanOrEqual(3);
  });

  it('pins the version, so an old composer cannot be read as a new one', () => {
    expect(validateSpec({ ...KRISHNA, version: SPEC_VERSION + 1 }).ok).toBe(false);
  });
});

describe('normaliseSpec', () => {
  it('fills the optional half so the planner reads one shape', () => {
    const n = normaliseSpec({ elements: [{ elementId: 'a', zone: 'side' }] });
    expect(n.cake.shape).toBe('round');
    expect(n.elements[0]).toMatchObject({ count: 1, prominence: 'feature' });
    expect(n.wanted).toEqual([]);
  });
});
