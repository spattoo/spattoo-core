import { describe, it, expect } from 'vitest';
import { captchaVisible, resendAction } from './useOtp.js';

/* WHY THIS EXISTS. The captcha appeared twice on the storefront: once on load, and again on the code
 * screen after the send. It is ONE widget — the send spends its single-use Turnstile token, the reset
 * re-challenges, and the widget is rendered outside the step branch (deliberately, so a remount
 * cannot discard a token the resend needs), so the new challenge lands where nothing needs it.
 *
 * Neither rule below can be checked anywhere else: vitest runs environment:'node' (no jsdom, no
 * @testing-library), and the harness passes captchaSiteKey={null} with no site key on the machine, so
 * a real widget never renders. These assertions are the whole safety net. */

describe('captchaVisible', () => {
  it('shows it while the contact is being entered', () => {
    expect(captchaVisible('start', false)).toBe(true);
  });

  it('hides it on the code step — the only job there is typing six digits', () => {
    expect(captchaVisible('code', false)).toBe(false);
  });

  it('shows it again once a resend has been asked for', () => {
    expect(captchaVisible('code', true)).toBe(true);
  });

  it('stays visible on the start step regardless', () => {
    expect(captchaVisible('start', true)).toBe(true);
  });
});

describe('resendAction', () => {
  /* ⚠️ The case that matters. Without the reveal, Resend is gated by sendBlocked on a token the reset
     just cleared, with the widget hidden — a permanently dead button, exactly where someone is
     already waiting for a code that did not arrive. */
  it('reveals the captcha when one is configured and no token is held', () => {
    expect(resendAction(true, null)).toBe('reveal');
  });

  it('sends once a fresh token has been solved', () => {
    expect(resendAction(true, 'fresh-token')).toBe('send');
  });

  it('sends straight away when no captcha is configured', () => {
    expect(resendAction(false, null)).toBe('send');
    expect(resendAction(false, 'anything')).toBe('send');
  });

  it('treats an empty-string token as no token, not as solved', () => {
    expect(resendAction(true, '')).toBe('reveal');
  });
});
