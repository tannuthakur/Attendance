import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

const PUBLIC_PATHS = ['/login', '/forgot-password', '/auth/callback', '/auth/signout'];

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
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}
