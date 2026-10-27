import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-user';
import { csvResponse } from '@/lib/csv-response';
import { parseListParams } from '@/lib/list-params';
import { formatDate, formatDateTime } from '@/lib/dates';
import { attendanceListConfig } from '@/features/attendance/list-config';
import { exportAttendance } from '@/features/attendance/queries';
import { getSettings } from '@/features/lookups/queries';

/** CSV of the current filtered attendance list (same params as /attendance?view=list). */
export async function GET(req: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const params = parseListParams(req.nextUrl.searchParams, attendanceListConfig);
  const [rows, settings] = await Promise.all([exportAttendance(params), getSettings()]);
  const tz = settings.business_timezone;
  return csvResponse(`attendance-${new Date().toISOString().slice(0, 10)}.csv`, rows, [
    { header: 'Date', value: (r) => formatDate(r.date) },
    { header: 'Employee code', value: (r) => r.employee_code },
    { header: 'Employee name', value: (r) => r.employee_name },
    { header: 'Job role', value: (r) => r.job_role_name },
    { header: 'Projects', value: (r) => r.project_names },
    { header: 'Status', value: (r) => r.status_label },
    { header: 'Leave deduction', value: (r) => (r.is_leave ? r.deduction_factor : 0) },
    { header: 'Remarks', value: (r) => r.remarks },
    { header: 'Marked by', value: (r) => r.marked_by_name },
    { header: 'Updated at', value: (r) => formatDateTime(r.updated_at, tz) },
  ]);
}
