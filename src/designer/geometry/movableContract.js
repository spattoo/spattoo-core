import { describe, it, expect } from 'vitest';

// ── The contract every movable procedural decoration signs ──────────────────────────────────────
//
// Four decorations are dragged on the cake — the rainbow, the cloud, the number topper and cream
// writing — and in one week the first two broke in six different ways. Every one of them was a rule
// nobody had written down, so every one was found by a customer rather than by a test:
//
//   · the cloud moved on ONE axis, because the renderer skipped the yaw its selection box applied
//   · the cloud SHRANK as it was dragged toward the rim
//   · the rainbow's box turned about its own centre while the arch turned about the cake's axis,
//     so at any yaw the border was not where the rainbow was
//   · the rainbow's drag was DEAD over the middle 71% of the cake top, then leapt backwards
//   · the cloud could not be grabbed at all — nothing took the pointer but the cake
//   · three grab planes were single-sided, so they stopped being targets from behind
//
// None of those is exotic. They are the same four mistakes, and a decoration can be asked about
// them mechanically. That is what this is: a suite a decoration REGISTERS with, so the questions get
// asked once and then asked of everything that comes after.
//
// `scripts/check-movable.mjs` reads PROCEDURAL_TOOLS and fails the build if a movable tool has no
// registration here — which is the part that makes it stick. A rule you have to remember is a rule
// you will forget at 11pm on the sixth iteration of a shape.
//
// ── WHAT IT DOES NOT CHECK ──────────────────────────────────────────────────────────────────────
// Law 1 — "one place says where it is" — is the strongest of the five and is NOT enforced here,
// because it is a claim about the renderer and the selection box rather than about the geometry.
// The guard script greps for its two smells (a SelectionBox group carrying its own `rotation=`, a
// grab plane without DoubleSide) and that is all a grep can honestly do. Making it structural means
// geometry returning world-space points with nothing downstream free to add a transform, and the
// rainbow does not do that yet.
//
// ── HOW TO REGISTER ─────────────────────────────────────────────────────────────────────────────
//   movableContract('cloud', {
//     positionKeys: ['yaw', 'standoff', 'theta'],
//     cases: [{
//       label: 'on the cake top',
//       params: { ...CLOUD_DEFAULTS, surface: 'top' },
//       cake: CAKE,
//       freedoms: [
//         { label: 'round the cake', drag: (p, c, t) => cloudDragTo(p, c, t, 0.5),
//           targets: [0, 0.125, 0.25, 0.5, 0.75, 0.9] },
//       ],
//     }],
//     pointsOf: (p, c) => cloudPlacement(p, c).lobes.map(l => l.position),
//   });
//
// Everything except `positionKeys` and `cases` is optional, and each law is skipped — loudly, in
// the test name — when the decoration cannot answer it. A decoration that supplies nothing gets a
// suite that passes trivially, which is why the guard checks for the REGISTRATION and this checks
// what was registered.

const centroid = pts => {
  let x = 0, y = 0, z = 0;
  for (const p of pts) { x += p.x; y += p.y; z += p.z; }
  return [x / pts.length, y / pts.length, z / pts.length];
};

// How big the thing is, in a way that survives being MOVED.
//
// Not the axis-aligned bounding box, which was the first attempt and is wrong: turning an object
// changes its box without changing the object, so a rainbow dragged round the wall read as being
// resized. The root-mean-square distance from its own centre is invariant under any rigid motion —
// it can only change if the thing is genuinely scaled, stretched or reshaped, which is exactly the
// law. It also has no blind spot a box has: a stretch that keeps the box (rotate 90 and stretch)
// still moves the RMS.
const spread = pts => {
  const [cx, cy, cz] = centroid(pts);
  let sum = 0;
  for (const p of pts) {
    sum += (p.x - cx) ** 2 + (p.y - cy) ** 2 + (p.z - cz) ** 2;
  }
  return Math.sqrt(sum / pts.length);
};

