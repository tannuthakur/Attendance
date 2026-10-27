'use client';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ColorBadge } from '@/components/status-badge';
import { useIsAdmin } from '@/components/providers/current-user';
import type { ActionResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';
import { LOOKUP_LABELS, lookupNameSchema, nameFormSchema, type LookupKind, type NameFormInput } from '../schemas';
import { createLookup, deleteLookup, moveLookup, renameLookup, setLookupActive } from '../actions';

export type LookupItem = { id: string; name: string; is_active: boolean; sort_order: number };

function report(res: ActionResult<unknown>, success?: string): boolean {
  if (res.ok) {
    if (success) toast.success(success);
    return true;
  }
  toast.error(res.error.message);
  return false;
}

function AddForm({ kind }: { kind: LookupKind }) {
  const [pending, startTransition] = useTransition();
  const label = LOOKUP_LABELS[kind].singular;
  const form = useForm<NameFormInput>({ resolver: zodResolver(nameFormSchema), defaultValues: { name: '' } });
  const onSubmit = (values: NameFormInput) =>
    startTransition(async () => {
      const res = await createLookup({ kind, name: values.name });
      if (res.ok) {
        toast.success(`${label} added`);
        form.reset();
      } else {
        form.setError('name', { message: res.error.fieldErrors?.name?.[0] ?? res.error.message });
      }
    });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex items-start gap-2" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel className="sr-only">New {label.toLowerCase()} name</FormLabel>
              <FormControl>
                <Input placeholder={`New ${label.toLowerCase()}`} autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={pending}>
          <Plus aria-hidden /> Add
        </Button>
      </form>
    </Form>
  );
}

function ItemRow({
  kind,
  item,
  isFirst,
  isLast,
  isAdmin,
}: {
  kind: LookupKind;
  item: LookupItem;
  isFirst: boolean;
  isLast: boolean;
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const inputId = `rename-${item.id}`;

  const run = (fn: () => Promise<boolean | void>) => startTransition(async () => void (await fn()));

  const saveRename = () =>
    run(async () => {
      const parsed = lookupNameSchema.safeParse(name);
      if (!parsed.success) return setError(parsed.error.issues[0]?.message);
      if (parsed.data === item.name) return setEditing(false);
      const res = await renameLookup({ kind, id: item.id, name: parsed.data });
      if (res.ok) {
        toast.success('Renamed');
        setEditing(false);
        setError(undefined);
      } else setError(res.error.message);
    });

  if (editing) {
    return (
      <li className="flex items-start gap-2 py-2">
        <div className="flex-1 space-y-1">
          <label htmlFor={inputId} className="sr-only">
            Rename {item.name}
          </label>
          <Input
            id={inputId}
            value={name}
            autoFocus
            aria-invalid={!!error}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                saveRename();
              }
              if (e.key === 'Escape') {
                setEditing(false);
                setName(item.name);
                setError(undefined);
              }
            }}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <Button size="icon" variant="ghost" aria-label="Save name" onClick={saveRename} disabled={pending}>
          <Check aria-hidden />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Cancel rename"
          onClick={() => {
            setEditing(false);
            setName(item.name);
            setError(undefined);
          }}
        >
          <X aria-hidden />
        </Button>
      </li>
    );
  }

  return (
    <li className={cn('flex items-center gap-2 py-2', pending && 'opacity-60')}>
      <span className={cn('flex-1', !item.is_active && 'text-muted-foreground')}>{item.name}</span>
      {!item.is_active && <ColorBadge color="gray">Inactive</ColorBadge>}
      {isAdmin && (
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={`Move ${item.name} up`}
            disabled={isFirst || pending}
            onClick={() => run(async () => report(await moveLookup({ kind, id: item.id, direction: 'up' })))}
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={`Move ${item.name} down`}
            disabled={isLast || pending}
            onClick={() => run(async () => report(await moveLookup({ kind, id: item.id, direction: 'down' })))}
          >
            <ArrowDown aria-hidden />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={`Rename ${item.name}`}
            onClick={() => {
              setName(item.name);
              setEditing(true);
            }}
          >
            <Pencil aria-hidden />
          </Button>
          <Switch
            checked={item.is_active}
            disabled={pending}
            aria-label={`${item.name} active`}
            onCheckedChange={(checked) =>
              run(async () =>
                report(
                  await setLookupActive({ kind, id: item.id, is_active: checked }),
                  checked ? `${item.name} activated` : `${item.name} deactivated`,
                ),
              )
            }
          />
          <ConfirmDialog
            trigger={
              <Button size="icon" variant="ghost" className="size-8" aria-label={`Delete ${item.name}`}>
                <Trash2 aria-hidden />
              </Button>
            }
            title={`Delete ${item.name}?`}
            description="Items that are in use cannot be deleted; deactivate them instead."
            confirmLabel="Delete"
            onConfirm={async () => {
              report(await deleteLookup({ kind, id: item.id }), `${item.name} deleted`);
            }}
          />
        </div>
      )}
    </li>
  );
}

export function LookupManager({ kind, items }: { kind: LookupKind; items: LookupItem[] }) {
  const isAdmin = useIsAdmin();
  const labels = LOOKUP_LABELS[kind];
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{labels.plural}</h2>
        </CardTitle>
        <CardDescription>
          {isAdmin ? 'Inactive items are hidden from dropdowns but kept on existing records.' : 'Read only.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isAdmin && <AddForm kind={kind} />}
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No {labels.plural.toLowerCase()} yet.</p>
        ) : (
          <ul aria-label={labels.plural} className="divide-y">
            {items.map((item, i) => (
              <ItemRow
                key={item.id}
                kind={kind}
                item={item}
                isFirst={i === 0}
                isLast={i === items.length - 1}
                isAdmin={isAdmin}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
