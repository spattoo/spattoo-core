import { computeTinPlan } from './tinHelper.js';
import { harvestColors, harvestPiping } from './harvest.js';
import { gelRecipeFor } from './gelLibrary.js';

// ── The X-Ray report, as DATA ────────────────────────────────────────────────────────────────────
// What the baker needs in order to make the cake: which tins, which cream colours (and how to mix
// them), which nozzle for which piping. Derived entirely from the order's design snapshot + weight,
// plus the craft-guide rows the API returns for the piped elements.
//
// This is a DATA MODEL, not a view — deliberately. There are two renderings of it: the on-screen
// report (XrayReport.jsx) and the printable PDF the baker takes to the bench (xrayPdf.js). The rules
// that decide WHAT the report says — how instances are deduped, which nozzle counts as primary, how a
// confidence becomes "Strong", how tips are worded — must be computed exactly ONCE, or the sheet in
// the kitchen and the screen in the office start disagreeing about the same cake. So they live here,
// and both renderers are dumb about content: they only decide how it LOOKS.
//
// Everything below is pure (no React, no DOM), which is also what makes it testable.

// A nozzle recommendation's confidence, in words. The bands are a judgement about how much a baker
// should TRUST the suggestion, so they belong with the data, not with either view.
export function strengthOf(confidence) {
  if (confidence == null) return null;
  const pct = Math.round(confidence * 100);
  if (confidence >= 0.85) return { label: 'Strong', pct };
  if (confidence >= 0.65) return { label: 'Good', pct };
  return { label: 'Possible', pct };
}

// "Wilton 1M/32 · Ateco 863" — grouped by brand, because a baker owns tips by brand and reads them
// that way ("do I have a Wilton 1M?"), not as a flat list.
export function formatTips(recs) {
  const byBrand = {};
  (recs ?? []).forEach(r => { (byBrand[r.brand] ??= []).push(r.number); });
  return Object.entries(byBrand).map(([b, nums]) => `${b} ${nums.join('/')}`).join('  ·  ');
}

// The colour a strength is drawn in. Shared so the PDF's leader-line labels and the screen's agree —
// a "Strong" match must not be green on screen and amber on paper.
export function strengthColor(strength) {
  if (strength?.label === 'Strong') return '#1E7A35';
  if (strength?.label === 'Good')   return '#B26B00';
  return '#8A7CB0';
}

export function buildXrayReport({ design, weightKg, guides } = {}) {
  const tins   = computeTinPlan(design?.tiers, weightKg);
  const piping = harvestPiping(design);

  // Each colour with its mixing recipe already resolved — the screen used to call gelRecipeFor inline
  // in its JSX, which meant the PDF would have had to know to call it too (and could have called it
  // with different arguments). One call, one answer.
  const colors = harvestColors(design).map(c => ({ ...c, recipe: gelRecipeFor(c.hex) }));

  // The same element piped on the same tier + zone several times is ONE line with a count — a baker
  // fits the nozzle once. Dedupe before anything downstream counts or lays out.
  const unique = [];
  const seen = new Map();
  for (const el of piping.elements) {
    const k = `${el.elementId}|${el.tier}|${el.zone}`;
    if (seen.has(k)) { seen.get(k).count++; continue; }
    const item = { ...el, count: 1 };
    seen.set(k, item);
    unique.push(item);
  }

  const elements = unique.map((el, idx) => {
    const guide = guides?.[el.elementId];
    const recs  = guide?.nozzle_recs ?? [];
    const primary = recs.filter(r => r.rank === 'primary');
    const others  = recs.filter(r => r.rank !== 'primary');
    return {
      ...el, idx, guide, primary, others,
      primaryLabel: formatTips(primary),
      othersLabel:  formatTips(others),
      strength: strengthOf(primary[0]?.confidence),
    };
  });

  // Only elements with a recommended nozzle earn a leader line — a line pointing at "no nozzle
  // tagged yet" is clutter on a diagram whose whole job is to say which tip goes where.
  const diagram = elements
    .filter(e => e.primary.length)
    .map(e => ({
      key: `${e.elementId}-${e.tier}-${e.zone}-${e.idx}`,
      tierIndex: e.tierIndex,
      tierCount: e.tierCount,
      zone: e.zone,
      primaryLabel: e.primaryLabel,
      strength: e.strength,
    }));

  return {
    tins,
    colors,
    elements,
    freehand: piping.freehand,
    diagram,
    elementIds: piping.elementIds,
    // True when there is nothing to say — the caller shows an empty state rather than a blank sheet.
    isEmpty: !tins.tiers.length && !colors.length && !elements.length && !piping.freehand.length,
  };
}
