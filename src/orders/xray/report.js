import { computeTinPlan } from './tinHelper.js';
import { proceduralPlacements, harvestColors, harvestPiping, harvestPlaceables } from './harvest.js';
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

// ── The customer's own words, split into tickable lines ──────────────────────
// `special_instructions` is one free-text blob. Split on NEWLINES only, because that is
// the separator the customer actually chose. Splitting on sentences is over-clever and
// actively dangerous: "no nuts in the buttercream. nuts on top are fine." becomes two
// items that read as contradicting each other.
//
// No parsing beyond that, ever. This is the one place on the sheet where the text is the
// customer's rather than something we derived, and any attempt to infer structure from
// it is us guessing at intent. Ambiguity belongs to the customer; the baker resolves it
// by asking them.
export function splitInstructions(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
}

export function buildXrayReport({ design, weightKg, guides, flavours, specialInstructions } = {}) {
  const plan   = computeTinPlan(design?.tiers, weightKg);
  const piping = harvestPiping(design);

  // Flavour joined onto the tin row by tier INDEX, not by label — labels are display
  // strings ("Base tier") and orders.flavours keys on the index. One per-tier table
  // rather than a second one below it: a baker reading "7in round, 1.54 kg" wants to know
  // what goes IN it at that moment, and the sheet has never said. Getting this wrong is
  // not a blemish, it is a remake.
  const tins = {
    ...plan,
    tiers: plan.tiers.map(t => ({
      ...t,
      flavour: (flavours ?? []).find(f => f?.tier === t.index)?.name || null,
    })),
  };

  // Each colour with its mixing recipe already resolved — the screen used to call gelRecipeFor inline
  // in its JSX, which meant the PDF would have had to know to call it too (and could have called it
  // with different arguments). One call, one answer.
  const colors = harvestColors(design).map(c => ({ ...c, recipe: gelRecipeFor(c.hex) }));

  // The same element piped on the same tier + zone several times is ONE line with a count — a baker
  // fits the nozzle once. Dedupe before anything downstream counts or lays out.
  const unique = [];
  const seen = new Map();
  for (const el of piping.elements) {
    // zoneLabel, not zone: a hand-piped run anchors at 'Rim' so its leader line points somewhere
    // sensible, and it is NOT the same job as an actual rim ring of the same element. Keyed on
    // `zone` alone the two would merge into one line and the sheet would lose a whole task.
    const k = `${el.elementId}|${el.tier}|${el.zoneLabel ?? el.zone}`;
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
      // The anchor for a PHOTO order, as a fraction of the image. Present here means the diagram
      // can skip the 3D projection entirely — see layoutDiagram.
      bbox: e.bbox ?? null,
    }));

  // ── The checklist ───────────────────────────────────────────────────────────
  // Numbered ONCE, here, running unbroken across groups — 1..N over the whole cake, not
  // restarting per tier. Two reasons, and both are about the sheet being read aloud in a
  // kitchen: "number 7 is missing" has to identify exactly one thing, and a final number
  // that equals the total tells a baker at a glance how much is left. Restarting per
  // tier gives you three number 1s and no count.
  //
  // The sequence is assigned in the data layer for the same reason everything else here
  // is: both renderers must show the SAME number against the same item, or the screen
  // and the sheet cannot be talked about together.
  // Instructions lead the checklist. They are CONSTRAINTS on everything below — "make the
  // lion face left", "gold candles not silver", "keep it under 6in for the box" — so a
  // baker has to meet them before the hands start, not tick them afterwards. A
  // don't-forget list at the bottom of the page is read after the mistake.
  //
  // `kind` marks them so both renderers can treat them differently WITHOUT either one
  // deciding what an instruction is. They are a different sort of claim: "Lion topper ✓"
  // means I placed it — derived, objective, checkable. "Read the instruction ✓" means I
  // read this and complied, which nothing here can verify.
  const instructions = splitInstructions(specialInstructions);
  const groups = [
    ...(instructions.length ? [{
      title: 'Special instructions',
      kind: 'instruction',
      items: instructions.map((what, i) => ({ key: `instr-${i}`, what, where: null, count: 1 })),
    }] : []),
    ...harvestPlaceables(design),
  ];

  let seq = 0;
  const checklist = groups.map(g => ({
    ...g,
    items: g.items.map(i => ({ ...i, seq: ++seq })),
  }));

  return {
    tins,
    colors,
    elements,
    freehand: piping.freehand,
    diagram,
    checklist,
    checklistTotal: seq,
    elementIds: piping.elementIds,
    // Placeable decorations that reference a library element — stickers and legacy decorations,
    // deduped, first-seen order. Distinct from `elementIds`, which is piping only: a piped border
    // gets a NOZZLE guide, a topper gets a BUILD guide, and they are looked up on the same rail by
    // element id. Kept here rather than derived in the view, so both renderings ask for the same
    // set (the sheet in the kitchen and the screen in the office, again).
    placeableElementIds: [...new Set(
      [
        ...(design?.stickers ?? []), ...(design?.decorations ?? []),
        // Procedural decorations — a rainbow is BUILT and is exactly the sort of thing a baker
        // wants a how-to for. They were absent because they live in per-tier collections rather
        // than design.stickers, so nothing here ever asked for their guides.
        ...proceduralPlacements(design),
      ].map(s => s?.elementId).filter(Boolean),
    )],
    // True when there is nothing to say — the caller shows an empty state rather than a blank sheet.
    isEmpty: !tins.tiers.length && !colors.length && !elements.length && !piping.freehand.length,
  };
}
