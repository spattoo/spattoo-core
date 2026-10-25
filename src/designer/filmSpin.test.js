import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./CakeDesigner.jsx', import.meta.url), 'utf8');
/* ⚠️ COMMENTS STRIPPED FOR ANYTHING THAT ASSERTS AN ABSENCE. The notes in this feature quote the
   mistakes they exist to prevent — including the dead "Stop spinning" label — so a bare search of
   the source finds the explanation and calls it the bug. The same trap check:image-model fell into:
   its first draft matched the string quoted in the comment ABOVE the fix and was satisfied. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ── Spinning the cake for the camera ────────────────────────────────────────────────────────────
 *
 * A hero shot for the demo video: the cake turning on its own while somebody films the screen.
 * Sandeep set two conditions that are easy to satisfy on the day and easy to lose later, so they
 * are pinned here rather than left to a comment.
 *
 *   "that button should not appear in video"
 *   "only template authors have access to this button"
 *
 * ⚠️ THE FIRST ONE IS NOT A STYLE POINT. A screen recorder captures the SCREEN, so any control
 * drawn in the designer lands in the file. The reel's own status messages are allowed to sit over
 * the designer precisely because the reel captures the CANVAS and nothing on top of it reaches the
 * recording — a piece of reasoning that does not transfer, and would be very easy to borrow.
 *
 * Asserted as source because mounting CakeDesigner needs an API client, a baker, a design and a
 * WebGL context to prove where one menu item lives.
 */
