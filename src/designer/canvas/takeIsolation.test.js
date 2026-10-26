import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ── A take changes nothing a baker keeps ────────────────────────────────────────────────────────
 *
 * The spin, the build and the lens exist so a catalogue author can film the product. None of them
 * may change what an ordinary baker sees, and ONE of them is genuinely dangerous: the lens.
 *
 * ⚠️ THE CAKE'S APPEARANCE IS A CONTRACT. A baker approves a colour on screen and their customer
 * gets that cake — so a take must not touch lighting, materials, tone mapping or the env map, and a
 * camera change it makes must be put back. Sandeep asked exactly this: *"would it impact the colour
 * or anything in the existing studio? in normal cake designing case, it should be as it is today."*
 *
 * Asserted as source because the alternative is booting WebGL to prove a prop is null.
 */
const CANVAS = readFileSync(new URL('./CakeCanvas.jsx', import.meta.url), 'utf8');
const DESIGNER = readFileSync(new URL('../CakeDesigner.jsx', import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const canvas = strip(CANVAS);
const designer = strip(DESIGNER);

describe('filming is isolated from designing', () => {
  /* Every take input is null unless a take is actually running. With all three null the canvas
     renders exactly the tree it rendered before any of this existed. */
  it('hands the canvas nothing unless a take is running', () => {
    expect(designer).toMatch(/spin=\{filmSpin \? spinPlan : null\}/);
    expect(designer).toMatch(/assembly=\{build == null \? null : \{ time: build, plan: buildTimings \}\}/);
    /* ⚠️ THE LENS OUTLIVES THE TAKE, ON PURPOSE. `lensReturning` keeps TakeLens mounted after the
       build finishes so it can GLIDE back; unmounting it the moment the take ended is what made the
       return a jump. `takeLensActive` is the honest "is a take running" — the two are separate
       questions and conflating them is the bug. */
    expect(designer).toMatch(/takeLens=\{filmSpin \|\| build != null \|\| lensReturning \? takeLens : null\}/);
    expect(designer).toMatch(/takeLensActive=\{filmSpin \|\| build != null\}/);
    expect(designer).toMatch(/onTakeLensReturned=\{\(\) => setLensReturning\(false\)\}/);
  });

  it('mounts no take machinery when it is handed nothing', () => {
    expect(canvas).toMatch(/\{spin && <SpinDirector/);
    expect(canvas).toMatch(/\{assembly && <AssemblyDirector/);
    expect(canvas).toMatch(/\{takeLens != null && \(\s*\n?\s*<TakeLens/);
  });

  /* The build's per-piece offset collapses to nothing with no build running: no piece is hidden and
     nothing is lifted, so the sticker loop behaves exactly as it did. */
  it('lifts and hides nothing when no build is running', () => {
    expect(canvas).toMatch(/const build = assembly\s*\?\s*assemblyPose\([^)]*\)\s*:\s*null;/);
    expect(canvas).toMatch(/if \(build && !build\.visible\) return null;/);
    expect(canvas).toMatch(/const buildRise = build \? build\.rise \* [^:]+: 0;/);
  });

  /* ⚠️ THE LENS IS THE ONE THING A TAKE CHANGES IN THE SCENE, so it has to put it back. Without the
     cleanup, filming once would leave every cake the baker designs afterwards on a different lens —
     and the proportions they approve would not be the proportions they were shown. */
  it('puts the lens back when the take ends', () => {
    const at = canvas.indexOf('function TakeLens(');
    expect(at, 'TakeLens should exist').toBeGreaterThan(-1);
    const body = canvas.slice(at, at + 2200);
    // The eased return is what a baker sees…
    expect(body).toMatch(/camera\.fov = lensAt\(/);
    expect(body).toMatch(/const to = active \? clampLens\(fov\) : was\.current;/);
    // …and the hard restore stays as the safety net for a teardown mid-glide. The lens a baker
    // designs on is a contract, so it is put back even when nobody watches it move.
    expect(body).toMatch(/was\.current = camera\.fov;/);
    expect(body).toMatch(/return \(\) => \{[\s\S]*?camera\.fov = was\.current;[\s\S]*?\};/);
    expect(body).toMatch(/updateProjectionMatrix\(\)/);
  });

  /* ⚠️ NO TAKE MAY TOUCH HOW THE CAKE LOOKS. A filmic key light or a tone-mapping tweak would make
     a better video and a dishonest one: the baker signs off a colour and the customer gets a cake.
     If a take ever needs a look of its own, it belongs in a take-only rig that is restored the way
     the lens is — not in these components. */
  it('never reaches for lighting, materials or tone mapping', () => {
    for (const name of ['TakeLens', 'SpinDirector', 'AssemblyDirector']) {
      const at = canvas.indexOf(`function ${name}(`);
      expect(at, `${name} should exist`).toBeGreaterThan(-1);
      const body = canvas.slice(at, at + 1400);
      for (const forbidden of [
        /\.material\b/, /toneMapping/, /environment\b/, /envMap/,
        /\bintensity\b/, /scene\.background/, /new THREE\.Color/,
      ]) {
        expect(body, `${name} must not touch ${forbidden}`).not.toMatch(forbidden);
      }
    }
  });

  /* ── The scope trap ────────────────────────────────────────────────────────────────────────────
   *
   * ⚠️ THIS SHIPPED, IN 0.1.770. `assembly` was declared as a prop of CakeCanvas and used in the
   * sticker loop — which lives in CakeContent, a DIFFERENT component 650 lines earlier that takes
   * only `config`, `scene` and `edit`. Every gate passed and the designer threw
   * "ReferenceError: assembly is not defined" on load, with a black screen and Try again.
   *
   * ⚠️ `check:bindings` CANNOT CATCH IT. It asks whether a NAME is declared anywhere in the file,
   * and `assembly` was — just not where it was used. That is the same shape as the OrbitControls
   * setters: a gate answering a slightly different question than the one that matters.
   *
   * ⚠️ WHAT DID CATCH IT IS `cakeContent.test.js` — "is GIVEN everything it passes", which walks the
   * whole CakeCanvas → CakeScene → CakeContent chain and is the real gate for a missing hop. Read it
   * before adding anything here. This suite only guards the part that is specific to a TAKE: that
   * the build travels in `edit` rather than as a prop, because that is what keeps it off the capture
   * path. The chain itself is that file's job, not this one's.
   */
  describe('the shared renderer can see what it uses', () => {
    const at = canvas.indexOf('function CakeContent(');
    const end = canvas.indexOf('export default function CakeCanvas');
    const body = canvas.slice(at, end);

    it('is a different component from CakeCanvas, with only three props', () => {
      expect(at).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(at);
      expect(canvas).toMatch(/function CakeContent\(\{ config, scene, edit = null \}\)/);
    });

    it('destructures everything its sticker loop uses', () => {
      // The loop really is in here, or this suite is guarding the wrong body.
      expect(body).toMatch(/stickers\.map\(\(sticker, pieceIndex\)/);
      for (const name of ['assembly', 'onSandClick', 'onGrassClick']) {
        const declared = new RegExp(`\\n\\s*${name},`).test(body.slice(0, body.indexOf('} = edit ?? {};')));
        expect(declared, `${name} must be read out of edit inside CakeContent`).toBe(true);
      }
    });

    /* ⚠️ AND IT MUST TRAVEL IN `edit`, not as a prop of CakeCanvas — `edit` is null on the capture
       path, which is what stops a thumbnail catching a half-built cake. Asserted on the `edit`
       literal CakeCanvas hands down, so moving it back out to a prop fails here. */
    it('sends the build through edit, so a capture never sees one', () => {
      const open = canvas.indexOf('edit={{');
      expect(open, 'CakeCanvas should hand CakeContent an edit literal').toBeGreaterThan(-1);
      const literal = canvas.slice(open, canvas.indexOf('}}', open));
      expect(literal).toMatch(/\n\s*assembly,/);
      // And NOT as a prop of CakeContent, which is the arrangement that crashed.
      expect(canvas).not.toMatch(/<CakeContent[\s\S]{0,400}?\n\s*assembly=/);
    });
  });

  /* ── The take ends ─────────────────────────────────────────────────────────────────────────────
   *
   * ⚠️ THIS SHIPPED TOO. AssemblyDirector finished with `if (onDone?.(t)) t0.current = null;`,
   * intending to stop the clock. Nulling the start time does not stop a clock, it REARMS one: the
   * next frame reads null as "not started", begins again at zero and calls `onTick(0)`, which puts
   * a build back on the canvas and keeps the director mounted to do it again. Sandeep, on an 11s
   * take: *"it finished faster and then started over again."* Reproduced at 18 seconds.
   *
   * A director must latch when it is done, not reset. Asserted on the source because the failure is
   * a race between a ref write and an unmount, which a render test does not see.
   */
  it('latches when a take is done instead of rewinding', () => {
    const at = canvas.indexOf('function AssemblyDirector(');
    expect(at, 'AssemblyDirector should exist').toBeGreaterThan(-1);
    const body = canvas.slice(at, at + 700);
    expect(body).toMatch(/const done = useRef\(false\);/);
    expect(body).toMatch(/if \(done\.current\) return;/);
    expect(body).toMatch(/if \(onDone\?\.\(t\)\) done\.current = true;/);
    // ⚠️ THE EXACT LINE THAT LOOPED, named so nobody writes it back.
    expect(body).not.toMatch(/onDone[\s\S]{0,40}t0\.current = null/);
  });

  /* ── The head start never reaches the recording ────────────────────────────────────────────────
   *
   * The delay exists so a baker can cross to a screen recorder: *"so the actual assembling video or
   * the spin video starts after selected number of seconds, this is useful in case of screen
   * recording."* Which means the count is the one piece of UI that is GUARANTEED to be on screen
   * while a recorder is rolling — and burned into the file if it survives into the take.
   *
   * ⚠️ IT IS CLEARED AND THE TAKE STARTED IN ONE COMMIT. React batches the two setStates, so the
   * render that first shows the take is the render that has already dropped the number. Asserted on
   * the source because the thing being protected is the ORDER of two statements.
   */
  describe('the head start', () => {
    const at = designer.indexOf('function armTake(');
    const body = designer.slice(at, at + 1400);

    it('exists and both takes go through it', () => {
      expect(at, 'armTake should exist').toBeGreaterThan(-1);
      expect(designer).toMatch(/armTake\(\(\) => \{ setLensReturning\(true\); setBuild\(0\); \}\)/);
      expect(designer).toMatch(/armTake\(\(\) => \{ setLensReturning\(true\); setFilmSpin\(true\); \}\)/);
      // ⚠️ AND NEITHER STARTS DIRECTLY ANY MORE, or the delay is simply skipped on that take.
      expect(designer).not.toMatch(/handleDeselect\(\);\s*\n\s*setBuild\(0\);/);
      expect(designer).not.toMatch(/handleDeselect\(\);\s*\n\s*setFilmSpin\(true\);/);
    });

    it('drops the count before it starts the take, not after', () => {
      /* The DELAYED start, not the no-delay early return above it — that one never shows a
         count at all, and matching it instead is how this test passed a wrong ordering. */
      const tick = body.indexOf('setInterval(');
      expect(tick, 'the delayed path should run on an interval').toBeGreaterThan(-1);
      const inTick = body.slice(tick);
      const cleared = inTick.indexOf('setCountdown(null)');
      const began = inTick.indexOf('begin();');
      expect(cleared, 'the count must be cleared on the final tick').toBeGreaterThan(-1);
      expect(began, 'the take must begin on the final tick').toBeGreaterThan(-1);
      expect(cleared, 'clear the count BEFORE beginning the take').toBeLessThan(began);
    });

    /* ⚠️ ASSERTED WITHOUT QUOTING THE COMPARISON. Writing the source line out verbatim put a bare
       `name <= 0` in this file, and `check:bindings` reads that shape as a read of an undeclared
       name — which is exactly what it is for, since such a comparison is silently false rather than
       loud. The gate is right to be crude there; the test can ask the same question differently. */
    it('starts immediately when no delay is asked for', () => {
      const early = body.slice(0, body.indexOf('setInterval('));
      expect(early).toContain('clampDelay');
      expect(early, 'the no-delay path must start the take and return').toMatch(/begin\(\);\s*return;/);
    });

    /* A take that is merely armed is not running, so nothing may be mounted for it yet — the lens
       included. Otherwise the recording opens on a lens that moved before the take did. */
    it('changes nothing in the scene while it counts', () => {
      /* ⚠️ `lensReturning` IS ARMED AT `begin`, NOT AT ARM TIME — so during the count it is still
         false, every take input is null, and the lens has not started moving. A countdown that
         began the zoom would put the move in the recording before the take. */
      expect(designer).toMatch(/takeLens=\{filmSpin \|\| build != null \|\| lensReturning \? takeLens : null\}/);
      expect(designer).toMatch(/spin=\{filmSpin \? spinPlan : null\}/);
      expect(designer).not.toMatch(/takeLens=\{[^}]*countdown/);
      const arm = designer.slice(designer.indexOf('function armTake('), designer.indexOf('function cancelArmedTake('));
      expect(arm, 'the lens must not be armed by the countdown itself').not.toMatch(/setLensReturning/);
    });

    it('is drawn over the canvas without swallowing a click', () => {
      const overlay = designer.slice(designer.indexOf('{countdown != null && ('), designer.indexOf('{countdown != null && (') + 700);
      expect(overlay).toMatch(/pointerEvents: 'none'/);
    });
  });

  /* The cream wheel owns autoRotate and must keep owning it — the spin briefly shared it, which is
     two things writing the camera every frame. */
  it('leaves the cream spin wheel alone', () => {
    expect(designer).toMatch(/autoRotate=\{creamAutoRotate\}/);
    expect(designer).not.toMatch(/autoRotate=\{creamAutoRotate \|\| /);
  });
});
