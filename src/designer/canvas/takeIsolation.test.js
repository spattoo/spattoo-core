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
    /* ⚠️ TWO PREDICATES, AND THE DIFFERENCE IS LOAD-BEARING. `filmingTake` is "a take is running";
       `takeWindow` adds the second or so while the lens glides back, which is still part of the
       shot. Unmounting TakeLens the moment the build ended is what made the return a jump. Pinned
       by their DEFINITIONS, so widening either one has to be deliberate. */
    expect(designer).toMatch(/const filmingTake = filmSpin \|\| build != null;/);
    expect(designer).toMatch(/const takeWindow = filmingTake \|\| lensReturning;/);
    expect(designer).toMatch(/takeLens=\{takeWindow \? takeLens : null\}/);
    expect(designer).toMatch(/takeLensActive=\{filmingTake\}/);
    expect(designer).toMatch(/onTakeLensReturned=\{\(\) => setLensReturning\(false\)\}/);
  });

  it('mounts no take machinery when it is handed nothing', () => {
    expect(canvas).toMatch(/\{spin && <SpinDirector/);
    expect(canvas).toMatch(/\{assembly && <AssemblyDirector/);
    expect(canvas).toMatch(/\{takeLens != null && \(\s*\n?\s*<TakeLens/);
  });

  /* ⚠️ ONE MECHANISM FOR EVERY PIECE, and that is what makes the rest of the cake able to fly at
     all. The pose used to be threaded into the two sticker components as four props, each applying
     it its own way — which is why piping, roses, gypsophila and writing sat still while the
     stickers flew. `BuildPiece` is the wrapper they all share now, so a renderer never has to know
     the take exists.

     With no build running `poseFor` returns null, BuildPiece renders a plain identity group, and
     the scene is exactly the tree it was before any of this existed. */
  it('lifts and hides nothing when no build is running', () => {
    const piece = readFileSync(new URL('./BuildPiece.jsx', import.meta.url), 'utf8');
    const body = strip(piece);
    expect(body).toMatch(/if \(pose && !pose\.visible\) return null;/);
    expect(body).toMatch(/if \(!pose\) return <group>\{children\}<\/group>;/);
    // ⚠️ ALWAYS A GROUP, even at rest: wrapping only during a take changes the tree shape at the
    // moment the take starts and remounts every GLB mid-shot.
    expect(body).not.toMatch(/return <>\{children\}<\/>/);
    // And the old per-component mechanism is gone, not merely unused.
    expect(canvas).not.toMatch(/buildRise/);
    expect(canvas).not.toMatch(/buildSwing/);
  });

  /* ⚠️ THE PIECES ARE MORE THAN THE STICKERS. Reported after four releases of a build that animated
     stickers alone: *"piping elements are not flying. also, few other things like roses in this
     image are not flying."* The roses in that picture ARE a piping ring, so both halves of that
     sentence were one omission. */
  it('counts the whole cake as pieces, not just the stickers', () => {
    const at = canvas.indexOf('const buildIds = useMemo(');
    expect(at, 'the piece list should exist').toBeGreaterThan(-1);
    const list = canvas.slice(at, canvas.indexOf('}, [', at));
    for (const family of ['top:', 'bot:', 'garnish:', 'topper:', 'age:', 'text:', 'sticker:', 'gyp:', 'grass:']) {
      expect(list, `${family} should be a build piece`).toContain(family);
    }
    // Piping is named first, because that is what a baker pipes first and `spread` deals them out
    // in this order.
    expect(list.indexOf('top:')).toBeLessThan(list.indexOf('sticker:'));
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
      expect(designer).toMatch(/takeLens=\{takeWindow \? takeLens : null\}/);
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

  /* ── The grid floor is scenery for filming, and nothing else ───────────────────────────────────
   *
   * Asked for by name — *"the grid lines for the canvas like in the marketing site? (only for the
   * video capture)"* — and that parenthesis is the requirement. A baker approves a colour against
   * the designer's own ground; graph paper under the cake changes what they are judging, and a
   * thumbnail with it in is not the cake they sold.
   */
  it('reaches the canvas only inside a take', () => {
    expect(designer).toMatch(/takeGrid=\{takeWindow && takeGrid\}/);
    expect(designer).toMatch(/takeGridWall=\{takeWindow && takeGridWall\}/);
    expect(canvas).toMatch(/\{takeGrid && <TakeGrid strength=\{takeGridStrength\} \/>\}/);
    expect(canvas).toMatch(/\{takeGridWall && <TakeGridWall strength=\{takeGridStrength\} \/>\}/);
  });

  /* ⚠️ THE HEADER RULE GOES TOO. *"the horizontal line below the baker name is disturbing. can we
     hide while capturing this video."* It defines the header row for somebody WORKING; in a
     recording it is a stray line across the top with nothing to explain it — the same fault the
     FRONT marker had when it was being burned into finished reels. */
  it('hides the header rule for the whole take', () => {
    expect(designer).toMatch(/\{!isMobile && !takeWindow && \(/);
  });

  /* ⚠️ THE BACKDROP IS PLACED FROM THE CAMERA EVERY FRAME. The spin take drives a full revolution;
     a wall fixed to one side of the scene would swing into the foreground halfway through. */
  it('keeps the backdrop behind the cake at every angle', () => {
    const at = canvas.indexOf('function TakeGridWall(');
    expect(at, 'TakeGridWall should exist').toBeGreaterThan(-1);
    const body = canvas.slice(at, at + 1400);
    expect(body).toMatch(/Math\.atan2\(camera\.position\.x, camera\.position\.z\)/);
    expect(body).toMatch(/lineBasicMaterial/);
    expect(body).toMatch(/depthWrite=\{false\}/);
  });

  /* ⚠️ RECORDING MOUNTS NOTHING UNLESS A FILE IS BEING WRITTEN, and the designer's ordinary frame
     loop gains nothing at all. */
  it('pumps capture frames only while saving a video', () => {
    expect(designer).toMatch(/onTakeFrame=\{buildSaving \? \(\(\) => takeFrame\.current\?\.\(\)\) : null\}/);
    expect(canvas).toMatch(/\{onTakeFrame && <TakeFramePump/);
  });

  /* ⚠️ UNLIT LINES, so it cannot light the cake, shadow it, or bounce a colour onto it. The rule a
     take must not break is kept by construction rather than by care. */
  it('cannot change how the cake looks', () => {
    const at = canvas.indexOf('function TakeGrid(');
    expect(at, 'TakeGrid should exist').toBeGreaterThan(-1);
    const body = canvas.slice(at, at + 1200);
    expect(body).toMatch(/lineBasicMaterial/);
    for (const forbidden of [/castShadow/, /receiveShadow/, /meshStandardMaterial/, /meshPhysicalMaterial/,
                             /\bintensity\b/, /toneMapping/, /envMap/]) {
      expect(body, `TakeGrid must not use ${forbidden}`).not.toMatch(forbidden);
    }
    // And it must not write depth, or it reintroduces the swallowed FRONT marker one element later.
    expect(body).toMatch(/depthWrite=\{false\}/);
  });

  /* ── Who may film a build ──────────────────────────────────────────────────────────────────────
   *
   * *"let this feature be available for only users with atleast blaze subscription. we have
   * watermark optio for reel capture. but this one strictly for blaze."*
   *
   * ⚠️ A GATE THAT QUIETLY OPENS IS A REVENUE BUG, and it opens by someone widening a condition
   * while fixing something else — which is exactly what happened to the header rule's predicate two
   * changes ago. Asserted on the condition itself, not on the menu item, because the condition is
   * the thing with a price on it.
   */
  it('offers the build only to Blaze, or to a catalogue author', () => {
    expect(designer).toMatch(/const canFilmBuild = isCatalogAuthor \|\| buildFilm;/);
    expect(designer).toMatch(/setBuildFilm\(res\?\.ent\?\.build_film === true\);/);
    // Defaults to locked: a failed entitlement lookup must not hand the feature out.
    expect(designer).toMatch(/const \[buildFilm,\s*setBuildFilm\]\s*=\s*useState\(false\);/);
    expect(designer).toMatch(/\{canFilmBuild && \(/);
  });

  /* ⚠️ NO WATERMARK RUNG, unlike the reel. The reel is given to every paid tier BECAUSE a
     watermarked one markets us; this one is the showpiece, so there is no cheaper version of it to
     fall back to. If a `build_film` watermark ever appears, this decision is what it overturns. */
  it('has no lesser version to fall back to', () => {
    expect(designer).not.toMatch(/buildFilm\s*\?\s*[^:]{0,80}:\s*[^;]{0,80}watermark/i);
  });

  /* ── The framing survives the lens ─────────────────────────────────────────────────────────────
   *
   * ⚠️ TWO OPPOSITE BUGS LIVE HERE, so both are pinned. Letting the fit run during a take made it
   * chase the decorations flying above the cake and the camera lurched mid-shot. Switching it off
   * made the narrowing lens a 1.54x magnification with nothing moving the camera to match, and the
   * board left the bottom of the frame — *"its cut the board from front. some board elements are
   * not visible."* Measured on the same take: with the fit off the board reached row 699 of 700;
   * holding the bounds instead it ends at 642.
   */
  it('holds the bounds during a take but still follows the lens', () => {
    expect(canvas).toMatch(/holdBounds=\{framingHeld\}/);
    // ⚠️ NOT `enabled={!framingHeld}` — that is the version that cropped the board.
    expect(canvas).not.toMatch(/enabled=\{!framingHeld\}/);
    const at = canvas.indexOf('function FitCakeToView(');
    const body = canvas.slice(at, at + 6000);
    // The fov is a reason to re-fit; its absence from this list is what cropped the board.
    expect(body).toMatch(/const fovMoved = [^;]*camera\.fov[^;]*;/);
    expect(body).toMatch(/if \(!cakeMoved && !aspectMoved && !fovMoved\) return;/);
    // And a lens move must not be glided on top of — TakeLens already eased it.
    expect(body).toMatch(/const glide = aspectMoved && !cakeMoved && !fovMoved;/);
    // The held branch reuses the last bounds rather than walking the cake again.
    expect(body).toMatch(/const heldBounds = holdBounds \? applied\.current : null;/);
  });

  /* The cream wheel owns autoRotate and must keep owning it — the spin briefly shared it, which is
     two things writing the camera every frame. */
  it('leaves the cream spin wheel alone', () => {
    expect(designer).toMatch(/autoRotate=\{creamAutoRotate\}/);
    expect(designer).not.toMatch(/autoRotate=\{creamAutoRotate \|\| /);
  });
});
