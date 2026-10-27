import Link from 'next/link';
import { cn } from '@/lib/utils';

export type DetailTab = { id: string; label: string };

/** Server-rendered tabs driven by `?tab=` so each tab is linkable (see docs/ARCHITECTURE.md). */
export function DetailTabs({ basePath, tabs, active }: { basePath: string; tabs: DetailTab[]; active: string }) {
  return (
    <nav aria-label="Sections" className="mb-4 overflow-x-auto border-b">
      <ul className="flex min-w-max gap-1">
        {tabs.map((t) => {
          const current = t.id === active;
          return (
            <li key={t.id}>
              <Link
                href={t.id === tabs[0].id ? basePath : `${basePath}?tab=${t.id}`}
                aria-current={current ? 'page' : undefined}
                scroll={false}
                className={cn(
                  '-mb-px inline-flex h-9 items-center border-b-2 px-3 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                  current
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Picks the active tab from search params, falling back to the first tab. */
export function activeTab(tabs: DetailTab[], raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return tabs.some((t) => t.id === v) ? (v as string) : tabs[0].id;
}
