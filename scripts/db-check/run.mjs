// pnpm db:check — runs every migration + seed.sql + the pgTAP files on PGlite (in-memory Postgres) with
// stand-ins for Supabase (auth/storage) and pgTAP. A fast local check when Docker / Supabase CLI aren't
// available; CI still runs the real `supabase test db`. Exit code 1 on any failure.
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const root = here('../../');
const read = (p) => readFileSync(p, 'utf8');

export async function freshDb({ seed = true } = {}) {
  const db = new PGlite({ extensions: { btree_gist, pg_trgm } });
  await db.exec(read(here('./supabase-stubs.sql')));
  for (const f of readdirSync(`${root}supabase/migrations`).sort()) {
    try {
      await db.exec(read(`${root}supabase/migrations/${f}`));
    } catch (e) {
      throw new Error(`migration ${f} failed: ${e.message}`);
    }
  }
  if (seed) await db.exec(read(`${root}supabase/seed.sql`));
  return db;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tests = readdirSync(`${root}supabase/tests`).filter((f) => f.endsWith('.test.sql')).sort();
  let failed = 0;
  for (const t of tests) {
    const db = await freshDb();
    await db.exec(read(here('./pgtap-stub.sql')));
    const sql = read(`${root}supabase/tests/${t}`)
      .replace(/^begin;$/m, '')
      .replace(/^rollback;$/m, '')
      .replace(/create extension if not exists pgtap with schema extensions;/, '');
    try {
      await db.exec(sql);
    } catch (e) {
      failed++;
      console.log(`✗ ${t}: aborted — ${e.message}`);
    }
    await db.exec('reset role');
    const rows = (await db.query('select n, ok, descr, diag from public._tap order by n')).rows;
    const bad = rows.filter((r) => !r.ok);
    failed += bad.length;
    console.log(`${bad.length ? '✗' : '✓'} ${t}: ${rows.length} assertions, ${bad.length} failed`);
    for (const b of bad) console.log(`    #${b.n} ${b.descr} → ${b.diag}`);
  }
  console.log(failed ? `\n${failed} failure(s)` : '\nAll database checks passed (migrations + seed + pgTAP on PGlite).');
  process.exit(failed ? 1 : 0);
}
