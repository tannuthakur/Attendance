import 'server-only';
import { forbidden, redirect } from 'next/navigation';
import { getCurrentUser, type CurrentUser } from './get-user';
import { ForbiddenError, UnauthenticatedError } from './errors';
import { can, type Permission } from './permissions';

/** For server actions: throws 401/403 errors (mapped to ActionResult by `adminAction`). */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  if (!user.isAdmin) throw new ForbiddenError();
  return user;
}

/** For server actions other roles may run (§18): throws 401/403 errors. */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  if (!can(user.profile.access_role, permission)) throw new ForbiddenError();
  return user;
}

/** For pages: redirects to login, or renders the 403 page for users without the permission. */
export async function requirePermissionPage(permission: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!can(user.profile.access_role, permission)) forbidden();
  return user;
}

/** For pages: redirects to login, or renders the 403 page for non-admins. */
export async function requireAdminPage(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.isAdmin) forbidden();
  return user;
}

export async function requireUserPage(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}
