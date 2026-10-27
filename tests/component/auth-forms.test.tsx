import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { nav } from './test-utils';

const actions = vi.hoisted(() => ({
  signIn: vi.fn(),
  requestPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/features/auth/actions', () => actions);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { LoginForm } from '@/features/auth/components/login-form';
import { ForgotPasswordForm, RESET_SENT_MESSAGE } from '@/features/auth/components/forgot-password-form';
import { ResetPasswordClient } from '@/features/auth/components/reset-password-client';
import { safeNextPath } from '@/features/auth/schemas';

beforeEach(() => {
  Object.values(actions).forEach((a) => a.mockReset());
  nav.replace.mockReset();
});

describe('LoginForm', () => {
  it('validates required fields', async () => {
    render(<LoginForm />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(actions.signIn).not.toHaveBeenCalled();
  });

  it('shows the generic error from the server', async () => {
    actions.signIn.mockResolvedValue({ ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('redirects to the next path on success', async () => {
    actions.signIn.mockResolvedValue({ ok: true, data: { redirectTo: '/projects' } });
    render(<LoginForm next="/projects" />);
    await userEvent.type(screen.getByLabelText('Email'), 'A@B.co');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/projects'));
    expect(actions.signIn).toHaveBeenCalledWith({ email: 'a@b.co', password: 'secret', next: '/projects' });
  });

  it('shows an initial error (e.g. disabled account)', () => {
    render(<LoginForm initialError="Your account is disabled" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Your account is disabled');
  });
});

describe('ForgotPasswordForm', () => {
  it('always shows the neutral message', async () => {
    actions.requestPasswordReset.mockResolvedValue({ ok: true, data: null });
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText('Email'), 'who@ever.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(RESET_SENT_MESSAGE)).toBeInTheDocument();
  });

  it('validates email and surfaces rate limits', async () => {
    actions.requestPasswordReset.mockResolvedValue({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests.' } });
    render(<ForgotPasswordForm />);
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Email'), 'who@ever.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('Too many requests.')).toBeInTheDocument();
  });
});

describe('ResetPasswordClient', () => {
  it('enforces password rules and matching confirmation', async () => {
    render(<ResetPasswordClient />);
    await userEvent.type(screen.getByLabelText('New password'), 'short');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'other');
    await userEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('New password'));
    await userEvent.type(screen.getByLabelText('New password'), 'onlyletters');
    await userEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByText('Password must contain a number')).toBeInTheDocument();
    expect(actions.updatePassword).not.toHaveBeenCalled();
  });

  it('updates the password and goes to the dashboard', async () => {
    actions.updatePassword.mockResolvedValue({ ok: true, data: null });
    render(<ResetPasswordClient />);
    await userEvent.type(screen.getByLabelText('New password'), 'n3wPassword');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'n3wPassword');
    await userEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/dashboard'));
  });

  it('shows server errors', async () => {
    actions.updatePassword.mockResolvedValue({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Your reset link has expired.' } });
    render(<ResetPasswordClient />);
    await userEvent.type(screen.getByLabelText('New password'), 'n3wPassword');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'n3wPassword');
    await userEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your reset link has expired.');
  });
});

describe('safeNextPath', () => {
  it('only allows same-origin relative paths', () => {
    expect(safeNextPath('/invoices?x=1')).toBe('/invoices?x=1');
    expect(safeNextPath('//evil.com')).toBe('/dashboard');
    expect(safeNextPath('/\\evil.com')).toBe('/dashboard');
    expect(safeNextPath('https://evil.com')).toBe('/dashboard');
    expect(safeNextPath(undefined)).toBe('/dashboard');
  });
});
