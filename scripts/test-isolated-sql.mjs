import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db = new PGlite(); // Isolated embedded PostgreSQL, no network and no operational data.
try {
  const migration = readFileSync('supabase/review/20261003_gain_isolated.sql', 'utf8');
  const fixture = readFileSync('tests/isolated-sql.sql', 'utf8')
    .replace(/^\\set[^\n]*\n/m, '')
    .replace(/^\\i[^\n]*$/m, () => migration);
  // Fail at the last statement, then ensure no schema, bucket or policies survived.
  const rollbackDb = new PGlite();
  try {
    const bootstrap = readFileSync('tests/isolated-sql.sql', 'utf8').split('\\i ')[0].replace(/^\\set[^\n]*\n/m, '');
    await rollbackDb.exec(bootstrap);
    await assert.rejects(() => rollbackDb.exec(migration.replace(/^commit;$/m, 'select 1/0;\ncommit;')));
    await rollbackDb.exec('rollback;');
    const { rows } = await rollbackDb.query("select to_regnamespace('gain') is null as schema_absent, (select count(*) from storage.buckets)=0 as buckets_absent, (select count(*) from pg_policies where policyname like 'gain_media_%')=0 as policies_absent, (select count(*) from public.photos where private_note='legacy fixture')=1 as legacy_preserved");
    assert.deepEqual(rows[0], { schema_absent: true, buckets_absent: true, policies_absent: true, legacy_preserved: true });
  } finally { await rollbackDb.close(); }
  await db.exec(fixture);
  console.log('Isolated PostgreSQL RLS, 125-object/250-MiB quota rollback/reclaim, whole-migration rollback, text limits and legacy preservation passed');
} finally { await db.close(); }
