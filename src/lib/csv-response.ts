import 'server-only';
import { toCsv, type CsvColumn } from './csv';

export function csvResponse<T>(filename: string, rows: T[], columns: CsvColumn<T>[]): Response {
  return new Response(`﻿${toCsv(rows, columns)}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/** Hard cap for exports so a single request cannot pull unbounded rows. */
export const EXPORT_LIMIT = 10_000;
