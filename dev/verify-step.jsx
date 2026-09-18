import { createRoot } from 'react-dom/client';
import VerifyStep from '../src/storefront/facets/VerifyStep.jsx';

// ── The gate a customer meets when a message sends them to their order ──────────────────────────
// `?named=1` is the happy path. WITHOUT it is the case that actually shipped broken: the settings
// read failed (unpublished storefront, 404, flaky network), both callers swallow that by design, and
// every line of this screen said "undefined".
const q = new URLSearchParams(location.search);
createRoot(document.getElementById('root')).render(
  <VerifyStep
    apiBaseUrl="https://api.spattoo.dev"
    slug="yellow-baker"
    bakerName={q.get('named') === '1' ? 'Feelings and Flavours' : undefined}
    primary="#2C4433"
    channels={['sms', 'email']}
    onVerified={() => console.log('verified')}
    onBack={() => console.log('back')}
  />
);
