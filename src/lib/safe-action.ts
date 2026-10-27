import 'server-only';
import { revalidatePath } from 'next/cache';
import type { z } from 'zod';
import { fail, ok, type ActionResult } from './action-result';
import { mapDbError } from './db-errors';
import { requireAdmin } from './auth/require-admin';
import { ForbiddenError, UnauthenticatedError } from './auth/errors';
import { createClient, type ServerClient } from './supabase/server';
import type { CurrentUser } from './auth/get-user';

export class DbError extends Error {
  constructor(
    readonly pg: { code?: string; message?: string; details?: string | null; hint?: string | null },
    readonly overrides: Partial<Record<string, string>> = {},
  ) {
    super(pg.message);
  }
}

/** Throw inside an action body when a Supabase call returns an error. */
export function check<T>(res: { data: T; error: DbError['pg'] | null }, overrides?: Partial<Record<string, string>>): T {
  if (res.error) throw new DbError(res.error, overrides);
  return res.data;
}

export class ActionFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Ctx = { user: CurrentUser; supabase: ServerClient };

/**
 * Standard admin mutation (§9): requireAdmin → schema.parse → body → revalidatePath → ActionResult.
 * Never leaks raw DB errors.
 */
export function adminAction<S extends z.ZodType, T>(
  schema: S,
  body: (input: z.infer<S>, ctx: Ctx) => Promise<T>,
  options: { revalidate?: string[] | ((input: z.infer<S>, result: T) => string[]) } = {},
) {
  return async (raw: z.input<S>): Promise<ActionResult<T>> => {
    try {
      const user = await requireAdmin();
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        const fieldErrors: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path.join('.') || '_form';
          (fieldErrors[key] ??= []).push(issue.message);
        }
        return fail('VALIDATION', 'Please fix the highlighted fields', fieldErrors);
      }
      const supabase = await createClient();
      const data = await body(parsed.data, { user, supabase });
      const paths =
        typeof options.revalidate === 'function' ? options.revalidate(parsed.data, data) : (options.revalidate ?? []);
      paths.forEach((p) => revalidatePath(p));
      return ok(data);
    } catch (e) {
      return toFailure(e);
    }
  };
}

export function toFailure(e: unknown): ActionResult<never> {
  if (e instanceof ForbiddenError) return fail('FORBIDDEN', e.message);
  if (e instanceof UnauthenticatedError) return fail('UNAUTHENTICATED', e.message);
  if (e instanceof DbError) {
    const m = mapDbError(e.pg, e.overrides);
    return fail(m.code, m.message);
  }
  if (e instanceof ActionFailure) return fail(e.code, e.message);
  console.error('[action] unexpected error', e);
  return fail('UNKNOWN', 'Something went wrong. Please try again.');
}
