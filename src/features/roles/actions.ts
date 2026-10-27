'use server';
import { ActionFailure, adminAction, check } from '@/lib/safe-action';
import {
  createLookupSchema,
  deleteLookupSchema,
  LOOKUP_LABELS,
  moveLookupSchema,
  renameLookupSchema,
  setLookupActiveSchema,
  type LookupKind,
} from './schemas';

// Lists that show job roles / designations in dropdowns are revalidated with the admin page.
const PATHS = ['/admin/roles', '/employees'];

const duplicate = (kind: LookupKind) => ({
  DUPLICATE: `A ${LOOKUP_LABELS[kind].singular.toLowerCase()} with this name already exists`,
});

export const createLookup = adminAction(
  createLookupSchema,
  async ({ kind, name }, { supabase }) => {
    const last = check(
      await supabase.from(kind).select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle(),
    );
    const row = check(
      await supabase
        .from(kind)
        .insert({ name, sort_order: (last?.sort_order ?? 0) + 1 })
        .select('id')
        .single(),
      duplicate(kind),
    );
    return { id: row!.id };
  },
  { revalidate: PATHS },
);

export const renameLookup = adminAction(
  renameLookupSchema,
  async ({ kind, id, name }, { supabase }) => {
    const row = check(await supabase.from(kind).update({ name }).eq('id', id).select('id').maybeSingle(), duplicate(kind));
    if (!row) throw new ActionFailure('NOT_FOUND', `${LOOKUP_LABELS[kind].singular} not found`);
    return { id };
  },
  { revalidate: PATHS },
);

export const setLookupActive = adminAction(
  setLookupActiveSchema,
  async ({ kind, id, is_active }, { supabase }) => {
    const row = check(await supabase.from(kind).update({ is_active }).eq('id', id).select('id').maybeSingle());
    if (!row) throw new ActionFailure('NOT_FOUND', `${LOOKUP_LABELS[kind].singular} not found`);
    return { id };
  },
  { revalidate: PATHS },
);

export const deleteLookup = adminAction(
  deleteLookupSchema,
  async ({ kind, id }, { supabase }) => {
    const rows = check(
      await supabase.from(kind).delete().eq('id', id).select('id'),
      { IN_USE: 'In use — deactivate instead' },
    );
    if (!rows?.length) throw new ActionFailure('NOT_FOUND', `${LOOKUP_LABELS[kind].singular} not found`);
    return { id };
  },
  { revalidate: PATHS },
);

// SPEC-NOTE: reordering renumbers the whole (small) list 1..n in display order and swaps the moved
// item with its neighbour. Not wrapped in a transaction; a concurrent edit can at worst produce a
// harmless tie, which the next move renormalises.
export const moveLookup = adminAction(
  moveLookupSchema,
  async ({ kind, id, direction }, { supabase }) => {
    const items = check(await supabase.from(kind).select('id, sort_order').order('sort_order').order('name')) ?? [];
    const index = items.findIndex((i) => i.id === id);
    if (index === -1) throw new ActionFailure('NOT_FOUND', `${LOOKUP_LABELS[kind].singular} not found`);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= items.length) return { id };
    const order = items.map((i) => i.id);
    [order[index], order[target]] = [order[target], order[index]];
    const current = new Map(items.map((i) => [i.id, i.sort_order]));
    for (const [pos, itemId] of order.entries()) {
      if (current.get(itemId) === pos + 1) continue;
      check(await supabase.from(kind).update({ sort_order: pos + 1 }).eq('id', itemId));
    }
    return { id };
  },
  { revalidate: PATHS },
);
