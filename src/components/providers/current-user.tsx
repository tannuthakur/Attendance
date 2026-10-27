'use client';
import { createContext, useContext, type ReactNode } from 'react';

export type ClientUser = { id: string; name: string; email: string; isAdmin: boolean; timezone: string };

const CurrentUserContext = createContext<ClientUser | null>(null);

export function CurrentUserProvider({ user, children }: { user: ClientUser; children: ReactNode }) {
  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser(): ClientUser | null {
  return useContext(CurrentUserContext);
}

/** Hides create/edit/delete/status controls for viewers (§5.5). Server + RLS still enforce. */
export function useIsAdmin(): boolean {
  return useContext(CurrentUserContext)?.isAdmin ?? false;
}

export function AdminOnly({ children }: { children: ReactNode }) {
  return useIsAdmin() ? <>{children}</> : null;
}
