import { createRoot } from 'react-dom/client';
import VerifyStep from '../src/storefront/facets/VerifyStep.jsx';

// ── The gate a customer meets when a message sends them to their order ──────────────────────────
// `?named=1` is the happy path. WITHOUT it is the case that actually shipped broken: the settings
// read failed (unpublished storefront, 404, flaky network), both callers swallow that by design, and
// every line of this screen said "undefined".
//
// ⚠️ THE SAME GATE STANDS IN THREE DOORWAYS, and the words are only true in one of them. `?as=`
// picks which caller's copy to render, because "the baker will be in touch" is right at enquiry
// SUBMIT and a promise nobody made at the other two:
//
//   (none)       the enquiry — the baker really will call about the cake just sent
//   ?as=design   the designer door — nothing is sent yet, and this asks only because the designer
//                cannot work without a session
//   ?as=order    the order page — they arrived from a message to LOOK at an order that exists
const q = new URLSearchParams(location.search);
const BAKER = q.get('named') === '1' ? 'Feelings and Flavours' : undefined;
//
// ⚠️ AND TWO OF THE THREE ARE THE WHOLE PAGE. `standalone` is what turns this from a column of
// fields into a branded card on the baker's own ground — and, less visibly, what gives it a
// background at all. Without it the gate renders `wrap` on the host's black body, which is the bug
// this harness's <body> now reproduces. `?logo=1` stands in for a baker who has uploaded a mark.
const COPY = {
  design: {
    standalone: true,
    eyebrow: 'Cake designer',
    title: "Almost there — let's design your cake",
    lede: 'A quick code to open the designer. We only see your cake when you choose to send it.',
    submitLabel: 'Start designing',
  },
  order: {
    standalone: true,
    eyebrow: 'Your order',
    title: "Let's open your order",
    lede: "It's private, so we'll send you a quick code to check it's you.",
    submitLabel: 'View my order',
    // `onBack` lands on the shop front, which is not a cake and nowhere they have been.
    backLabel: 'Go to Feelings and Flavours',
    // The order already has a named customer — see the note on `askName` in VerifyStep.
    askName: false,
  },
}[q.get('as')] ?? {};

createRoot(document.getElementById('root')).render(
  <VerifyStep
    apiBaseUrl="https://api.spattoo.dev"
    slug="yellow-baker"
    bakerName={BAKER}
    logoUrl={q.get('logo') === '1' ? '/feelings-flavours-logo.png' : null}
    primary={q.get('primary') ? `#${q.get('primary')}` : '#2C4433'}
    channels={['sms', 'email']}
    {...COPY}
    onVerified={() => console.log('verified')}
    onBack={() => console.log('back')}
  />
);
