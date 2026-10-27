import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/types/database';

export type CurrentUser = {
  id: string;
  email: string;
  profile: Tables<'profiles'>;
  isAdmin: boolean;
};

/** Signed-in, active user with profile, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!profile || !profile.is_active) return null;
  return { id: user.id, email: user.email ?? profile.email, profile, isAdmin: profile.access_role === 'admin' };
});
