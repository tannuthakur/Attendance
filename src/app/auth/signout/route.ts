import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Clears the session (e.g. for deactivated users) and returns to the login page. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const reason = request.nextUrl.searchParams.get('reason');
  const url = new URL('/login', request.nextUrl.origin);
  if (reason === 'disabled') url.searchParams.set('error', 'disabled');
  return NextResponse.redirect(url);
}
