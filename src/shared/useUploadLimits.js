import { useEffect, useState } from 'react';
import { MAX_IMAGE_BYTES } from './image.js';

// ── The upload size ceiling, as the SERVER currently has it ──────────────────────────────────────
// The limit is config (env `UPLOAD_MAX_IMAGE_MB` on the API), so it can be retuned in the Render
// dashboard without a deploy. That is only true if the browser READS it rather than carrying a copy: a
// hardcoded client would go on accepting files the API then 413s, and the user would sit through an
// upload that was never going to be kept. So there is exactly ONE number, and this is how the client
// learns it.
//
// Cached per apiClient for the life of the page — the limit does not change mid-session, and every
// upload surface (Uploads panel, order photos, …) asks for it. `MAX_IMAGE_BYTES` is the fallback while
// the fetch is in flight, or if the host hasn't wired `fetchUploadLimits` at all: a limit that fails
// OPEN would be no limit, so the fallback is the API's own default, never Infinity.
const cache = new WeakMap();

function load(apiClient) {
  if (!apiClient?.fetchUploadLimits) return Promise.resolve(null);
  if (!cache.has(apiClient)) {
    cache.set(apiClient, apiClient.fetchUploadLimits().catch(() => null));
  }
  return cache.get(apiClient);
}

export function useUploadLimits(apiClient) {
  const [maxImageBytes, setMaxImageBytes] = useState(MAX_IMAGE_BYTES);

  useEffect(() => {
    let alive = true;
    load(apiClient).then(limits => {
      if (alive && Number.isInteger(limits?.imageBytes) && limits.imageBytes > 0) {
        setMaxImageBytes(limits.imageBytes);
      }
    });
    return () => { alive = false; };
  }, [apiClient]);

  return { maxImageBytes };
}
