'use server';
import { ActionFailure, adminAction, check } from '@/lib/safe-action';
import { createAdminClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { createUserSchema, setUserActiveSchema, updateUserSchema, userIdSchema } from './schemas';

const PATHS = ['/admin/users'];
const DUPLICATE_EMAIL = 'A user with this email already exists';
const redirectTo = () => `${env.siteUrl}/auth/callback?next=/reset-password`;

type AuthError = { code?: string; status?: number; message?: string };

function authFailure(error: AuthError): ActionFailure {
  const msg = (error.message ?? '').toLowerCase();
  if (error.code === 'email_exists' || error.code === 'user_already_exists' || msg.includes('already been registered')) {
    return new ActionFailure('DUPLICATE', DUPLICATE_EMAIL);
  }
  if (error.code === 'weak_password') return new ActionFailure('WEAK_PASSWORD', 'Password is too weak');
  if (error.status === 429) return new ActionFailure('RATE_LIMITED', 'Too many requests. Please wait a moment and try again.');
  console.error('[users] auth admin error', error);
  return new ActionFailure('AUTH_ERROR', 'Could not create the user. Please try again.');
}

/** §5.3: an admin may not demote or deactivate themselves. */
function guardSelf(userId: string, targetId: string, change: { access_role?: string; is_active?: boolean }) {
  if (userId !== targetId) return;
  if (change.access_role !== undefined && change.access_role !== 'admin') {
    throw new ActionFailure('SELF_DEMOTE', 'You cannot remove your own admin access');
  }
  if (change.is_active === false) throw new ActionFailure('SELF_DEACTIVATE', 'You cannot deactivate your own account');
}

export const createUser = adminAction(
  createUserSchema,
  async (input, { supabase }) => {
    const admin = createAdminClient();
    let userId: string;
    if (input.mode === 'invite') {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
        redirectTo: redirectTo(),
        data: { full_name: input.full_name },
      });
      if (error) throw authFailure(error);
      userId = data.user.id;
      // Invites cannot set app_metadata; keep it in sync with the profile for the signup trigger.
      await admin.auth.admin.updateUserById(userId, { app_metadata: { access_role: input.access_role } });
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
        app_metadata: { access_role: input.access_role },
        user_metadata: { full_name: input.full_name },
      });
      if (error) throw authFailure(error);
      userId = data.user.id;
    }

    // The handle_new_user trigger already created a profile; upsert as the acting admin so the
    // audit log attributes the change and the role/name are exactly what was entered.
    const res = await supabase
      .from('profiles')
      .upsert(
        { id: userId, full_name: input.full_name, email: input.email, access_role: input.access_role, is_active: true },
        { onConflict: 'id' },
      )
      .select('id')
      .single();
    if (res.error) {
      await admin.auth.admin.deleteUser(userId);
      check(res, { DUPLICATE: DUPLICATE_EMAIL });
    }
    return { id: userId };
  },
  { revalidate: PATHS },
);

export const updateUser = adminAction(
  updateUserSchema,
  async (input, { supabase, user }) => {
    guardSelf(user.id, input.id, input);
    const row = check(
      await supabase
        .from('profiles')
        .update({ full_name: input.full_name, access_role: input.access_role, is_active: input.is_active })
        .eq('id', input.id)
        .select('id')
        .maybeSingle(),
    );
    if (!row) throw new ActionFailure('NOT_FOUND', 'User not found');
    // Best effort: keep auth metadata aligned with the profile (profile is the source of truth).
    await createAdminClient().auth.admin.updateUserById(input.id, {
      app_metadata: { access_role: input.access_role },
      user_metadata: { full_name: input.full_name },
    });
    return { id: input.id };
  },
  { revalidate: PATHS },
);

// SPEC-NOTE: deactivation only flips profiles.is_active (the app layout signs inactive users out and
// sign-in refuses them); we do not ban the user in Supabase Auth.
export const setUserActive = adminAction(
  setUserActiveSchema,
  async (input, { supabase, user }) => {
    guardSelf(user.id, input.id, input);
    const row = check(
      await supabase.from('profiles').update({ is_active: input.is_active }).eq('id', input.id).select('id').maybeSingle(),
    );
    if (!row) throw new ActionFailure('NOT_FOUND', 'User not found');
    return { id: input.id };
  },
  { revalidate: PATHS },
);

export const sendPasswordReset = adminAction(userIdSchema, async (input, { supabase }) => {
  const profile = check(await supabase.from('profiles').select('email').eq('id', input.id).maybeSingle());
  if (!profile) throw new ActionFailure('NOT_FOUND', 'User not found');
  // Sent with the service-role client (no PKCE verifier bound to the admin's browser), so the link
  // works in the user's browser via the token_hash email template.
  const { error } = await createAdminClient().auth.resetPasswordForEmail(profile.email, { redirectTo: redirectTo() });
  if (error) {
    if (error.status === 429) throw new ActionFailure('RATE_LIMITED', 'Too many requests. Please wait a moment and try again.');
    console.error('[users] reset email error', error);
    throw new ActionFailure('EMAIL_FAILED', 'Could not send the reset email. Please try again.');
  }
  return { email: profile.email };
});
