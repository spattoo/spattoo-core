import { useState, useEffect, useCallback } from 'react';
import { Section, Field } from './controls.jsx';
import { INK, INK_MUTED } from '../shared/tokens.js';

/* ── Choosing what your own rail looks like ──────────────────────────────────────────────────────
 *
 * Sandeep: "i actually want to build this as a setting a baker can choose. baker can choose how
 * should their menu bar look like. just a fancy feature." Blaze and above.
 *
 * ⚠️ IN SETTINGS, NOT My Account, and that is a deliberate reversal of where the other personal
 * things went. My Account sits behind the re-auth gate, and making somebody type their password to
 * try a different colour is absurd friction for a cosmetic. The gate is there to protect what a
 * borrowed session could DO — redirect mail, move a phone number — and a rail skin is not that.
 *
 * ⚠️ PER PERSON, not per bakery (migration 120, which borrows migration 060's argument). Two people
 * in one shop can disagree about this and both be right.
 *
 * ⚠️ `served` IS THE SERVER'S ANSWER AND THE CLIENT DOES NOT SECOND-GUESS IT. A baker who chose
 * Walnut and dropped off Blaze gets chosen:'walnut', served:'chrome', entitled:false — the tick
 * stays where they put it and the reason is said out loud, because a downgrade that silently
 * un-picks a choice reads as the app having lost it.
 */
export function RailSkinSection({ apiClient, onChanged }) {
  const [state, setState] = useState(null);     // { skins, chosen, served, entitled }
  const [busy, setBusy]   = useState(null);     // the key being saved
  const [err,  setErr]    = useState(null);

  const load = useCallback(() => {
    if (!apiClient?.fetchRailSkins) return;
    apiClient.fetchRailSkins().then(setState).catch(e => setErr(e?.message ?? 'Could not load looks.'));
  }, [apiClient]);
  useEffect(() => { load(); }, [load]);

  /* A host that cannot serve them shows nothing, rather than an empty box that looks broken.
   *
   * ⚠️ AND FEWER THAN TWO IS NOT A CHOICE. The same rule the Templates rail item already states —
   * "A ONE-ITEM MENU IS NOT A MENU" — applied to a chooser: a single swatch you cannot move away
   * from is a picture of the status quo with a border round it. Migration 122 switched the other
   * looks off, and this is what makes that invisible rather than sad. */
  if (!apiClient?.fetchRailSkins || (state?.skins?.length ?? 0) < 2) return null;

  const { skins, chosen, entitled } = state;

  async function pick(key) {
    if (busy) return;
    setBusy(key); setErr(null);
    try {
      await apiClient.setRailSkin(key);
      setState(s => ({ ...s, chosen: key, served: key }));
      onChanged?.();          // the rail re-reads itself; this panel does not draw it
    } catch (e) {
      setErr(e?.code === 'upgrade_required'
        ? 'That look is part of Blaze.'
        : (e?.message ?? 'Could not save that look.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title="Menu bar">
      <Field label="How your menu bar looks"
             hint={entitled
               ? 'Only you see this — it is not part of your storefront.'
               : 'Choosing a look is part of Blaze. Your menu bar stays as it is until then.'}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
          {skins.map(sk => {
            const locked = sk.is_premium && !entitled;
            const on     = chosen === sk.key || (!chosen && sk.is_default);
            return (
              /* ⚠️ LOCKED SKINS ARE SHOWN, NOT HIDDEN — the same call premium storefront themes
                 make. A feature nobody below Blaze can see is one nobody below Blaze will ever
                 want, and a locked control that explains itself is not the dead button the
                 codebase forbids: pressing it says what it costs. */
              <button key={sk.key} type="button" disabled={!!busy}
                onClick={() => locked ? setErr('That look is part of Blaze.') : pick(sk.key)}
                aria-pressed={on}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                         padding: 8, borderRadius: 12, cursor: busy ? 'wait' : 'pointer',
                         background: '#fff', fontFamily: "'Quicksand',sans-serif",
                         border: `2px solid ${on ? INK : '#E3E8E4'}` }}>
                {/* The swatch IS the skin's own stops, so what is chosen and what is drawn cannot
                    disagree — one function would be better still, but the rail is a 158px SVG and
                    this is a 34px chip; what they share is the data (INVARIANTS #15's spirit). */}
                <span style={{ width: 34, height: 54, borderRadius: 7, display: 'block',
                               background: `linear-gradient(180deg, ${sk.stops.join(', ')})`,
                               boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25)' }} />
                <span style={{ fontSize: 11, fontWeight: 800,
                               color: locked ? '#9AA79F' : (on ? INK : INK_MUTED) }}>
                  {sk.name}
                </span>
                {locked && <span style={{ fontSize: 9, fontWeight: 800, color: '#9AA79F' }}>BLAZE</span>}
              </button>
            );
          })}
        </div>
        {err && <div style={{ fontSize: 12, fontWeight: 600, color: '#B42318', marginTop: 8 }}>{err}</div>}
      </Field>
    </Section>
  );
}

export default RailSkinSection;
