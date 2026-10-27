'use server';
import { redirect } from 'next/navigation';
import { fail, ok, type ActionResult } from '@/lib/action-result';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  safeNextPath,
  type ForgotPasswordInput,
  type LoginInput,
  type ResetPasswordInput,
} from './schemas';

const INVALID = 'Invalid email or password';

export async function signIn(input: LoginInput): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return fail('INVALID_CREDENTIALS', INVALID);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    if (error.status === 429) return fail('RATE_LIMITED', 'Too many attempts. Please wait a moment and try again.');
    // Wrong email/password (or unconfirmed email) → the neutral message, never revealing which.
    if (error.status === 400 || error.code === 'invalid_credentials' || error.code === 'email_not_confirmed') {
      return fail('INVALID_CREDENTIALS', INVALID);
    }
    // Anything else (bad Supabase URL/key, network, outage) is a server problem: log it for the host's logs.
    console.error('[auth] signInWithPassword failed', { status: error.status, code: error.code, message: error.message });
    return fail('AUTH_UNAVAILABLE', 'Sign-in is temporarily unavailable. Please try again later or contact the administrator.');
  }
  const { data: profile } = await supabase.from('profiles').select('is_active').eq('id', data.user.id).maybeSingle();
  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return fail('ACCOUNT_DISABLED', 'Your account is disabled');
  }
  await supabase.rpc('touch_last_login');
  return ok({ redirectTo: safeNextPath(parsed.data.next) });
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function requestPasswordReset(input: ForgotPasswordInput): Promise<ActionResult<null>> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return fail('VALIDATION', 'Enter a valid email');
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.siteUrl}/auth/callback?next=/reset-password`,
  });
  if (error?.status === 429) return fail('RATE_LIMITED', 'Too many requests. Please wait a moment and try again.');
  // Never reveal whether the account exists.
  return ok(null);
}

export async function updatePassword(input: ResetPasswordInput): Promise<ActionResult<null>> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return fail('VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid password');
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('UNAUTHENTICATED', 'Your reset link has expired. Please request a new one.');
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === 'same_password') return fail('SAME_PASSWORD', 'New password must be different from the old one');
    return fail('UPDATE_FAILED', 'Could not update password. Please try again.');
  }
  return ok(null);
}
