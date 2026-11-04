import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

const PUBLIC_PATHS = ['/login', '/forgot-password', '/auth/callback', '/auth/signout'];

/**
 * Admin-only pages (§17.6). Checked here, before any streaming starts, so viewers get a real HTTP 403 even
 * under a `loading.tsx` boundary (where `forbidden()` would already have sent 200). Pages keep their own check.
 */
export function isAdminOnlyPath(pathname: string) {
  return pathname === '/admin' || pathname.startsWith('/admin/') || /\/(new|edit)\/?$/.test(pathname);
}

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Plain-text 500 naming the missing variables (instead of Vercel's opaque MIDDLEWARE_INVOCATION_FAILED). */
function configError(missing: string[]) {
  return new NextResponse(
    `Server configuration error: missing environment variable(s) ${missing.join(', ')}.\n` +
      'Set them in the hosting provider (e.g. Vercel → Project → Settings → Environment Variables) and redeploy — ' +
      'NEXT_PUBLIC_* values are embedded at build time.',
    { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } },
  );
}

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return configError([
      ...(url ? [] : ['NEXT_PUBLIC_SUPABASE_URL']),
      ...(anonKey ? [] : ['NEXT_PUBLIC_SUPABASE_ANON_KEY']),
    ]);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(
    url,
    anonKey,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Must be called to refresh the auth token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    if (pathname !== '/') url.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  if (user && isAdminOnlyPath(pathname)) {
    const { data: profile } = await supabase.from('profiles').select('access_role, is_active').eq('id', user.id).maybeSingle();
    if (profile && !(profile.access_role === 'admin' && profile.is_active)) {
      const url = request.nextUrl.clone();
      url.pathname = '/access-denied';
      url.search = '';
      const denied = NextResponse.rewrite(url, { status: 403 });
      response.cookies.getAll().forEach((c) => denied.cookies.set(c));
      return denied;
    }
  }
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}
