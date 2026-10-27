import { z } from 'zod';

/** The two admin-managed lookup tables shown on /admin/roles. */
export const LOOKUP_KINDS = ['job_roles', 'designations'] as const;
export type LookupKind = (typeof LOOKUP_KINDS)[number];
export const lookupKindSchema = z.enum(LOOKUP_KINDS);

export const LOOKUP_LABELS: Record<LookupKind, { singular: string; plural: string }> = {
  job_roles: { singular: 'Job role', plural: 'Job roles' },
  designations: { singular: 'Designation', plural: 'Designations' },
};

export const lookupNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(80, 'Name must be at most 80 characters');

const id = z.uuid('Invalid item');

export const createLookupSchema = z.object({ kind: lookupKindSchema, name: lookupNameSchema });
export const renameLookupSchema = z.object({ kind: lookupKindSchema, id, name: lookupNameSchema });
export const moveLookupSchema = z.object({ kind: lookupKindSchema, id, direction: z.enum(['up', 'down']) });
export const setLookupActiveSchema = z.object({ kind: lookupKindSchema, id, is_active: z.boolean() });
export const deleteLookupSchema = z.object({ kind: lookupKindSchema, id });

export const nameFormSchema = z.object({ name: lookupNameSchema });
export type NameFormInput = z.input<typeof nameFormSchema>;
