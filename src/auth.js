import { useState, useEffect, useCallback } from 'react';
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
} from 'amazon-cognito-identity-js';

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
    if (!pool) return reject(new Error('Accounts are not configured'));
    pool.signUp(email, password, [], null, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });

export const confirmSignUp = (email, code) =>
  new Promise((resolve, reject) => {
    if (!pool) return reject(new Error('Accounts are not configured'));
    const cognitoUser = new CognitoUser({ Username: email, Pool: pool });
    cognitoUser.confirmRegistration(code, true, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });

export const signIn = (email, password) =>
  new Promise((resolve, reject) => {
    if (!pool) return reject(new Error('Accounts are not configured'));
    const cognitoUser = new CognitoUser({ Username: email, Pool: pool });
    const details = new AuthenticationDetails({ Username: email, Password: password });
    cognitoUser.authenticateUser(details, {
      onSuccess: (session) => resolve(sessionToUser(cognitoUser, session)),
      onFailure: (err) => reject(err),
    });
  });

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

  return {
    user,
    authLoading,
    authConfigured,
    signIn: doSignIn,
    signOut: doSignOut,
    signUp,
    confirmSignUp,
  };
};
