'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronsLeft, ChevronsRight, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsAdmin } from '@/components/providers/current-user';
import { cn } from '@/lib/utils';
import { ADMIN_NAV, MAIN_NAV, type NavItem } from './nav';

function NavLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        active && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
        collapsed && 'justify-center px-2',
      )}
    >
      <item.icon className="size-4 shrink-0" aria-hidden />
      <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function SidebarNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const isAdmin = useIsAdmin();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1 p-2">
      {MAIN_NAV.map((item) => (
        <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
      {isAdmin && (
        <>
          <p className={cn('mt-4 mb-1 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase', collapsed && 'sr-only')}>
            Admin
          </p>
          {ADMIN_NAV.map((item) => (
            <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </>
      )}
    </nav>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem('sidebar:collapsed') === '1');
    } catch {
      /* ignore */
    }
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem('sidebar:collapsed', c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  };
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-svh shrink-0 flex-col border-r bg-sidebar transition-[width] md:flex',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      <div className={cn('flex h-14 items-center gap-2 border-b px-4 font-semibold', collapsed && 'justify-center px-0')}>
        <Receipt className="size-5" aria-hidden />
        {!collapsed && <span>Invoicing</span>}
      </div>
      <div className="flex-1 overflow-y-auto">
        <SidebarNav collapsed={collapsed} />
      </div>
      <div className="border-t p-2">
        <Button variant="ghost" size="sm" className="w-full" onClick={toggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronsRight /> : <><ChevronsLeft /> Collapse</>}
        </Button>
      </div>
    </aside>
  );
}
