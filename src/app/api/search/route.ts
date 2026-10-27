import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/get-user';
import { globalSearch } from '@/features/search/queries';

export async function GET(request: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = await createClient();
  const results = await globalSearch(supabase, request.nextUrl.searchParams.get('q') ?? '');
  return NextResponse.json({ results });
}
