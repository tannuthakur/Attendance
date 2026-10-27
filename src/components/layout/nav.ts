import {
  CalendarCheck,
  CalendarDays,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Settings,
  Shield,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const MAIN_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/employees', label: 'Employees', icon: Users },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { href: '/holidays', label: 'Holidays', icon: CalendarDays },
  { href: '/invoices', label: 'Invoices', icon: FileText },
];

export const ADMIN_NAV: NavItem[] = [
  { href: '/admin/users', label: 'Users', icon: Shield },
  { href: '/admin/roles', label: 'Roles & Designations', icon: Tags },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];
