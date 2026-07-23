import { useState, useEffect, useCallback } from 'react';
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
} from 'amazon-cognito-identity-js';
import { deleteAccountRemote } from './api';

// AWS Cognito configuration. When these env vars are absent (e.g. local dev
// before running infra/setup-aws.sh) the app stays in guest-only mode and the
// account sheet explains that sign-in isn't available.
const USER_POOL_ID = process.env.REACT_APP_COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.REACT_APP_COGNITO_CLIENT_ID;

export const authConfigured = Boolean(USER_POOL_ID && CLIENT_ID);

const pool = authConfigured
  ? new CognitoUserPool({ UserPoolId: USER_POOL_ID, ClientId: CLIENT_ID })
  : null;

const displayNameFromEmail = (email) => (email || '').split('@')[0];

const sessionToUser = (cognitoUser, session) => ({
  email: session.getIdToken().payload.email,
  sub: session.getIdToken().payload.sub,
  displayName: displayNameFromEmail(session.getIdToken().payload.email),
  _cognitoUser: cognitoUser,
});

// Resolves to a user object or null; refreshes tokens if needed.
export const getCurrentUser = () =>
  new Promise((resolve) => {
    if (!pool) return resolve(null);
    const cognitoUser = pool.getCurrentUser();
    if (!cognitoUser) return resolve(null);
    cognitoUser.getSession((err, session) => {
      if (err || !session || !session.isValid()) return resolve(null);
      resolve(sessionToUser(cognitoUser, session));
    });
  });

// Resolves to a fresh access token string, or null when signed out.
export const getAccessToken = () =>
  new Promise((resolve) => {
    if (!pool) return resolve(null);
    const cognitoUser = pool.getCurrentUser();
    if (!cognitoUser) return resolve(null);
    cognitoUser.getSession((err, session) => {
      if (err || !session || !session.isValid()) return resolve(null);
      resolve(session.getAccessToken().getJwtToken());
    });
  });

