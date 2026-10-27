import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmployeeStatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/dates';

export type HistoryPeriod = {
  id: string;
  start_date: string;
  end_date: string | null;
  reason: string | null;
  end_reason: string | null;
};

/** All employment periods (newest first) with on/off-role reasons (§6.2 tab 2). */
export function EmploymentHistory({ periods, today }: { periods: HistoryPeriod[]; today: string }) {
  if (!periods.length) return <p className="text-sm text-muted-foreground">No employment history.</p>;
  const rows = [...periods].sort((a, b) => b.start_date.localeCompare(a.start_date));
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table aria-label="Employment history">
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>On-role from</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>On-role until</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p, i) => {
            const current = p.start_date <= today && (p.end_date === null || p.end_date >= today);
            return (
              <TableRow key={p.id}>
                <TableCell>{rows.length - i}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(p.start_date)}</TableCell>
                <TableCell>{p.reason ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap">{p.end_date ? formatDate(p.end_date) : 'Ongoing'}</TableCell>
                <TableCell>{p.end_reason ?? '—'}</TableCell>
                <TableCell>
                  {current ? (
                    <EmployeeStatusBadge status="on_role" />
                  ) : p.start_date > today ? (
                    <span className="text-sm text-muted-foreground">Upcoming</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Past</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
