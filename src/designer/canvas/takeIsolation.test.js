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
    expect(designer).toMatch(/takeLens=\{filmSpin \|\| build != null \? takeLens : null\}/);
  });

  it('mounts no take machinery when it is handed nothing', () => {
    expect(canvas).toMatch(/\{spin && <SpinDirector/);
    expect(canvas).toMatch(/\{assembly && <AssemblyDirector/);
    expect(canvas).toMatch(/\{takeLens != null && <TakeLens/);
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
    const body = canvas.slice(at, at + 700);
    expect(body).toMatch(/const was = camera\.fov;/);
    expect(body).toMatch(/return \(\) => \{[\s\S]*?camera\.fov = was;[\s\S]*?\};/);
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

  /* The cream wheel owns autoRotate and must keep owning it — the spin briefly shared it, which is
     two things writing the camera every frame. */
  it('leaves the cream spin wheel alone', () => {
    expect(designer).toMatch(/autoRotate=\{creamAutoRotate\}/);
    expect(designer).not.toMatch(/autoRotate=\{creamAutoRotate \|\| /);
  });
});
