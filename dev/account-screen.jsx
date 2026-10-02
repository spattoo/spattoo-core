/* ── Looking at the My Account screen ────────────────────────────────────────────────────────────
 *
 * The screen lives inside CakeDesigner, behind a baker sign-in, so there is no way to open it for a
 * look without credentials — the same wall decorFlyout.test.jsx hit, and the reason that file
 * settles for source assertions. This harness is the other half of the answer: it mounts THE panel,
 * imported from the designer, not a copy of it, and stands a fake apiClient behind it.
 *
 * ⚠️ THE STUB IS A STUB. It proves the screen, never the server. The real start/confirm pair is
 * spattoo-backend routes/account.js, and nothing here exercises an SMS, the owner-conflict check,
 * or migration 119's attempt ceiling.
 */
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { AccountPanel } from '../src/designer/CakeDesigner.jsx';

// The phone the fake server believes in, and the code it will accept.
const GOOD_CODE = '424242';

const stubApi = {
  signOut: () => console.log('[harness] signOut'),
  changePassword: async () => { await wait(400); },
  startPhoneChange: async (phone) => {
    await wait(500);
    if (/^\+?91?9{5}/.test(phone.replace(/\s/g, ''))) {
      const e = new Error('That phone number is already registered to another bakery.');
      e.code = 'owner_exists';
      throw e;                                  // the conflict the real route answers with a 409
    }
    return { to: '••••' + phone.replace(/\D/g, '').slice(-4), expiresIn: 600 };
  },
  confirmPhoneChange: async (code) => {
    await wait(400);
    if (code !== GOOD_CODE) throw new Error('That code is not right.');
    return { phone: '+91 90000 11111', country: 'IN' };
  },
};
const wait = ms => new Promise(r => setTimeout(r, ms));

function Harness() {
  const [open, setOpen] = useState(true);
  const user = { firstName: '31san', lastName: '31t', email: 'ashoky041981+31@gmail.com',
                 phone: '+91 98765 43210', canChangePhone: true };
  return (
    <>
      {/* So the harness is still usable after the panel is dismissed. */}
      {!open && (
        <button onClick={() => setOpen(true)}
                style={{ margin: 24, padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
                         border: '1.5px solid #C5D4C8', background: '#fff', fontWeight: 800 }}>
          Open My Account
        </button>
      )}
      {open && (
        <AccountPanel onClose={() => setOpen(false)} apiClient={stubApi} userData={user}
                      isMobile={window.innerWidth <= 640}
                      onPhoneChanged={() => console.log('[harness] profile re-read')} />
      )}
    </>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
