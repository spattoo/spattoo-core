# Bundled fonts

## NotoSans-Regular.woff

**Why it's here (SEC-WEB-7).** `troika-three-text` — the renderer behind drei's `<Text>` —
resolves a font at runtime when no `font` prop is given, fetching both its index data and the
actual font file from **`cdn.jsdelivr.net`** (`unicode-font-resolver`). That put a third-party
CDN on the designer's critical path: an origin in the CSP's `connect-src`/`font-src`, a runtime
dependency on someone else's uptime for 3D text, and a request that leaks the visitor's IP to a
third party on every storefront visit.

This is **the exact file troika was already downloading** —
`unicode-font-resolver@v1.0.1/packages/data/font-files/latin/sans-serif.normal.400.woff`,
which is Noto Sans Regular — so bundling it changes **nothing visually**. It is not a font
choice; it is the same font, served from our own bundle instead of a CDN.

- SHA-256: `f7f64a47de4b18ea368a75e3ee3d03ba1a9d6853c238cf7160816e25f45a7cb7`
- Size: 18,216 bytes (inlined as a `data:` URI by Vite's `?inline`, so it needs **no** origin at
  all — `font-src data:` already covers it, and there is no extra network request).

**Licence.** Noto Sans is licensed under the SIL Open Font License 1.1 — see `OFL.txt` in this
directory, which must ship alongside the font. OFL permits redistribution and bundling; it
requires the licence notice to travel with the font, and forbids selling the font on its own.

**Before replacing or removing this,** note that dropping it sends `<Text>` straight back to
jsdelivr — and remember that the resulting failure is invisible in the console, because troika
does its fetching inside a Web Worker (see the CSP notes in
`spattoo-docs/deployment/production-rollout.md` §5). Verify by watching the **network log**.
