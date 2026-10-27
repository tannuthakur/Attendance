import { beforeAll, describe, expect, it } from 'vitest';
import { actAs, anyJobRoleId, serviceClient, uniq } from './helpers';
import {
  changeInvoiceNumber,
  computeInvoiceLines,
  deleteInvoice,
  generateInvoice,
  markInvoicePaid,
  markInvoiceUnpaid,
  previewInvoicePdf,
  previewRegenerate,
  regenerateInvoice,
  updateInvoiceDetails,
  voidInvoice,
} from '@/features/invoices/actions';
import { refreshOutdatedFlags } from '@/features/invoices/outdated';

// Cycle 08 Aug – 07 Sep 2026, weekend Fri+Sat → D = 22 working days.
const PERIOD = { periodStart: '2026-08-08', periodEnd: '2026-09-07' };
const DETAILS = {
  issueDate: '2026-09-08',
  dueDate: '2026-09-23',
  invoiceTitle: 'Development Work – August 2026',
  invoiceTo: 'Client Ltd\nDoha',
};

type Fixture = { projectId: string; assignmentId: string; employeeId: string };

/** Project (active since 1 Aug) with one employee assigned at USD 2,200 / month. */
async function createFixture(opts: { withEmployee?: boolean } = {}): Promise<Fixture> {
  const db = serviceClient();
  const tag = uniq('inv');
  const { data: project, error: pErr } = await db
    .from('projects')
    .insert({
      name: `Project ${tag}`,
      client_name: `Client ${tag}`,
      billing_cycle_start_date: '2026-08-08',
      billing_cycle_end_date: '2026-09-07',
      currency: 'USD',
      invoice_to: 'Client Ltd\nDoha',
      invoice_title: 'Development Work – {MONTH} {YEAR}',
      weekend_days: [5, 6],
      payment_terms_days: 15,
      status: 'active',
    })
    .select()
    .single();
  if (pErr) throw pErr;
  await db.from('project_status_events').insert({ project_id: project.id, status: 'active', effective_date: '2026-08-01' });
  if (opts.withEmployee === false) return { projectId: project.id, assignmentId: '', employeeId: '' };

  const { data: employee, error: eErr } = await db
    .from('employees')
    .insert({ name: `Emp ${tag}`, email: `${tag}@test.local`, job_role_id: await anyJobRoleId(), start_date: '2026-01-01', first_joined_on: '2026-01-01' })
    .select()
    .single();
  if (eErr) throw eErr;
  const { data: assignment, error: aErr } = await db
    .from('project_assignments')
    .insert({ project_id: project.id, employee_id: employee.id, start_date: '2026-08-01' })
    .select()
    .single();
  if (aErr) throw aErr;
  await db.from('assignment_rates').insert({ assignment_id: assignment.id, monthly_cost: 2200, effective_from: '2026-08-01' });
  return { projectId: project.id, assignmentId: assignment.id, employeeId: employee.id };
}

async function generate(f: Fixture, extra: Partial<Parameters<typeof generateInvoice>[0]> = {}) {
  return generateInvoice({
    projectId: f.projectId,
    ...PERIOD,
    ...DETAILS,
    lines: [
      ...(f.assignmentId ? [{ kind: 'employee' as const, assignmentId: f.assignmentId, description: 'Development' }] : []),
      { kind: 'custom' as const, description: 'Hosting', quantity: '1', unitPrice: '100' },
    ],
    allowOverlap: true,
    ...extra,
  });
}

async function loadInvoice(id: string) {
  const db = serviceClient();
  const { data } = await db.from('invoices').select('*').eq('id', id).single();
  const { data: lines } = await db.from('invoice_lines').select('*').eq('invoice_id', id).order('sort_order');
  return { invoice: data!, lines: lines ?? [] };
}

