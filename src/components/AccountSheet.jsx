import React, { useState } from 'react';
import Sheet from './Sheet';
import { friendlyAuthError } from '../auth';

const inputStyle = {
  width: '100%',
  padding: '11px 12px',
  border: '2px solid var(--af-input-border)',
  borderRadius: '10px',
  backgroundColor: 'var(--af-inset-bg)',
  color: 'var(--af-text)',
  outline: 'none',
  boxSizing: 'border-box',
  marginBottom: '10px',
  fontFamily: 'inherit',
};

// mode: 'signin' | 'signup' | 'confirm' | 'forgot' | 'reset'
const AccountSheet = ({ open, onClose, auth, toast }) => {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(''); // doubles as the new password in reset mode
  const [currentPassword, setCurrentPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setMode('signin');
    setPassword('');
    setCurrentPassword('');
    setChangingPassword(false);
    setDeletingAccount(false);
    setCode('');
    setError('');
    setBusy(false);
  };

  const close = () => { reset(); onClose(); };

  const switchMode = (next) => { setMode(next); setCode(''); setError(''); };

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSignIn = () => run(async () => {
    try {
      await auth.signIn(email.trim(), password);
    } catch (err) {
      // Account exists but was never verified: send a fresh code and let
      // them finish instead of dead-ending on "User is not confirmed".
      if ((err.code || err.name) === 'UserNotConfirmedException') {
        await auth.resendConfirmationCode(email.trim());
        switchMode('confirm');
        return;
      }
      throw err;
    }
    toast('Signed in — your lists will now sync');
    close();
  });

  const handleSignUp = () => run(async () => {
    await auth.signUp(email.trim(), password);
    switchMode('confirm');
  });

  const handleConfirm = () => run(async () => {
    await auth.confirmSignUp(email.trim(), code.trim());
    try {
      await auth.signIn(email.trim(), password);
    } catch {
      // Verified, but the password on file is wrong (typo before an
      // unconfirmed-account redirect) — have them sign in normally.
      switchMode('signin');
      setError('Email verified — now sign in with your password.');
      return;
    }
    toast('Account created and signed in');
    close();
  });

  const handleResendCode = () => run(async () => {
    await auth.resendConfirmationCode(email.trim());
    toast('New code sent — check your email');
  });

  const handleForgot = () => run(async () => {
    await auth.forgotPassword(email.trim());
    setPassword('');
    switchMode('reset');
  });

  const handleReset = () => run(async () => {
    await auth.confirmPassword(email.trim(), code.trim(), password);
    await auth.signIn(email.trim(), password);
    toast('Password updated — you are signed in');
    close();
  });

  const handleChangePassword = () => run(async () => {
    await auth.changePassword(currentPassword, password);
    toast('Password changed');
    close();
  });

  const handleDeleteAccount = () => run(async () => {
    await auth.deleteAccount();
    toast('Account deleted — your lists remain on this device');
    close();
  });

  const errorBox = error && (
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
  );

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
          {changingPassword ? (
            <>
              <input
                type="password"
                placeholder="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="af-input"
                style={inputStyle}
              />
              <input
                type="password"
                placeholder="New password (8+ characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && currentPassword && password && !busy) handleChangePassword(); }}
                className="af-input"
                style={inputStyle}
              />
              {errorBox}
              <button
                className="af-btn-primary"
                disabled={busy || !currentPassword || !password}
                onClick={handleChangePassword}
              >
                <i className="fa-solid fa-key" style={{ marginRight: '8px' }} />
                {busy ? 'Updating…' : 'Update password'}
              </button>
              <button
                className="af-btn-ghost"
                onClick={() => { setChangingPassword(false); setCurrentPassword(''); setPassword(''); setError(''); }}
              >
                Cancel
              </button>
            </>
          ) : deletingAccount ? (
            <>
              <p style={{
                backgroundColor: 'var(--af-error-bg)',
                border: '1px solid var(--af-error-border)',
                color: 'var(--af-error-text)',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '13px',
                lineHeight: 1.5,
                margin: '0 0 10px',
              }}>
                This permanently deletes your account and removes your synced
                lists from our servers. Lists on this device are kept. This
                can't be undone.
              </p>
              {errorBox}
              <button
                className="af-btn-ghost"
                style={{ color: 'var(--af-error-text)', borderColor: 'var(--af-error-border)' }}
                disabled={busy}
                onClick={handleDeleteAccount}
              >
                <i className="fa-solid fa-trash-can" style={{ marginRight: '8px' }} />
                {busy ? 'Deleting…' : 'Yes, delete my account'}
              </button>
              <button
                className="af-btn-ghost"
                disabled={busy}
                onClick={() => { setDeletingAccount(false); setError(''); }}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button className="af-btn-ghost" onClick={() => setChangingPassword(true)}>
                <i className="fa-solid fa-key" style={{ marginRight: '8px' }} />
                Change password
              </button>
              <button
                className="af-btn-ghost"
                onClick={() => { auth.signOut(); toast('Signed out — back to guest mode'); close(); }}
              >
                <i className="fa-solid fa-right-from-bracket" style={{ marginRight: '8px' }} />
                Sign out
              </button>
              <button
                className="af-btn-ghost"
                style={{ color: 'var(--af-error-text)' }}
                onClick={() => setDeletingAccount(true)}
              >
                <i className="fa-solid fa-trash-can" style={{ marginRight: '8px' }} />
                Delete account
              </button>
            </>
          )}
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
            {mode === 'confirm' || mode === 'reset' ? 'Check your email'
              : mode === 'forgot' ? 'Reset your password'
              : "You're in guest mode"}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--af-text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
            {mode === 'confirm' ? `Enter the verification code we sent to ${email}.`
              : mode === 'reset' ? `Enter the code we sent to ${email} and choose a new password.`
              : mode === 'forgot' ? "Enter your account email and we'll send you a reset code."
              : 'Create a free account to sync lists across devices and share them with others.'}
          </p>

          {(mode === 'signin' || mode === 'signup' || mode === 'forgot') && (
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && mode === 'forgot' && email && !busy) handleForgot(); }}
              className="af-input"
              style={inputStyle}
            />
          )}

          {(mode === 'confirm' || mode === 'reset') && (
            <input
              type="text"
              inputMode="numeric"
              placeholder="Verification code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && mode === 'confirm' && code && !busy) handleConfirm(); }}
              className="af-input"
              style={inputStyle}
            />
          )}

          {(mode === 'signin' || mode === 'signup' || mode === 'reset') && (
            <input
              type="password"
              placeholder={mode === 'signup' ? 'Choose a password (8+ characters)'
                : mode === 'reset' ? 'New password (8+ characters)'
                : 'Password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || busy || !password) return;
                if (mode === 'signin' && email) handleSignIn();
                else if (mode === 'signup' && email) handleSignUp();
                else if (mode === 'reset' && code) handleReset();
              }}
              className="af-input"
              style={inputStyle}
            />
          )}

          {errorBox}

          {mode === 'signin' && (
            <>
              <button className="af-btn-primary" disabled={busy || !email || !password} onClick={handleSignIn}>
                <i className="fa-solid fa-right-to-bracket" style={{ marginRight: '8px' }} />
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
              <button className="af-btn-ghost" onClick={() => switchMode('signup')}>
                New here? Create an account
              </button>
              <button className="af-btn-ghost" style={{ border: 'none' }} onClick={() => switchMode('forgot')}>
                Forgot password?
              </button>
            </>
          )}
          {mode === 'signup' && (
            <>
              <button className="af-btn-primary" disabled={busy || !email || !password} onClick={handleSignUp}>
                <i className="fa-solid fa-user-plus" style={{ marginRight: '8px' }} />
                {busy ? 'Creating…' : 'Create account'}
              </button>
              <button className="af-btn-ghost" onClick={() => switchMode('signin')}>
                Already have an account? Sign in
              </button>
            </>
          )}
          {mode === 'confirm' && (
            <>
              <button className="af-btn-primary" disabled={busy || !code} onClick={handleConfirm}>
                <i className="fa-solid fa-check" style={{ marginRight: '8px' }} />
                {busy ? 'Verifying…' : 'Verify and sign in'}
              </button>
              <button className="af-btn-ghost" disabled={busy} onClick={handleResendCode}>
                Resend code
              </button>
            </>
          )}
          {mode === 'forgot' && (
            <>
              <button className="af-btn-primary" disabled={busy || !email} onClick={handleForgot}>
                <i className="fa-solid fa-envelope" style={{ marginRight: '8px' }} />
                {busy ? 'Sending…' : 'Send reset code'}
              </button>
              <button className="af-btn-ghost" onClick={() => switchMode('signin')}>
                Back to sign in
              </button>
            </>
          )}
          {mode === 'reset' && (
            <>
              <button className="af-btn-primary" disabled={busy || !code || !password} onClick={handleReset}>
                <i className="fa-solid fa-key" style={{ marginRight: '8px' }} />
                {busy ? 'Updating…' : 'Set new password'}
              </button>
              <button className="af-btn-ghost" disabled={busy} onClick={handleForgot}>
                Send a new code
              </button>
            </>
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
        <a
          href="https://aislefinder3000.com/privacy.html"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--af-text-muted)', textDecoration: 'none' }}
        >
          <i className="fa-solid fa-shield-halved" style={{ marginRight: '5px', color: 'var(--af-focus)' }} />
          Privacy
        </a>
      </div>
    </Sheet>
  );
};

export default AccountSheet;
