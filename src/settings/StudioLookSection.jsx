import { useState, useEffect, useCallback } from 'react';
import { Section, Field } from './controls.jsx';
import { Slider } from '../shared/Slider.jsx';
import Chip from '../shared/Chip.jsx';
import { GroundSwatches, groundsFor } from '../designer/capture/takeUi.jsx';
import { BACKDROP_LOOKS } from '../designer/reel/takeBackdrop.js';
import { STRENGTH_MIN as GRID_STRENGTH_MIN } from '../designer/reel/takeGrid.js';
import {
  STUDIO_LOOK_DEFAULT, normaliseStudioLook, hasStudioLook, studioLookPayload,
} from '../designer/studioLook.js';
import { INK } from '../shared/tokens.js';

/* ── Dressing the room you work in ───────────────────────────────────────────────────────────────
 *
 * Sandeep: *"under the capture button, we have 'build the cake' option. in this we can select
 * studio background like color and grid lines while capturing the video. now the samething we
 * should also give as baker settings. so a baker can customize the studio. we would save these
 * settings and the baker would see theie selected look&feel."*
 *
 * ⚠️ THE SAME CONTROLS AS THE TAKE PANEL, NOT A SECOND SET THAT LOOKS LIKE THEM. `GroundSwatches`,
 * `BACKDROP_LOOKS` and the two grid chips are imported from where the Build panel already uses
 * them, so "Slate" is one grey and a look chosen here is the look that films. `TAKE_GROUNDS`' own
 * note records what a third copy of a swatch row costs; this is the second caller, not a fork.
 *
 * ⚠️ IN SETTINGS, NOT My Account — the same call `RailSkinSection` makes and for the same reason:
 * the re-auth gate is there for what a borrowed session could DO, and making somebody type their
 * password to try a different backdrop is absurd friction for a cosmetic.
 *
 * ⚠️ EVERY CHANGE SAVES ITSELF. There is no Save button, because there is nothing to lose: the
 * preview IS the designer, one screen away, and a baker will flip a swatch, go and look, and come
 * back. A form that silently forgot the swatch while they were looking would be the one failure
 * this cannot afford. INVARIANTS #13's unsaved-work rule is about work; this is a preference.
 */
export function StudioLookSection({ apiClient, brandPrimary = null, onChanged }) {
  const [look, setLook] = useState(null);       // null while loading — not the default, which is a real answer
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(() => {
    if (!apiClient?.fetchStudioLook) return;
    apiClient.fetchStudioLook()
      .then(r => setLook(normaliseStudioLook(r?.look ?? r)))
      .catch(e => setErr(e?.message ?? 'Could not load your studio.'));
  }, [apiClient]);
  useEffect(() => { load(); }, [load]);

  /* A host that cannot serve this shows nothing, rather than an empty box that looks broken — the
     same rule RailSkinSection states. Every customer session and every harness is such a host. */
  if (!apiClient?.fetchStudioLook || !apiClient?.setStudioLook) return null;
  if (!look) return null;

  async function save(next) {
    const merged = normaliseStudioLook({ ...look, ...next });
    setLook(merged);                    // the control moves now; the wire catches up
    setBusy(true); setErr(null);
    try {
      await apiClient.setStudioLook(studioLookPayload(merged));
      onChanged?.(merged);
    } catch (e) {
      setErr(e?.message ?? 'Could not save that.');
      load();                           // put the controls back to what is actually stored
    } finally {
      setBusy(false);
    }
  }

  const on = hasStudioLook(look);
  const grounds = groundsFor(brandPrimary);

  return (
    <Section title="Your studio">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field
          label="Background"
          hint="The colour behind and under your cake while you design, and when you film it. Choose None to go back to the plain studio."
        >
          <GroundSwatches
            grounds={grounds}
            value={look.ground}
            selected={on}
            onPick={v => save({ ground: v === look.ground ? null : v })}
            /* ⚠️ A WAY BACK, AND IT IS A BUTTON RATHER THAN A SWATCH. "None" is not a colour, so
               painting it as one would put a white square beside the pale grounds and make the
               plain studio look like a choice between two creams. */
            extra={(
              <button type="button" onClick={() => save({ ground: null })} aria-pressed={!on}
                      style={{ height: 34, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
                               fontSize: 12, fontWeight: 700, color: INK, background: '#fff',
                               border: on ? '1.5px solid #D8E0DA' : '3px solid #2C4433' }}>
                None
              </button>
            )}
          />
        </Field>

        {/* ⚠️ NOTHING BELOW EXISTS UNTIL A GROUND DOES. They all dress the sweep, and a grid with
            no ground under it lies on the editing room's painted floor and crosses the horizon
            join the sweep exists to hide — see studioRoomFrom, which refuses that combination
            whatever a stored row says. Hiding the controls and enforcing it in the data are two
            halves of one rule: the form stops it happening, the renderer stops it mattering. */}
        {on && (
          <>
            <Field label="Look" hint="How the colour is shaded behind the cake.">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {BACKDROP_LOOKS.map(l => (
                  <Chip key={l.key} label={l.label} active={look.backdrop === l.key}
                        title={l.hint} onClick={() => save({ backdrop: l.key })} />
                ))}
              </div>
            </Field>

            {look.backdrop !== 'flat' && (
              <Slider label="Depth" value={look.backdropStrength} min={0} max={1} step={0.05}
                      fmt={v => `${Math.round(v * 100)}%`}
                      onChange={v => save({ backdropStrength: v })} />
            )}

            <Field label="Floor lines" hint="Lines on the floor and behind the cake, like the Spattoo website.">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Chip label="Grid floor" active={look.grid}
                      title="Lines on the floor under the cake"
                      onClick={() => save({ grid: !look.grid })} />
                <Chip label="Back wall" active={look.gridWall}
                      title="Vertical lines behind the cake"
                      onClick={() => save({ gridWall: !look.gridWall })} />
              </div>
            </Field>

            {(look.grid || look.gridWall) && (
              <Slider label="Line strength" value={look.gridStrength} min={GRID_STRENGTH_MIN} max={1} step={0.05}
                      fmt={v => `${Math.round(v * 100)}%`}
                      onChange={v => save({ gridStrength: v })} />
            )}
          </>
        )}

        {/* ⚠️ SAID WHERE THE DECISION IS MADE, not in a help article somebody has to go and find.
            A baker choosing a dark studio should know the cake they approve is the cake their
            customer gets, and that this changes neither. */}
        <p style={{ margin: 0, fontSize: 11, color: '#888', lineHeight: 1.5 }}>
          This changes the room, never the cake. Pictures and videos of your cakes are unaffected
          unless you choose the same look when you film.
        </p>

        {err && <span style={{ fontSize: 12, color: '#B42318' }}>{err}</span>}
        {busy && <span style={{ fontSize: 11, color: '#888' }}>Saving…</span>}
      </div>
    </Section>
  );
}

export { STUDIO_LOOK_DEFAULT };
