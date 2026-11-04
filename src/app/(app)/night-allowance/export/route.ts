import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-user';
import { csvResponse } from '@/lib/csv-response';
import { parseListParams } from '@/lib/list-params';
import { getJobRoles, getToday } from '@/features/lookups/queries';
import { parseMonth } from '@/features/attendance/lib';
import { nightAllowanceListConfig } from '@/features/night-allowance/list-config';
import { exportNightAllowance } from '@/features/night-allowance/queries';
import { excludedSummary, rateLabel } from '@/features/night-allowance/format';

/** CSV of the current filtered night-allowance report (§17.4), incl. breakdown summary columns. */
export async function GET(req: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const month = parseMonth(req.nextUrl.searchParams.get('month') ?? undefined, await getToday());
  const params = parseListParams(req.nextUrl.searchParams, nightAllowanceListConfig);
  const [data, roles] = await Promise.all([exportNightAllowance(month, params), getJobRoles()]);
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const currency = data.settings.currency;
  return csvResponse(`night-allowance-${month}.csv`, data.rows, [
    { header: 'Month', value: () => month },
    { header: 'Employee code', value: (r) => r.employee.code },
    { header: 'Name', value: (r) => r.employee.name },
    { header: 'Job role', value: (r) => roleName.get(r.employee.jobRoleId) ?? '' },
    { header: 'Projects', value: (r) => r.employee.projects.map((p) => p.name).join(', ') || 'No project' },
    { header: 'Working days', value: (r) => r.workingDays },
    { header: 'Night shifts', value: (r) => r.nightShifts },
    { header: 'Excluded', value: (r) => excludedSummary(r.excluded) },
    { header: 'Eligible nights', value: (r) => r.eligibleNights },
    { header: 'Counted dates', value: (r) => r.breakdown.filter((b) => b.result === 'counted').map((b) => b.date).join(' ') },
    { header: 'Rate', value: (r) => rateLabel(r.lastRate, currency) },
    { header: `Calculated (${currency})`, value: (r) => r.calculatedAmount },
    { header: 'Nights override', value: (r) => r.nightsOverride ?? '' },
    { header: `Amount override (${currency})`, value: (r) => r.amountOverride ?? '' },
    { header: 'Override reason', value: (r) => r.overrideReason ?? '' },
    { header: `Final amount (${currency})`, value: (r) => r.finalAmount },
    { header: 'Status', value: (r) => (r.status === 'none' ? 'Not saved' : r.status) },
    { header: 'Outdated', value: (r) => (r.outdated ? 'Yes' : 'No') },
  ]);
}