describe('invoices (integration)', () => {
  let f: Fixture;
  beforeAll(async () => {
    await actAs('admin');
    f = await createFixture();
  });

  it('computes employee lines for the wizard', async () => {
    await actAs('admin');
    const res = await computeInvoiceLines({ projectId: f.projectId, ...PERIOD });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.workingDays).toBe(22);
    expect(res.data.lines).toHaveLength(1);
    expect(res.data.lines[0].amount).toBe('2200.00');
  });

  it('generates an invoice with employee + custom lines, stores hash, exclusions and the PDF', async () => {
    await actAs('admin');
    const res = await generate(f);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { invoice, lines } = await loadInvoice(res.data.id);
    expect(invoice.invoice_number).toMatch(/^INV-2026-\d{4}$/);
    expect(Number(invoice.total)).toBe(2300);
    expect(invoice.source_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(invoice.version).toBe(1);
    expect(lines.map((l) => [l.line_type, Number(l.amount)])).toEqual([
      ['employee', 2200],
      ['custom', 100],
    ]);
    expect(lines[0].calc_breakdown).toBeTruthy();
    expect(invoice.pdf_path).toBe(`${invoice.id}/v1.pdf`);
    const { data: file } = await serviceClient().storage.from('invoices').download(invoice.pdf_path!);
    expect(Buffer.from(await file!.arrayBuffer()).subarray(0, 4).toString()).toBe('%PDF');
    const { data: events } = await serviceClient().from('invoice_events').select('event').eq('invoice_id', invoice.id);
    expect(events!.map((e) => e.event)).toContain('generated');
  });

  it('never trusts client amounts and rejects stale employee lines', async () => {
    await actAs('admin');
    const missing = await generateInvoice({
      projectId: f.projectId,
      ...PERIOD,
      ...DETAILS,
      lines: [{ kind: 'custom', description: 'Only custom', quantity: '1', unitPrice: '1' }],
      allowOverlap: true,
    });
    // The billable employee is neither on the invoice nor excluded.
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe('LINES_CHANGED');

    const excluded = await generateInvoice({
      projectId: f.projectId,
      ...PERIOD,
      ...DETAILS,
      excludedAssignmentIds: [f.assignmentId],
      lines: [{ kind: 'custom', description: 'Only custom', quantity: '1', unitPrice: '1' }],
      allowOverlap: true,
    });
    expect(excluded.ok).toBe(true);
    if (excluded.ok) {
      const { invoice } = await loadInvoice(excluded.data.id);
      expect(invoice.excluded_assignment_ids).toEqual([f.assignmentId]);
    }
  });

  it('warns about overlapping invoices unless confirmed', async () => {
    await actAs('admin');
    const res = await generate(f, { allowOverlap: false });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('OVERLAP_CONFIRM');
  });

  it('generates a custom-lines-only invoice for a project without employees', async () => {
    await actAs('admin');
    const empty = await createFixture({ withEmployee: false });
    const lines = await computeInvoiceLines({ projectId: empty.projectId, ...PERIOD });
    expect(lines.ok && lines.data.lines).toEqual([]);
    const res = await generate(empty);
    expect(res.ok).toBe(true);
    if (res.ok) expect(Number((await loadInvoice(res.data.id)).invoice.total)).toBe(100);
  });

  it('rejects zero lines and negative totals', async () => {
    await actAs('admin');
    const empty = await createFixture({ withEmployee: false });
    const none = await generateInvoice({ projectId: empty.projectId, ...PERIOD, ...DETAILS, lines: [], allowOverlap: true });
    expect(none.ok).toBe(false);
    const negative = await generateInvoice({
      projectId: empty.projectId,
      ...PERIOD,
      ...DETAILS,
      lines: [{ kind: 'custom', description: 'Credit', quantity: '1', unitPrice: '-5' }],
      allowOverlap: true,
    });
    expect(negative.ok).toBe(false);
    if (!negative.ok) expect(negative.error.code).toBe('INVOICE_NEGATIVE_TOTAL');
  });

  it('renders a preview PDF without saving', async () => {
    await actAs('admin');
    const res = await previewInvoicePdf({ projectId: f.projectId, ...PERIOD, ...DETAILS, lines: [{ kind: 'employee', assignmentId: f.assignmentId, description: 'Dev' }] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(Buffer.from(res.data.base64, 'base64').subarray(0, 4).toString()).toBe('%PDF');
  });

  it('reserves unique numbers under 10 concurrent generates', async () => {
    await actAs('admin');
    const results = await Promise.all(Array.from({ length: 10 }, () => generate(f)));
    expect(results.every((r) => r.ok)).toBe(true);
    const numbers = results.map((r) => (r.ok ? r.data.invoiceNumber : ''));
    expect(new Set(numbers).size).toBe(10);
  });

  it('edits details and custom lines of an issued invoice, keeping employee amounts', async () => {
    await actAs('admin');
    const gen = await generate(f);
    if (!gen.ok) throw new Error(gen.error.message);
    const { lines } = await loadInvoice(gen.data.id);
    const res = await updateInvoiceDetails({
      id: gen.data.id,
      ...DETAILS,
      invoiceTitle: 'Edited title',
      notes: 'Thanks',
      lines: [
        { kind: 'custom', description: 'Discount', quantity: '1', unitPrice: '-200' },
        { kind: 'employee', lineId: lines[0].id, description: 'Renamed' },
      ],
    });
    expect(res.ok).toBe(true);
    const after = await loadInvoice(gen.data.id);
    expect(after.invoice.invoice_title).toBe('Edited title');
    expect(Number(after.invoice.total)).toBe(2000);
    expect(after.lines.map((l) => l.description)).toEqual(['Discount', 'Renamed']);
    expect(Number(after.lines[1].amount)).toBe(2200);
  });

  it('edit number: unique, logged, blocked when paid; paid locks edits and regenerate', async () => {
    await actAs('admin');
    const a = await generate(f);
    const b = await generate(f);
    if (!a.ok || !b.ok) throw new Error('generate failed');

    const dup = await changeInvoiceNumber({ id: a.data.id, invoiceNumber: b.data.invoiceNumber });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe('DUPLICATE_INVOICE_NUMBER');

    const newNumber = `MAN-${Date.now()}`;
    expect((await changeInvoiceNumber({ id: a.data.id, invoiceNumber: newNumber })).ok).toBe(true);
    const { data: ev } = await serviceClient().from('invoice_events').select('details').eq('invoice_id', a.data.id).eq('event', 'number_changed').single();
    expect(ev!.details).toMatchObject({ from: a.data.invoiceNumber, to: newNumber });

    expect((await markInvoicePaid({ id: a.data.id, paidAt: '2026-09-20', reference: 'TRX' })).ok).toBe(true);
    const blocked = await changeInvoiceNumber({ id: a.data.id, invoiceNumber: `${newNumber}-X` });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe('INVOICE_LOCKED');
    expect((await regenerateInvoice({ id: a.data.id, expectedVersion: 1 })).ok).toBe(false);
    expect((await updateInvoiceDetails({ id: a.data.id, ...DETAILS, lines: [{ kind: 'custom', description: 'x', quantity: '1', unitPrice: '1' }] })).ok).toBe(false);
    const del = await deleteInvoice({ id: a.data.id, confirmNumber: newNumber });
    expect(del.ok).toBe(false);

    // Unpaid requires a reason and returns it to issued.
    expect((await markInvoiceUnpaid({ id: a.data.id, reason: '' })).ok).toBe(false);
    expect((await markInvoiceUnpaid({ id: a.data.id, reason: 'Bounced' })).ok).toBe(true);
    expect((await loadInvoice(a.data.id)).invoice.status).toBe('issued');
  });

  it('outdated flag appears after an attendance change and clears after regenerate (keeps number + custom lines, bumps version)', async () => {
    await actAs('admin');
    const own = await createFixture();
    const gen = await generate(own);
    if (!gen.ok) throw new Error(gen.error.message);
    const before = await loadInvoice(gen.data.id);

    // Full-day leave on Monday 10 Aug 2026.
    await serviceClient().from('attendance').insert({ employee_id: own.employeeId, date: '2026-08-10', status_code: 'full_day' });
    const flags = await refreshOutdatedFlags([before.invoice], { force: true });
    expect(flags.get(gen.data.id)).toBe(true);

    const preview = await previewRegenerate({ id: gen.data.id });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.data).toMatchObject({ oldTotal: '2300.00', newTotal: '2200.00', diff: '-100.00', isOutdated: true });

    const regen = await regenerateInvoice({ id: gen.data.id, expectedVersion: 1 });
    expect(regen.ok).toBe(true);
    const after = await loadInvoice(gen.data.id);
    expect(after.invoice.invoice_number).toBe(before.invoice.invoice_number);
    expect(after.invoice.version).toBe(2);
    expect(Number(after.invoice.total)).toBe(2200);
    expect(after.invoice.is_outdated).toBe(false);
    expect(after.lines.find((l) => l.line_type === 'custom')?.description).toBe('Hosting');
    expect(after.invoice.pdf_path).toBe(`${gen.data.id}/v2.pdf`);
    const { data: files } = await serviceClient().storage.from('invoices').list(gen.data.id);
    expect(files!.map((x) => x.name).sort()).toEqual(['v1.pdf', 'v2.pdf']);
    const again = await refreshOutdatedFlags([after.invoice], { force: true });
    expect(again.get(gen.data.id)).toBe(false);

    // Stale version in the dialog is rejected.
    const stale = await regenerateInvoice({ id: gen.data.id, expectedVersion: 1 });
    expect(stale.ok).toBe(false);
  });

  it('void requires a reason and locks the invoice; void invoices can be soft-deleted', async () => {
    await actAs('admin');
    const gen = await generate(f);
    if (!gen.ok) throw new Error(gen.error.message);
    expect((await voidInvoice({ id: gen.data.id, reason: '' })).ok).toBe(false);
    expect((await voidInvoice({ id: gen.data.id, reason: 'Wrong client' })).ok).toBe(true);
    const voided = await loadInvoice(gen.data.id);
    expect(voided.invoice.status).toBe('void');
    expect((await changeInvoiceNumber({ id: gen.data.id, invoiceNumber: `V-${Date.now()}` })).ok).toBe(false);

    const wrong = await deleteInvoice({ id: gen.data.id, confirmNumber: 'nope' });
    expect(wrong.ok).toBe(false);
    expect((await deleteInvoice({ id: gen.data.id, confirmNumber: voided.invoice.invoice_number })).ok).toBe(true);
    const { data: listed } = await serviceClient().from('invoice_list').select('id').eq('id', gen.data.id);
    expect(listed).toEqual([]);
    expect((await loadInvoice(gen.data.id)).invoice.deleted_at).not.toBeNull();
  });

  it('soft-deletes an issued invoice and never reuses its number', async () => {
    await actAs('admin');
    const gen = await generate(f);
    if (!gen.ok) throw new Error(gen.error.message);
    expect((await deleteInvoice({ id: gen.data.id, confirmNumber: gen.data.invoiceNumber })).ok).toBe(true);
    const next = await generate(f);
    expect(next.ok && next.data.invoiceNumber).not.toBe(gen.data.invoiceNumber);
    const other = await generate(f);
    if (!other.ok) throw new Error(other.error.message);
    const reuse = await changeInvoiceNumber({ id: other.data.id, invoiceNumber: gen.data.invoiceNumber });
    expect(reuse.ok).toBe(false);
  });

  it('viewer gets FORBIDDEN on every action', async () => {
    await actAs('admin');
    const gen = await generate(f);
    if (!gen.ok) throw new Error(gen.error.message);
    const id = gen.data.id;
    await actAs('viewer');
    const results = await Promise.all([
      computeInvoiceLines({ projectId: f.projectId, ...PERIOD }),
      generate(f),
      previewInvoicePdf({ projectId: f.projectId, ...PERIOD, ...DETAILS, lines: [{ kind: 'custom', description: 'x', quantity: '1', unitPrice: '1' }] }),
      updateInvoiceDetails({ id, ...DETAILS, lines: [{ kind: 'custom', description: 'x', quantity: '1', unitPrice: '1' }] }),
      previewRegenerate({ id }),
      regenerateInvoice({ id, expectedVersion: 1 }),
      changeInvoiceNumber({ id, invoiceNumber: 'VIEWER-1' }),
      markInvoicePaid({ id, paidAt: '2026-09-20' }),
      markInvoiceUnpaid({ id, reason: 'x' }),
      voidInvoice({ id, reason: 'x' }),
      deleteInvoice({ id, confirmNumber: gen.data.invoiceNumber }),
    ]);
    for (const r of results) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('FORBIDDEN');
    }
    expect((await loadInvoice(id)).invoice.status).toBe('issued');
  });
});
