import 'server-only';

/** PostgREST caps responses at `max_rows` (1000); page through larger result sets. */
export const DB_PAGE = 1000;

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  limit = Number.POSITIVE_INFINITY,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < limit; from += DB_PAGE) {
    const to = Math.min(from + DB_PAGE, limit) - 1;
    const { data, error } = await page(from, to);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < to - from + 1) break;
  }
  return out;
}

/** Chunk ids so `.in()` filters keep URLs short. */
export function chunk<T>(items: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
