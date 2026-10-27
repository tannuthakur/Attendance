import { describe, expect, it } from 'vitest';
import {
  holidayCreateSchema,
  holidayFormSchema,
  holidayUpdateSchema,
  toCreateInput,
  toUpdateInput,
  type HolidayFormValues,
} from '@/features/holidays/schemas';

const P1 = '33333333-3333-4333-8333-333333333333';
const H1 = '44444444-4444-4444-8444-444444444444';

const create = { name: 'Eid', start_date: '2026-03-20', end_date: '2026-03-22', applies_to_all_projects: true, project_ids: [] };

describe('holidayCreateSchema', () => {
  it('accepts a single date and a range', () => {
    expect(holidayCreateSchema.safeParse({ ...create, end_date: null }).success).toBe(true);
    expect(holidayCreateSchema.parse({ ...create, notes: '  ' }).notes).toBeNull();
  });
  it('requires name and start date', () => {
    expect(holidayCreateSchema.safeParse({ ...create, name: ' ' }).success).toBe(false);
    expect(holidayCreateSchema.safeParse({ ...create, start_date: '' }).success).toBe(false);
  });
  it('rejects end before start and ranges longer than a year', () => {
    expect(holidayCreateSchema.safeParse({ ...create, end_date: '2026-03-19' }).error?.issues[0].path).toEqual(['end_date']);
    expect(holidayCreateSchema.safeParse({ ...create, end_date: '2027-03-22' }).error?.issues[0].message).toBe(
      'Holiday range is too long',
    );
  });
  it('project scope requires at least one project', () => {
    const res = holidayCreateSchema.safeParse({ ...create, applies_to_all_projects: false, project_ids: [] });
    expect(res.error?.issues[0]).toMatchObject({ path: ['project_ids'], message: 'Select at least one project' });
    expect(holidayCreateSchema.safeParse({ ...create, applies_to_all_projects: false, project_ids: [P1] }).success).toBe(true);
  });
});

describe('holidayUpdateSchema', () => {
  const update = { id: H1, name: 'Eid', date: '2026-03-20', applies_to_all_projects: true, project_ids: [] };
  it('accepts a single-date update', () => {
    expect(holidayUpdateSchema.safeParse(update).success).toBe(true);
  });
  it('requires id and scope projects', () => {
    expect(holidayUpdateSchema.safeParse({ ...update, id: 'x' }).success).toBe(false);
    expect(holidayUpdateSchema.safeParse({ ...update, applies_to_all_projects: false }).success).toBe(false);
  });
});

describe('holidayFormSchema + mappers', () => {
  const values: HolidayFormValues = {
    name: 'Eid',
    isRange: true,
    start_date: '2026-03-20',
    end_date: '2026-03-22',
    scope: 'projects',
    project_ids: [P1],
    notes: '',
  };
  it('validates range and scope', () => {
    expect(holidayFormSchema.safeParse(values).success).toBe(true);
    expect(holidayFormSchema.safeParse({ ...values, end_date: '' }).error?.issues[0].message).toBe('End date is required');
    expect(holidayFormSchema.safeParse({ ...values, end_date: '2026-03-01' }).error?.issues[0].path).toEqual(['end_date']);
    expect(holidayFormSchema.safeParse({ ...values, end_date: '2027-12-01' }).error?.issues[0].message).toBe('Holiday range is too long');
    expect(holidayFormSchema.safeParse({ ...values, project_ids: [] }).error?.issues[0]).toMatchObject({
      path: ['project_ids'],
      message: 'Select at least one project',
    });
    expect(holidayFormSchema.safeParse({ ...values, isRange: false, end_date: '' }).success).toBe(true);
  });
  it('maps form values to action inputs', () => {
    expect(toCreateInput(values)).toEqual({
      name: 'Eid',
      start_date: '2026-03-20',
      end_date: '2026-03-22',
      applies_to_all_projects: false,
      project_ids: [P1],
      notes: '',
    });
    expect(toCreateInput({ ...values, isRange: false, scope: 'all' })).toMatchObject({
      end_date: null,
      applies_to_all_projects: true,
      project_ids: [],
    });
    expect(toUpdateInput(H1, { ...values, scope: 'all' })).toEqual({
      id: H1,
      name: 'Eid',
      date: '2026-03-20',
      applies_to_all_projects: true,
      project_ids: [],
      notes: '',
    });
  });
});
