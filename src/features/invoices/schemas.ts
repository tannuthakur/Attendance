import { z } from 'zod';

// Shared by the wizard / edit forms (client) and the server actions.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;

export const isoDate = z.string().regex(ISO_DATE, 'Enter a valid date');
const uuid = z.string().uuid('Invalid id');

/** Money-like decimal as string (never parsed into floats). */
const decimalString = (label: string, opts: { min?: 'positive'; maxDp: number }) =>
  z
    .string()
    .trim()
    .regex(DECIMAL, `${label} must be a number`)
    .refine((v) => (v.split('.')[1]?.length ?? 0) <= opts.maxDp, `${label} allows at most ${opts.maxDp} decimals`)
    .refine((v) => opts.min !== 'positive' || Number(v) > 0, `${label} must be greater than 0`)
    .refine((v) => Math.abs(Number(v)) < 1e11, `${label} is too large`);

export const customLineSchema = z.object({
  description: z.string().trim().min(1, 'Description is required').max(500),
  // SPEC-NOTE: quantity must be > 0; discounts/credits are entered with a negative unit price.
  quantity: decimalString('Quantity', { min: 'positive', maxDp: 2 }),
  unitPrice: decimalString('Unit price', { maxDp: 2 }),
});
export type CustomLineInput = z.infer<typeof customLineSchema>;

/**
 * Ordered lines sent by the client. Employee lines carry ONLY identity + description; their
 * amounts are always recomputed (generate) or copied from the stored invoice (edit) on the server.
 */
export const draftLineSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('employee'),
    assignmentId: uuid,
    description: z.string().trim().min(1, 'Description is required').max(500),
  }),
  customLineSchema.extend({ kind: z.literal('custom') }),
]);
export type DraftLineInput = z.infer<typeof draftLineSchema>;

const periodShape = { periodStart: isoDate, periodEnd: isoDate };
const periodOrder = (v: { periodStart: string; periodEnd: string }) => v.periodEnd >= v.periodStart;
const periodOrderMsg = { message: 'Period end must be on or after the start', path: ['periodEnd'] };

export const computeLinesSchema = z.object({ projectId: uuid, ...periodShape }).refine(periodOrder, periodOrderMsg);

const detailsShape = {
  issueDate: isoDate,
  dueDate: isoDate,
  invoiceTitle: z.string().trim().min(1, 'Invoice title is required').max(300),
  invoiceTo: z.string().trim().min(1, 'Invoice to is required').max(2000),
  notes: z.string().trim().max(2000).optional().default(''),
};
const dueOrder = (v: { issueDate: string; dueDate: string }) => v.dueDate >= v.issueDate;
const dueOrderMsg = { message: 'Due date cannot be before the issue date', path: ['dueDate'] };

export const invoiceDetailsSchema = z.object(detailsShape).refine(dueOrder, dueOrderMsg);
export type InvoiceDetailsInput = z.infer<typeof invoiceDetailsSchema>;

export const generateInvoiceSchema = z
  .object({
    projectId: uuid,
    ...periodShape,
    ...detailsShape,
    excludedAssignmentIds: z.array(uuid).default([]),
    lines: z.array(draftLineSchema).min(1, 'An invoice needs at least one line').max(500),
    /** Set after the user confirmed the "overlapping invoice" warning. */
    allowOverlap: z.boolean().default(false),
  })
  .refine(periodOrder, periodOrderMsg)
  .refine(dueOrder, dueOrderMsg);
export type GenerateInvoiceInput = z.input<typeof generateInvoiceSchema>;

/** Edit details / custom lines of an issued invoice. Employee lines are referenced by stored line id. */
export const editLineSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('employee'),
    lineId: uuid,
    description: z.string().trim().min(1, 'Description is required').max(500),
  }),
  customLineSchema.extend({ kind: z.literal('custom') }),
]);
export type EditLineInput = z.infer<typeof editLineSchema>;

export const updateInvoiceSchema = z
  .object({
    id: uuid,
    ...detailsShape,
    lines: z.array(editLineSchema).min(1, 'An invoice needs at least one line').max(500),
  })
  .refine(dueOrder, dueOrderMsg);
export type UpdateInvoiceInput = z.input<typeof updateInvoiceSchema>;

export const invoiceIdSchema = z.object({ id: uuid });

export const regenerateSchema = z.object({
  id: uuid,
  /** Optimistic check: the version the user saw in the diff dialog. */
  expectedVersion: z.number().int().positive(),
});

export const changeNumberSchema = z.object({
  id: uuid,
  invoiceNumber: z
    .string()
    .trim()
    .min(1, 'Invoice number is required')
    .max(60, 'Invoice number is too long')
    .regex(/^[A-Za-z0-9][A-Za-z0-9\-_/.]*$/, 'Use letters, digits and - _ / . only'),
});

export const markPaidSchema = z.object({
  id: uuid,
  paidAt: isoDate,
  reference: z.string().trim().max(200).optional().default(''),
});

export const reasonSchema = z.object({
  id: uuid,
  reason: z.string().trim().min(1, 'A reason is required').max(500),
});

export const deleteInvoiceSchema = z.object({
  id: uuid,
  /** Must equal the invoice number (typed by the user). */
  confirmNumber: z.string().trim().min(1, 'Type the invoice number to confirm'),
});
