# CI/CD Pipeline Plan — designer → web → mobile

> Status: DRAFT (direction converged 2026-06-28; open decisions in §9)
> Scope: how a `spattoo-core` (`@spattoo/designer`) change reaches the deployed web apps and
> the mobile apps, automatically, deterministically, and without staleness or double-deploys.
> Related: [ASSET_OPTIMIZATION_PLAN.md](./ASSET_OPTIMIZATION_PLAN.md), [AR_PREVIEW_PLAN.md](./AR_PREVIEW_PLAN.md)

## 1. The problem we hit

A designer fix (`spattoo-core/src/designer/CakeDesigner.jsx`) was committed and pushed to
`origin/dev`, but **did not appear on the deployed dev site.** Root cause:

- `@spattoo/designer` is a Vite **library** consumed as a **built bundle** (`dist/`), and `dist`
  is **gitignored**.
- The deployed app (`spattoo-web/apps/app`) installs the designer from a **vendored tarball**
  checked into `spattoo-web/vendor/spattoo-designer-0.1.8.tgz` — not from core's git, not from
  npm. The tarball was stale (built before the fix).
- `spattoo-admin` consumes core via `file:../spattoo-core` (auto-fresh in local dev — not a
  problem there). **Only the deployed `spattoo-web/apps/app` goes stale.**

So: pushing source to core's git has **zero effect** on the deployed site. The whole pipeline
question is "how does core's build reach web's deploy, automatically."

## 2. Deploy topology (the constraint that shapes everything)

`spattoo-web` is an **npm-workspaces monorepo** (`apps/marketing`, `apps/app`) on **Vercel**.
Vercel **auto-deploys on git push to the repo, path-filtered by which folder changed** — a push
touching `apps/app` deploys the baker app; `apps/marketing` deploys marketing.

**Key consequence:** publishing a package to a registry does **not**, by itself, trigger a
Vercel deploy. Vercel deploys on **git events** (or on an explicit CLI/API/Deploy-Hook call). So
every automation has **two halves**:

1. **Produce** the new designer build somewhere web can consume it.
2. **Trigger** a deploy of `apps/app`.

Half 2 is the one people forget — a floating semver range alone won't redeploy, because the
lockfile pins an exact version and no `apps/app` file changes.

## 3. Options considered (and why we're moving off the default)

| Option | Produce | Trigger | Verdict |
|---|---|---|---|
| **A. Local release script** | build+pack locally → vendor into web | manual web commit | Good stopgap; manual, machine-coupled, blob-in-git |
| **B. Git dependency + prepare hook** | web depends on `core#dev`, builds on install | web deploy | Heavy installs, non-deterministic branch refs |
| **C. Registry + cross-repo bump commit** | publish to GitHub Packages | CI commits version bump to web → Vercel | Clean, but the bump commit is a *second* commit → **double deploy** + transient mismatch window |
| **D. Auto-vendor commit** | CI packs tgz, commits to web/vendor | that commit | No registry, but **commits a ~1 MB binary to web git history** on every change |

Two real objections killed C and D as-is:

- **Double deploy / mismatch window (C):** if `apps/app` changes *and* the designer changes, you
  get two Vercel deploys — your apps-change deploy (built against the *old* designer) finishes
  first, leaving the live site running **new app code against stale designer** until the second
  deploy lands.
- **Binary-in-git bloat (D):** committing a ~1 MB tarball into `spattoo-web` on every designer
  change bloats history unboundedly — counter to "think long-term."

## 4. The decided direction: CI **pushes** to Vercel (decouple build from git-as-trigger)

Vercel does not have to be the thing watching git. Flip it to a **push model**:

```
vercel pull   --environment=preview   # fetch project settings + env into .vercel
vercel build                          # build in CI → .vercel/output
vercel deploy --prebuilt              # upload the prebuilt output, create the deployment
```

**Turn OFF Vercel's automatic git deploys for the baker-app project, and funnel ALL app deploys
through ONE GitHub Actions workflow.** This single change dissolves both objections:

- **Double-deploy dies at the root.** Every deploy — whether triggered by an `apps/app` push or a
  designer change — goes through the *same* workflow. A `concurrency:` group **cancels the older
  run**, so "both changed" collapses to exactly one deploy containing both. No mismatch window.
- **No blob in git.** CI controls the build, so the designer is fetched at build time (§5), never
  committed. `spattoo-web/vendor/*.tgz` is retired.
