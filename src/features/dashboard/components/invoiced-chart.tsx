'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Dec, money } from '@/lib/billing';
import { formatMoney, formatNumber } from '@/lib/format';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { MonthlyInvoiced } from '../aggregate';
import { EmptyState, WidgetCard } from './widgets';

// Fixed categorical order from the theme tokens; a currency keeps its colour by its sorted position.
export const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

function totalFor(data: MonthlyInvoiced, currency: string): string {
  return money(data.months.reduce((s, m) => s.plus(new Dec(m.amounts[currency] ?? 0)), new Dec(0)));
}

/** Plain-text summary used as the charts' accessible description. */
export function invoicedSummary(data: MonthlyInvoiced): string {
  if (data.currencies.length === 0) return 'No invoices issued in the last 12 months.';
  const first = data.months[0].label;
  const last = data.months[data.months.length - 1].label;
  const totals = data.currencies.map((c) => formatMoney(totalFor(data, c), c)).join(', ');
  return `Invoiced ${first} – ${last}: ${totals}.`;
}

// SPEC-NOTE: one small chart per currency (small multiples) instead of grouped bars on a shared
// axis — amounts in different currencies are not comparable on one scale. Bar heights use JS
// numbers for geometry only; every displayed amount is formatted from the decimal string.
function CurrencyChart({ data, currency, color }: { data: MonthlyInvoiced; currency: string; color: string }) {
  const rows = data.months.map((m) => ({ label: m.label, value: Number(m.amounts[currency]), display: m.amounts[currency] }));
  return (
    <figure className="space-y-1">
      <figcaption className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{currency}</span>
        <span className="text-xs text-muted-foreground">12-month total {formatMoney(totalFor(data, currency), currency)}</span>
      </figcaption>
      <div
        role="img"
        aria-label={`Bar chart of ${currency} invoiced per month. ${data.months
          .map((m) => `${m.label}: ${formatMoney(m.amounts[currency], currency)}`)
          .join('; ')}`}
        className="h-48"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
            <XAxis
              dataKey="label"
              tickFormatter={(l: string) => l.slice(0, 3)}
              tickLine={false}
              axisLine={false}
              fontSize={11}
              stroke="var(--muted-foreground)"
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={(v: number) => formatNumber(v, 0)}
              tickLine={false}
              axisLine={false}
              fontSize={11}
              width={56}
              stroke="var(--muted-foreground)"
            />
            <Tooltip
              cursor={{ fill: 'var(--accent)' }}
              contentStyle={{
                background: 'var(--popover)',
                color: 'var(--popover-foreground)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(_v, _n, item) => [formatMoney((item.payload as { display: string }).display, currency), 'Invoiced']}
            />
            <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function InvoicedChart({ data }: { data: MonthlyInvoiced }) {
  const summary = invoicedSummary(data);
  return (
    <WidgetCard title="Invoiced per month" description="Last 12 months, by issue date (void excluded)">
      {data.currencies.length === 0 ? (
        <EmptyState>{summary}</EmptyState>
      ) : (
        <div className="space-y-4">
          <p className="sr-only">{summary}</p>
          <div className="grid gap-6 lg:grid-cols-2">
            {data.currencies.map((c, i) => (
              <CurrencyChart key={c} data={data} currency={c} color={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View as table</summary>
            <div className="mt-2 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    {data.currencies.map((c) => (
                      <TableHead key={c} className="text-right">
                        {c}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.months.map((m) => (
                    <TableRow key={m.month}>
                      <TableCell>{m.label}</TableCell>
                      {data.currencies.map((c) => (
                        <TableCell key={c} className="text-right tabular-nums">
                          {formatMoney(m.amounts[c], c)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </details>
        </div>
      )}
    </WidgetCard>
  );
}
