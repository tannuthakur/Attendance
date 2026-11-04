'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { Abilities } from '@/lib/auth/permissions';

export type ClientUser = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  /** Role abilities (§18), e.g. attendance managers edit employees and attendance but see no money. */
  can: Abilities;
  timezone: string;
};

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

const NONE: Abilities = { manageEmployees: false, markAttendance: false, seeMoney: false };

export function useCan(): Abilities {
  return useContext(CurrentUserContext)?.can ?? NONE;
}

export function AdminOnly({ children }: { children: ReactNode }) {
  return useIsAdmin() ? <>{children}</> : null;
}
