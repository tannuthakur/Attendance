'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, FolderKanban, Search, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import type { SearchResult } from '@/features/search/queries';

const ICONS = { employee: User, project: FolderKanban, invoice: FileText };
const GROUPS: Array<[SearchResult['type'], string]> = [
  ['employee', 'Employees'],
  ['project', 'Projects'],
  ['invoice', 'Invoices'],
];

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (res.ok) setResults((await res.json()).results);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  return (
    <>
      <Button variant="outline" size="sm" className="w-full justify-start text-muted-foreground sm:w-72" onClick={() => setOpen(true)}>
        <Search aria-hidden /> Search employees, projects, invoices…
        <kbd className="ml-auto hidden rounded border px-1 text-[10px] sm:inline">⌘K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false} title="Search">
        <CommandInput placeholder="Type at least 2 characters…" value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>{loading ? 'Searching…' : q.length < 2 ? 'Start typing to search.' : 'No results.'}</CommandEmpty>
          {GROUPS.map(([type, heading]) => {
            const items = results.filter((r) => r.type === type);
            if (!items.length) return null;
            const Icon = ICONS[type];
            return (
              <CommandGroup key={type} heading={heading}>
                {items.map((r) => (
                  <CommandItem
                    key={`${r.type}:${r.id}`}
                    value={`${r.type}:${r.id}`}
                    onSelect={() => {
                      setOpen(false);
                      setQ('');
                      router.push(r.href);
                    }}
                  >
                    <Icon aria-hidden />
                    <div className="flex flex-col">
                      <span>{r.title}</span>
                      <span className="text-xs text-muted-foreground">{r.subtitle}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
}
