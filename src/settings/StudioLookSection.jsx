import { useState, useEffect, useCallback, useRef } from 'react';
import { Section, Field } from './controls.jsx';
import { Slider } from '../shared/Slider.jsx';
import Chip from '../shared/Chip.jsx';
import { GroundSwatches, groundsFor } from '../designer/capture/takeUi.jsx';
import { BACKDROP_LOOKS, backdropPlan, paintBackdrop } from '../designer/reel/takeBackdrop.js';
import { GRID_COLOR, floorOpacity, wallOpacity } from '../designer/reel/takeGrid.js';
import { previewSegments } from '../designer/studioPreview.js';
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
/* ── The room, small ─────────────────────────────────────────────────────────────────────────────
 *
 * Sandeep: *"on this screen, can we at least show an image preview kind of it. for example user
 * does not know what 'pool' look means."* and then *"instead there should be only one preview box,
 * based on your selection that changes. for example if you select look and then grid lines it
 * shows both on the preview."*
 *
 * ⚠️ ONE BOX, NOT FOUR SWATCHES. The first version put a painted tile on each Look, which answered
 * "what is Pool" and nothing else — a baker still could not see Pool WITH their grid on, which is
 * the room they are actually choosing. Four tiles also meant four pictures of settings the baker
 * is not on. One box that is the current answer is both smaller and more honest.
 *
 * ⚠️ IT IS PAINTED BY THE RENDERER'S OWN FUNCTIONS. See studioPreview.js — the backdrop, the line
 * colour, the opacities and the grid's world coordinates all come from the modules the scene uses,
 * and the camera is the only thing this owns. INVARIANTS #15.
 */
function StudioPreview({ look, width = 260, height = 150 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    /* Device resolution: at 1× a radial gradient over this size bands visibly, and the banding is
       the first thing you see rather than the shape. */
    const dpr = Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const w = Math.round(width * dpr), h = Math.round(height * dpr);
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;                       // no 2D context (jsdom, a blocked canvas) — draw nothing
    ctx.clearRect(0, 0, w, h);
    paintBackdrop(ctx, w, h, backdropPlan(look.ground, look.backdrop, look.backdropStrength));

    const seg = previewSegments({ floor: look.grid, wall: look.gridWall, w, h });
    ctx.lineWidth = Math.max(1, dpr * 0.6);
    ctx.strokeStyle = GRID_COLOR;
    /* ⚠️ THE WALL IS DRAWN FIRST AND FAINTER, as it is in the scene — `wallOpacity` keeps it behind
       the floor rather than competing with it, and painting it after would put the far surface in
       front of the near one. */
    for (const [set, alpha] of [[seg.wall, wallOpacity(look.gridStrength)],
                                [seg.floor, floorOpacity(look.gridStrength)]]) {
      if (!set.length) continue;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      for (const [x1, y1, x2, y2] of set) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, [look.ground, look.backdrop, look.backdropStrength, look.grid, look.gridWall,
      look.gridStrength, width, height]);

  return (
    <canvas ref={ref} aria-hidden
            style={{ width, height, display: 'block', borderRadius: 10, border: '1.5px solid #D8E0DA' }} />
  );
}

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
            {/* ⚠️ ABOVE THE CONTROLS, NOT BELOW THEM. INVARIANTS #11 — a control and what it changes
                must be visible at the same time, "effect above control" being the second-best
                arrangement after side by side. Below the four controls it would be off the bottom
                of a phone while the baker was pressing the thing that changes it. */}
            <StudioPreview look={look} />
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
