import type { NextRequest } from 'next/server';
import { csvResponse, EXPORT_LIMIT } from '@/lib/csv-response';
import { ForbiddenError, UnauthenticatedError } from '@/lib/auth/errors';
import { requireAdmin } from '@/lib/auth/require-admin';
import { parseListParams } from '@/lib/list-params';
import { formatDateTime } from '@/lib/dates';
import { ACCESS_ROLE_LABELS } from '@/lib/format';
import { getSettings } from '@/features/lookups/queries';
import { usersListConfig } from '@/features/users/list-config';
import { listUsers } from '@/features/users/queries';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof UnauthenticatedError) return new Response('Unauthorized', { status: 401 });
    if (e instanceof ForbiddenError) return new Response('Forbidden', { status: 403 });
    throw e;
  }
  const params = parseListParams(request.nextUrl.searchParams, usersListConfig);
  const [{ rows }, settings] = await Promise.all([listUsers(params, { limit: EXPORT_LIMIT }), getSettings()]);
  const tz = settings.business_timezone;
  return csvResponse('users.csv', rows, [
    { header: 'Name', value: (r) => r.full_name },
    { header: 'Email', value: (r) => r.email },
    { header: 'Access role', value: (r) => ACCESS_ROLE_LABELS[r.access_role] },
    { header: 'Active', value: (r) => (r.is_active ? 'Yes' : 'No') },
    { header: 'Last login', value: (r) => (r.last_login_at ? formatDateTime(r.last_login_at, tz) : '') },
    { header: 'Created', value: (r) => (r.created_at ? formatDateTime(r.created_at, tz) : '') },
  ]);
}
