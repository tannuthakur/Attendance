import { z } from 'zod';
import { passwordSchema } from '@/features/auth/schemas';

export const ACCESS_ROLES = ['admin', 'viewer'] as const;
export const accessRoleSchema = z.enum(ACCESS_ROLES, 'Select an access role');

const fullName = z.string().trim().min(1, 'Name is required').max(120, 'Name is too long');

export const CREATE_MODES = ['invite', 'password'] as const;

export const createUserSchema = z
  .object({
    full_name: fullName,
    email: z.string('Enter a valid email').trim().toLowerCase().pipe(z.email('Enter a valid email')),
    access_role: accessRoleSchema,
    mode: z.enum(CREATE_MODES),
    password: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode !== 'password') return;
    const res = passwordSchema.safeParse(v.password ?? '');
    if (!res.success) {
      ctx.addIssue({ code: 'custom', path: ['password'], message: res.error.issues[0]?.message ?? 'Invalid password' });
    }
  });

export const updateUserSchema = z.object({
  id: z.uuid('Invalid user'),
  full_name: fullName,
  access_role: accessRoleSchema,
  is_active: z.boolean(),
});

export const setUserActiveSchema = z.object({ id: z.uuid('Invalid user'), is_active: z.boolean() });
export const userIdSchema = z.object({ id: z.uuid('Invalid user') });

export type CreateUserInput = z.input<typeof createUserSchema>;
export type UpdateUserInput = z.input<typeof updateUserSchema>;
