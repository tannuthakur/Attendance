import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { DashboardKpis } from '@/features/dashboard/components/kpi-cards';
import type { AttendanceKpis, InvoiceKpis } from '@/features/dashboard/aggregate';

const TODAY = '2026-10-27';

const attendance: AttendanceKpis = {
  byStatus: [
    { code: 'present', label: 'Present', color: 'green', isLeave: false, count: 7 },
    { code: 'full_day', label: 'Full Day Leave', color: 'red', isLeave: true, count: 2 },
  ],
  notMarked: 4,
};

const invoices: InvoiceKpis = {
  outstanding: [
    { currency: 'QAR', amount: '300.00', count: 1 },
    { currency: 'USD', amount: '12500.50', count: 3 },
  ],
  overdueCount: 2,
  paidThisMonth: [],
};

function renderKpis(inv: InvoiceKpis = invoices) {
  render(
    <DashboardKpis
      today={TODAY}
      employees={{ total: 15, onRole: 12, offRole: 3, onBench: 5 }}
      projects={{ active: 2, paused: 1, notStarted: 0, endedOrCancelled: 1 }}
      attendance={attendance}
      invoices={inv}
    />,
  );
}

const link = (name: RegExp) => screen.getByRole('link', { name });

describe('DashboardKpis', () => {
  it('renders employee KPIs linking to filtered employee lists', () => {
    renderKpis();
    expect(link(/^15 Total$/)).toHaveAttribute('href', '/employees');
    expect(link(/^12 On-role$/)).toHaveAttribute('href', '/employees?status=on_role');
    expect(link(/^3 Off-role$/)).toHaveAttribute('href', '/employees?status=off_role');
    expect(link(/^5 On bench$/)).toHaveAttribute('href', '/employees?status=on_role&bench=yes');
  });

  it('renders project KPIs linking to status filters', () => {
    renderKpis();
    expect(link(/^2 Active$/)).toHaveAttribute('href', '/projects?status=active');
    expect(link(/^1 Paused$/)).toHaveAttribute('href', '/projects?status=paused');
    expect(link(/^0 Not started$/)).toHaveAttribute('href', '/projects?status=not_started');
    expect(link(/^1 Ended \/ cancelled$/)).toHaveAttribute('href', '/projects?status=ended%2Ccancelled');
  });

  it("renders today's attendance per status (DB labels) and not marked", () => {
    renderKpis();
    expect(link(/^7 Present$/)).toHaveAttribute(
      'href',
      '/attendance?view=list&date_from=2026-10-27&date_to=2026-10-27&status=present',
    );
    expect(link(/^2 Full Day Leave$/)).toHaveAttribute(
      'href',
      '/attendance?view=list&date_from=2026-10-27&date_to=2026-10-27&status=full_day',
    );
    expect(link(/^4 Not marked$/)).toHaveAttribute('href', '/attendance');
  });

  it('renders outstanding per currency, overdue count and paid-this-month empty state', () => {
    renderKpis();
    const card = screen.getByRole('heading', { name: 'Invoices' }).closest('[data-slot="card"]') as HTMLElement;
    expect(within(card).getByRole('link', { name: /Outstanding: USD 12,500.50 \(3 invoices\)/ })).toHaveAttribute(
      'href',
      '/invoices?status=issued&currency=USD',
    );
    expect(within(card).getByRole('link', { name: /Outstanding: QAR 300.00 \(1 invoice\)/ })).toHaveAttribute(
      'href',
      '/invoices?status=issued&currency=QAR',
    );
    expect(within(card).getByRole('link', { name: /^2 Overdue$/ })).toHaveAttribute(
      'href',
      '/invoices?status=issued&overdue=yes',
    );
    expect(within(card).getByRole('link', { name: 'None' })).toHaveAttribute(
      'href',
      '/invoices?status=paid&paid_at_from=2026-10-01&paid_at_to=2026-10-31',
    );
  });

  it('links paid-this-month per currency and shows "None" for no outstanding', () => {
    renderKpis({ outstanding: [], overdueCount: 0, paidThisMonth: [{ currency: 'USD', amount: '250', count: 2 }] });
    expect(link(/Paid this month: USD 250.00/)).toHaveAttribute(
      'href',
      '/invoices?status=paid&currency=USD&paid_at_from=2026-10-01&paid_at_to=2026-10-31',
    );
    expect(link(/^None$/)).toHaveAttribute('href', '/invoices?status=issued');
  });
});
