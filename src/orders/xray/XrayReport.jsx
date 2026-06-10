import { useEffect, useMemo, useState } from 'react';
import { computeTinPlan } from './tinHelper.js';
import { harvestColors, harvestPiping } from './harvest.js';
import { gelRecipeFor } from './gelLibrary.js';
import XrayCakeDiagram from './XrayCakeDiagram.jsx';
import XrayTinDiagram from './XrayTinDiagram.jsx';

// Full-screen "X-Ray" report — how to make a placed order's cake: an annotated
// cake diagram (leader lines projected onto each piping), tin sizes, the
// cream-colour mixing table, and the full piping/nozzle list. Opened from the
// order detail; computed client-side from design_snapshot + weight, with nozzle
// data via apiClient.fetchCraftGuides.

const s = {
  overlay: { position: 'fixed', inset: 0, zIndex: 4000, background: '#FBFAF7', overflowY: 'auto', fontFamily: 'inherit' },
  header: { position: 'sticky', top: 0, zIndex: 2, background: '#fff', borderBottom: '1.5px solid #EFEAE3', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: 800, color: '#2C2A26' },
  close: { padding: '8px 16px', borderRadius: 10, border: '1.5px solid #E0DDD8', background: '#fff', fontSize: 13, fontWeight: 700, color: '#555', cursor: 'pointer', fontFamily: 'inherit' },
  body: { maxWidth: 860, margin: '0 auto', padding: '24px 20px 80px', display: 'flex', flexDirection: 'column', gap: 28 },
  sub: { fontSize: 12, fontWeight: 800, color: '#555', letterSpacing: 0.3, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 },
  dot: (c) => ({ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }),
  card: { background: '#fff', border: '1.5px solid #EFEAE3', borderRadius: 14, padding: 14 },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid #F4F1EC' },
  swatch: (c) => ({ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: c || '#eee', border: '1.5px solid rgba(0,0,0,0.12)' }),
  hex: { fontFamily: 'monospace', fontSize: 12, color: '#888', fontWeight: 700 },
  muted: { fontSize: 12, color: '#9a958d' },
  tag: { display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#F4F1EC', color: '#6b6459' },
  tip: (bg, fg) => ({ display: 'inline-block', padding: '2px 9px', borderRadius: 7, fontSize: 12, fontWeight: 800, background: bg, color: fg, border: '1px solid rgba(0,0,0,0.06)' }),
  tin: { display: 'inline-block', padding: '2px 9px', borderRadius: 7, fontSize: 12, fontWeight: 800, background: '#EEF6FF', color: '#1B5FA8' },
  strength: (lvl) => {
    const c = lvl === 'Strong' ? ['#E6F4EA', '#1E7A35'] : lvl === 'Good' ? ['#FFF6E5', '#B26B00'] : ['#F0EEF6', '#6A5A8C'];
    return { display: 'inline-block', padding: '1px 7px', borderRadius: 20, fontSize: 10, fontWeight: 800, background: c[0], color: c[1] };
  },
};

function strengthOf(c) {
  if (c == null) return null;
  const pct = Math.round(c * 100);
  if (c >= 0.85) return { label: 'Strong', pct };
  if (c >= 0.65) return { label: 'Good', pct };
  return { label: 'Possible', pct };
}
function formatTips(recs) {
  const byBrand = {};
  recs.forEach(r => { (byBrand[r.brand] ??= []).push(r.number); });
  return Object.entries(byBrand).map(([b, nums]) => `${b} ${nums.join('/')}`).join('  ·  ');
}

export default function XrayReport({ order, apiClient, onClose }) {
  const design = order?.design_snapshot;
  const tinPlan = useMemo(() => computeTinPlan(design?.tiers, order?.weight_kg), [order]);
  const colors = useMemo(() => harvestColors(design), [design]);
  const piping = useMemo(() => harvestPiping(design), [design]);

  const [guides, setGuides] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!piping.elementIds.length || !apiClient?.fetchCraftGuides) { setGuides({}); return; }
    setLoading(true);
    Promise.resolve(apiClient.fetchCraftGuides(piping.elementIds))
      .then(rows => { if (!alive) return; const m = {}; (rows || []).forEach(r => { m[r.element_id] = r; }); setGuides(m); })
      .catch(() => { if (alive) setGuides({}); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [order?.id]); // eslint-disable-line

  // Dedupe repeated instances of the same element/tier/zone.
  const uniqueElements = [];
  const seen = new Map();
  for (const el of piping.elements) {
    const k = `${el.elementId}|${el.tier}|${el.zone}`;
    if (seen.has(k)) { seen.get(k).count++; continue; }
    const item = { ...el, count: 1 };
    seen.set(k, item); uniqueElements.push(item);
  }

  const withNozzle = uniqueElements.map((el, i) => {
    const recs = guides?.[el.elementId]?.nozzle_recs ?? [];
    const primary = recs.filter(r => r.rank === 'primary');
    const others = recs.filter(r => r.rank !== 'primary');
    return { ...el, idx: i, primary, others, guide: guides?.[el.elementId], strength: strengthOf(primary[0]?.confidence) };
  });

  const diagramItems = withNozzle
    .filter(e => e.primary.length)
    .map(e => ({
      key: `${e.elementId}-${e.tier}-${e.zone}-${e.idx}`,
      tierIndex: e.tierIndex, tierCount: e.tierCount, zone: e.zone,
      primaryLabel: formatTips(e.primary), strength: e.strength,
    }));

  return (
    <div style={s.overlay}>
      <div style={s.header}>
        <div style={s.title}>X-Ray — how to make this cake</div>
        <button style={s.close} onClick={onClose}>Close</button>
      </div>

      <div style={s.body}>
        {/* Annotated cake */}
        {diagramItems.length > 0 && (
          <XrayCakeDiagram thumbnailUrl={order.design_thumbnail_url} items={diagramItems} snapshotTiers={design.tiers} />
        )}

        {/* Tins */}
        {tinPlan.tiers.length > 0 && (
          <div>
            <div style={s.sub}><span style={s.dot('#1B5FA8')} /> Tins &amp; weight {tinPlan.totalKg && <span style={s.tag}>{tinPlan.totalKg} kg · {tinPlan.tiers.length} tier{tinPlan.tiers.length > 1 ? 's' : ''}</span>}</div>
            <div style={s.card}>
              {tinPlan.totalKg
                ? <XrayTinDiagram tiers={tinPlan.tiers} />
                : <div style={s.muted}>Add a weight to the order to size the tins.</div>}
            </div>
          </div>
        )}

        {/* Cream colours */}
        {colors.length > 0 && (
          <div>
            <div style={s.sub}><span style={s.dot('#C2569B')} /> Cream colours <span style={s.tag}>{colors.length}</span></div>
            <div style={s.card}>
              {colors.map((c, i) => {
                const rec = gelRecipeFor(c.hex);
                return (
                  <div key={c.hex} style={{ ...s.row, alignItems: 'flex-start', borderBottom: i === colors.length - 1 ? 'none' : s.row.borderBottom }}>
                    <div style={s.swatch(c.hex)} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={s.hex}>{c.hex}</span>
                        <span style={s.muted}>{c.uses.join(', ')}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: '#444', marginTop: 3 }}>
                        {rec?.recipe}{rec?.approx && <span style={s.muted}> (closest match — adjust by eye)</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Piping & nozzles */}
        {(uniqueElements.length > 0 || piping.freehand.length > 0) && (
          <div>
            <div style={s.sub}><span style={s.dot('#1E7A35')} /> Piping &amp; nozzles <span style={s.tag}>{uniqueElements.length + piping.freehand.length}</span></div>
            <div style={s.card}>
              {loading && <div style={{ ...s.muted, paddingBottom: 8 }}>Loading nozzle suggestions…</div>}

              {withNozzle.map((el) => (
                <div key={el.elementId + el.idx} style={{ ...s.row, alignItems: 'flex-start' }}>
                  <div style={s.swatch(el.color)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={s.tag}>{el.tier} · {el.zone}{el.count > 1 ? ` · ×${el.count}` : ''}</span>
                    </div>
                    {el.primary.length > 0 ? (
                      <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={s.tip('#F3FBF5', '#1E7A35')}>{formatTips(el.primary)}</span>
                        {el.strength && <span style={s.strength(el.strength.label)}>{el.strength.pct}% match</span>}
                      </div>
                    ) : (
                      <div style={{ ...s.muted, marginTop: 4 }}>{apiClient?.fetchCraftGuides ? 'No nozzle tagged yet' : 'Nozzle data not connected'}</div>
                    )}
                    {el.others.length > 0 && <div style={{ ...s.muted, marginTop: 4 }}>Also: {formatTips(el.others)}</div>}
                    {(el.guide?.consistency || el.guide?.technique) && (
                      <div style={{ ...s.muted, marginTop: 4 }}>
                        {el.guide.consistency && <b style={{ textTransform: 'capitalize' }}>{el.guide.consistency} cream. </b>}
                        {el.guide.technique}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {piping.freehand.map((f) => (
                <div key={f.key} style={{ ...s.row, alignItems: 'flex-start' }}>
                  <div style={s.swatch(f.color)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#444' }}>Cream pen — {f.shape}</span>
                      {f.tier && <span style={s.tag}>{f.tier}</span>}
                    </div>
                    <div style={{ marginTop: 5 }}><span style={s.tip('#F3FBF5', '#1E7A35')}>{f.tip}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