- **Registry-publish can now drive a deploy** (the thing it couldn't do under §2): core's CI
  explicitly triggers web's deploy workflow.

Marketing keeps its own trigger/path and is unaffected.

### Target shape

```
core push to dev ─► [core CI] build + publish/version ─► repository_dispatch ─┐
                                                                              ▼
apps/app push to dev ──────────────────────────────────────► [web deploy.yml]
                                                              concurrency: app-dev  (cancel-in-progress)
                                                              fetch designer@<ver>
                                                              vercel pull / build / deploy --prebuilt
                                                                              │
                                                                              ▼
                                                                        Vercel (ONE deploy)
```

## 5. Where CI gets the designer (the one open sub-decision)

CI needs the designer artifact at build time. Two clean ways, both blob-free:

- **C′. From GitHub Packages (recommended).** Core CI on `dev` push: build → bump prerelease
  version → publish `@spattoo/designer` to GitHub Packages (private). Web deploy workflow installs
  the version (passed in the dispatch payload for determinism), builds, pushes to Vercel.
  - Cost: **~$0** at our scale (private-package quota: 500 MB storage / 1 GB transfer free;
    transfer *into* Actions is free; only Vercel's pull counts, ~1 MB/deploy). Setup: `.npmrc`
    scoping `@spattoo` → `npm.pkg.github.com`, an `NPM_TOKEN` in CI/Vercel, a publish PAT.
  - Pros: fast deploys (no per-deploy core rebuild), clean git, deterministic (version-pinned),
    and `spattoo-admin` can later consume the same registry instead of `file:` link.
- **C″. Build core from source in CI (registry-free).** Web deploy workflow checks out
  `spattoo-core`, builds + packs it *in the runner*, installs the tarball into the app build,
  deploys. Tarball exists only transiently in CI.
  - Pros: no registry. Cons: every deploy rebuilds the designer (slower), needs a core-checkout
    token. Determinism via the checked-out SHA.

**Recommendation: C′ (registry).** Faster, cleaner, scales to admin. C″ only if we want zero
registry services.

## 6. Asset optimization is a pipeline stage (cross-ref)

Per [ASSET_OPTIMIZATION_PLAN.md](./ASSET_OPTIMIZATION_PLAN.md):

- **Ingest optimizer** (api BullMQ worker) runs on element upload — Draco + KTX2 + mobile/desktop
  variants + LOD → R2. This is its own pipeline, triggered by admin authoring, **not** by the
  web deploy. Keep them separate.
- **`check:assets` CI gate** (mirrors existing `check:paths`/`check:schema`): fail the build if a
  referenced element variant exceeds the §3 caps. Wire into `npm run verify`.

## 6a. Browser-target floor — Safari 15 (build guardrail)

**Lesson (2026-06-28):** three/drei ship ES2022 class `static {}` blocks; Next does **not**
transpile `node_modules` by default, so both the marketing hero **and** the customer storefront
went **blank on Safari 15.6.1** (`Unexpected token '{'`, the client-only 3D chunk failing to
parse) — exactly India's older-iOS profile (the Floor B device in the optimization plan). Fixed by
pinning a Safari-15 transpile floor; this section keeps it from regressing.

Standing guardrail:
- Both Next apps pin a **`browserslist` floor of `safari >= 15` / `ios_saf >= 15`** and list the
  3D libs in **`transpilePackages`** (`three`, `@react-three/fiber`, `@react-three/drei`). These
  are **externalized** by `@spattoo/designer`'s Vite lib build, so they arrive raw from
  `node_modules` and must be transpiled by the **consuming** app, not core. `apps/app` also
  transpiles `@spattoo/designer`.
- **CI check (proposed) `check:browser-target`:** grep the production chunks for un-transpiled
  modern syntax (e.g. class `static {}`) and **fail the build** — so a future dependency bump
  can't silently reintroduce syntax Safari 15 can't parse. Verify on a real Safari-15 device (or
  the Floor B test matrix in [ASSET_OPTIMIZATION_PLAN.md](./ASSET_OPTIMIZATION_PLAN.md)) before
  release.
- **Keep this floor in lockstep with the optimization plan's device floor** — if Floor B moves,
  move the browserslist floor with it.

## 7. Mobile / native track (separate, infrequent)

This is a **second, independent pipeline** — and the split is the whole point.

- **Customers → PWA, no native pipeline.** The `{slug}.spattoo.*` storefront is the mobile
  experience; add a manifest + service worker. The web pipeline (§4) covers customers entirely.
  Per-tenant native apps don't scale (25k bakers ≠ 25k store listings).
- **Baker app → ONE native app** (Capacitor WebView shell wrapping the same web build), only if
  we want true-native features (push, camera). Multi-tenant via login.

**Why the designer cadence stays fast:** the WebView loads the **deployed web URL**, so designer
changes reach phones the instant Vercel deploys — **with no app-store review.** Only the **native
shell** (nav, push, camera, store presence) goes through the store pipeline, and it changes
rarely.

Native pipeline (runs only on shell changes, NOT on designer tweaks):
- **Tooling:** Capacitor (wrap web app) + Fastlane, or Expo/EAS (`eas build` / `eas submit` /
  `eas update` for OTA).
- **CI reality:** Android builds on Linux runners; **iOS needs macOS runners + Apple signing
  certs/provisioning** (the genuinely new, fiddly infra).
- **App Store Guideline 4.2:** a pure WebView wrapper risks rejection — needs genuine native value
  (push, camera). See the camera/AR features in [AR_PREVIEW_PLAN.md](./AR_PREVIEW_PLAN.md) and the
  baker-app feature brainstorm. Heaviness note: stores don't reject for "heavy," but **OOM crashes
  on the reviewer's device do** — bounded by the optimization plan; and **never bundle the GLB
  library in the binary** (keeps install small + closes the size-based rejection vectors).

## 8. Secrets / settings to provision (one-time)

- **Vercel:** project IDs (app), `VERCEL_TOKEN` in GitHub secrets; **disable Git auto-deploy** for
  the app project; `NPM_TOKEN` env var (if C′) for `.npmrc` auth.
- **GitHub Packages (if C′):** a publish PAT (`write:packages`) for core CI; a read PAT
  (`read:packages`) for web CI/Vercel; `.npmrc` scoping `@spattoo`.
- **Cross-repo dispatch:** a PAT allowing core CI to `repository_dispatch` to `spattoo-web`.
- **Mobile (when built):** Apple signing certs/provisioning, Play service-account JSON, EAS token.

## 9. Open decisions

1. **§5 designer source:** C′ registry (recommended) vs C″ build-from-source-in-CI.
2. **When to build this:** ship the **local release script (Option A)** now as a stopgap to end
   the staleness immediately, then build the CI-push pipeline? Or go straight to §4.
3. **PWA scope/timing:** add manifest + service worker to the storefront now (cheap, no new CI)?
4. **Native app go/no-go + tooling:** Capacitor vs Expo/EAS, and which native features justify a
   binary (gates the iOS-signing investment).
