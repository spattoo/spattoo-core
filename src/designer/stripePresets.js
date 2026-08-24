/* ── Starting points for stripe frosting ─────────────────────────────────────────────────────────
 *
 * ⚠️ These EXACT values are the ones judged against the reference photos in the admin studio. They
 * were moved here, not retyped — anything re-picked on the way into core is a different set of
 * colours that nobody has looked at.
 *
 * ── WHY PRESETS ARE PART OF THE FEATURE, NOT A CONVENIENCE ──────────────────────────────────────
 * The failure mode is not a baker who cannot start. It is eight saturated colours at softness 0.8,
 * which is brown. Choosing six colours that work together is a colourist's job and most bakers are
 * not colourists, so a blank palette ships a colour system rather than a cake.
 *
 * Named for the CAKE, never the mechanism — "Pastel rainbow", not "6 stripes · soft". A baker looks
 * for the cake they have been asked to make.
 *
 * ⚠️ Every preset sets EVERY field. One carrying only colours would leave the previous cake's
 * softness behind, and the baker gets a look they did not choose and cannot account for.
 *
 * They are STARTING POINTS: the palette lands in the editor immediately editable. If a preset is
 * hard to change, every cake made with this feature looks like one of four cakes.
 *
 * ⚠️ PROVENANCE. These colours were picked BY EYE from the reference photos. That method has a known
 * bias: when the football cake's stripes were later sampled properly, the eye had chosen #FFFFFF
 * where the real icing is a warm, faintly green off-white. Assume the same bias here until each is
 * sampled.
 *
 * ⚠️ There is deliberately NO football-stripes preset. Its photo was sent to show that two colours
 * must be able to REPEAT — which is why `count` exists — not to ask for that cake as a starting
 * point. It was added on a misreading and removed on request; the two-colour repeat it demonstrated
 * is reachable from any preset by dropping to two colours and raising the count.
 */

/* The reference photos, as configs. Listed BASE → TOP, which is the direction the shader reads and the
 * direction a baker ices in.
 *
 * ⚠️ PROVENANCE, because it decides whether these are fit to ship: only `stripes` has colours MEASURED
 * off its photo. The other three were picked by eye from the images, and measuring the one exposed a
 * systematic error in that method — the eye chose #FFFFFF where the real icing is a warm off-white.
 * Assume the same bias sits in the others until they are sampled too. */
export const STRIPE_PRESETS = {
  pastel: {
    label: 'Pastel rainbow',
    /* ⚠️ 0.5, not 0.95, and this is the studio earning its keep.
     * It was set to 0.95 on the reasoning that a pastel cake is "soft". Rendered next to the photo
     * that is plainly wrong: at 0.95 the stripes stop existing and it becomes a single wash, whereas
     * the reference has six clearly separate colours whose joins happen to be gentle. Soft COLOURS
     * are not a soft BLEND, and no amount of reading the source would have caught that. */
    note: 'Six pastels with gentle joins. The stripes stay countable — soft colours, not a soft blend. Set this above ~0.7 and it collapses into one wash, which is a different cake.',
    palette: ['#C9AEE0', '#A9C8E8', '#B9E3C6', '#F6EAA8', '#F9C9A3', '#F3AEC0'], count: 6,
    softness: 0.5, wobble: 0.25, weights: [1, 1, 1, 1, 1, 1],
  },
  unicorn: {
    label: 'Unicorn (soft joins)',
    note: 'Six colours, scraped so the joins are visible but soft. The middle of the range, and the look most bakers will actually reach for.',
    palette: ['#C9A9D6', '#9FC7DE', '#BFE0C0', '#F5E3A1', '#F2B98A', '#D9646B'], count: 6,
    softness: 0.45, wobble: 0.3, weights: [1, 1, 1, 1, 1, 1],
  },
  sunset: {
    label: 'Sunset ombre (3)',
    note: 'Three colours, fully blended — the classic ombre, and the far end of the slider. Proves the existing vertical gradient is just this with count 3 and softness 1, which is the case for merging the two rather than shipping both.',
    palette: ['#F7DE8E', '#F4A98C', '#EE9BB0'], count: 3,
    softness: 1, wobble: 0.15, weights: [1, 1, 1],
  },
  rainbow: {
    label: 'Rainbow (hard edges)',
    note: 'Six saturated stripes, crisp. The case that breaks if the blend maths cannot reach a true zero — watch the joins for fizz against the grain normal.',
    palette: ['#8E5AA8', '#3F6FD0', '#3FA55B', '#F2D33F', '#EE8B2E', '#D8392F'], count: 6,
    softness: 0.04, wobble: 0.08, weights: [1, 1, 1, 1, 1, 1],
  },
};