describe('the hero spin stays out of the frame', () => {
  const item = code.match(/\{isCatalogAuthor && \([\s\S]{0,600}?Spin the cake[\s\S]{0,400}?\)\}/);

  it('lives behind the Capture menu, which is shut unless it is being used', () => {
    expect(item, 'the spin item should be inside an isCatalogAuthor guard').not.toBeNull();
    // The one visible control is the Capture button, which predates this and is author-gated too.
    expect(item[0]).toMatch(/SHEET_ITEM/);
  });

  /* ⚠️ `isCatalogAuthor`, NEVER `canRecordReel`. The menu AROUND it opens for either, because a
     baker on a plan with reel capture films their own cakes. This films the PRODUCT. */
  it('is for catalogue authors, not for anyone who can record a reel', () => {
    expect(item[0]).not.toMatch(/canRecordReel/);
    expect(code).toMatch(/const isCatalogAuthor = !!bakerData\?\.is_catalog_author/);
  });

  /* ⚠️ THE WAY OUT HAS TO BE INVISIBLE TOO. A "Stop" button on screen is a button in the video, so
     stopping is Esc or taking hold of the cake. If this ever becomes a rendered control, the first
     assertion above still passes and the feature is quietly broken for its only purpose. */
  it('is stopped by Escape and by grabbing the cake, not by a visible control', () => {
    const effect = code.match(/if \(!filmSpin\) return undefined;[\s\S]{0,700}?\}, \[filmSpin\]\);/);
    expect(effect, 'a listener should exist only while spinning').not.toBeNull();
    expect(effect[0]).toMatch(/'Escape'/);
    expect(effect[0]).toMatch(/addEventListener\('pointerdown'/);
    // And it must clean itself up, or every spin leaves another listener behind.
    expect(effect[0]).toMatch(/removeEventListener\('keydown'/);
    expect(effect[0]).toMatch(/removeEventListener\('pointerdown'/);
  });

  /* ⚠️ IT IS HOW THE CAKE IS LOOKED AT, NOT WHAT IT IS. Written into the design it would be saved,
     and a cake that spins when you reopen it is a bug somebody chases through the snapshot. */
  it('never reaches the design', () => {
    expect(code).not.toMatch(/setDesign\([^)]*filmSpin/);
    expect(code).not.toMatch(/filmSpin:\s/);
  });

  /* Turning it on drops the selection — both because the canvas refuses to auto-rotate while
     something is selected (so the menu item would appear dead), and because a selection draws a box
     and handles ON the cake, which is the one thing a hero shot must not contain.
     ⚠️ Through `handleDeselect`, the same call openReelPanel makes for the same stated reason, not
     a lighter one that happens to clear the tier and leaves the piping toolbar in frame. */
  it('drops the selection on the way in, the way the reel does', () => {
    const at = code.indexOf('function startFilmSpin() {');
    expect(at).toBeGreaterThan(-1);
    expect(code.slice(at, at + 300)).toMatch(/handleDeselect\(\)/);
  });

  /* The photo and reel panels both aim the camera themselves. A spin left running fights them for
     the orbit, and the symptom — a reel that drifts — would look like a bug in the recorder. */
  it('stands down when the photo or reel panel takes the camera', () => {
    for (const fn of ['openReelPanel', 'openPhotoPanel']) {
      const at = code.indexOf(`function ${fn}() {`);
      expect(at, `${fn} should exist`).toBeGreaterThan(-1);
      /* The opening of the function, not its whole body: standing the spin down is the FIRST thing
         either does, before it deselects or opens anything, so a narrow window is the assertion. */
      expect(code.slice(at, at + 300), `${fn} should stop the spin first`).toMatch(/setFilmSpin\(false\)/);
    }
  });

  /* ⚠️ THE LABEL MUST NOT BE A TOGGLE. It was first written as
     `filmSpin ? 'Stop spinning' : 'Spin the cake'` — unreachable, because the spin stops on ANY
     pointerdown and opening this menu IS a pointerdown, so the item always rendered "Spin the
     cake". A ternary whose other branch can never show is a lie about what the control does. */
  it('does not pretend to be a toggle it cannot be', () => {
    expect(code).not.toMatch(/Stop spinning/);
    expect(item[0]).toMatch(/Spin the cake/);
  });

  /* ⚠️ THE SETUP PANEL MUST CLOSE BEFORE THE TAKE RUNS. It is the one piece of chrome this feature
     draws, and everything on screen is filmed — so Start has to shut it in the same handler that
     begins the move, not leave it to a later render or an onClose. */
  it('closes its setup panel in the same breath as starting', () => {
    expect(code).toMatch(/setSpinSetupOpen\(false\);\s*startFilmSpin\(\)/);
  });

  /* The way out is still Esc, and the panel is the only place that can say so — it is on screen
     exactly when nobody is recording. */
  it('teaches the way out where it is safe to say it', () => {
    const panel = code.match(/spinSetupOpen && \([\s\S]{0,2600}?<\/Panel>/);
    expect(panel, 'the setup panel should exist').not.toBeNull();
    expect(panel[0]).toMatch(/Esc stops it early/);
  });

  /* ⚠️ NOT FOLDED INTO `creamAutoRotate`, which spins the cake for spin-painting. Same effect on
     the controls, different owner and different lifetime: shared, closing the cream panel would
     stop the film shot and filming would leave the paint wheel on. */
  /* ⚠️ TWO THINGS MUST NOT BOTH WRITE THE AZIMUTH. The first version drove the spin through
     `autoRotate`, which turns on one axis forever; the take lifts to a plan view and settles back,
     so a director drives it instead. Left on autoRotate as well, both would write the camera every
     frame and the lift would fight the turntable. */
  it('is driven by the director, not by autoRotate', () => {
    expect(code).toMatch(/autoRotate=\{creamAutoRotate\}/);
    expect(code).not.toMatch(/autoRotate=\{creamAutoRotate \|\| filmSpin\}/);
    expect(code).toMatch(/spin=\{filmSpin \? spinPlan : null\}/);
    // The cream wheel still owns autoRotate, and is untouched by any of this.
    expect(code).toMatch(/const \[creamAutoRotate, setCreamAutoRotate\]/);
  });

  /* The take ends itself, so a baker who set 14 seconds gets 14 seconds and no stray state. */
  it('clears the flag when the take finishes', () => {
    expect(code).toMatch(/onSpinDone=\{\(\) => setFilmSpin\(false\)\}/);
  });
});
