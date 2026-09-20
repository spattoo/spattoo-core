// ── The colours the app's controls are made of ──────────────────────────────────────────────────
//
// ⚠️ THIS EXISTS BECAUSE "MAKE IT A STANDARD" KEPT MEANING "TYPE THE SAME HEX AGAIN". Sandeep,
// 2026-09-20, after four separate card fixes: "i am worried button color is not coming from one
// source. it should be." He was right, and the count was worse than it looked — `#1a1a1a` appeared
// 108 times in CakeDesigner.jsx alone, 27 more in orders, 18 in customers. Every "standard" set that
// evening added another literal instead of removing one.
//
// ⚠️ A TOKEN MODULE ONLY WORKS IF THE CALL SITES READ IT. Half-converted is worse than unconverted:
// it reads as one source while drifting silently, so a change here would appear to work and quietly
// miss the literals left behind. `check:tokens` exists to make that impossible — it fails the build
// when a raw hex duplicates a value defined here.
//
// The model is src/shared/chrome.js, which solved the same problem for the near-black furniture:
// "One source, two renderers, no drift."
//
// ── WHAT IS AND IS NOT A TOKEN ──────────────────────────────────────────────────────────────────
// A token is a colour with a JOB in the interface: ink, a surface, a hairline, a warning. It is not
// a colour with a MEANING IN THE CAKE. A gold leaf's gold, a buttercream's cream, the HDRI's cast,
// a 3D handle's marker tint — those describe something a baker is looking at, and they belong with
// the thing they describe. Do not move them here, and do not "tidy" a cake colour into a token:
// the two drift apart for good reasons, and a shared constant would force them together.

/** Ink — text, borders at full strength, and the filled state of a primary control.
 *  What "active" already means everywhere: doneBtn, the toolbar's pressed button, editTabOn. */
export const INK = '#1a1a1a';

/** The field a control sits on when it is not filled. */
export const SURFACE = '#ffffff';

/** A hairline: an unfilled control's border, a divider, the edge of a swatch. */
export const LINE = '#dddddd';

/** Ink at rest for a secondary control's label — present but not shouting. */
export const INK_MUTED = '#888888';

/** Destructive. The FIELD is the signal, not the word: a remove that looks like a confirm loses
 *  the only at-rest cue on a phone, where there is no hover to recover it. */
export const DANGER = '#e53935';
export const DANGER_FIELD = '#fff0f0';
export const DANGER_LINE = '#f5c0c0';

/** A pressed/selected tint of INK, for a chip or tile that is on without being filled. */
export const INK_TINT = 'rgba(26,26,26,0.06)';

/* ── The retired green ──────────────────────────────────────────────────────────────────────────
 * #3D5A44 and its companions (#C5D4C8, #EEF4EF, #F2F7F3, #2C4433) were a second control palette
 * that grew on the finish and studio surfaces. Sandeep, on the foil card: "see the buttons are in
 * green color", then plainly: "buttons in black".
 *
 * ⚠️ NOT EVERY GREEN IS A BUTTON, and this is the trap in sweeping it. FinishHandles' `selColor`
 * and CakeCanvas's marker tint are colours ON THE CAKE — a 3D handle a baker grabs. Recolouring
 * those because they share a hex would change the cake, not the chrome. Classify before replacing.
 */
