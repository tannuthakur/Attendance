import type { ActionError } from './action-result';

type PgError = { code?: string; message?: string; details?: string | null; hint?: string | null };

/** Friendly messages for errors raised by our Postgres functions (`raise exception '<CODE>'`). */
const KNOWN: Record<string, string> = {
  FORBIDDEN: 'You do not have permission to perform this action',
  LAST_ADMIN: 'At least one active admin is required',
  ATTENDANCE_STATUS_CODES_FIXED: 'Attendance status codes are fixed; only label, colour and factor can change',
  EMPLOYEE_NOT_FOUND: 'Employee not found',
  NO_PERIODS: 'Employee has no employment history',
  ALREADY_OFF_ROLE: 'Employee is already off-role on that date',
  ALREADY_ON_ROLE: 'Employee is already on-role',
  END_BEFORE_START: 'End date cannot be before the start date',
  OVERLAPS_PREVIOUS: 'The new on-role date must be after the last off-role date',
  PROJECT_NOT_FOUND: 'Project not found',
  INVALID_TRANSITION: 'That status change is not allowed',
  EFFECTIVE_DATE_BEFORE_LAST_EVENT: 'Effective date cannot be before the last status change',
  NO_ROWS: 'Nothing to save',
  DATE_TOO_FAR_IN_FUTURE: 'Attendance can be planned at most 60 days ahead',
  INVALID_STATUS: 'Unknown attendance status',
  HOLIDAY_NEEDS_PROJECTS: 'Select at least one project for a project-specific holiday',
  RANGE_NOT_ALLOWED_ON_UPDATE: 'A date range can only be used when creating holidays',
  RANGE_TOO_LONG: 'Holiday range is too long',
  DUPLICATE_HOLIDAY: 'A holiday already exists on that date for the same scope',
  HOLIDAY_NOT_FOUND: 'Holiday not found',
  EMPLOYEE_HAS_INVOICES: 'This employee has been invoiced and cannot be deleted. Mark them off-role instead.',
  INVOICE_NO_LINES: 'An invoice needs at least one line',
  INVOICE_NEGATIVE_TOTAL: 'Invoice total cannot be negative',
  INVOICE_NOT_FOUND: 'Invoice not found',
  INVOICE_LOCKED: 'This invoice is locked and cannot be changed',
  INVOICE_DELETED: 'This invoice has been deleted',
  INVALID_INVOICE_TRANSITION: 'That invoice status change is not allowed',
  DUPLICATE_INVOICE_NUMBER: 'That invoice number is already used',
  INVALID_NUMBER: 'Invoice number is required',
  REASON_REQUIRED: 'A reason is required',
};

export function mapDbError(error: PgError, overrides: Partial<Record<string, string>> = {}): ActionError {
  const raised = error.message ?? '';
  if (raised in KNOWN || raised in overrides) {
    return { code: raised, message: overrides[raised] ?? KNOWN[raised] };
  }
  switch (error.code) {
    case '23505':
      return { code: 'DUPLICATE', message: overrides.DUPLICATE ?? 'A record with these details already exists' };
    case '23P01':
      return { code: 'OVERLAP', message: overrides.OVERLAP ?? 'The dates overlap an existing record' };
    case '23503':
      return { code: 'IN_USE', message: overrides.IN_USE ?? 'This record is in use and cannot be deleted' };
    case '23514':
      return { code: 'INVALID', message: overrides.INVALID ?? 'Some values are not valid' };
    case '42501':
      return { code: 'FORBIDDEN', message: KNOWN.FORBIDDEN };
    default:
      return { code: 'UNKNOWN', message: 'Something went wrong. Please try again.' };
  }
}
