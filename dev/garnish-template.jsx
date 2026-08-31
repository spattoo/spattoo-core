import { newA4Canvas } from '../src/orders/pdf.js';
import { drawGarnishTemplate } from '../src/orders/xray/garnishTemplate.js';
import { templateLayout } from '../src/orders/xray/templateSheet.js';
import { garnishGuide } from '../src/designer/geometry/garnishGuide.js';
import { renderXrayPages } from '../src/orders/xray/xrayPdf.js';

/* ⚠️ A TEMPLATE IS A PHYSICAL MEASURING INSTRUMENT. "The code ran" is not evidence the sheet is
 * right — a hole drawn like the outline, a ruler bar the wrong length or a piece off the page all
 * pass every test and are obvious the moment the page is looked at. Both printed artefacts render
 * here into visible canvases at true A4 proportions. */

const arc = (cx, cy, r, n = 26) => Array.from({ length: n }, (_, i) => {
  const a = (i / (n - 1)) * Math.PI * 2;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
});

const spike = [[210, 80], [260, 330], [160, 330], [210, 80]];
const PANEL = {
  id: 'p1', name: 'Cut spike', kind: 'cut', zone: 'top', mode: 'stand', color: '#8A5A3B',
  rope: 6, plate: 420, scale: 1, cakeDiameterMm: 180,
  paths: [spike], rings: [spike, arc(210, 265, 28)],
};
const FILIGREE = {
  id: 'f1', name: 'Filigree swirl', kind: 'piped', zone: 'top', mode: 'lie', color: '#4A2C1B',
  rope: 6, plate: 420, scale: 1, cakeDiameterMm: 180,
  paths: [arc(210, 210, 90), [[150, 200], [210, 170], [270, 200]], [[150, 250], [210, 285], [270, 250]]],
  rings: [],
};

const root = document.getElementById('root');
const label = t => { const h = document.createElement('h3'); h.textContent = t; root.append(h); };

// 1. The cutting template, at true A4.
label('Cutting template (A4, true size)');
{
  const guide = garnishGuide(PANEL, { cakeDiameterMm: 180 });
  const layout = templateLayout(guide.widthMm, guide.size.w / guide.size.h);
  const c = newA4Canvas();
  drawGarnishTemplate(c.getContext('2d'), c.width, { guide, layout, title: PANEL.name });
  root.append(c);
}

// 2. The X-ray sheet itself, so the garnish section can be read as it prints.
label('X-ray sheet — the garnish section');
const report = {
  tins: { tiers: [] }, colors: [], elements: [], freehand: [], checklist: [], checklistTotal: 0,
  diagram: null, garnishes: [FILIGREE, PANEL],
};
renderXrayPages({ order: { id: 'demo' }, report }).then(pages => {
  pages.forEach(p => root.append(p));
});
