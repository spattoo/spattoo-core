// ── Cake geometry constants ───────────────────────────────────────────────────
// Radii for each tier slot (index 0 = bottom tier, ascending toward top).
export const TIER_RADII = [1.2, 0.9, 0.65, 0.45];

// Y-coordinate of the cake board surface and the default tier height.
export const BOTTOM_BASE = 0.1;
export const BOTTOM_H    = 1.45;

// Default vertical anchor for a bend (festoon) swag, as a FRACTION of the tier wall height —
// where the festoon's high ends sit; the belly drapes below by the (scaled) bend depth. Using
// a fraction instead of the absolute bottom_y_offset makes the swag land proportionally on any
// tier size (no hard-coded height). The Height control nudges from here.
export const BEND_ANCHOR_FRAC = 0.55;

// ── Sheet (rectangular) cakes ─────────────────────────────────────────────────
// Standard US bakery sheet/square sizes, full width × depth in inches, scaled to
// world units so a half sheet's long side (~2.16) reads at roughly the round bottom
// tier's footprint (diameter 2.4). `w` is the long side (world X), `d` the short (Z).
export const SHEET_INCH_TO_WORLD = 0.12;
const inToW = (n) => +(n * SHEET_INCH_TO_WORLD).toFixed(3);
export const SHEET_SIZES = {
  quarter:  { label: 'Quarter sheet', inches: '9×13',  w: inToW(13), d: inToW(9)  },
  half:     { label: 'Half sheet',    inches: '13×18', w: inToW(18), d: inToW(13) },
  full:     { label: 'Full sheet',    inches: '18×26', w: inToW(26), d: inToW(18) },
  square_s: { label: 'Square (8")',   inches: '8×8',   w: inToW(8),  d: inToW(8)  },
  square_l: { label: 'Square (12")',  inches: '12×12', w: inToW(12), d: inToW(12) },
};
export const SHEET_DEFAULT_KEY   = 'half';
export const SHEET_CORNER_RADIUS = 0;      // 0 = sharp vertical corners on the cake body
// Corner radius the piping uses. 0 → each side runs full length and the two rows meet at the
// sharp corner (no diagonal bridging shell). >0 → rows inset and a corner shell bridges them.
export const SHEET_PIPING_CORNER_RADIUS = 0;

// ── Sticker ───────────────────────────────────────────────────────────────────
export const STICKER_SIZE = 0.28;       // world-space side length of the hit plane

// ── Piping style picker layout ────────────────────────────────────────────────
export const PICKER_ORIGIN_X = -0.5;
export const PICKER_STEP_X   = -0.62;
export const PICKER_ORIGIN_Z =  2.0;
export const PICKER_STEP_Z   =  0.52;

// ── Tier height ───────────────────────────────────────────────────────────────
export const TIER_HEIGHT_STEP = 0.08;   // each upper tier is this shorter than the one below

// ── Visual constants ──────────────────────────────────────────────────────────
export const SELECTION_COLOR  = '#6c47ff';   // emissive highlight on selected elements

// ── Piping ────────────────────────────────────────────────────────────────────
// Cake front faces the camera (+Z). In the ring math pos=[cos·r, y, sin·r] that's
// angle π/2, so single piping pieces seed here to land dead-center front.
export const PIPING_FRONT_ANGLE = Math.PI / 2;

// ── Camera ────────────────────────────────────────────────────────────────────
export const CAMERA_POSITION        = [0, 5.5, 7.9];
// Pulled in ~15% from [0,7,10.8] so the cake is larger and reaches under the right-side popup
// (the see-through overlay needs cake behind it to read), while still leaving clear headroom above
// for tall toppers. Tune by eye; if a multi-tier cake clips at the top, switch to height-adaptive.
export const CAMERA_POSITION_MOBILE = [0, 6.3, 9.3];
export const CAMERA_FOV             = 42;

// ── Top cap ───────────────────────────────────────────────────────────────────
// CakeTier renders a thin cap disc (height 0.02) on top of each tier so the
// top face has a slightly smoother sheen. Balls placed on the top surface must
// sit above this cap to avoid geometric clipping.
export const CAKE_TOP_CAP_H = 0.02;

// ── Sticker surface offsets ───────────────────────────────────────────────────
// How far a side decal's base sheet sits off the wall, as a DIMENSIONLESS FRACTION of the live
// tier radius — never an absolute world length (INVARIANTS.md #8). Apply via `sideSeatOffset()`.
//
// Derived, not invented: the Relief Sticker Studio seats its decal at `TIER_R + 0.004` on its
// own 1.2-radius tier. Re-expressing that absolute value as a fraction of THAT tool's radius is
// exactly what #8 prescribes, so the designer can multiply by ITS OWN live radius. Written as the
// original quotient so the provenance survives — do not "simplify" it to a bare number.
//
// (Lesson: this was `0.025` world. On the 1.2 tier that's 2.1% of the radius — 6.25x the studio's
// 0.33% — so every side decal floated a visible slot off the wall, and you saw the board through
// the gap at the silhouette tangent. On a 0.45 tier the same constant is 5.6%: worse the smaller
// the cake, which is the signature of a hardcoded world length.)
export const SIDE_STICKER_SEAT_FRAC = 0.004 / 1.2;
export const FLAT_STICKER_Y_OFFSET  = 0.025;  // lift above cake top surface — TODO: same #8 smell, still absolute

// ── Domain enums ──────────────────────────────────────────────────────────────
// Single source of truth for the string identifiers used across the designer and
// admin. The VALUES are persisted (DB / saved designs), so they must never change
// — but referencing them by name means a slug rename never needs a code change.

// Cake surfaces an element can be placed on.
export const ZONES = Object.freeze({
  TOP_SURFACE: 'top_surface',
  SIDE:        'side',
  MIDDLE_TIER: 'middle_tier',
  BOARD:       'board',
  RIM:         'rim',
  TOP:         'top',
});

// How a placed element orients on its surface.
export const PLACEMENT_MODES = Object.freeze({
  STAND:            'stand',
  HUG:              'hug',
  PERCH:            'perch',   // figure seated on the rim/top edge — straddles the edge, legs over
  VERGE:            'verge',   // rests its base on the rim lip and reclines radially OUTWARD, the rest
                              //   cantilevered over the edge into the air (butterflies, flowers)
});

// Internal element kinds the designer branches on (NOT the admin element-type slug).
export const ELEMENT_KINDS = Object.freeze({
  TIER:    'tier',
  TOPPER:  'topper',
  STICKER: 'sticker',
  TEXT:    'text',
  IMAGE:   'image',
});

// Element-type SLUGS that have bespoke placement logic. Anything special-cased in
// code must be referenced from here, never as a bare string literal.
export const ELEMENT_SLUGS = Object.freeze({
  SCATTERED_DECOR: 'scattered_decor',
  PICKS:           'picks',
  IMAGE_TOPPER:    'image_topper',
});

// Human names for the cake surfaces. Shared: the element popup labels a zone with these, and so does
// the upload studio's zone picker — one vocabulary, so a baker who reads "Side" in one place reads
// "Side" in the other.
export const ZONE_LABELS = Object.freeze({
  top_edge:     'Top',
  bottom_board: 'Base',
  top_surface:  'Top surface',
  side:         'Side',
  side_edge:    'Side edge',
  middle_tier:  'Middle tier',
  board:        'Board',
});
