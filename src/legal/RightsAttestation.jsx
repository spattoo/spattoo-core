import React, { useEffect, useState } from 'react';

// ── Rights attestation (IP / copyright) ───────────────────────────────────────
// The confirmation a baker ticks when they PUBLISH their storefront. Cake themes are overwhelmingly
// third-party IP (cartoon characters, films, clubs, brands); Spattoo is an intermediary and does not
// pre-screen, so liability sits with the baker who published (ToS 6.4/6.5, B5.4-B5.6). This is where
// they take it on, and the API records who vouched (content_attestations).
//
// ASKED EXACTLY ONCE PER PUBLISH — nowhere else. Storefront publish is the ONLY moment content
// becomes visible to the world: until then GET /api/storefront/:slug 404s, so templates, gallery
// photos and the hero are all still baker<->customer, and the ToS already puts those on the baker.
// It is deliberately NOT on "Save as Template" (that is the baker's design library — they save
// constantly) nor on photo upload: a tick clicked fifty times becomes reflex, and a habituated tick
// is WEAK evidence. The value of an attestation is that it was considered.
//
// Kept as its own component rather than inlined at the call site so that when a SECOND public
// surface appears (a custom domain, a marketplace listing), it reuses this wording and this
// unticked-by-default rule instead of growing a second, drifting copy.

// Shown while the published statement loads, and if it can't be fetched. The RECORDED evidence is
// always the server's current published version (the API resolves it itself and refuses to publish
// if none exists) — this string is only ever what the baker READS, never what is stored.
const FALLBACK_STATEMENT =
  'I have the right to publish this. Licensed characters, film and TV themes, and brand logos ' +
  'need permission from the rights holder.';

export default function RightsAttestation({ apiClient, checked, onChange, primaryColor = '#d81b60', disabled = false }) {
  const [statement, setStatement] = useState(null);

  // The exact sentence the baker is affirming, as currently published + hashed server-side, so the
  // consent record and the UI can never drift apart. Null until loaded → fall back to the default.
  useEffect(() => {
    let alive = true;
    if (!apiClient?.fetchAttestationStatement) return undefined;
    apiClient.fetchAttestationStatement()
      .then(doc => { if (alive && doc?.content) setStatement(doc.content.trim()); })
      .catch(() => {});
    return () => { alive = false; };
  }, [apiClient]);

  return (
    <label
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
      }}
    >
      {/* Unticked by default and never pre-ticked — an attestation is only worth something if it
          was an affirmative act by the baker. */}
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        style={{ marginTop: 2, accentColor: primaryColor, width: 15, height: 15, flexShrink: 0, cursor: 'inherit' }}
      />
      <span style={{ fontSize: 11.5, lineHeight: 1.45, color: '#777', fontFamily: "'Quicksand',sans-serif" }}>
        {statement ?? FALLBACK_STATEMENT}
      </span>
    </label>
  );
}