export function movableContract(name, spec) {
  const { positionKeys, cases, pointsOf, roundTrip } = spec;

  describe(`${name} — the movable contract`, () => {
    for (const c of cases) {
      describe(c.label, () => {
        const after = patch => ({ ...c.params, ...patch });

        // ── Law: a drag REACHES everywhere it is offered ───────────────────────────────────────
        // A drag that returns nothing leaves the decoration where it was, and to the customer that
        // is "it is stuck". The rainbow's did exactly this over most of the cake.
        it('answers every target it is offered', () => {
          for (const f of c.freedoms) {
            for (const t of f.targets) {
              const patch = f.drag(c.params, c.cake, t);
              expect(patch, `${f.label} at ${JSON.stringify(t)}`).toBeTruthy();
              for (const v of Object.values(patch)) {
                expect(Number.isFinite(v) || typeof v === 'string', `${f.label} → ${v}`).toBe(true);
              }
            }
          }
        });

        // ── Law: a drag MOVES it, and writes nothing else ──────────────────────────────────────
        // Stated as data rather than as prose, so it holds for a decoration nobody has written yet.
        // A drag that writes `scale` is resizing something the customer asked to move.
        it('writes only position, never size or shape', () => {
          for (const f of c.freedoms) {
            for (const t of f.targets) {
              for (const k of Object.keys(f.drag(c.params, c.cake, t))) {
                expect(positionKeys, `${f.label} wrote ${k}`).toContain(k);
              }
            }
          }
        });

        // ── Law: no freedom is DEAD ────────────────────────────────────────────────────────────
        // The rainbow's radial drag solved hypot(centerX, standoff) = v·R, and the arch's own centre
        // already stood 0.71 of the radius out — so every v below that had no solution and rested at
        // zero. Sweeping it produced the same answer over and over. That is the shape of the bug,
        // and this is that shape as an assertion: a declared freedom must actually vary the result.
        //
        // A freedom that genuinely should not move the thing is not a freedom — do not declare it.
        it('moves it for every freedom it declares', () => {
          for (const f of c.freedoms) {
            const seen = new Set(f.targets.map(t =>
              JSON.stringify(f.drag(c.params, c.cake, t))));
            expect(seen.size, `${f.label} collapsed ${f.targets.length} targets to ${seen.size}`)
              .toBe(f.targets.length);
          }
        });

        if (!pointsOf) {
          it.skip('holds its size and shape while it moves (no pointsOf supplied)', () => {});
          it.skip('actually goes somewhere (no pointsOf supplied)', () => {});
        } else {
          // ── Law: a drag never resizes or reshapes ────────────────────────────────────────────
          // The cloud shrank as it was dragged toward the rim, on a fit solved so nothing overhung.
          // Nobody asked for it, and there is a size control. Position and size are separate, and
          // neither one moves the other.
          it('holds its size and shape while it moves', () => {
            const at0 = spread(pointsOf(c.params, c.cake));
            for (const f of c.freedoms) {
              for (const t of f.targets) {
                const s = spread(pointsOf(after(f.drag(c.params, c.cake, t)), c.cake));
                expect(s, `${f.label} at ${JSON.stringify(t)}`).toBeCloseTo(at0, 6);
              }
            }
          });

          // The other half of "no dead freedom": the PARAMS differing is not enough if the geometry
          // ignores them. This asks the object itself where it ended up.
          it('actually goes somewhere', () => {
            for (const f of c.freedoms) {
              const seen = new Set(f.targets.map(t =>
                centroid(pointsOf(after(f.drag(c.params, c.cake, t)), c.cake))
                  .map(v => v.toFixed(6)).join()));
              expect(seen.size, `${f.label} did not move the geometry`).toBe(f.targets.length);
            }
          });
        }

        // ── Law: where it says it is, is where a drag would put it ─────────────────────────────
        // Only for decorations with a handle: the two are halves of one map, and a handle that
        // reports somewhere a drag cannot reach is the same drift that detached the cloud's
        // selection box from the cloud.
        if (!roundTrip) {
          it.skip('reports the position a drag put it in (no round trip supplied)', () => {});
        } else {
          it('reports the position a drag put it in', () => {
            for (const f of c.freedoms) {
              for (const t of f.targets) {
                const moved = after(f.drag(c.params, c.cake, t));
                roundTrip(moved, c.cake, t, f);
              }
            }
          });
        }
      });
    }
  });
}