export const signUp = (email, password) =>
  new Promise((resolve, reject) => {
    if (!pool) return reject(new Error("Sign-in isn't available right now"));
    pool.signUp(email, password, [], null, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });

export const confirmSignUp = (email, code) =>
  new Promise((resolve, reject) => {
    if (!pool) return reject(new Error("Sign-in isn't available right now"));
    const cognitoUser = new CognitoUser({ Username: email, Pool: pool });
    cognitoUser.confirmRegistration(code, true, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });

export const signIn = (email, password) =>
  new Promise((resolve, reject) => {
    if (!pool) return reject(new Error("Sign-in isn't available right now"));
    const cognitoUser = new CognitoUser({ Username: email, Pool: pool });
    const details = new AuthenticationDetails({ Username: email, Password: password });
    cognitoUser.authenticateUser(details, {
      onSuccess: (session) => resolve(sessionToUser(cognitoUser, session)),
      onFailure: (err) => reject(err),
      // Without this handler the SDK throws asynchronously and the promise
      // never settles, leaving the UI stuck on "Signing in…".
      newPasswordRequired: () =>
        reject(new Error('This account needs a new password. Use "Forgot password?" to set one.')),
    });
  });

export const resendConfirmationCode = (email) =>
  new Promise((resolve, reject) => {
    if (!pool) return reject(new Error("Sign-in isn't available right now"));
    const cognitoUser = new CognitoUser({ Username: email, Pool: pool });
    cognitoUser.resendConfirmationCode((err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });

// Sends a password-reset code to the account's email.
export const forgotPassword = (email) =>
  new Promise((resolve, reject) => {
    if (!pool) return reject(new Error("Sign-in isn't available right now"));
    const cognitoUser = new CognitoUser({ Username: email, Pool: pool });
    cognitoUser.forgotPassword({
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
      inputVerificationCode: () => resolve(),
    });
  });

// Completes a reset started by forgotPassword.
export const confirmPassword = (email, code, newPassword) =>
  new Promise((resolve, reject) => {
    if (!pool) return reject(new Error("Sign-in isn't available right now"));
    const cognitoUser = new CognitoUser({ Username: email, Pool: pool });
    cognitoUser.confirmPassword(code, newPassword, {
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
    });
  });

// Changes the password of the signed-in user (requires the current one).
export const changePassword = (currentPassword, newPassword) =>
  new Promise((resolve, reject) => {
    if (!pool) return reject(new Error("Sign-in isn't available right now"));
    const cognitoUser = pool.getCurrentUser();
    if (!cognitoUser) return reject(new Error('You are signed out'));
    cognitoUser.getSession((err, session) => {
      if (err || !session || !session.isValid()) {
        return reject(new Error('Your session expired — sign in again first'));
      }
      cognitoUser.changePassword(currentPassword, newPassword, (changeErr) => {
        if (changeErr) return reject(changeErr);
        resolve();
      });
    });
  });

// Permanently deletes the signed-in user's Cognito account. Fallback for
// servers without list sync configured, where DELETE /api/account returns 503
// and the only server-side data is the Cognito user itself.
export const deleteCognitoUser = () =>
  new Promise((resolve, reject) => {
    const cognitoUser = pool && pool.getCurrentUser();
    if (!cognitoUser) return reject(new Error('You are signed out'));
    cognitoUser.getSession((err, session) => {
      if (err || !session || !session.isValid()) {
        return reject(new Error('Your session expired — sign in again first'));
      }
      cognitoUser.deleteUser((delErr) => {
        if (delErr) return reject(delErr);
        resolve();
      });
    });
  });

// Turns Cognito's error objects into messages fit for the account sheet.
export const friendlyAuthError = (err) => {
  switch (err && (err.code || err.name)) {
    case 'UserNotFoundException':
      return 'No account found with that email address.';
    case 'NotAuthorizedException':
      return /password/i.test(err.message || '') ? 'Incorrect email or password.' : err.message;
    case 'UsernameExistsException':
      return 'An account with that email already exists — try signing in.';
    case 'InvalidPasswordException':
    case 'InvalidParameterException':
      return err.message || 'That input doesn’t meet the requirements.';
    case 'CodeMismatchException':
      return 'That code isn’t right — check the email and try again.';
    case 'ExpiredCodeException':
      return 'That code has expired — request a new one.';
    case 'LimitExceededException':
      return 'Too many attempts — wait a few minutes and try again.';
    default:
      return (err && err.message) || 'Something went wrong';
  }
};

export const signOut = () => {
  if (!pool) return;
  const cognitoUser = pool.getCurrentUser();
  if (cognitoUser) cognitoUser.signOut();
};

// React hook exposing auth state to the app. `user` is null in guest mode.
export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(authConfigured);

  useEffect(() => {
    if (!authConfigured) return;
    let cancelled = false;
    getCurrentUser().then((u) => {
      if (!cancelled) {
        setUser(u);
        setAuthLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const doSignIn = useCallback(async (email, password) => {
    const u = await signIn(email, password);
    setUser(u);
    return u;
  }, []);

  const doSignOut = useCallback(() => {
    signOut();
    setUser(null);
  }, []);

  // Deletes the server-side account (lists + Cognito user), then clears the
  // local session. Local lists are untouched — the app drops to guest mode.
  const doDeleteAccount = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) throw new Error('Your session expired — sign in again first');
    const result = await deleteAccountRemote(token);
    if (result === null) await deleteCognitoUser();
    signOut();
    setUser(null);
  }, []);

  return {
    user,
    authLoading,
    authConfigured,
    signIn: doSignIn,
    signOut: doSignOut,
    signUp,
    confirmSignUp,
    resendConfirmationCode,
    forgotPassword,
    confirmPassword,
    changePassword,
    deleteAccount: doDeleteAccount,
  };
};
