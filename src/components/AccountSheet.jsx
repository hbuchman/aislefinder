import React, { useState } from 'react';
import Sheet from './Sheet';

const inputStyle = {
  width: '100%',
  padding: '11px 12px',
  border: '2px solid var(--af-input-border)',
  borderRadius: '10px',
  fontSize: '15px',
  backgroundColor: 'var(--af-inset-bg)',
  color: 'var(--af-text)',
  outline: 'none',
  boxSizing: 'border-box',
  marginBottom: '10px',
  fontFamily: 'inherit',
};

// mode: 'signin' | 'signup' | 'confirm'
const AccountSheet = ({ open, onClose, auth, toast }) => {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setMode('signin');
    setPassword('');
    setCode('');
    setError('');
    setBusy(false);
  };

  const close = () => { reset(); onClose(); };

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const handleSignIn = () => run(async () => {
    await auth.signIn(email.trim(), password);
    toast('Signed in — your lists will now sync');
    close();
  });

  const handleSignUp = () => run(async () => {
    await auth.signUp(email.trim(), password);
    setMode('confirm');
  });

  const handleConfirm = () => run(async () => {
    await auth.confirmSignUp(email.trim(), code.trim());
    await auth.signIn(email.trim(), password);
    toast('Account created and signed in');
    close();
  });

  return (
    <Sheet open={open} onClose={close}>
      {auth.user ? (
        <>
          <h3 style={{ margin: '0 0 4px', fontSize: '18px' }}>
            <i className="fa-solid fa-circle-user" style={{ marginRight: '8px', color: 'var(--af-focus)' }} />
            {auth.user.displayName}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--af-text-muted)', margin: '0 0 16px' }}>
            {auth.user.email} — your lists sync across devices and can be shared.
          </p>
          <button
            className="af-btn-ghost"
            onClick={() => { auth.signOut(); toast('Signed out — back to guest mode'); close(); }}
          >
            <i className="fa-solid fa-right-from-bracket" style={{ marginRight: '8px' }} />
            Sign out
          </button>
        </>
      ) : !auth.authConfigured ? (
        <>
          <h3 style={{ margin: '0 0 4px', fontSize: '18px' }}>You're in guest mode</h3>
          <p style={{ fontSize: '13px', color: 'var(--af-text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
            Everything works and stays on this device. Accounts aren't configured in this
            build yet (missing Cognito settings) — see infra/README.md to enable sign-in,
            syncing, and sharing.
          </p>
          <button className="af-btn-ghost" onClick={close}>Continue as guest</button>
        </>
      ) : (
        <>
          <h3 style={{ margin: '0 0 4px', fontSize: '18px' }}>
            {mode === 'confirm' ? 'Check your email' : "You're in guest mode"}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--af-text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
            {mode === 'confirm'
              ? `We sent a verification code to ${email}. Enter it below to finish creating your account.`
              : 'Everything works and stays on this device. Create a free account to sync lists across devices, share with others, and keep your history safe.'}
          </p>

          {mode !== 'confirm' && (
            <>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="af-input"
                style={inputStyle}
              />
              <input
                type="password"
                placeholder={mode === 'signup' ? 'Choose a password (8+ characters)' : 'Password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') (mode === 'signin' ? handleSignIn : handleSignUp)(); }}
                className="af-input"
                style={inputStyle}
              />
            </>
          )}

          {mode === 'confirm' && (
            <input
              type="text"
              inputMode="numeric"
              placeholder="Verification code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
              className="af-input"
              style={inputStyle}
            />
          )}

          {error && (
            <div style={{
              backgroundColor: 'var(--af-error-bg)',
              border: '1px solid var(--af-error-border)',
              color: 'var(--af-error-text)',
              borderRadius: '8px',
              padding: '8px 10px',
              fontSize: '12px',
              marginBottom: '10px',
            }}>
              {error}
            </div>
          )}

          {mode === 'signin' && (
            <>
              <button className="af-btn-primary" disabled={busy || !email || !password} onClick={handleSignIn}>
                <i className="fa-solid fa-right-to-bracket" style={{ marginRight: '8px' }} />
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
              <button className="af-btn-ghost" onClick={() => { setMode('signup'); setError(''); }}>
                New here? Create an account
              </button>
            </>
          )}
          {mode === 'signup' && (
            <>
              <button className="af-btn-primary" disabled={busy || !email || !password} onClick={handleSignUp}>
                <i className="fa-solid fa-user-plus" style={{ marginRight: '8px' }} />
                {busy ? 'Creating…' : 'Create account'}
              </button>
              <button className="af-btn-ghost" onClick={() => { setMode('signin'); setError(''); }}>
                Already have an account? Sign in
              </button>
            </>
          )}
          {mode === 'confirm' && (
            <button className="af-btn-primary" disabled={busy || !code} onClick={handleConfirm}>
              <i className="fa-solid fa-check" style={{ marginRight: '8px' }} />
              {busy ? 'Verifying…' : 'Verify and sign in'}
            </button>
          )}
          <button className="af-btn-ghost" style={{ border: 'none' }} onClick={close}>
            Continue as guest
          </button>
        </>
      )}

      <div style={{
        borderTop: '1px solid var(--af-border)',
        marginTop: '14px',
        paddingTop: '12px',
        display: 'flex',
        justifyContent: 'center',
        gap: '14px',
        fontSize: '11px',
      }}>
        <a
          href="https://www.paypal.com/donate/?business=ECTSEQ2MFSE4Y&no_recurring=0&item_name=Thanks+for+supporting+Aisle+Finder%21+Your+donation+pays+for+development+and+hosting+costs.&currency_code=USD"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--af-text-muted)', textDecoration: 'none' }}
        >
          <i className="fa-solid fa-heart" style={{ marginRight: '5px', color: 'var(--af-amber)' }} />
          Support via PayPal
        </a>
        <a
          href="https://github.com/hbuchman/aislefinder/issues"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--af-text-muted)', textDecoration: 'none' }}
        >
          <i className="fa-solid fa-bug" style={{ marginRight: '5px', color: 'var(--af-error-text)' }} />
          Report a Bug
        </a>
      </div>
    </Sheet>
  );
};

export default AccountSheet;
