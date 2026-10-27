import type { ListConfig } from '@/lib/list-params';

export const usersListConfig = {
  sortable: ['full_name', 'email', 'access_role', 'is_active', 'last_login_at'],
  defaultSort: { id: 'full_name', desc: false },
  filters: {
    access_role: { type: 'multi' },
    active: { type: 'boolean' },
  },
} satisfies ListConfig;

export type UsersListConfig = typeof usersListConfig;
