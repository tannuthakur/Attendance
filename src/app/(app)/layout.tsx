import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/get-user';
import { createClient } from '@/lib/supabase/server';
import { CurrentUserProvider } from '@/components/providers/current-user';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  // Session exists but the profile is missing or deactivated.
  if (!user) redirect('/auth/signout?reason=disabled');
  const supabase = await createClient();
  const { data: settings } = await supabase.from('app_settings').select('business_timezone').eq('id', 1).maybeSingle();
  return (
    <CurrentUserProvider
      user={{
        id: user.id,
        name: user.profile.full_name,
        email: user.email,
        isAdmin: user.isAdmin,
        timezone: settings?.business_timezone ?? 'Asia/Qatar',
      }}
    >
      <div className="flex min-h-svh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </CurrentUserProvider>
  );
}
