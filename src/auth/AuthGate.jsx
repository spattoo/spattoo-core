import { useState, useEffect } from 'react';

const BRAND = '#1a1a1a';
const BRAND_LIGHT = '#f5e6ec';
const FONT = "'Quicksand', sans-serif";

function Input({ label, type = 'text', value, onChange, disabled, placeholder }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#7a4a5a', fontFamily: FONT }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        style={{
          padding: '10px 12px',
          borderRadius: 8,
          border: '1.5px solid #e0cdd4',
          fontSize: 14,
          fontFamily: FONT,
          outline: 'none',
          background: disabled ? '#FAFAF8' : '#fff',
          color: '#3e2010',
        }}
      />
    </label>
  );
}

function Btn({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '11px 0',
        borderRadius: 8,
        border: 'none',
        background: BRAND,
        color: '#fff',
        fontFamily: FONT,
        fontWeight: 700,
        fontSize: 14,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        width: '100%',
      }}
    >
      {children}
    </button>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: BRAND_LIGHT, fontFamily: FONT,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{
        background: '#fff', borderRadius: 16, padding: '36px 32px',
        width: '100%', maxWidth: 380,
        boxShadow: '0 4px 24px rgba(26,26,26,0.12)',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: BRAND }}>{title}</h1>
          <p style={{ margin: 0, fontSize: 13, color: '#a07080' }}>{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

function Alert({ message, type }) {
  const styles = {
    error: { color: '#c0392b', background: '#FAFAF8' },
    info:  { color: '#2e7d52', background: '#edf7f1' },
  };
  return (
    <div style={{ fontSize: 13, borderRadius: 6, padding: '8px 12px', ...styles[type] }}>
      {message}
    </div>
  );
}

const linkStyle = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: BRAND, fontFamily: FONT, fontWeight: 600, fontSize: 12, padding: 0,
};

// ── Auth forms (login / forgot) ───────────────────────────────────────────────
function AuthForms({ supabase, noAccountError }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const reset = () => { setError(''); setInfo(''); };

  async function handleLogin() {
    setLoading(true); reset();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  }

  async function handleForgot() {
    setLoading(true); reset();
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) setError(error.message);
    else setInfo('Password reset email sent — check your inbox.');
    setLoading(false);
  }

  const titles    = { login: 'Welcome back',   forgot: 'Reset password' };
  const subtitles = { login: 'Sign in to manage your bakery', forgot: "We'll email you a reset link" };

  return (
    <Card title={titles[mode]} subtitle={subtitles[mode]}>
      <form onSubmit={e => { e.preventDefault(); mode === 'login' ? handleLogin() : handleForgot(); }}
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Input label="Email" type="email" value={email} onChange={setEmail} disabled={loading} />
        {mode !== 'forgot' && (
          <Input label="Password" type="password" value={password} onChange={setPassword} disabled={loading} />
        )}

        {noAccountError && mode === 'login' && !error && (
          <Alert message="No bakery account found. Contact your administrator." type="error" />
        )}
        {error && <Alert message={error} type="error" />}
        {info  && <Alert message={info}  type="info"  />}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {mode === 'login' && (
            <>
              <Btn onClick={handleLogin} disabled={loading || !email || !password}>
                {loading ? 'Signing in…' : 'Sign in'}
              </Btn>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => { setMode('forgot'); reset(); }} style={linkStyle}>Forgot password?</button>
              </div>
            </>
          )}
          {mode === 'forgot' && (
            <>
              <Btn onClick={handleForgot} disabled={loading || !email}>
                {loading ? 'Sending…' : 'Send reset link'}
              </Btn>
              <button type="button" onClick={() => { setMode('login'); reset(); }} style={{ ...linkStyle, textAlign: 'center' }}>
                Back to sign in
              </button>
            </>
          )}
        </div>
      </form>
    </Card>
  );
}


// ── AuthGate ──────────────────────────────────────────────────────────────────
export default function AuthGate({ supabase, children }) {
  const [session, setSession]     = useState(undefined); // undefined = loading
  const [contact, setContact]     = useState(undefined); // undefined = loading, null = not found
  const [checking, setChecking]   = useState(false);
  const [noAccountErr, setNoAccountErr] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s ?? null);
      if (!s) { setContact(undefined); setNoAccountErr(false); }
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  // Depend on user ID, not the full session, so token refreshes on tab re-focus don't re-run this and unmount the designer.
  useEffect(() => {
    if (!session) return;
    setChecking(true);
    supabase
      .from('baker_appusers')
      .select('id')
      .eq('auth_user_id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error('baker_appusers lookup failed:', error.message, error.code);
        if (!data) {
          setNoAccountErr(true);
          supabase.auth.signOut();
          return;
        }
        setContact(data);
        setChecking(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, supabase]);

  const isLoading = session === undefined || (session && (checking || contact === undefined));

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: BRAND_LIGHT }}>
        <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <div style={{ fontFamily: FONT, color: BRAND, fontSize: 15 }}>Loading…</div>
      </div>
    );
  }

  if (!session) return <AuthForms supabase={supabase} noAccountError={noAccountErr} />;

  return children;
}
