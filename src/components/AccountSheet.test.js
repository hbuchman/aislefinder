import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import AccountSheet from './AccountSheet';

global.IS_REACT_ACT_ENVIRONMENT = true;

const makeAuth = (overrides = {}) => ({
  user: null,
  authLoading: false,
  authConfigured: true,
  signIn: jest.fn(() => Promise.resolve({ email: 'a@b.com' })),
  signOut: jest.fn(),
  signUp: jest.fn(() => Promise.resolve({})),
  confirmSignUp: jest.fn(() => Promise.resolve('SUCCESS')),
  resendConfirmationCode: jest.fn(() => Promise.resolve({})),
  forgotPassword: jest.fn(() => Promise.resolve()),
  confirmPassword: jest.fn(() => Promise.resolve()),
  changePassword: jest.fn(() => Promise.resolve()),
  ...overrides,
});

const render = (auth) => {
  const div = document.createElement('div');
  document.body.appendChild(div);
  act(() => {
    createRoot(div).render(
      <AccountSheet open onClose={() => {}} auth={auth} toast={() => {}} />
    );
  });
  return div;
};

// Fires React's onChange for a controlled input
const setInput = (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const click = (el) =>
  act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

const button = (div, label) =>
  [...div.querySelectorAll('button')].find((b) => b.textContent.includes(label));

beforeEach(() => {
  document.body.innerHTML = '';
});

it('shows an error message when sign-in fails', async () => {
  const auth = makeAuth({
    signIn: jest.fn(() => Promise.reject(
      Object.assign(new Error('Incorrect username or password.'), { code: 'NotAuthorizedException' })
    )),
  });
  const div = render(auth);

  setInput(div.querySelector('input[type="email"]'), 'user@example.com');
  setInput(div.querySelector('input[type="password"]'), 'wrongpass');
  await click(button(div, 'Sign in'));

  expect(auth.signIn).toHaveBeenCalledWith('user@example.com', 'wrongpass');
  expect(div.textContent).toContain('Incorrect email or password.');
});

it('resets a forgotten password end to end', async () => {
  const auth = makeAuth();
  const div = render(auth);

  await click(button(div, 'Forgot password?'));
  expect(div.textContent).toContain('Reset your password');

  setInput(div.querySelector('input[type="email"]'), 'user@example.com');
  await click(button(div, 'Send reset code'));
  expect(auth.forgotPassword).toHaveBeenCalledWith('user@example.com');
  expect(div.textContent).toContain('choose a new password');

  setInput(div.querySelector('input[inputmode="numeric"]'), '123456');
  setInput(div.querySelector('input[type="password"]'), 'newpassword1');
  await click(button(div, 'Set new password'));

  expect(auth.confirmPassword).toHaveBeenCalledWith('user@example.com', '123456', 'newpassword1');
  expect(auth.signIn).toHaveBeenCalledWith('user@example.com', 'newpassword1');
});

it('sends a fresh code and moves to the confirm step when the account is unconfirmed', async () => {
  const auth = makeAuth({
    signIn: jest.fn(() => Promise.reject(
      Object.assign(new Error('User is not confirmed.'), { code: 'UserNotConfirmedException' })
    )),
  });
  const div = render(auth);

  setInput(div.querySelector('input[type="email"]'), 'user@example.com');
  setInput(div.querySelector('input[type="password"]'), 'password1');
  await click(button(div, 'Sign in'));

  expect(auth.resendConfirmationCode).toHaveBeenCalledWith('user@example.com');
  expect(div.textContent).toContain('verification code');
  expect(div.querySelector('input[inputmode="numeric"]')).not.toBeNull();
});

it('lets a signed-in user change their password', async () => {
  const auth = makeAuth({
    user: { email: 'user@example.com', sub: 'abc', displayName: 'user' },
  });
  const div = render(auth);

  await click(button(div, 'Change password'));
  const [current, next] = div.querySelectorAll('input[type="password"]');
  setInput(current, 'oldpassword1');
  setInput(next, 'newpassword1');
  await click(button(div, 'Update password'));

  expect(auth.changePassword).toHaveBeenCalledWith('oldpassword1', 'newpassword1');
});

it('shows an error when changing the password fails', async () => {
  const auth = makeAuth({
    user: { email: 'user@example.com', sub: 'abc', displayName: 'user' },
    changePassword: jest.fn(() => Promise.reject(
      Object.assign(new Error('Incorrect username or password.'), { code: 'NotAuthorizedException' })
    )),
  });
  const div = render(auth);

  await click(button(div, 'Change password'));
  const [current, next] = div.querySelectorAll('input[type="password"]');
  setInput(current, 'wrongold');
  setInput(next, 'newpassword1');
  await click(button(div, 'Update password'));

  expect(div.textContent).toContain('Incorrect email or password.');
});
