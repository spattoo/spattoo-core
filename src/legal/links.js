// Where the public legal documents live. The docs are served by the MARKETING site (one public
// /terms + /privacy URL — see spattoo-api docs/CONSENT_CAPTURE_PLAN.md §2: "the API owns the
// versions, marketing serves the one public page, the app links + records"). Core never carries a
// copy of the text, so it only ever needs the base URL.
//
// The HOST knows its real domain (spattoo-web derives MARKETING_URL from NEXT_PUBLIC_BASE_DOMAIN),
// so it is passed in as a prop; this is only the fallback for the standalone dev harness. Kept in
// ONE place so a second surface that links to the terms can't invent a different default.
export const DEFAULT_LEGAL_BASE = 'https://www.spattoo.com';
