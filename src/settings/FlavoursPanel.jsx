import { useState, useEffect } from 'react';
import { useIsMobile, Toggle, Section, Field } from './controls.jsx';
import Chip from '../shared/Chip.jsx';
import { dietTone } from '../orders/dietary.js';
import DietaryOptionsSection from './DietaryOptionsSection.jsx';
import { dockedLeft } from '../shared/rail.js';

// Flavours — a top-level settings destination (peer of Store Settings), not a section
// inside it, so the catalogue can grow without bloating the store-config screen.
//
// Shows the GLOBAL flavour master list with an on/off switch per flavour. Off = this baker
// doesn't offer it → hidden from their customers. The API owns the schema and resolution
// (GET /api/baker/flavours → [{ id, name, description, excluded }]; the save replaces the
// baker's exclusion set). Core only ever sees flags.
export default function FlavoursPanel({ open, onClose, apiClient, primaryColor = '#1a1a1a', accentColor = '#333333' }) {
  const isMobile = useIsMobile();
  const [flavours, setFlavours]                 = useState(null);
  const [excluded, setExcluded]                 = useState(() => new Set());
  // Dietary vocabulary + this baker's declarations. `conflicts` is keyed
  // `${flavourId}|${requirementKey}` — a flat Set beats a nested map here because every
  // read and write is a single pair, and nesting would only add spread-merge noise.
  const [diet,      setDiet]      = useState([]);
  const [conflicts, setConflicts] = useState(() => new Set());
  const [baseline,  setBaseline]  = useState(() => new Set());
  // Requirements this bakery doesn't deal in at all (by key).
  const [dietOff,   setDietOff]   = useState(() => new Set());
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState(null);
  // Per-kg rates, keyed by flavour id and held as the STRING the baker typed — not a
  // number. A half-typed "1" must not become 1, an emptied box must stay empty rather
  // than collapsing to 0, and re-rendering must never reformat what someone is mid-way
  // through. Parsing happens once, on save.
  const [prices, setPrices] = useState({});
  // Only prices are settled here. Whether the storefront DISPLAYS the flavour list is
  // the menu section's own on/off in the storefront customiser — one control, where the
  // section is. A `show_flavours` flag briefly lived here too and had to go: it also
  // emptied the API response, which broke the order form's flavour picker.
  const [priceVisibility, setPriceVisibility] = useState('private');

  useEffect(() => {
    if (!open) return;
    setError(null); setSaved(false);
    if (!apiClient.fetchBakerFlavours) { setFlavours([]); return; }
    setLoading(true);
    apiClient.fetchBakerFlavours()
      .then(res => {
        // The route grew a wrapper when it gained the visibility settings; an array is
        // still accepted so a core running against an older API keeps working.
        const arr = Array.isArray(res) ? res : (res?.flavours ?? []);
        setFlavours(arr);
        setExcluded(new Set(arr.filter(f => f.excluded).map(f => f.id)));
        setPrices(Object.fromEntries(
          arr.filter(f => f.price_per_kg != null).map(f => [f.id, String(f.price_per_kg)]),
        ));
        if (res?.visibility) setPriceVisibility(res.visibility.price_visibility ?? 'private');
        // Effective state seeds the controls; the baseline is kept alongside so a chip
        // can show WHERE it came from. A baker cannot sensibly overrule a default they
        // cannot see is a default.
        setConflicts(new Set(arr.flatMap(f => (f.conflicts_with ?? []).map(c => `${f.id}|${c.key}`))));
        setBaseline(new Set(arr.flatMap(f => (f.baseline_conflicts ?? []).map(k => `${f.id}|${k}`))));
      })
      .catch(e => { setError(e.message); setFlavours([]); })
      .finally(() => setLoading(false));

    // The vocabulary itself, so retiring or adding a requirement never needs a release.
    // The baker-scoped route so each row carries this bakery's on/off state.
    (apiClient.fetchBakerDietaryRequirements ?? apiClient.fetchDietaryRequirements)?.()
      .then(rows => {
        if (!Array.isArray(rows)) return;
        setDiet(rows);
        setDietOff(new Set(rows.filter(r => r.offered === false).map(r => r.key)));
      })
      .catch(() => {});
  }, [open]);

  function toggleFlavour(id) {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleDietOption(key) {
    setDietOff(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // What this bakery deals in — drives both the per-flavour chips below and,
  // via the API, what a customer is offered.
  const offeredDiet = (diet ?? []).filter(d => !dietOff.has(d.key));

  function toggleConflict(flavourId, key) {
    setConflicts(prev => {
      const next = new Set(prev);
      const id = `${flavourId}|${key}`;
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // A rate the baker can't have meant. Blank is fine — it means "not priced", which the
  // storefront renders as "ask" — but a typo shouldn't reach the server to be rejected
  // there, and it certainly shouldn't reach a customer.
  const badPrice = (id) => {
    const raw = (prices[id] ?? '').trim();
    if (!raw) return false;
    const n = Number(raw);
    return !Number.isFinite(n) || n < 0;
  };
  const priceErrors = (flavours ?? []).filter(f => badPrice(f.id));

  async function handleSave() {
    if (!apiClient.updateBakerFlavours) return;
    if (priceErrors.length) { setError('Check the prices marked in red.'); return; }
    setSaving(true); setError(null); setSaved(false);
    try {
      // One call carries the flags, the rates and the visibility — they are saved by one
      // button, so splitting them would let a baker end up half-saved with no way to tell.
      await apiClient.updateBakerFlavours({
        flavours: (flavours ?? []).map(f => ({
          flavour_id: f.id,
          excluded: excluded.has(f.id),
          // '' means "unprice this" and must reach the server as null, not 0 — 0 is a
          // baker advertising a free cake.
          price_per_kg: (prices[f.id] ?? '').trim() === '' ? null : Number(prices[f.id]),
        })),
        visibility: { price_visibility: priceVisibility },
      });

      if (apiClient.updateBakerDietaryExclusions) {
        await apiClient.updateBakerDietaryExclusions([...dietOff]);
      }
      // Sent as the EFFECTIVE truth per flavour — "these are the ones we can't make" —
      // and the API works out what differs from Spattoo's default. The panel never has
      // to reason about baselines or diffs, which is why it can stay this small.
      if (apiClient.updateBakerFlavourDietaryConflicts) {
        await apiClient.updateBakerFlavourDietaryConflicts(
          (flavours ?? []).map(f => ({
            flavourId: f.id,
            source: 'global',
            requirementKeys: (diet ?? [])
              .map(d => d.key)
              .filter(k => conflicts.has(`${f.id}|${k}`)),
          })),
        );
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <style>{`
        @keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, left: dockedLeft(isMobile),
        zIndex: 300, display: 'flex', flexDirection: 'column',
        fontFamily: "'Quicksand', sans-serif",
        background: '#F4F8F5',
        boxShadow: '-4px 0 40px rgba(0,0,0,0.15)',
        animation: 'slideInRight 0.3s cubic-bezier(0.32,0.72,0,1)',
      }}>

        {/* Header */}
        <div style={{
          padding: isMobile ? '16px 20px' : '20px 28px',
          background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`,
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <button onClick={onClose} style={{
            display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
            background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 10, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.85)',
          }}>← Back</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Flavours</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>What you can make — flavours and dietary options</div>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 60, color: '#9BB5A2', fontSize: 14 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid #C5D4C8', borderTopColor: '#2C4433', animation: 'spin 0.7s linear infinite', marginRight: 10 }} />
              Loading flavours…
            </div>
          )}

          {error && (
            <div style={{ padding: '14px 18px', borderRadius: 12, background: '#FEE2E2', color: '#991B1B', fontSize: 13, fontWeight: 600 }}>
              {error}
            </div>
          )}

          {flavours && !loading && (
            <>
              <DietaryOptionsSection
                options={diet}
                excluded={dietOff}
                onToggle={toggleDietOption}
                isMobile={isMobile}
              />

              <Section title="Flavours">
                <Field
                  label="Offered flavours"
                  hint="Turn off any flavour you don't offer. Hidden flavours won't appear to customers placing an order. Under each one, mark anything you can't make it as — a customer who asks for that gets a note to check with you, and can still place the order."
                >
                  {/* What a customer can see, stated as a sentence rather than left to be
                      inferred from a control. A baker must never have to work out whether
                      the number they just typed is public — this line changing as they
                      choose is the whole explanation of the feature. */}
                  <div style={{ background: '#F7FAF8', border: '1px solid #E8EFE9', borderRadius: 11,
                                padding: '11px 13px', marginTop: 8, display: 'flex',
                                flexDirection: 'column', gap: 9 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#2C4433' }}>
                      {priceVisibility === 'public'
                        ? 'Customers see your prices.'
                        : priceVisibility === 'verified'
                          ? 'Prices show once a customer verifies a phone or email.'
                          : 'Customers don’t see your prices.'}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {[
                        { key: 'private',  label: 'Prices private' },
                        { key: 'verified', label: 'After verifying' },
                        { key: 'public',   label: 'Prices public' },
                      ].map(o => (
                        <button
                          key={o.key} type="button"
                          onClick={() => setPriceVisibility(o.key)}
                          aria-pressed={priceVisibility === o.key}
                          style={{
                            padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
                            border: `1.5px solid ${priceVisibility === o.key ? '#2C4433' : '#E5E7EB'}`,
                            background: priceVisibility === o.key ? '#2C4433' : '#fff',
                            color: priceVisibility === o.key ? '#fff' : '#6B7280',
                            fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700,
                          }}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>

                    {/* The reason a baker who never publishes should still fill the rates
                        in. Without this the price boxes look like a request to go public. */}
                    <div style={{ fontSize: 10.5, color: '#9CA3AF', fontWeight: 600, lineHeight: 1.5 }}>
                      Your prices are always used to work out a suggested quote for you, even when
                      customers can&rsquo;t see them.
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
                    {flavours.length === 0 && (
                      <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 600 }}>No flavours available yet.</span>
                    )}
                    {flavours.map((f, i) => {
                      const offered = !excluded.has(f.id);
                      return (
                        <div key={f.id} style={{
                          padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid #F3F4F6',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: offered ? '#2C4433' : '#9CA3AF' }}>{f.name}</div>
                              {f.description && (
                                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{f.description}</div>
                              )}
                            </div>
                            <Toggle checked={offered} onChange={() => toggleFlavour(f.id)} />
                          </div>

                          {/* Only for flavours on offer, for the same reason as the
                              dietary chips below: pricing something you don't sell is
                              dead work. The rate is NOT cleared when a flavour is
                              switched off — it is kept, so a baker who turns mango off
                              for the winter still has their number in April. */}
                          {offered && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingLeft: 2 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: 0.3 }}>
                                PER KG
                              </span>
                              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                                <span style={{ position: 'absolute', left: 9, fontSize: 12.5, fontWeight: 700,
                                               color: badPrice(f.id) ? '#DC2626' : '#9CA3AF', pointerEvents: 'none' }}>₹</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={prices[f.id] ?? ''}
                                  onChange={e => setPrices(p => ({ ...p, [f.id]: e.target.value }))}
                                  placeholder="—"
                                  aria-label={`Price per kg for ${f.name}`}
                                  aria-invalid={badPrice(f.id) || undefined}
                                  style={{
                                    width: 104, padding: '7px 10px 7px 22px', borderRadius: 9,
                                    border: `1.5px solid ${badPrice(f.id) ? '#DC2626' : '#E5E7EB'}`,
                                    fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
                                    color: '#2C4433', boxSizing: 'border-box',
                                    fontVariantNumeric: 'tabular-nums',
                                  }}
                                />
                              </div>
                              {/* Optional, and it has to LOOK optional. A baker who prices
                                  nothing should feel finished, not nagged — this exists to
                                  make pricing available, never compulsory. */}
                              <span style={{ fontSize: 10.5, color: '#C3CBC6', fontWeight: 600 }}>
                                {badPrice(f.id) ? 'Not a valid price' : 'optional'}
                              </span>
                            </div>
                          )}

                          {/* Only for flavours actually on offer — declaring what you
                              can't do with a flavour you don't sell is dead work.
                              Phrased as "can't be made", matching what is stored: we
                              record the NEGATIVE, so nothing here ever reads as us
                              certifying that a flavour IS suitable. */}
                          {/* Only requirements this bakery actually deals in. Declaring
                              that one flavour can't be made nut-free is dead work if you
                              never guarantee nut-free at all — and it would make the row
                              longer for every baker who offers less. */}
                          {offered && offeredDiet.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, paddingLeft: 2 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: 0.3 }}>
                                CAN'T BE MADE
                              </span>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {offeredDiet.map(d => {
                                  const id       = `${f.id}|${d.key}`;
                                  const active   = conflicts.has(id);
                                  const fromUs   = baseline.has(id);
                                  return (
                                    <Chip
                                      key={d.key}
                                      label={d.label}
                                      active={active}
                                      isMobile={isMobile}
                                      tone={dietTone(d.kind)}
                                      // Dashed while it is still OUR default rather than
                                      // the baker's own call — and it stays tappable, so
                                      // "we DO make a nut-free hazelnut sponge" is always
                                      // sayable. A default nobody can overrule would be
                                      // us making a claim about their kitchen.
                                      variant={active && fromUs ? 'dashed' : 'solid'}
                                      title={active && fromUs ? "Spattoo's default — tap if you do make it" : undefined}
                                      onClick={() => toggleConflict(f.id, d.key)}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Field>
              </Section>

              {flavours.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      padding: '12px 28px', borderRadius: 12, border: 'none',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      background: saving ? '#C5D4C8' : `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
                      color: '#fff', fontSize: 14, fontWeight: 800, fontFamily: 'inherit',
                      boxShadow: saving ? 'none' : '0 4px 14px rgba(0,0,0,0.2)',
                      transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    {saving && <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />}
                    {saving ? 'Saving…' : 'Save Flavours'}
                  </button>
                  {saved && <span style={{ fontSize: 13, fontWeight: 700, color: '#2C4433' }}>✓ Saved</span>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
