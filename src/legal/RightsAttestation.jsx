import React, { useEffect, useState } from 'react';

// ── Rights attestation (IP / copyright) ───────────────────────────────────────
// The confirmation a baker ticks when PUBLISHING content to a public surface — saving a design
// as a template, or adding a storefront gallery photo. Cake themes are overwhelmingly third-party
// IP (cartoon characters, films, clubs, brands); Spattoo is an intermediary and does not
// pre-screen, so liability sits with the baker who published (ToS 6.4 / B5.4-B5.6). This is where
// they take it on, and the API records who vouched for what (content_attestations).
//
// ONE component, used by BOTH publish surfaces (CakeDesigner's save-template modal and
// ThemePreview's gallery upload). It is deliberately not pasted per call site: the wording, the
// unticked default, and the "must be an affirmative act" rule are a single rule, so they live in
// a single unit. Adding a third publish surface means importing this — not copying it.
//
// NOT shown on upload. A customer sending their own photo to their baker is private and low-risk,
// and prompting every upload is friction with no legal payoff — the blanket ToS warranty accepted
// once at signup already covers it. Friction belongs at PUBLICATION, which is rare and deliberate.

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
