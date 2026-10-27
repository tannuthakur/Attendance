// Shared by server actions and client components (no server imports here).

export type ActionError = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
};

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: ActionError };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
export const fail = (code: string, message: string, fieldErrors?: Record<string, string[]>): ActionResult<never> => ({
  ok: false,
  error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) },
});
