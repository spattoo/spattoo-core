// ── Piping shell metrics ──────────────────────────────────────────────────────
// Single source of truth for how tall a cream-piping shell renders, shared by the
// renderer (CakeTier) and the editor's vertical clamp (CakeDesigner) so the two can
// never drift.
//
// SHELL_HEIGHT_FRAC is the height-normalisation the renderer bakes into every shell:
// a shell is scaled so its *upright bounding box* is this fraction of the tier radius
// tall. But the renderer then TILTS each shell (placement_config rotation), which
// foreshortens its real vertical reach — so the upright fraction is only a fallback.
//
// The exact rendered extents (how far the shell reaches ABOVE and BELOW its anchor,
// as a fraction of the tier radius — radius-independent, since a shell's scale is
// proportional to the radius) are measured by the canvas as each shell is built and
// published here, keyed by (glbUrl, flip, size). The clamp reads them back for an
// exact "does the top edge touch the rim / does the bottom touch the board" test that
// holds for any cake size or template without hardcoded guesses.

export const SHELL_HEIGHT_FRAC = 0.24;

const measured = new Map();
const keyFor = (glbUrl, flip, size) => `${glbUrl}|${flip ? 1 : 0}|${(size ?? 1).toFixed(2)}`;

// Publish a measured shell's vertical extents (fractions of the tier radius).
export function setShellExtents(glbUrl, flip, size, extents) {
  if (glbUrl) measured.set(keyFor(glbUrl, flip, size), extents);
}

// Read back measured extents, or fall back to the upright normalisation (no tilt,
// base-anchored) scaled by size when this shell hasn't rendered/been measured yet. All values
// are fractions of the tier radius:
//   topFrac / botFrac       — vertical reach above / below the anchor (Height clamp)
//   radialOutFrac / radialInFrac — radial reach of the outer / inner edge, measured from the
//                             rim edge (so outerEdge = radius + offset + radius·radialOutFrac).
export function getShellExtents(glbUrl, flip, size) {
  return measured.get(keyFor(glbUrl, flip, size))
    ?? { topFrac: SHELL_HEIGHT_FRAC * (size ?? 1), botFrac: 0, radialOutFrac: 0, radialInFrac: -SHELL_HEIGHT_FRAC * (size ?? 1) };
}
