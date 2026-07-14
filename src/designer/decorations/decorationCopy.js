// ── What promotion is CALLED, and what it MEANS ──────────────────────────────────────────────────
// Two screens describe the same act — the Uploads Edit screen, where the baker decides, and the
// promote studio, where he authors the behaviour and ticks the rights. They were saying it in three
// different ways ("show in my decorations", "use as a decoration", "remove from decorations") and
// explaining it in two. Words are an interface: if the button he pressed and the screen it opened do
// not agree on what he is doing, he stops trusting either. So the wording lives here, once.
//
// PUBLISH / UNPUBLISH, deliberately a matched pair. Add ↔ Remove would do too, but the baker is
// publishing: the image leaves his private Uploads and enters a library other people design from. The
// storefront also has a Publish, and that is fine — they are said in full ("publish to decorations",
// "publish your storefront"), so neither is ever the bare word standing alone.

export const PUBLISH_LABEL   = 'Publish to decorations';
export const UNPUBLISH_LABEL = 'Unpublish from decorations';

// What he is actually agreeing to, in the order the questions occur to him: who sees it, and can I
// undo this.
//
// It deliberately says nothing about the image "staying in Uploads". An earlier draft did, to reassure
// him it was not being moved — but a line insisting the picture does not go anywhere, directly under a
// line saying his customers will see it, reads as a contradiction. Nothing here suggests it leaves, so
// nothing has to promise it stays.
export const PUBLISH_NOTE = [
  'Your customers see it under Decorations when they design a cake, and can use it in their cake designs.',
  'You can unpublish it at any time. Cakes already designed with it keep it.',
];
