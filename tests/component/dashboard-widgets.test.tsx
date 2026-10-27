import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  OnLeaveTodayWidget,
  OutdatedInvoicesWidget,
  OverdueInvoicesWidget,
  ReadyToInvoiceWidget,
  UpcomingHolidaysWidget,
} from '@/features/dashboard/components/widgets';
import { InvoicedChart, invoicedSummary } from '@/features/dashboard/components/invoiced-chart';
import { RoleDonut } from '@/features/dashboard/components/role-donut';
import { invoicedPerMonth, type InvoiceRow, type ProjectRow } from '@/features/dashboard/aggregate';

const TODAY = '2026-10-27';

const invoice: InvoiceRow = {
  id: 'i1',
  invoice_number: 'INV-2026-0001',
  project_id: 'p1',
  project_code: 'PRJ-0001',
  project_name: 'Alpha',
  client_name: 'Acme',
  period_start: '2026-09-08',
  period_end: '2026-10-07',
  issue_date: '2026-10-08',
  due_date: '2026-10-23',
  currency: 'USD',
  status: 'issued',
  total: 2750,
  paid_at: null,
  is_outdated: true,
};

const project: ProjectRow = {
  id: 'p1',
  code: 'PRJ-0001',
  name: 'Alpha',
  client_name: 'Acme',
  status: 'active',
  currency: 'USD',
  billing_cycle_start_date: '2026-01-01',
};

describe('dashboard widgets: empty states', () => {
  it('shows an empty message for every widget without rows', () => {
    render(
      <>
        <UpcomingHolidaysWidget rows={[]} />
        <ReadyToInvoiceWidget rows={[]} isAdmin />
        <OverdueInvoicesWidget rows={[]} today={TODAY} />
        <OutdatedInvoicesWidget rows={[]} today={TODAY} />
        <OnLeaveTodayWidget rows={[]} today={TODAY} />
        <InvoicedChart data={invoicedPerMonth([], TODAY)} />
        <RoleDonut slices={[]} />
      </>,
    );
    expect(screen.getByText('No holidays in the next 60 days.')).toBeInTheDocument();
    expect(screen.getByText(/No billing cycles are ending/)).toBeInTheDocument();
    expect(screen.getByText('No overdue invoices.')).toBeInTheDocument();
    expect(screen.getByText('No outdated invoices.')).toBeInTheDocument();
    expect(screen.getByText('Nobody is on leave today.')).toBeInTheDocument();
    expect(screen.getByText('No invoices issued in the last 12 months.')).toBeInTheDocument();
    expect(screen.getByText('No on-role employees.')).toBeInTheDocument();
  });
});

describe('dashboard widgets: rows', () => {
  it('overdue invoices link to the invoice and the filtered list, with formatted money and dates', () => {
    render(<OverdueInvoicesWidget rows={[invoice]} today={TODAY} />);
    expect(screen.getByRole('link', { name: 'INV-2026-0001' })).toHaveAttribute('href', '/invoices/i1');
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/invoices?status=issued&overdue=yes');
    expect(screen.getByText('USD 2,750.00')).toBeInTheDocument();
    expect(screen.getByText('23 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('outdated invoices show the outdated badge and link to the outdated filter', () => {
    render(<OutdatedInvoicesWidget rows={[invoice]} today={TODAY} />);
    expect(screen.getByText('Outdated – regenerate?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/invoices?outdated=yes');
  });

  it('ready to invoice shows the cycle and a Generate link for admins only', () => {
    const rows = [{ project, cycle: { index: 9, start: '2026-10-01', end: '2026-10-31' }, daysLeft: 4 }];
    const { rerender } = render(<ReadyToInvoiceWidget rows={rows} isAdmin />);
    expect(screen.getByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '/projects/p1');
    expect(screen.getByText('01 Oct 2026 – 31 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText('In 4 days')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Generate' })).toHaveAttribute(
      'href',
      '/invoices/new?projectId=p1&cycle=2026-10-01',
    );
    rerender(<ReadyToInvoiceWidget rows={rows} isAdmin={false} />);
    expect(screen.queryByRole('link', { name: 'Generate' })).not.toBeInTheDocument();
  });

  it('on leave today lists employees with their DB status label', () => {
    render(
      <OnLeaveTodayWidget
        today={TODAY}
        rows={[
          {
            employee_id: 'e1',
            employee_code: 'EMP-0001',
            employee_name: 'Sara',
            status_code: 'half_day',
            status_label: 'Half Day Leave',
            status_color: 'orange',
            remarks: null,
            project_names: ['Alpha'],
          },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Sara' })).toHaveAttribute('href', '/employees/e1');
    expect(screen.getByText('Half Day Leave')).toBeInTheDocument();
  });

  it('upcoming holidays show date and scope', () => {
    render(
      <UpcomingHolidaysWidget
        rows={[{ id: 'h1', name: 'National Day', date: '2026-12-18', applies_to_all_projects: true, project_names: [] }]}
      />,
    );
    expect(screen.getByText('National Day')).toBeInTheDocument();
    expect(screen.getByText('18 Dec 2026')).toBeInTheDocument();
    expect(screen.getByText('All projects')).toBeInTheDocument();
  });
});

describe('dashboard charts: accessible fallbacks', () => {
  it('bar chart has an accessible summary and a table view per currency', () => {
    const data = invoicedPerMonth([invoice, { ...invoice, id: 'i2', currency: 'QAR', total: '10.5' }], TODAY);
    render(<InvoicedChart data={data} />);
    expect(invoicedSummary(data)).toBe('Invoiced Nov 2025 – Oct 2026: QAR 10.50, USD 2,750.00.');
    expect(screen.getByRole('img', { name: /Bar chart of USD invoiced per month.*Oct 2026: USD 2,750.00/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Bar chart of QAR/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'QAR' })).toBeInTheDocument();
    expect(screen.getAllByText('USD 2,750.00').length).toBeGreaterThan(0);
  });

  it('donut lists every role with its count', () => {
    render(
      <RoleDonut
        slices={[
          { id: 'r1', name: 'Backend', count: 3 },
          { id: 'r2', name: 'QA', count: 1 },
        ]}
      />,
    );
    expect(screen.getByRole('img', { name: /4 on-role employees: Backend 3, QA 1/ })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Employees per job role' })).toHaveTextContent('Backend3QA1');
  });
});
