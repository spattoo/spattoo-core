// ── Cake geometry constants ───────────────────────────────────────────────────
// Radii for each tier slot (index 0 = bottom tier, ascending toward top).
export const TIER_RADII = [1.2, 0.9, 0.65, 0.45];

// Y-coordinate of the cake board surface and the default tier height.
export const BOTTOM_BASE = 0.1;
export const BOTTOM_H    = 1.45;

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
export const GOLD_COLOR       = '#D4AF37';
export const SELECTION_COLOR  = '#6c47ff';   // emissive highlight on selected elements

// ── Piping ────────────────────────────────────────────────────────────────────
// Cake front faces the camera (+Z). In the ring math pos=[cos·r, y, sin·r] that's
// angle π/2, so single piping pieces seed here to land dead-center front.
export const PIPING_FRONT_ANGLE = Math.PI / 2;

// ── Camera ────────────────────────────────────────────────────────────────────
export const CAMERA_POSITION        = [0, 5.5, 7.9];
export const CAMERA_POSITION_MOBILE = [0, 7, 10.8];
export const CAMERA_FOV             = 42;

// ── Top cap ───────────────────────────────────────────────────────────────────
// CakeTier renders a thin cap disc (height 0.02) on top of each tier so the
// top face has a slightly smoother sheen. Balls placed on the top surface must
// sit above this cap to avoid geometric clipping.
export const CAKE_TOP_CAP_H = 0.02;

// ── Sticker surface offsets ───────────────────────────────────────────────────
export const SIDE_STICKER_SURFACE_OFFSET = 0.025;  // gap between cake wall and sticker face
export const FLAT_STICKER_Y_OFFSET       = 0.025;  // lift above cake top surface
