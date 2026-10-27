'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { RoleSlice } from '../aggregate';
import { CHART_COLORS } from './invoiced-chart';
import { EmptyState, WidgetCard } from './widgets';

export function roleSummary(slices: RoleSlice[]): string {
  const total = slices.reduce((n, s) => n + s.count, 0);
  if (total === 0) return 'No on-role employees.';
  return `${total} on-role employees: ${slices.map((s) => `${s.name} ${s.count}`).join(', ')}.`;
}

export function RoleDonut({ slices }: { slices: RoleSlice[] }) {
  const total = slices.reduce((n, s) => n + s.count, 0);
  const summary = roleSummary(slices);
  return (
    <WidgetCard title="Employees by job role" description="On-role employees">
      {total === 0 ? (
        <EmptyState>{summary}</EmptyState>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div role="img" aria-label={`Donut chart. ${summary}`} className="relative h-44 w-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="count"
                  nameKey="name"
                  innerRadius="62%"
                  outerRadius="100%"
                  paddingAngle={slices.length > 1 ? 2 : 0}
                  stroke="var(--card)"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {slices.map((s, i) => (
                    <Cell key={s.id} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'var(--popover)',
                    color: 'var(--popover-foreground)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold tabular-nums">{total}</span>
              <span className="text-xs text-muted-foreground">on-role</span>
            </div>
          </div>
          {/* Legend doubles as the text/table fallback: every slice is labelled with its count. */}
          <ul className="w-full space-y-1.5 text-sm" aria-label="Employees per job role">
            {slices.map((s, i) => (
              <li key={s.id} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span aria-hidden className="size-2.5 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  {s.name}
                </span>
                <span className="tabular-nums text-muted-foreground">{s.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </WidgetCard>
  );
}
