#!/usr/bin/env bash
# The HDRIs the glare sweep compares, fetched to where vite can serve them same-origin.
#
# ⚠️ NOT A CONVENIENCE — the CDN's CORS allowlist holds `app.spattoo.com` and `localhost:3000`, and
# the harness runs on 5190. A WebGL texture load with no `access-control-allow-origin` fails, and
# SafeEnvironment swallows the failure, so measuring against the CDN silently measured no
# environment at all. These are the same bytes production fetches.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/_local/env
for f in lebombo_256 lebombo_512 lebombo_1k; do
  [ -s "public/_local/env/$f.hdr" ] && continue
  curl -fsS -o "public/_local/env/$f.hdr" "https://dev.spattoocdn.com/code/env/$f.hdr"
  echo "fetched $f"
done
