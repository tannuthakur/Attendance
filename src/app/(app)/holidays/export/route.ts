import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-user';
import { csvResponse } from '@/lib/csv-response';
import { parseListParams } from '@/lib/list-params';
import { formatDate, weekdayName } from '@/lib/dates';
import { holidayListConfig } from '@/features/holidays/list-config';
import { exportHolidays } from '@/features/holidays/queries';

/** CSV of the current filtered holiday list. */
export async function GET(req: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const params = parseListParams(req.nextUrl.searchParams, holidayListConfig);
  const rows = await exportHolidays(params);
  return csvResponse(`holidays-${new Date().toISOString().slice(0, 10)}.csv`, rows, [
    { header: 'Date', value: (r) => formatDate(r.date) },
    { header: 'Day of week', value: (r) => weekdayName(r.date) },
    { header: 'Name', value: (r) => r.name },
    { header: 'Scope', value: (r) => (r.applies_to_all_projects ? 'All projects' : r.project_names) },
    { header: 'Notes', value: (r) => r.notes },
  ]);
}
